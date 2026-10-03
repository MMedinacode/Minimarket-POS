// Motor de sincronización "primero local".
//
//   pantalla = datos del servidor (base) + operaciones que faltan subir (cola)
//
// 1. Cada acción (vender, editar, gastar…) se agrega a la COLA y se guarda en
//    el dispositivo al instante. La caja nunca espera a internet.
// 2. Cuando hay conexión, la cola se envía al servidor (apply_ops). Cada
//    operación lleva un id único, así un reintento no la aplica dos veces.
// 3. Luego se DESCARGA lo que cambió (pull_changes), incluidas las ventas de
//    los otros dispositivos, y se quitan de la cola las operaciones que el
//    servidor ya incluyó.
import type { AppData } from '../../types'
import { reducer, type SyncAction } from '../../store/reducer'
import { uid } from '../utils'
import { emptyCloudData, mergeChanges } from './mapping'
import { NetworkError, type ApplyResult, type Cursors, type PendingOp, type Remote } from './types'

export type SyncStatus = 'loading' | 'syncing' | 'synced' | 'offline' | 'error'

export interface SyncSnapshot {
  /** null mientras no hay ni copia local ni descarga */
  data: AppData | null
  status: SyncStatus
  /** Operaciones que todavía no llegan al servidor */
  pending: number
  lastSyncAt: number | null
  error: string | null
}

export interface SyncStorage {
  load(): Promise<{ base: AppData | null; pending: PendingOp[]; cursors: Cursors }>
  saveBase(base: AppData, cursors: Cursors): Promise<void>
  savePending(pending: PendingOp[]): Promise<void>
  clear(): Promise<void>
}

export interface OpFailure {
  type: string
  error: string
}

const BATCH = 50
const PAGE = 1000
// Al descargar se vuelve a mirar un poco hacia atrás: una transacción larga (ej. importar un
// Excel grande) puede guardar filas con una hora anterior a la de otra que terminó antes
const OVERLAP_SECONDS = 30
// Una operación que falla sola tantas veces (sin ser por internet) se aparta para no trabar la cola
const MAX_ATTEMPTS = 5

export class SyncEngine {
  private base: AppData | null = null
  private pending: PendingOp[] = []
  private cursors: Cursors = {}
  private data: AppData | null = null
  private status: SyncStatus = 'loading'
  private lastSyncAt: number | null = null
  private error: string | null = null
  private listeners = new Set<(s: SyncSnapshot) => void>()
  private running: Promise<void> | null = null
  private rerun = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private retryDelay = 0
  private cleanups: (() => void)[] = []
  private destroyed = false
  private snapshot: SyncSnapshot
  // Tamaño del lote: baja a 1 si un lote completo falla, para encontrar la operación culpable
  private batchSize = BATCH
  private attempts = new Map<string, number>()

  constructor(
    private remote: Remote,
    private storage: SyncStorage,
    private onOpFailure: (f: OpFailure) => void = () => {},
  ) {
    this.snapshot = this.makeSnapshot()
  }

  /** Carga la copia local, se suscribe a cambios y sincroniza */
  async start(): Promise<void> {
    const saved = await this.storage.load()
    if (this.destroyed) return // se cerró la cuenta mientras se leía la copia local
    this.base = saved.base
    this.pending = saved.pending
    this.cursors = saved.cursors
    this.recompute()
    this.emit()

    this.cleanups.push(this.remote.subscribe(() => this.schedule(250)))
    if (typeof window !== 'undefined') {
      const wake = () => this.schedule(0)
      const onVisible = () => document.visibilityState === 'visible' && wake()
      window.addEventListener('online', wake)
      document.addEventListener('visibilitychange', onVisible)
      // Respaldo por si el aviso en tiempo real se pierde
      const interval = setInterval(wake, 60_000)
      this.cleanups.push(() => {
        window.removeEventListener('online', wake)
        document.removeEventListener('visibilitychange', onVisible)
        clearInterval(interval)
      })
    }
    await this.syncNow()
  }

  destroy() {
    this.destroyed = true
    if (this.timer) clearTimeout(this.timer)
    for (const c of this.cleanups) c()
    this.cleanups = []
    this.listeners.clear()
  }

  /** Espera a que termine la sincronización en curso (antes de borrar la copia local) */
  async whenIdle(): Promise<void> {
    await this.running?.catch(() => {})
  }

  subscribe(fn: (s: SyncSnapshot) => void): () => void {
    this.listeners.add(fn)
    fn(this.snapshot)
    return () => this.listeners.delete(fn)
  }

  getSnapshot(): SyncSnapshot {
    return this.snapshot
  }

  /** Registra una acción del usuario: se ve al instante y se sube cuando se pueda */
  dispatch(action: SyncAction) {
    if (this.destroyed) return
    this.pending.push({ opId: uid(), at: Date.now(), action })
    this.storage.savePending(this.pending).catch((err: unknown) => {
      console.error('No se pudo guardar la cola', err)
      this.onOpFailure({ type: 'guardar-local', error: err instanceof Error ? err.message : String(err) })
    })
    this.recompute()
    this.emit()
    this.schedule(300)
  }

  hasUnsyncedChanges(): boolean {
    return this.pending.some((op) => op.ackedAt === undefined)
  }

