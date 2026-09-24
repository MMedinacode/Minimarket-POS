// Tipos compartidos por el motor de sincronización y sus "remotos"
// (Supabase en producción, PGlite en los tests).
import type { SyncAction } from '../../store/reducer'

/** Una acción del usuario esperando (o ya enviada) al servidor */
export interface PendingOp {
  opId: string
  /** Momento en que se creó (reloj del dispositivo) */
  at: number
  action: SyncAction
  /** Momento en que el servidor la confirmó. Se borra de la cola en la siguiente descarga. */
  ackedAt?: number
}

/** Hasta qué fecha (del servidor) ya se descargó cada tabla */
export interface Cursors {
  products?: string
  sales?: string
  expenses?: string
}

/** Filas tal como vienen de Postgres (snake_case) */
export type Row = Record<string, unknown> & { id: string; updated_at: string; deleted?: boolean }

export interface PullResult {
  store: { settings?: Record<string, unknown>; sale_seq?: number } | null
  products: Row[]
  sales: Row[]
  expenses: Row[]
}

export interface ApplyResult {
  errors: { opId: string; type?: string; error: string }[]
}

/** Lo que el motor necesita del servidor */
export interface Remote {
  applyOps(ops: PendingOp[]): Promise<ApplyResult>
  pull(cursors: Cursors, overlapSeconds: number, maxRows: number): Promise<PullResult>
  /** Avisa cuando otro dispositivo cambió algo. Devuelve cómo desuscribirse. */
  subscribe(onChange: () => void): () => void
}

/** Error de red: no hay internet o el servidor no responde (se reintenta solo) */
export class NetworkError extends Error {
  constructor(message = 'Sin conexión') {
    super(message)
    this.name = 'NetworkError'
  }
}

/** Formato en que viaja cada operación: { opId, type, ...datos } */
export function toWire(op: PendingOp): Record<string, unknown> {
  return { opId: op.opId, ...op.action }
}
