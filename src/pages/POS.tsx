import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  AlertTriangle,
  Banknote,
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Landmark,
  Minus,
  Plus,
  ScanBarcode,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react'
import { ProductForm } from '../components/ProductForm'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Badge, Button, Card, EmptyState, Input, Kbd, MoneyInput } from '../components/ui/primitives'
import { useToast } from '../components/ui/Toast'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { beepError, beepOk, chaChing } from '../lib/sound'
import { readPref, writePref } from '../lib/storage'
import { cn, formatCLP, formatQty, normalizeText, parseLocaleNumber, roundQty } from '../lib/utils'
import { useActions, useData, useDerived } from '../store/AppStore'
import { PAYMENT_METHODS, type PaymentMethod, type Product, type Sale, type SaleItem } from '../types'

const CameraScanner = lazy(() => import('../components/CameraScanner'))

interface CartLine {
  productId: string
  qty: number
}

const PAYMENT_ICONS: Record<PaymentMethod, typeof Banknote> = {
  Efectivo: Banknote,
  Débito: CreditCard,
  Crédito: CreditCard,
  Transferencia: Landmark,
}

const FREQUENT = '__frecuentes__'
const stripZeros = (code: string) => code.replace(/^0+/, '')

/** Montos sugeridos para pago en efectivo: exacto y los billetes que calzan */
function quickAmounts(total: number): number[] {
  const out = new Set<number>([total])
  for (const bill of [1000, 2000, 5000, 10000, 20000]) {
    const v = Math.ceil(total / bill) * bill
    if (v > total) out.add(v)
    if (out.size >= 5) break
  }
  return [...out]
}