  schedule(ms: number) {
    if (this.destroyed) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.syncNow(), ms)
  }

  /** Sube la cola y descarga cambios. Si ya está corriendo, se repite al terminar. */
  syncNow(): Promise<void> {
    if (this.destroyed) return Promise.resolve()
    if (this.running) {
      this.rerun = true
      return this.running
    }
    this.running = (async () => {
      try {
        do {
          this.rerun = false
          this.status = 'syncing'
          this.emit()
          await this.flush()
          await this.pull()
        } while (this.rerun && !this.destroyed)
        this.error = null
        this.retryDelay = 0
        this.lastSyncAt = Date.now()
        this.status = 'synced'
      } catch (err) {
        const offline =
          err instanceof NetworkError || (typeof navigator !== 'undefined' && navigator.onLine === false)
        this.status = offline ? 'offline' : 'error'
        this.error = offline ? 'Sin conexión' : err instanceof Error ? err.message : String(err)
        // Reintento con espera creciente: 5 s, 10 s, 20 s… hasta 1 minuto
        this.retryDelay = Math.min(Math.max(this.retryDelay * 2, 5_000), 60_000)
        this.schedule(this.retryDelay)
      } finally {
        this.running = null
        this.emit()
      }
    })()
    return this.running
  }

  // ---------- Internos ----------

  private async flush() {
    const toSend = this.pending.filter((op) => op.ackedAt === undefined)
    for (let i = 0; i < toSend.length; i += this.batchSize) {
      const batch = toSend.slice(i, i + this.batchSize)
      let res: ApplyResult
      try {
        res = await this.remote.applyOps(batch)
      } catch (err) {
        if (err instanceof NetworkError) throw err
        if (batch.length > 1) {
          // Falló el lote completo (no por internet): el próximo intento va de a una operación
          this.batchSize = 1
          throw err
        }
        const op = batch[0]
        const n = (this.attempts.get(op.opId) ?? 0) + 1
        this.attempts.set(op.opId, n)
        if (n < MAX_ATTEMPTS) throw err
        // Falló sola muchas veces: se aparta y se avisa, para que las demás sí suban
        this.attempts.delete(op.opId)
        res = { errors: [{ opId: op.opId, type: op.action.type, error: err instanceof Error ? err.message : String(err) }] }
      }
      if (this.destroyed) return // se cerró la cuenta: no se vuelve a escribir la copia local
      const ackedAt = Date.now()
      const failed = new Map(res.errors.map((e) => [e.opId, e]))
      const ids = new Set(batch.map((op) => op.opId))
      this.pending = this.pending
        // Una operación rechazada se descarta (si no, bloquearía la cola para siempre)
        .filter((op) => !failed.has(op.opId))
        .map((op) => (ids.has(op.opId) ? { ...op, ackedAt } : op))
      for (const e of res.errors) this.onOpFailure({ type: e.type ?? '?', error: e.error })
      await this.storage.savePending(this.pending)
      if (failed.size) this.recompute()
    }
    this.batchSize = BATCH
  }

  private async pull() {
    const startedAt = Date.now()
    const cursors: Cursors = { ...this.cursors }
    let base = this.base ?? emptyCloudData()
    let first = true
    let more = true
    let rows = 0
    while (more) {
      const res = await this.remote.pull(cursors, first ? OVERLAP_SECONDS : 0, PAGE)
      if (this.destroyed) return // se cerró la cuenta mientras se descargaba
      first = false
      base = mergeChanges(base, res)
      more = false
      for (const table of ['products', 'sales', 'expenses'] as const) {
        const list = res[table]
        rows += list.length
        if (list.length) cursors[table] = list[list.length - 1].updated_at
        if (list.length >= PAGE) more = true
      }
    }
    // Lo confirmado ANTES de esta descarga ya viene incluido en `base`
    const pending = this.pending.filter((op) => op.ackedAt === undefined || op.ackedAt > startedAt)
    const pendingChanged = pending.length !== this.pending.length
    const baseChanged = !this.base || rows > 0 || JSON.stringify(base.settings) !== JSON.stringify(this.base.settings)
    if (!baseChanged && !pendingChanged) return // no llegó nada nuevo: no se reescribe la copia local
    if (baseChanged) {
      this.base = base
      this.cursors = cursors
    }
    this.pending = pending
    await Promise.all([
      baseChanged ? this.storage.saveBase(this.base!, this.cursors) : Promise.resolve(),
      pendingChanged ? this.storage.savePending(pending) : Promise.resolve(),
    ])
    this.recompute()
  }

  private recompute() {
    this.data = this.base ? this.pending.reduce((state, op) => reducer(state, op.action), this.base) : null
  }

  private makeSnapshot(): SyncSnapshot {
    return {
      data: this.data,
      status: this.status,
      pending: this.pending.filter((op) => op.ackedAt === undefined).length,
      lastSyncAt: this.lastSyncAt,
      error: this.error,
    }
  }

  private emit() {
    this.snapshot = this.makeSnapshot()
    for (const fn of this.listeners) fn(this.snapshot)
  }
}

/** Almacenamiento en memoria (tests) */
export class MemorySyncStorage implements SyncStorage {
  base: AppData | null = null
  pending: PendingOp[] = []
  cursors: Cursors = {}
  async load() {
    return { base: this.base, pending: [...this.pending], cursors: { ...this.cursors } }
  }
  async saveBase(base: AppData, cursors: Cursors) {
    this.base = base
    this.cursors = { ...cursors }
  }
  async savePending(pending: PendingOp[]) {
    this.pending = [...pending]
  }
  async clear() {
    this.base = null
    this.pending = []
    this.cursors = {}
  }
}
