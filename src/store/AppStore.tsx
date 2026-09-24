// Estado global de la app. Funciona en dos modos:
//  · local: los datos viven solo en este navegador (como al principio).
//  · nube:  hay una cuenta; los datos se sincronizan entre PC y celular
//           mediante el motor de sync (lib/sync/engine.ts).
// Las pantallas no notan la diferencia: todas usan las mismas acciones.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { CloudOff, Loader2, LogOut, RotateCcw } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useToast } from '../components/ui/Toast'
import { buildDemoData, buildEmptyData, DEFAULT_SETTINGS } from '../data/mockData'
import { buildVelocityMap, getStockInfo, type StockInfo } from '../lib/stock'
import { loadData, readPref, requestPersistentStorage, saveData, writePref } from '../lib/storage'
import { SyncEngine, type SyncSnapshot } from '../lib/sync/engine'
import { appUrl, cloudEnabled, getSupabase, IdbSyncStorage, SupabaseRemote } from '../lib/sync/supabase'
import { uid } from '../lib/utils'
import type { AppData, Expense, PaymentMethod, Product, Sale, SaleItem, Settings } from '../types'
import { reducer, type Action, type ProductPatch, type StockAdjustMode } from './reducer'

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

export interface CloudUser {
  id: string
  email: string
}

export interface CloudState {
  enabled: boolean
  user: CloudUser | null
  sync: SyncSnapshot | null
  /** Llegó desde el link de "recuperar contraseña" del correo */
  recovery: boolean
  /** Resumen de los datos "solo este dispositivo" (para ofrecer subirlos) */
  localSummary: { products: number; sales: number; isDemo: boolean }
}

interface StoreValue {
  data: AppData
  derived: Derived
  actions: ReturnType<typeof createActions>
  cloud: CloudState
  cloudApi: ReturnType<typeof createCloudApi>
}

const StoreContext = createContext<StoreValue | null>(null)

// Canal para avisar a otras pestañas abiertas que los datos cambiaron (modo local)
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mm-pos-sync') : null
const TAB_ID = uid()

