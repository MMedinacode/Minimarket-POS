// Todas las modificaciones de datos pasan por este reducer (función pura),
// así es fácil de testear y nunca hay dos lugares cambiando el stock.
import type { AppData, Expense, Product, Sale, Settings } from '../types'
import { roundQty } from '../lib/utils'

export type StockAdjustMode = 'add' | 'remove' | 'set'

export type Action =
  | { type: 'hydrate'; data: AppData }
  | { type: 'addProduct'; product: Product }
  | { type: 'updateProduct'; id: string; patch: Partial<Omit<Product, 'id' | 'createdAt'>> }
  | { type: 'deleteProduct'; id: string }
  | { type: 'adjustStock'; id: string; mode: StockAdjustMode; qty: number }
  | { type: 'setProducts'; products: Product[] }
  | { type: 'registerSale'; sale: Omit<Sale, 'number'> }
  | { type: 'voidSale'; id: string }
  | { type: 'addExpense'; expense: Expense }
  | { type: 'deleteExpense'; id: string }
  | { type: 'updateSettings'; patch: Partial<Settings> }
  | { type: 'endDemo'; keepProducts: boolean }

const now = () => new Date().toISOString()

export function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'hydrate':
      return action.data

    case 'addProduct':
      return { ...state, products: [...state.products, action.product] }

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

    case 'registerSale': {
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

    default:
      return state
  }
}
