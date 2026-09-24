// Todas las modificaciones de datos pasan por este reducer (función pura),
// así es fácil de testear y nunca hay dos lugares cambiando el stock.
//
// Con la sincronización en la nube, cada acción también es una "operación"
// que se envía al servidor (ver supabase/schema.sql → apply_ops), y el
// servidor la aplica con las mismas reglas. Por eso las acciones describen
// lo que PASÓ ("se vendieron 2") y no el resultado ("quedan 34").
import type { AppData, Expense, Product, Sale, Settings } from '../types'
import { roundQty } from '../lib/utils'

export type StockAdjustMode = 'add' | 'remove' | 'set'

export type ProductPatch = Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>>

export type Action =
  | { type: 'hydrate'; data: AppData }
  | { type: 'addProduct'; product: Product }
  | { type: 'updateProduct'; id: string; patch: ProductPatch }
  | { type: 'deleteProduct'; id: string }
  | { type: 'adjustStock'; id: string; mode: StockAdjustMode; qty: number }
  /** Importación "reemplazar todo": el inventario queda igual a esta lista */
  | { type: 'setProducts'; products: Product[] }
  /** Importación "actualizar y agregar": solo toca estos productos */
  | { type: 'upsertProducts'; products: Product[] }
  | { type: 'registerSale'; sale: Omit<Sale, 'number'> }
  | { type: 'voidSale'; id: string }
  | { type: 'addExpense'; expense: Expense }
  | { type: 'deleteExpense'; id: string }
  | { type: 'updateSettings'; patch: Partial<Settings> }
  | { type: 'endDemo'; keepProducts: boolean }
  /** Borra productos, ventas y gastos (mantiene los ajustes) */
  | { type: 'wipeAll' }
  /** Sube a la cuenta los datos que había en este dispositivo */
  | { type: 'importAll'; products: Product[]; sales: Sale[]; expenses: Expense[]; settings: Settings }

/** Acciones que viajan al servidor ('hydrate' es solo local) */
export type SyncAction = Exclude<Action, { type: 'hydrate' }>

const now = () => new Date().toISOString()

function upsertById<T extends { id: string }>(list: T[], items: T[]): T[] {
  const incoming = new Map(items.map((x) => [x.id, x]))
  const out = list.map((x) => incoming.get(x.id) ?? x)
  const known = new Set(list.map((x) => x.id))
  for (const x of items) if (!known.has(x.id)) out.push(x)
  return out
}

export function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'hydrate':
      return action.data

    case 'addProduct':
      return { ...state, products: upsertById(state.products, [action.product]) }

    case 'updateProduct':
      return {
        ...state,
        products: state.products.map((p) => (p.id === action.id ? { ...p, ...action.patch, updatedAt: now() } : p)),
      }

    case 'deleteProduct':
      return { ...state, products: state.products.filter((p) => p.id !== action.id) }

    case 'adjustStock':
      return {
        ...state,
        products: state.products.map((p) => {
          if (p.id !== action.id) return p
          const next =
            action.mode === 'set' ? action.qty : action.mode === 'add' ? p.stock + action.qty : p.stock - action.qty
          return { ...p, stock: roundQty(Math.max(0, next), p.unit), updatedAt: now() }
        }),
      }

    case 'setProducts':
      return { ...state, products: action.products }

    case 'upsertProducts':
      return { ...state, products: upsertById(state.products, action.products) }

    case 'registerSale': {
      // Idempotente: si la venta ya está (reintento), no se descuenta de nuevo
      if (state.sales.some((s) => s.id === action.sale.id)) return state
      const number = state.sales.reduce((max, s) => Math.max(max, s.number), 0) + 1
      const sold = new Map<string, number>()
      for (const it of action.sale.items) sold.set(it.productId, (sold.get(it.productId) ?? 0) + it.qty)
      const allowNegative = state.settings.allowNegativeStock
      return {
        ...state,
        sales: [...state.sales, { ...action.sale, number }],
        products: state.products.map((p) => {
          const qty = sold.get(p.id)
          if (!qty) return p
          let stock = roundQty(p.stock - qty, p.unit)
          if (!allowNegative) stock = Math.max(0, stock)
          return { ...p, stock, updatedAt: action.sale.date }
        }),
      }
    }

    case 'voidSale': {
      const sale = state.sales.find((s) => s.id === action.id)
      if (!sale || sale.voided) return state
      const back = new Map<string, number>()
      for (const it of sale.items) back.set(it.productId, (back.get(it.productId) ?? 0) + it.qty)
      return {
        ...state,
        sales: state.sales.map((s) => (s.id === action.id ? { ...s, voided: true, voidedAt: now() } : s)),
        products: state.products.map((p) => {
          const qty = back.get(p.id)
          return qty ? { ...p, stock: roundQty(p.stock + qty, p.unit), updatedAt: now() } : p
        }),
      }
    }

    case 'addExpense':
      if (state.expenses.some((e) => e.id === action.expense.id)) return state
      return { ...state, expenses: [...state.expenses, action.expense] }

    case 'deleteExpense':
      return { ...state, expenses: state.expenses.filter((e) => e.id !== action.id) }

    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } }

    case 'endDemo':
      return {
        ...state,
        products: action.keepProducts ? state.products : [],
        sales: [],
        expenses: [],
        isDemo: false,
      }

    case 'wipeAll':
      return { ...state, products: [], sales: [], expenses: [], isDemo: false }

    case 'importAll':
      return {
        ...state,
        products: upsertById(state.products, action.products),
        sales: upsertById(state.sales, action.sales),
        expenses: upsertById(state.expenses, action.expenses),
        settings: { ...state.settings, ...action.settings },
        isDemo: false,
      }

    default:
      return state
  }
}
