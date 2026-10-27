// Conexión con Supabase: cuentas, envío de operaciones y avisos en tiempo real.
// La librería se descarga solo si el proyecto tiene Supabase configurado.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppData, Sale } from '../../types'
import { joinMonths, SalesChunks } from '../salesChunks'
import { kvDelete, kvGet, kvSet } from '../storage'
import type { SyncStorage } from './engine'
import { NetworkError, toWire, type ApplyResult, type Cursors, type PendingOp, type PullResult, type Remote } from './types'

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim()

/** true si el proyecto tiene las variables de Supabase (si no, la app funciona solo local) */
export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY)

let clientPromise: Promise<SupabaseClient> | null = null

export function getSupabase(): Promise<SupabaseClient> {
  if (!cloudEnabled) return Promise.reject(new Error('Supabase no está configurado'))
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL!, SUPABASE_KEY!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Lee la sesión del link de confirmación / recuperación del correo.
        // PKCE: el link solo abre sesión en el navegador que lo pidió (guarda un código secreto
        // al pedirlo). Con 'implicit', un link armado con la sesión de OTRA cuenta la metía en la
        // caja sin pedir nada.
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: 'mm-pos:auth',
      },
    }),
  )
  return clientPromise
}

/**
 * Cliente aparte, sin guardar sesión: sirve para comprobar el correo y la contraseña de la
 * cuenta de la caja SIN reemplazar la sesión abierta (si alguien prueba con otra cuenta,
 * la de la caja sigue abierta y no se entra).
 */
export async function createCheckClient(): Promise<SupabaseClient> {
  if (!cloudEnabled) throw new Error('Supabase no está configurado')
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'mm-pos:comprobar' },
  })
}

/** URL a la que vuelven los links de los correos (confirmación, nueva contraseña) */
export function appUrl(): string {
  return `${window.location.origin}${window.location.pathname}`
}

function toError(err: { message?: string } | null | undefined): Error {
  const msg = err?.message ?? 'Error desconocido'
  if (/Failed to fetch|NetworkError|Load failed|network|fetch failed/i.test(msg) || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return new NetworkError()
  }
  return new Error(msg)
}

export class SupabaseRemote implements Remote {
  constructor(
    private client: SupabaseClient,
    private userId: string,
  ) {}

  async applyOps(ops: PendingOp[]): Promise<ApplyResult> {
    const { data, error } = await this.client.rpc('apply_ops', { ops: ops.map(toWire) })
    if (error) throw toError(error)
    return (data as ApplyResult) ?? { errors: [] }
  }

  async pull(cursors: Cursors, overlapSeconds: number, maxRows: number): Promise<PullResult> {
    const { data, error } = await this.client.rpc('pull_changes', {
      cursors,
      overlap_seconds: overlapSeconds,
      max_rows: maxRows,
    })
    if (error) throw toError(error)
    return data as PullResult
  }

  subscribe(onChange: () => void): () => void {
    const filter = `owner_id=eq.${this.userId}`
    let channel = this.client.channel(`sync-${this.userId}`)
    for (const table of ['products', 'sales', 'expenses', 'stores']) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => onChange())
    }
    channel.subscribe()
    return () => {
      void this.client.removeChannel(channel)
    }
  }
}

/** Copia local de la cuenta (IndexedDB), separada de los datos "solo este dispositivo" */
// Las ventas van separadas por mes (ver salesChunks.ts): cada descarga reescribe solo los meses que cambiaron
export class IdbSyncStorage implements SyncStorage {
  private chunks: SalesChunks
  constructor(private userId: string) {
    this.chunks = new SalesChunks(this.key('base-sales'))
  }
  private key(k: string) {
    return `cloud:${this.userId}:${k}`
  }
  async load() {
    const [base, pending, cursors, months] = await Promise.all([
      kvGet<AppData>(this.key('base')),
      kvGet<PendingOp[]>(this.key('pending')),
      kvGet<Cursors>(this.key('cursors')),
      kvGet<string[]>(this.chunks.indexKey),
    ])
    this.chunks.forget()
    if (base && Array.isArray(months)) {
      const lists = await Promise.all(months.map((m) => kvGet<Sale[]>(this.chunks.monthKey(m))))
      const byMonth = new Map(months.map((m, i) => [m, lists[i]]))
      const joined = joinMonths(months, (m) => byMonth.get(m))
      if (joined.missing.length) {
        // Falta un mes en la copia local: se descarga todo de nuevo de la cuenta (lo pendiente se conserva)
        return { base: null, pending: pending ?? [], cursors: {} }
      }
      this.chunks.remember(joined.groups)
      return { base: { ...base, sales: joined.sales }, pending: pending ?? [], cursors: cursors ?? {} }
    }
    if (base && !base.sales?.length) {
      // Hay copia pero no se pudo leer la lista de meses: se descarga todo de nuevo para no mostrar la caja sin ventas
      return { base: null, pending: pending ?? [], cursors: {} }
    }
    // Versión anterior: las ventas venían dentro de la copia; el próximo guardado las separa por mes
    return { base: base ?? null, pending: pending ?? [], cursors: cursors ?? {} }
  }
  async saveBase(base: AppData, cursors: Cursors) {
    const sales = this.chunks.plan(base.sales)
    // La lista de meses va en el mismo guardado que los meses: nunca apunta a un mes sin escribir
    await kvSet([[this.key('base'), { ...base, sales: [] }], ...sales.put, [this.key('cursors'), cursors]])
    sales.commit()
    if (sales.remove.length) await kvDelete(sales.remove).catch(() => {}) // si falla, solo queda un mes que nadie lee
  }
  async savePending(pending: PendingOp[]) {
    await kvSet([[this.key('pending'), pending]])
  }
  async clear() {
    const months = (await kvGet<string[]>(this.chunks.indexKey).catch(() => undefined)) ?? []
    this.chunks.forget()
    await kvDelete([this.key('base'), this.key('pending'), this.key('cursors'), this.chunks.indexKey, ...this.chunks.keysFor(months)])
  }
}