function createActions(dispatch: (a: Action) => void) {
  return {
    addProduct(input: NewProduct): Product {
      const iso = new Date().toISOString()
      const product: Product = { ...input, id: uid(), createdAt: iso, updatedAt: iso }
      dispatch({ type: 'addProduct', product })
      return product
    },
    updateProduct(id: string, patch: ProductPatch) {
      dispatch({ type: 'updateProduct', id, patch })
    },
    deleteProduct(id: string) {
      dispatch({ type: 'deleteProduct', id })
    },
    adjustStock(id: string, mode: StockAdjustMode, qty: number) {
      dispatch({ type: 'adjustStock', id, mode, qty })
    },
    /** Importación "reemplazar todo" */
    setProducts(products: Product[]) {
      dispatch({ type: 'setProducts', products })
    },
    /** Importación "actualizar y agregar" */
    upsertProducts(products: Product[]) {
      dispatch({ type: 'upsertProducts', products })
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
    wipeAll() {
      dispatch({ type: 'wipeAll' })
    },
  }
}

interface CloudDeps {
  engine: () => SyncEngine | null
  localData: () => AppData
  setRecovery: (v: boolean) => void
}

function friendlyAuthError(msg: string): string {
  if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos'
  if (/Email not confirmed/i.test(msg)) return 'Falta confirmar tu correo: revisa tu bandeja de entrada (y spam)'
  if (/already registered|already been registered/i.test(msg)) return 'Ese correo ya tiene cuenta: inicia sesión'
  if (/Password should be at least/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres'
  if (/rate limit|too many/i.test(msg)) return 'Demasiados intentos, espera unos minutos'
  if (/Failed to fetch|network/i.test(msg)) return 'Sin conexión a internet'
  return msg
}

function createCloudApi(deps: CloudDeps) {
  const client = (): Promise<SupabaseClient> => getSupabase()
  return {
    async signIn(email: string, password: string): Promise<string | null> {
      const { error } = await (await client()).auth.signInWithPassword({ email: email.trim(), password })
      return error ? friendlyAuthError(error.message) : null
    },
    async signUp(email: string, password: string, businessName: string): Promise<{ error: string | null; needsConfirmation: boolean }> {
      if (businessName.trim()) writePref('pendingBizName', businessName.trim())
      const { data, error } = await (await client()).auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: appUrl() },
      })
      if (error) return { error: friendlyAuthError(error.message), needsConfirmation: false }
      return { error: null, needsConfirmation: !data.session }
    },
    async resetPassword(email: string): Promise<string | null> {
      const { error } = await (await client()).auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl() })
      return error ? friendlyAuthError(error.message) : null
    },
    async updatePassword(password: string): Promise<string | null> {
      const { error } = await (await client()).auth.updateUser({ password })
      if (!error) deps.setRecovery(false)
      return error ? friendlyAuthError(error.message) : null
    },
    /** Cierra la sesión de la cuenta. Si hay ventas sin subir, avisa (salvo force). */
    async signOut(force = false): Promise<{ unsynced: number }> {
      const engine = deps.engine()
      const unsynced = engine?.getSnapshot().pending ?? 0
      if (unsynced > 0 && !force) return { unsynced }
      engine?.destroy() // que no vuelva a escribir la copia local mientras se borra
      const c = await client()
      const { data } = await c.auth.getSession()
      if (data.session) await new IdbSyncStorage(data.session.user.id).clear()
      await c.auth.signOut({ scope: 'local' })
      return { unsynced: 0 }
    },
    syncNow() {
      void deps.engine()?.syncNow()
    },
    /** Sube a la cuenta los productos, ventas y gastos de "solo este dispositivo" */
    uploadLocal() {
      const local = deps.localData()
      deps.engine()?.dispatch({
        type: 'importAll',
        products: local.products,
        sales: local.sales,
        expenses: local.expenses,
        settings: local.settings,
      })
    },
    clearRecovery() {
      deps.setRecovery(false)
    },
  }
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const toast = useToast()

  // ---------- Modo local ----------
  const [localData, dispatchLocal] = useReducer(reducer, undefined, () => buildEmptyData())
  const [localReady, setLocalReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const latestLocal = useRef(localData)
  latestLocal.current = localData

  // ---------- Modo nube ----------
  // undefined = todavía revisando si hay sesión iniciada
  const [user, setUser] = useState<CloudUser | null | undefined>(cloudEnabled ? undefined : null)
  const [sync, setSync] = useState<SyncSnapshot | null>(null)
  const [recovery, setRecovery] = useState(false)
  const engineRef = useRef<SyncEngine | null>(null)

  const mode: 'local' | 'cloud' = user ? 'cloud' : 'local'
  const modeRef = useRef(mode)
  modeRef.current = mode

  // Todas las acciones pasan por aquí y se van al modo que corresponda
  const dispatch = useCallback((action: Action) => {
    if (modeRef.current === 'cloud') {
      if (action.type === 'hydrate') return // cargar la demo no aplica a una cuenta real
      engineRef.current?.dispatch(action)
    } else {
      dispatchLocal(action)
    }
  }, [])
  const actions = useMemo(() => createActions(dispatch), [dispatch])
  const cloudApi = useMemo(
    () =>
      createCloudApi({
        engine: () => engineRef.current,
        localData: () => latestLocal.current,
        setRecovery,
      }),
    [],
  )

  // 1) Cargar los datos locales (o los de demostración la primera vez)
  useEffect(() => {
    let cancelled = false
    requestPersistentStorage()
    loadData()
      .then((saved) => {
        if (cancelled) return
        dispatchLocal({ type: 'hydrate', data: saved ?? buildDemoData() })
        setLocalReady(true)
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 2) Guardar automáticamente los cambios locales
  useEffect(() => {
    if (!localReady) return
    const t = setTimeout(() => {
      saveData(localData)
        .then((wrote) => wrote && channel?.postMessage({ from: TAB_ID }))
        .catch((err) => console.error('No se pudo guardar', err))
    }, 200)
    return () => clearTimeout(t)
  }, [localData, localReady])

  // 3) Guardar al ocultar la pestaña y recargar si otra pestaña guardó
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') void saveData(latestLocal.current)
    }
    const onMessage = (ev: MessageEvent<{ from: string }>) => {
      if (ev.data?.from === TAB_ID) return
      loadData().then((saved) => saved && dispatchLocal({ type: 'hydrate', data: saved }))
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

  // 4) Sesión de la cuenta (si Supabase está configurado)
  useEffect(() => {
    if (!cloudEnabled) return
    let unsub: (() => void) | undefined
    let cancelled = false
    const toUser = (u: { id: string; email?: string } | undefined | null): CloudUser | null =>
      u ? { id: u.id, email: u.email ?? '' } : null
    getSupabase()
      .then(async (client) => {
        const { data } = await client.auth.getSession()
        if (cancelled) return
        setUser(toUser(data.session?.user))
        const { data: sub } = client.auth.onAuthStateChange((event, session) => {
          if (event === 'PASSWORD_RECOVERY') setRecovery(true)
          const next = toUser(session?.user)
          setUser((prev) => (prev?.id === next?.id ? prev : next))
        })
        unsub = () => sub.subscription.unsubscribe()
      })
      .catch((err) => {
        console.error('No se pudo iniciar Supabase', err)
        if (!cancelled) setUser(null)
      })
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [])

  // 5) Motor de sincronización mientras haya sesión
  useEffect(() => {
    if (!user) return
    let engine: SyncEngine | null = null
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    getSupabase().then((client) => {
      if (cancelled) return
      engine = new SyncEngine(new SupabaseRemote(client, user.id), new IdbSyncStorage(user.id), (f) =>
        toast.error(`No se pudo guardar en la nube (${f.type}): ${f.error}`),
      )
      engineRef.current = engine
      let firstSync = true
      unsubscribe = engine.subscribe((snap) => {
        setSync(snap)
        // Nombre del negocio elegido al crear la cuenta
        if (firstSync && snap.status === 'synced' && snap.data) {
          firstSync = false
          const biz = readPref<string | null>('pendingBizName', null)
          if (biz) {
            writePref('pendingBizName', null)
            if (snap.data.settings.businessName === DEFAULT_SETTINGS.businessName) {
              engine?.dispatch({ type: 'updateSettings', patch: { businessName: biz } })
            }
          }
        }
      })
      void engine.start()
    })
    return () => {
      cancelled = true
      unsubscribe?.()
      engine?.destroy()
      if (engineRef.current === engine) engineRef.current = null
      setSync(null)
    }
  }, [user, toast])

  const data: AppData | null = mode === 'cloud' ? (sync?.data ?? null) : localData

  const velocity = useMemo(() => buildVelocityMap(data?.sales ?? []), [data?.sales])
  const stockInfo = useMemo(
    () =>
      new Map(
        (data?.products ?? []).map((p) => [p.id, getStockInfo(p, data!.settings, velocity.get(p.id) ?? 0)]),
      ),
    [data, velocity],
  )

  const cloud = useMemo<CloudState>(
    () => ({
      enabled: cloudEnabled,
      user: user ?? null,
      sync,
      recovery,
      localSummary: { products: localData.products.length, sales: localData.sales.length, isDemo: localData.isDemo },
    }),
    [user, sync, recovery, localData.products.length, localData.sales.length, localData.isDemo],
  )

  const value = useMemo<StoreValue | null>(
    () => (data ? { data, derived: { velocity, stockInfo }, actions, cloud, cloudApi } : null),
    [data, velocity, stockInfo, actions, cloud, cloudApi],
  )

  if (loadError) {
    return (
      <FullScreen>
        <p className="text-lg font-semibold">No se pudieron cargar los datos</p>
        <p className="mt-1 text-muted">{loadError}</p>
      </FullScreen>
    )
  }

  // Cuenta iniciada pero sin copia local y sin poder descargar
  if (mode === 'cloud' && !sync?.data && (sync?.status === 'offline' || sync?.status === 'error')) {
    return (
      <FullScreen>
        <CloudOff className="mx-auto size-10 text-subtle" />
        <p className="mt-3 text-lg font-semibold">No pudimos descargar tus datos</p>
        <p className="mt-1 max-w-sm text-sm text-muted">
          {sync.status === 'offline'
            ? 'Este dispositivo no tiene internet. La primera vez que entras con tu cuenta necesitas conexión; después funciona también sin internet.'
            : sync.error}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-4 font-semibold text-on-brand" onClick={() => cloudApi.syncNow()}>
            <RotateCcw className="size-4" /> Reintentar
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong px-4 font-semibold"
            onClick={() => void cloudApi.signOut(true)}
          >
            <LogOut className="size-4" /> Salir de la cuenta
          </button>
        </div>
      </FullScreen>
    )
  }

  if (!value || user === undefined || !localReady) {
    return (
      <FullScreen>
        <Loader2 className="mx-auto size-9 animate-spin text-brand" aria-label="Cargando" />
        {mode === 'cloud' && <p className="mt-3 text-sm text-muted">Descargando tus datos…</p>}
      </FullScreen>
    )
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>{children}</div>
    </div>
  )
}

function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore debe usarse dentro de <AppStoreProvider>')
  return ctx
}

export const useData = () => useStore().data
export const useDerived = () => useStore().derived
export const useActions = () => useStore().actions
export const useCloud = () => {
  const s = useStore()
  return { ...s.cloud, api: s.cloudApi }
}
