// Conexión con Supabase: cuentas, envío de operaciones y avisos en tiempo real.
// La librería se descarga solo si el proyecto tiene Supabase configurado.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppData } from '../../types'
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
        // Lee la sesión del link de confirmación / recuperación del correo
        detectSessionInUrl: true,
        flowType: 'implicit',
        storageKey: 'mm-pos:auth',
      },
    }),
  )
  return clientPromise
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
export class IdbSyncStorage implements SyncStorage {
  constructor(private userId: string) {}
  private key(k: string) {
    return `cloud:${this.userId}:${k}`
  }
  async load() {
    const [base, pending, cursors] = await Promise.all([
      kvGet<AppData>(this.key('base')),
      kvGet<PendingOp[]>(this.key('pending')),
      kvGet<Cursors>(this.key('cursors')),
    ])
    return { base: base ?? null, pending: pending ?? [], cursors: cursors ?? {} }
  }
  async saveBase(base: AppData, cursors: Cursors) {
    await kvSet([
      [this.key('base'), base],
      [this.key('cursors'), cursors],
    ])
  }
  async savePending(pending: PendingOp[]) {
    await kvSet([[this.key('pending'), pending]])
  }
  async clear() {
    await kvDelete([this.key('base'), this.key('pending'), this.key('cursors')])
  }
}