export default function POS() {
  const { products, settings, sales } = useData()
  const { stockInfo, velocity } = useDerived()
  const actions = useActions()
  const toast = useToast()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const [cart, setCart] = useState<CartLine[]>(() => readPref<CartLine[]>('cart', []))
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>(FREQUENT)
  const [cameraOn, setCameraOn] = useState(false)
  const [payment, setPayment] = useState<PaymentMethod>('Efectivo')
  const [received, setReceived] = useState<number | null>(null)
  const [receipt, setReceipt] = useState<Sale | null>(null)
  const [weightFor, setWeightFor] = useState<Product | null>(null)
  const [createFor, setCreateFor] = useState<string | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [flash, setFlash] = useState<{ id: string; n: number } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // El carrito sobrevive a un refresco de página
  useEffect(() => writePref('cart', cart), [cart])

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const byCode = useMemo(() => {
    const m = new Map<string, Product>()
    for (const p of products) {
      if (!p.barcode) continue
      m.set(p.barcode, p)
      m.set(stripZeros(p.barcode), p)
    }
    return m
  }, [products])

  // Líneas del carrito con datos actuales del producto (si se borró, se descarta)
  const lines = useMemo(
    () => cart.map((l) => ({ ...l, product: byId.get(l.productId) })).filter((l): l is CartLine & { product: Product } => Boolean(l.product)),
    [cart, byId],
  )
  const total = lines.reduce((a, l) => a + Math.round(l.qty * l.product.price), 0)
  const itemCount = lines.reduce((a, l) => a + (l.product.unit === 'kg' ? 1 : l.qty), 0)
  const effectiveReceived = payment === 'Efectivo' ? (received ?? total) : null
  const change = effectiveReceived !== null ? effectiveReceived - total : 0
  const missing = payment === 'Efectivo' && received !== null && received < total ? total - received : 0

  // ---------- Agregar productos ----------

  /** Sin qty: los productos a granel preguntan el peso; los por unidad suman 1 */
  const addToCart = useCallback(
    (p: Product, qty?: number) => {
      if (qty === undefined) {
        if (p.unit === 'kg') {
          setWeightFor(p)
          return
        }
        qty = 1
      }
      const inCart = cart.find((l) => l.productId === p.id)?.qty ?? 0
      const wanted = roundQty(inCart + qty, p.unit)
      if (!settings.allowNegativeStock && wanted > p.stock) {
        beepError()
        toast.error(
          p.stock <= 0 ? `"${p.name}" está agotado` : `Solo quedan ${formatQty(p.stock, p.unit)} de "${p.name}"`,
        )
        return
      }
      setCart((c) =>
        c.some((l) => l.productId === p.id)
          ? c.map((l) => (l.productId === p.id ? { ...l, qty: wanted } : l))
          : [...c, { productId: p.id, qty: wanted }],
      )
      setFlash((f) => ({ id: p.id, n: (f?.n ?? 0) + 1 }))
      beepOk()
    },
    [cart, settings.allowNegativeStock, toast],
  )

  const handleCode = useCallback(
    (raw: string) => {
      const code = raw.trim()
      if (!code) return
      setReceipt(null) // escanear durante el comprobante = empezar la siguiente venta
      const p = byCode.get(code) ?? byCode.get(stripZeros(code))
      if (p) {
        addToCart(p)
        return
      }
      beepError()
      toast.error(
        <span>
          El código <strong className="font-mono">{code}</strong> no está registrado
        </span>,
        { action: { label: 'Crear producto', onClick: () => setCreateFor(code) }, duration: 7000 },
      )
    },
    [byCode, addToCart, toast],
  )

  // Pistola lectora: siempre escuchando mientras no haya formularios abiertos
  useBarcodeScanner({ onScan: handleCode, enabled: createFor === null && !weightFor && !confirmClear })

  // ---------- Carrito ----------

  const setQty = (id: string, qty: number) => {
    const p = byId.get(id)
    if (!p) return
    const q = roundQty(qty, p.unit)
    if (q <= 0) {
      setCart((c) => c.filter((l) => l.productId !== id))
      return
    }
    if (!settings.allowNegativeStock && q > p.stock) {
      beepError()
      toast.error(`Solo quedan ${formatQty(p.stock, p.unit)} de "${p.name}"`)
      return
    }
    setCart((c) => c.map((l) => (l.productId === id ? { ...l, qty: q } : l)))
  }

  const clearCart = () => {
    setCart([])
    setReceived(null)
  }

  const checkout = useCallback(() => {
    if (!lines.length) return
    if (payment === 'Efectivo' && received !== null && received < total) {
      beepError()
      toast.error(`Falta ${formatCLP(total - received)} para completar el pago`)
      return
    }
    if (!settings.allowNegativeStock) {
      const short = lines.find((l) => l.qty > l.product.stock)
      if (short) {
        toast.error(`No hay stock suficiente de "${short.product.name}"`)
        return
      }
    }
    const items: SaleItem[] = lines.map(({ product: p, qty }) => ({
      productId: p.id,
      barcode: p.barcode,
      name: p.name,
      category: p.category,
      unit: p.unit,
      qty,
      unitPrice: p.price,
      unitCost: p.cost,
    }))
    const number = sales.reduce((m, s) => Math.max(m, s.number), 0) + 1
    const sale = actions.checkout({ items, payment, received: payment === 'Efectivo' ? (received ?? total) : null })
    chaChing()
    setReceipt({ ...sale, number })
    setCart([])
    setReceived(null)
    setPayment('Efectivo')
    setCartOpen(false)
  }, [lines, payment, received, total, settings.allowNegativeStock, sales, actions, toast])

  // Atajos: F2 buscar · F9 cobrar · Esc limpiar búsqueda
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'F9' && !receipt) {
        e.preventDefault()
        checkout()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [checkout, receipt])

  // ---------- Grilla de productos ----------

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of products) counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
    return [...counts.keys()].sort((a, b) => a.localeCompare(b, 'es'))
  }, [products])

  const visible = useMemo(() => {
    const q = normalizeText(query)
    if (q) {
      const words = q.split(/\s+/)
      return products
        .filter((p) => {
          const hay = normalizeText(p.name)
          return p.barcode.includes(q) || words.every((w) => hay.includes(w))
        })
        .sort((a, b) => Number(b.barcode === q) - Number(a.barcode === q) || (velocity.get(b.id) ?? 0) - (velocity.get(a.id) ?? 0))
        .slice(0, 60)
    }
    if (category === FREQUENT) {
      return [...products].sort((a, b) => (velocity.get(b.id) ?? 0) - (velocity.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'es')).slice(0, 24)
    }
    return products.filter((p) => p.category === category).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [products, query, category, velocity])

  const onSearchKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') setQuery('')
    if (e.key !== 'Enter') return
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    const exact = byCode.get(q) ?? byCode.get(stripZeros(q))
    if (exact) addToCart(exact)
    else if (visible.length === 1 || (visible.length && /^\D/.test(q))) addToCart(visible[0])
    else if (/^\d{4,}$/.test(q)) handleCode(q)
    else return
    setQuery('')
  }

  // ---------- Panel del carrito (se reutiliza en escritorio y en celular) ----------

  const cartPanel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="size-5 text-subtle" />
          <h2 className="font-bold">Venta actual</h2>
          {lines.length > 0 && <Badge tone="brand">{lines.length} {lines.length === 1 ? 'producto' : 'productos'}</Badge>}
        </div>
        {lines.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
            <Trash2 /> Vaciar
          </Button>
        )}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <EmptyState icon={<ScanBarcode />} title="Escanea un producto" className="h-full">
            Usa la pistola lectora, la cámara o toca un producto de la lista.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {lines.map(({ product: p, qty }) => {
              const lineTotal = Math.round(qty * p.price)
              const step = p.unit === 'kg' ? 0.1 : 1
              return (
                <li
                  key={flash?.id === p.id ? `${p.id}-${flash.n}` : p.id}
                  className={cn('px-4 py-2.5', flash?.id === p.id && 'animate-flash')}
                >
                  <div className="flex items-start gap-2">
                    <p className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug font-semibold" title={p.name}>
                      {p.name}
                    </p>
                    <button
                      type="button"
                      className="-mt-1 -mr-1.5 grid size-8 shrink-0 place-items-center rounded-lg text-subtle hover:bg-danger-soft hover:text-danger-ink"
                      onClick={() => setQty(p.id, 0)}
                      aria-label={`Eliminar ${p.name} de la venta`}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-3">
                  <p className="tabular min-w-0 flex-1 text-xs text-subtle">
                    {formatCLP(p.price)}
                    {p.unit === 'kg' ? ' /kg' : ' c/u'}
                  </p>
                  <div className="flex items-center rounded-xl border border-line-strong">
                    <button
                      type="button"
                      className="grid size-9 place-items-center rounded-l-xl text-muted hover:bg-surface-2 active:bg-line"
                      onClick={() => setQty(p.id, qty - step)}
                      aria-label={`Quitar uno de ${p.name}`}
                    >
                      <Minus className="size-4" />
                    </button>
                    <input
                      className="tabular h-9 w-14 border-x border-line-strong bg-transparent text-center text-sm font-bold outline-none focus:bg-brand-soft"
                      inputMode={p.unit === 'kg' ? 'decimal' : 'numeric'}
                      aria-label={`Cantidad de ${p.name}`}
                      value={p.unit === 'kg' ? String(qty).replace('.', ',') : qty}
                      onChange={(e) => {
                        const n = parseLocaleNumber(e.target.value)
                        if (n !== null) setQty(p.id, n)
                      }}
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      type="button"
                      className="grid size-9 place-items-center rounded-r-xl text-muted hover:bg-surface-2 active:bg-line"
                      onClick={() => setQty(p.id, qty + step)}
                      aria-label={`Agregar uno de ${p.name}`}
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                  <p className="tabular w-20 text-right text-sm font-bold">{formatCLP(lineTotal)}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Cobro */}
      <div className="space-y-3 border-t border-line bg-surface-2/60 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-muted">Total a pagar</span>
          <span className="tabular text-3xl font-extrabold tracking-tight">{formatCLP(total)}</span>
        </div>

        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Medio de pago">
          {PAYMENT_METHODS.map((m) => {
            const Icon = PAYMENT_ICONS[m]
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={payment === m}
                onClick={() => setPayment(m)}
                className={cn(
                  'flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl border text-[0.7rem] font-semibold transition-colors',
                  payment === m ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line-strong bg-surface text-muted hover:text-fg',
                )}
              >
                <Icon className="size-5" />
                {m === 'Transferencia' ? 'Transf.' : m}
              </button>
            )
          })}
        </div>

        {payment === 'Efectivo' && (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto] items-center gap-3">
              <MoneyInput
                value={received}
                onValueChange={setReceived}
                placeholder={total ? `${total.toLocaleString('es-CL')} (exacto)` : 'Monto recibido'}
                aria-label="Monto recibido"
                className="h-12 text-lg font-bold"
              />
              <div className="text-right">
                <p className="text-xs font-semibold text-subtle">{missing ? 'Falta' : 'Vuelto'}</p>
                <p className={cn('tabular text-xl font-extrabold', missing ? 'text-danger-ink' : 'text-ok-ink')}>
                  {formatCLP(missing || Math.max(0, change))}
                </p>
              </div>
            </div>
            {total > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {quickAmounts(total).map((v, i) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setReceived(v)}
                    className={cn(
                      'tabular h-9 rounded-lg border px-2.5 text-sm font-semibold transition-colors',
                      received === v ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line-strong bg-surface hover:bg-surface-2',
                    )}
                  >
                    {i === 0 ? 'Exacto' : formatCLP(v)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <Button variant="primary" size="lg" className="h-16 w-full text-xl" disabled={!lines.length || missing > 0} onClick={checkout}>
          <CheckCircle2 className="!size-6" /> Cobrar {total > 0 && formatCLP(total)}
          <span className="ml-1 hidden rounded bg-black/15 px-1.5 py-0.5 text-xs lg:inline">F9</span>
        </Button>
      </div>
    </div>
  )

  return (
    <div className="lg:-mb-6 lg:grid lg:h-[calc(100dvh-6rem)] lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
      {/* Columna izquierda: escáner + búsqueda + productos */}
      <div className="flex min-h-0 flex-col gap-3 pb-24 lg:pb-0">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-subtle" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Buscar por nombre o código…"
              className="h-12 pl-11 text-base"
              aria-label="Buscar producto"
              autoComplete="off"
              enterKeyHint="search"
            />
            {query ? (
              <button
                type="button"
                className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-subtle hover:bg-surface-2"
                onClick={() => setQuery('')}
                aria-label="Limpiar búsqueda"
              >
                <X className="size-4" />
              </button>
            ) : (
              <span className="absolute top-1/2 right-3 hidden -translate-y-1/2 lg:block">
                <Kbd>F2</Kbd>
              </span>
            )}
          </div>
          <Button
            variant={cameraOn ? 'primary' : 'outline'}
            className="h-12"
            onClick={() => setCameraOn((c) => !c)}
            aria-pressed={cameraOn}
          >
            {cameraOn ? <CameraOff /> : <Camera />}
            <span className="hidden sm:inline">{cameraOn ? 'Apagar cámara' : 'Cámara'}</span>
          </Button>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-ok-soft px-3 py-2 text-xs font-medium text-ok-ink">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-ok" />
          </span>
          Lector de código de barras listo: escanea en cualquier momento, no necesitas hacer clic.
        </div>

        {cameraOn && (
          <Suspense fallback={<div className="aspect-[4/3] max-h-72 animate-pulse rounded-2xl bg-surface-2" />}>
            <CameraScanner className="mx-auto w-full max-w-md" onDetected={handleCode} onClose={() => setCameraOn(false)} />
          </Suspense>
        )}

        {!query && (
          <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3 sm:mx-0 sm:px-0" role="tablist" aria-label="Categorías">
            {[FREQUENT, ...categories].map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={category === c}
                onClick={() => setCategory(c)}
                className={cn(
                  'h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold transition-colors',
                  category === c ? 'border-fg bg-fg text-bg' : 'border-line-strong bg-surface text-muted hover:text-fg',
                )}
              >
                {c === FREQUENT ? '⭐ Más vendidos' : c}
              </button>
            ))}
          </div>
        )}

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto lg:-mr-2 lg:pr-2">
          {visible.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Search />}
                title={products.length ? 'Sin resultados' : 'Todavía no hay productos'}
                action={
                  <Button variant="primary" onClick={() => setCreateFor(/^\d+$/.test(query.trim()) ? query.trim() : '')}>
                    <Plus /> Crear producto
                  </Button>
                }
              >
                {products.length ? `No encontramos "${query}".` : 'Agrega productos o importa tu Excel.'}
              </EmptyState>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-3 xl:grid-cols-4">
              {visible.map((p) => {
                const info = stockInfo.get(p.id)
                const out = info?.status === 'agotado'
                const low = info?.status === 'critico'
                const inCart = cart.find((l) => l.productId === p.id)?.qty
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addToCart(p)}
                    className={cn(
                      'group relative flex min-h-28 flex-col justify-between rounded-2xl border bg-surface p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98]',
                      inCart ? 'border-brand ring-1 ring-brand' : 'border-line hover:border-line-strong',
                      out && 'opacity-55',
                    )}
                  >
                    {inCart !== undefined && (
                      <span className="tabular absolute -top-2 -right-2 grid min-w-7 place-items-center rounded-full bg-brand px-1.5 py-0.5 text-xs font-bold text-on-brand shadow">
                        {formatQty(inCart, p.unit).replace(' kg', '')}
                      </span>
                    )}
                    <p className="line-clamp-2 text-sm leading-snug font-semibold">{p.name}</p>
                    <div className="mt-2 flex items-end justify-between gap-1">
                      <p className="tabular text-lg font-extrabold">
                        {formatCLP(p.price)}
                        {p.unit === 'kg' && <span className="text-xs font-semibold text-subtle">/kg</span>}
                      </p>
                      <span
                        className={cn(
                          'tabular flex items-center gap-0.5 text-xs font-semibold',
                          out ? 'text-danger-ink' : low ? 'text-warn-ink' : 'text-subtle',
                        )}
                      >
                        {(out || low) && <AlertTriangle className="size-3" />}
                        {out ? 'Agotado' : formatQty(p.stock, p.unit)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Columna derecha: carrito (escritorio) */}
      {isDesktop && <Card className="flex min-h-0 flex-col overflow-hidden">{cartPanel}</Card>}

      {/* Barra inferior del carrito (celular/tablet) */}
      {!isDesktop && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 px-3 pb-2">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex h-16 w-full max-w-xl items-center gap-3 rounded-2xl bg-brand px-4 text-on-brand shadow-xl shadow-brand/30 active:scale-[0.99]"
          >
            <span className="relative">
              <ShoppingCart className="size-6" />
              {itemCount > 0 && (
                <span className="tabular absolute -top-2 -right-2.5 grid min-w-5 place-items-center rounded-full bg-on-brand px-1 text-[0.7rem] font-bold text-brand">
                  {lines.length}
                </span>
              )}
            </span>
            <span className="flex-1 text-left text-sm font-semibold">{lines.length ? 'Ver venta y cobrar' : 'Venta vacía'}</span>
            <span className="tabular text-xl font-extrabold">{formatCLP(total)}</span>
            <ChevronRight className="size-5" />
          </button>
        </div>
      )}

      <Modal open={!isDesktop && cartOpen} onClose={() => setCartOpen(false)} title="Cobrar venta" size="lg">
        <div className="-mx-5 -my-4 h-[75dvh]">{cartPanel}</div>
      </Modal>

      <WeightModal
        product={weightFor}
        onClose={() => setWeightFor(null)}
        onConfirm={(p, kg) => {
          setWeightFor(null)
          addToCart(p, kg)
        }}
      />

      <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />

      <ProductForm
        open={createFor !== null}
        initialBarcode={createFor || undefined}
        onClose={() => setCreateFor(null)}
        onSaved={(p) => {
          // Producto recién creado desde un código desconocido: se suma a la venta
          if (p.stock > 0) addToCart(p)
        }}
      />

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={clearCart}
        title="¿Vaciar la venta?"
        confirmLabel="Vaciar"
        danger
      >
        Se quitarán todos los productos de la venta actual. El stock no se modifica.
      </ConfirmDialog>
    </div>
  )
}

// ---------- Modal para productos a granel (kg) ----------

function WeightModal({
  product,
  onClose,
  onConfirm,
}: {
  product: Product | null
  onClose: () => void
  onConfirm: (p: Product, kg: number) => void
}) {
  const [value, setValue] = useState('')
  useEffect(() => setValue(''), [product])
  if (!product) return null
  const kg = parseLocaleNumber(value)
  const ok = kg !== null && kg > 0
  const submit = () => ok && onConfirm(product, roundQty(kg!, 'kg'))

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={product.name}
      description={`${formatCLP(product.price)} por kilo · quedan ${formatQty(product.stock, 'kg')}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} disabled={!ok}>
            Agregar {ok && formatCLP(Math.round(kg! * product.price))}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="space-y-3"
      >
        <label htmlFor="kg" className="block text-sm font-medium text-muted">
          Peso en kilos
        </label>
        <div className="relative">
          <Input
            id="kg"
            autoFocus
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0,5"
            className="tabular h-16 pr-12 text-3xl font-bold"
          />
          <span className="absolute top-1/2 right-4 -translate-y-1/2 font-semibold text-subtle">kg</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[0.25, 0.5, 0.75, 1].map((v) => (
            <Button key={v} variant="outline" onClick={() => setValue(String(v).replace('.', ','))}>
              {v === 1 ? '1 kg' : `${v * 1000} g`}
            </Button>
          ))}
        </div>
      </form>
    </Modal>
  )
}

// ---------- Comprobante de la venta ----------

function ReceiptModal({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  if (!sale) return null
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <CheckCircle2 className="size-6 text-ok-ink" /> Venta N° {sale.number} registrada
        </span>
      }
      footer={
        <Button variant="primary" size="lg" className="w-full" onClick={onClose} data-autofocus>
          Nueva venta
        </Button>
      }
    >
      {sale.payment === 'Efectivo' && sale.change !== null && (
        <div className="mb-4 rounded-2xl bg-ok-soft p-4 text-center">
          <p className="text-sm font-semibold text-ok-ink">Vuelto a entregar</p>
          <p className="tabular text-4xl font-extrabold text-ok-ink">{formatCLP(sale.change)}</p>
          <p className="tabular mt-1 text-xs text-ok-ink/80">Recibido: {formatCLP(sale.received ?? sale.total)}</p>
        </div>
      )}
      <ul className="space-y-1.5 text-sm">
        {sale.items.map((it) => (
          <li key={it.productId} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">
              <span className="tabular text-subtle">{formatQty(it.qty, it.unit)} ×</span> {it.name}
            </span>
            <span className="tabular font-semibold">{formatCLP(Math.round(it.qty * it.unitPrice))}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
        <span className="font-semibold">Total · {sale.payment}</span>
        <span className="tabular text-2xl font-extrabold">{formatCLP(sale.total)}</span>
      </div>
      <p className="mt-3 text-center text-xs text-subtle">Escanea el siguiente producto para empezar otra venta.</p>
    </Modal>
  )
}
