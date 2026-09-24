import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { buildDemoData, buildEmptyData } from '../data/mockData'
import { buildVelocityMap, getStockInfo, type StockInfo } from '../lib/stock'
import { clearData, loadData, requestPersistentStorage, saveData } from '../lib/storage'
import { uid } from '../lib/utils'
import type { AppData, Expense, PaymentMethod, Product, Sale, SaleItem, Settings } from '../types'
import { reducer, type StockAdjustMode } from './reducer'

export type NewProduct = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
export type NewExpense = Omit<Expense, 'id'>

export interface CheckoutInput {
  items: SaleItem[]
  payment: PaymentMethod
  received: number | null
}

interface Derived {
  /** Unidades vendidas por día (últimos 14 días) por producto */
  velocity: Map<string, number>
  /** Estado de stock (agotado/crítico/ok) y umbral de cada producto */
  stockInfo: Map<string, StockInfo>
}

interface StoreValue {
  data: AppData
  derived: Derived
  actions: ReturnType<typeof createActions>
}

const StoreContext = createContext<StoreValue | null>(null)

// Canal para avisar a otras pestañas abiertas que los datos cambiaron
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mm-pos-sync') : null
const TAB_ID = uid()

function createActions(dispatch: React.Dispatch<Parameters<typeof reducer>[1]>) {
  return {
    addProduct(input: NewProduct): Product {
      const iso = new Date().toISOString()
      const product: Product = { ...input, id: uid(), createdAt: iso, updatedAt: iso }
      dispatch({ type: 'addProduct', product })
      return product
    },
    updateProduct(id: string, patch: Partial<NewProduct>) {
      dispatch({ type: 'updateProduct', id, patch })
    },
    deleteProduct(id: string) {
      dispatch({ type: 'deleteProduct', id })
    },
    adjustStock(id: string, mode: StockAdjustMode, qty: number) {
      dispatch({ type: 'adjustStock', id, mode, qty })
    },
    setProducts(products: Product[]) {
      dispatch({ type: 'setProducts', products })
    },
    checkout({ items, payment, received }: CheckoutInput): Omit<Sale, 'number'> {
      const total = items.reduce((a, it) => a + Math.round(it.qty * it.unitPrice), 0)
      const cost = items.reduce((a, it) => a + Math.round(it.qty * it.unitCost), 0)
      const sale: Omit<Sale, 'number'> = {
        id: uid(),
        date: new Date().toISOString(),
        items,
        total,
        cost,
        payment,
        received: payment === 'Efectivo' ? received : null,
        change: payment === 'Efectivo' && received !== null ? received - total : null,
        voided: false,
      }
      dispatch({ type: 'registerSale', sale })
      return sale
    },
    voidSale(id: string) {
      dispatch({ type: 'voidSale', id })
    },
    addExpense(input: NewExpense) {
      dispatch({ type: 'addExpense', expense: { ...input, id: uid() } })
    },
    deleteExpense(id: string) {
      dispatch({ type: 'deleteExpense', id })
    },
    updateSettings(patch: Partial<Settings>) {
      dispatch({ type: 'updateSettings', patch })
    },
    endDemo(keepProducts: boolean) {
      dispatch({ type: 'endDemo', keepProducts })
    },
    loadDemo() {
      dispatch({ type: 'hydrate', data: buildDemoData() })
    },
    async wipeAll(settings: Settings) {
      await clearData()
      dispatch({ type: 'hydrate', data: buildEmptyData(settings) })
    },
  }
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, undefined, () => buildEmptyData())
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const latest = useRef(data)
  latest.current = data
  const actions = useMemo(() => createActions(dispatch), [])

  // 1) Cargar datos guardados (o los de demostración la primera vez)
  useEffect(() => {
    let cancelled = false
    requestPersistentStorage()
    loadData()
      .then((saved) => {
        if (cancelled) return
        dispatch({ type: 'hydrate', data: saved ?? buildDemoData() })
        setReady(true)
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 2) Guardar automáticamente cada cambio (con una pequeña espera para agrupar)
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => {
      saveData(data)
        .then((wrote) => wrote && channel?.postMessage({ from: TAB_ID }))
        .catch((err) => console.error('No se pudo guardar', err))
    }, 200)
    return () => clearTimeout(t)
  }, [data, ready])

  // 3) Guardar al cerrar/ocultar la pestaña y recargar si otra pestaña guardó
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') void saveData(latest.current)
    }
    const onMessage = (ev: MessageEvent<{ from: string }>) => {
      if (ev.data?.from === TAB_ID) return
      loadData().then((saved) => saved && dispatch({ type: 'hydrate', data: saved }))
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    channel?.addEventListener('message', onMessage)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
      channel?.removeEventListener('message', onMessage)
    }
  }, [])

  const velocity = useMemo(() => buildVelocityMap(data.sales), [data.sales])
  const stockInfo = useMemo(
    () => new Map(data.products.map((p) => [p.id, getStockInfo(p, data.settings, velocity.get(p.id) ?? 0)])),
    [data.products, data.settings, velocity],
  )

  const value = useMemo<StoreValue>(
    () => ({ data, derived: { velocity, stockInfo }, actions }),
    [data, velocity, stockInfo, actions],
  )

  if (loadError) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-semibold">No se pudieron cargar los datos</p>
          <p className="mt-1 text-muted">{loadError}</p>
        </div>
      </div>
    )
  }
  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="size-10 animate-spin rounded-full border-4 border-brand/30 border-t-brand" aria-label="Cargando" />
      </div>
    )
  }
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore debe usarse dentro de <AppStoreProvider>')
  return ctx
}

export const useData = () => useStore().data
export const useDerived = () => useStore().derived
export const useActions = () => useStore().actions
