// Las ventas se guardan separadas por mes. Así, al cobrar, solo se reescribe el mes actual y no
// todo el historial: con un año de ventas (~50.000) guardar todo de nuevo congelaba la caja
// cerca de un segundo en cada venta.
import type { Sale } from '../types'

/** Mes de una venta ("2026-10"). Si la fecha viene rara, va a un grupo aparte (nunca se pierde). */
export function monthOf(sale: Sale): string {
  const m = typeof sale.date === 'string' ? sale.date.slice(0, 7) : ''
  return /^\d{4}-\d{2}$/.test(m) ? m : 'otras'
}

export function groupByMonth(sales: Sale[]): Map<string, Sale[]> {
  const out = new Map<string, Sale[]>()
  for (const s of sales) {
    const m = monthOf(s)
    const list = out.get(m)
    if (list) list.push(s)
    else out.set(m, [s])
  }
  return out
}

/** Mismas ventas, en el mismo orden y sin cambios (la caja nunca modifica una venta: crea una nueva) */
function sameList(a: Sale[] | undefined, b: Sale[]): boolean {
  if (!a || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export interface ChunkPlan {
  /** Lo que hay que escribir: los meses que cambiaron y la lista de meses */
  put: [string, unknown][]
  /** Meses que ya no tienen ventas (ej. después de "Borrar todo") */
  remove: string[]
  /** Llamar cuando el guardado salió bien */
  commit: () => void
}

/**
 * Recuerda qué se guardó de cada mes para escribir solo lo que cambió.
 * Claves: `<prefijo>@meses` (la lista de meses) y `<prefijo>@<mes>` (las ventas de ese mes).
 */
export class SalesChunks {
  private saved = new Map<string, Sale[]>()
  private savedMonths: string[] | null = null

  constructor(private prefix: string) {}

  get indexKey() {
    return `${this.prefix}@meses`
  }

  monthKey(month: string) {
    return `${this.prefix}@${month}`
  }

  /** Lo leído al abrir la caja ya está guardado: no hace falta escribirlo de nuevo */
  remember(groups: Map<string, Sale[]>) {
    this.saved = new Map(groups)
    this.savedMonths = [...groups.keys()].sort()
  }

  /** Olvida lo guardado: el próximo guardado escribe todos los meses */
  forget() {
    this.saved.clear()
    this.savedMonths = null
  }

  plan(sales: Sale[]): ChunkPlan {
    const groups = groupByMonth(sales)
    const months = [...groups.keys()].sort()
    const put: [string, unknown][] = []
    for (const m of months) {
      const list = groups.get(m)!
      if (!sameList(this.saved.get(m), list)) put.push([this.monthKey(m), list])
    }
    const indexChanged = !this.savedMonths || this.savedMonths.join() !== months.join()
    if (indexChanged) put.push([this.indexKey, months])
    const remove = (this.savedMonths ?? []).filter((m) => !groups.has(m)).map((m) => this.monthKey(m))
    return {
      put,
      remove,
      commit: () => {
        this.saved = groups
        this.savedMonths = months
      },
    }
  }

  /** Claves de cada mes, para leerlas al abrir */
  keysFor(months: string[]): string[] {
    return months.map((m) => this.monthKey(m))
  }
}

/** Junta los meses leídos en una sola lista, del más antiguo al más nuevo */
export function joinMonths(months: string[], read: (month: string) => Sale[] | undefined): { sales: Sale[]; groups: Map<string, Sale[]>; missing: string[] } {
  const groups = new Map<string, Sale[]>()
  const missing: string[] = []
  for (const m of [...months].sort()) {
    const list = read(m)
    if (Array.isArray(list)) groups.set(m, list)
    else missing.push(m)
  }
  return { sales: [...groups.values()].flat(), groups, missing }
}
