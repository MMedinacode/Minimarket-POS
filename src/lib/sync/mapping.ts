// Convierte las filas de Postgres (snake_case) al formato de la app.
import { DEFAULT_SETTINGS } from '../../data/mockData'
import type { AppData, Expense, ExpenseCategory, PaymentMethod, Product, Rotation, Sale, SaleItem, Settings, Unit } from '../../types'
import type { PullResult, Row } from './types'

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v))
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export function productFromRow(r: Row): Product {
  return {
    id: r.id,
    barcode: str(r.barcode),
    name: str(r.name),
    category: str(r.category) || 'Otros',
    cost: num(r.cost),
    price: num(r.price),
    stock: num(r.stock),
    unit: (r.unit as Unit) ?? 'un',
    rotation: (r.rotation as Rotation) ?? 'Media',
    minStock: numOrNull(r.min_stock),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  }
}

export function saleFromRow(r: Row): Sale {
  return {
    id: r.id,
    number: num(r.number),
    date: new Date(str(r.date)).toISOString(),
    items: (r.items as SaleItem[]) ?? [],
    total: num(r.total),
    cost: num(r.cost),
    payment: r.payment as PaymentMethod,
    received: numOrNull(r.received),
    change: numOrNull(r.change),
    voided: Boolean(r.voided),
    voidedAt: r.voided_at ? str(r.voided_at) : undefined,
  }
}

export function expenseFromRow(r: Row): Expense {
  return {
    id: r.id,
    date: new Date(str(r.date)).toISOString(),
    description: str(r.description),
    category: r.category as ExpenseCategory,
    amount: num(r.amount),
    paidFromCash: r.paid_from_cash !== false,
  }
}

export function settingsFromStore(store: PullResult['store'], fallback: Settings = DEFAULT_SETTINGS): Settings {
  if (!store) return fallback
  const s = (store.settings ?? {}) as Partial<Settings>
  return { ...DEFAULT_SETTINGS, ...s, thresholds: { ...DEFAULT_SETTINGS.thresholds, ...(s.thresholds ?? {}) } }
}

export function emptyCloudData(): AppData {
  return { products: [], sales: [], expenses: [], settings: { ...DEFAULT_SETTINGS }, isDemo: false }
}

function mergeList<T extends { id: string }>(list: T[], rows: Row[], map: (r: Row) => T): T[] {
  if (!rows.length) return list
  const byId = new Map(list.map((x) => [x.id, x]))
  for (const r of rows) {
    if (r.deleted) byId.delete(r.id)
    else byId.set(r.id, map(r))
  }
  return [...byId.values()]
}

/** Aplica lo descargado del servidor sobre la copia local */
export function mergeChanges(base: AppData, res: PullResult): AppData {
  return {
    products: mergeList(base.products, res.products, productFromRow),
    sales: mergeList(base.sales, res.sales, saleFromRow),
    expenses: mergeList(base.expenses, res.expenses, expenseFromRow),
    settings: res.store ? settingsFromStore(res.store, base.settings) : base.settings,
    isDemo: false,
  }
}
