import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  Camera,
  CameraOff,
  LayoutGrid,
  PackagePlus,
  Pencil,
  Plus,
  Rows3,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Truck,
  Undo2,
  Wand2,
  X,
} from 'lucide-react'
import { LabelsModal } from '../components/LabelsModal'
import { ProductForm } from '../components/ProductForm'
import { StockAdjustModal } from '../components/StockAdjustModal'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Badge, Button, Card, EmptyState, Input, Segmented, Select, StockBadge } from '../components/ui/primitives'
import { useToast } from '../components/ui/Toast'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { inventoryValue, marginPct, slowMovers } from '../lib/analytics'
import { allCategories, inferCategory } from '../lib/categories'
import { beepError, beepOk } from '../lib/sound'
import { describeThreshold, isAlert } from '../lib/stock'
import { readPref, writePref } from '../lib/storage'
import { cn, formatCLP, formatInt, formatPct, formatQty, normalizeText } from '../lib/utils'
import { useActions, useData, useDerived } from '../store/AppStore'
import { ROTATIONS, type Product, type Rotation } from '../types'

const CameraScanner = lazy(() => import('../components/CameraScanner'))

type StatusFilter = 'todos' | 'alerta' | 'agotado' | 'lentos'
type SortKey = 'name' | 'category' | 'cost' | 'price' | 'margin' | 'stock'
const PAGE = 60

export default function Inventory({ filter }: { filter: string | null }) {
  const { products, sales, settings } = useData()
  const { stockInfo } = useDerived()
  const actions = useActions()
  const toast = useToast()
  const isMobile = useMediaQuery('(max-width: 767px)')

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState<StatusFilter>(filter === 'critico' ? 'alerta' : filter === 'lentos' ? 'lentos' : 'todos')
  const [rotation, setRotation] = useState<'all' | Rotation>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>(
    filter === 'margen' ? { key: 'margin', dir: 1 } : { key: 'name', dir: 1 },
  )
  const [view, setView] = useState<'table' | 'cards'>(() => readPref('invView', 'table'))
  const [limit, setLimit] = useState(PAGE)

  const [editing, setEditing] = useState<Product | null>(null)
  const [creating, setCreating] = useState<string | null>(null)
  const [adjusting, setAdjusting] = useState<Product | null>(null)
  const [deleting, setDeleting] = useState<Product | null>(null)
  const [classifying, setClassifying] = useState(false)

  useEffect(() => {
    if (filter === 'critico') setStatus('alerta')
    if (filter === 'lentos') setStatus('lentos')
  }, [filter])
  useEffect(() => writePref('invView', view), [view])
  useEffect(() => setLimit(PAGE), [query, category, status, rotation, sort])

  // Recepción de mercadería: cada escaneo suma 1 al stock
  const [receiving, setReceiving] = useState(false)
  const [received, setReceived] = useState<{ id: string; qty: number }[]>([])
  const [labelsOpen, setLabelsOpen] = useState(false)

  const receive = (code: string) => {
    const clean = code.trim()
    const p = products.find((x) => x.barcode === clean) ?? products.find((x) => x.barcode && x.barcode.replace(/^0+/, '') === clean.replace(/^0+/, ''))
    if (!p) {
      beepError()
      setCreating(clean)
      return
    }
    if (p.unit === 'kg') {
      // A granel hay que decir cuántos kilos llegaron
      setAdjusting(p)
      return
    }
    actions.adjustStock(p.id, 'add', 1)
    beepOk()
    setReceived((list) => [{ id: p.id, qty: (list.find((r) => r.id === p.id)?.qty ?? 0) + 1 }, ...list.filter((r) => r.id !== p.id)])
  }

  const undoLast = () => {
    const last = received[0]
    if (!last) return
    actions.adjustStock(last.id, 'remove', 1)
    setReceived((list) => (last.qty > 1 ? [{ ...last, qty: last.qty - 1 }, ...list.slice(1)] : list.slice(1)))
  }

  // Escanear en esta pantalla abre el producto (o crea uno nuevo con ese código)
  const modalOpen = Boolean(editing || creating !== null || adjusting || deleting || classifying || labelsOpen)
  useBarcodeScanner({
    enabled: !modalOpen,
    onScan: (code) => {
      if (receiving) return receive(code)
      const p = products.find((x) => x.barcode === code)
      if (p) setEditing(p)
      else setCreating(code)
    },
  })

  const categories = useMemo(() => allCategories(products.map((p) => p.category)), [products])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of products) m.set(p.category, (m.get(p.category) ?? 0) + 1)
    return m
  }, [products])
  const slowIds = useMemo(
    () => new Set(slowMovers(products, sales, settings.slowMoverDays).map((s) => s.product.id)),
    [products, sales, settings.slowMoverDays],
  )
  const value = useMemo(() => inventoryValue(products), [products])
  const alertCount = useMemo(() => [...stockInfo.values()].filter((i) => isAlert(i.status)).length, [stockInfo])

  const rows = useMemo(() => {
    const q = normalizeText(query)
    const words = q.split(/\s+/).filter(Boolean)
    const list = products.filter((p) => {
      if (category !== 'all' && p.category !== category) return false
      if (rotation !== 'all' && p.rotation !== rotation) return false
      const st = stockInfo.get(p.id)?.status
      if (status === 'alerta' && !(st && isAlert(st))) return false
      if (status === 'agotado' && st !== 'agotado') return false
      if (status === 'lentos' && !slowIds.has(p.id)) return false
      if (words.length) {
        const hay = normalizeText(`${p.name} ${p.barcode} ${p.category}`)
        if (!words.every((w) => hay.includes(w))) return false
      }
      return true
    })
    const val = (p: Product): string | number => {
      switch (sort.key) {
        case 'name':
          return p.name
        case 'category':
          return p.category
        case 'cost':
          return p.cost
        case 'price':
          return p.price
        case 'margin':
          return marginPct(p.cost, p.price)
        case 'stock':
          return p.stock
      }
    }
    return list.sort((a, b) => {
      const x = val(a)
      const y = val(b)
      const c = typeof x === 'string' ? x.localeCompare(y as string, 'es') : x - (y as number)
      return c * sort.dir || a.name.localeCompare(b.name, 'es')
    })
  }, [products, query, category, rotation, status, sort, stockInfo, slowIds])

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' || key === 'category' ? 1 : -1 }))

  const hasFilters = query || category !== 'all' || status !== 'todos' || rotation !== 'all'
  const clearFilters = () => {
    setQuery('')
    setCategory('all')
    setStatus('todos')
    setRotation('all')
  }

  const effectiveView = isMobile ? 'cards' : view
  const shown = rows.slice(0, limit)

  const receivedUnits = received.reduce((a, r) => a + r.qty, 0)

  return (
    <div className="space-y-4">
      {receiving && (
        <ReceivingPanel
          units={receivedUnits}
          items={received.map((r) => ({ ...r, product: products.find((p) => p.id === r.id) })).filter((r) => r.product)}
          onScan={receive}
          onUndo={undoLast}
          onClose={() => {
            setReceiving(false)
            if (receivedUnits) toast.success(`Recepción terminada: ${receivedUnits} unidades sumadas al stock`)
            setReceived([])
          }}
          paused={modalOpen}
        />
      )}

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Productos" value={formatInt(products.length)} sub={`${formatInt(counts.size)} categorías`} />
        <MiniStat label="Inventario a costo" value={formatCLP(value.atCost)} sub={`A precio venta: ${formatCLP(value.atPrice)}`} />
        <MiniStat label="Utilidad potencial" value={formatCLP(value.potentialProfit)} sub={`Margen ${formatPct(value.margin)}`} />
        <button type="button" onClick={() => setStatus(status === 'alerta' ? 'todos' : 'alerta')} className="text-left">
          <MiniStat
            label="Stock crítico"
            value={formatInt(alertCount)}
            sub={alertCount ? 'Toca para ver cuáles' : 'Todo en orden'}
            tone={alertCount ? 'warn' : 'ok'}
            active={status === 'alerta'}
          />
        </button>
      </div>

      <Card className="overflow-hidden">
        {/* Barra de filtros */}
        <div className="space-y-3 border-b border-line p-3 sm:p-4">
          <div className="flex flex-wrap gap-2">
            {/* El buscador ocupa su propia fila salvo en pantallas muy anchas */}
            <div className="relative min-w-52 flex-1 basis-full 2xl:basis-0">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-subtle" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, código o categoría…"
                className="pl-11"
                aria-label="Buscar productos"
              />
            </div>
            <Button
              variant={receiving ? 'primary' : 'outline'}
              onClick={() => setReceiving((r) => !r)}
              title="Escanea lo que llegó del proveedor: cada escaneo suma 1 al stock"
            >
              <Truck /> <span className="hidden sm:inline">Recibir mercadería</span>
            </Button>
            <Button variant="outline" onClick={() => setLabelsOpen(true)} title="Imprimir etiquetas con código de barras">
              <Tag /> <span className="hidden sm:inline">Etiquetas</span>
            </Button>
            <Button variant="outline" onClick={() => setClassifying(true)} title="Asigna categorías automáticamente según el nombre">
              <Wand2 /> <span className="hidden sm:inline">Auto-clasificar</span>
            </Button>
            <Button variant="primary" onClick={() => setCreating('')}>
              <Plus /> <span className="sm:hidden">Nuevo</span>
              <span className="hidden sm:inline">Nuevo producto</span>
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              size="sm"
              value={status}
              onChange={setStatus}
              ariaLabel="Filtrar por estado de stock"
              options={[
                { value: 'todos', label: 'Todos' },
                { value: 'alerta', label: `Crítico (${alertCount})`, icon: <AlertTriangle /> },
                { value: 'agotado', label: 'Agotados' },
                { value: 'lentos', label: 'Sin ventas' },
              ]}
            />
            <Select value={rotation} onChange={(e) => setRotation(e.target.value as 'all' | Rotation)} className="h-9 w-auto text-sm" aria-label="Filtrar por rotación">
              <option value="all">Toda rotación</option>
              {ROTATIONS.map((r) => (
                <option key={r} value={r}>
                  Rotación {r.toLowerCase()}
                </option>
              ))}
            </Select>
            {isMobile && (
              <Select
                value={`${sort.key}:${sort.dir}`}
                onChange={(e) => {
                  const [key, dir] = e.target.value.split(':')
                  setSort({ key: key as SortKey, dir: Number(dir) as 1 | -1 })
                }}
                className="h-9 w-auto text-sm"
                aria-label="Ordenar"
              >
                <option value="name:1">Nombre A-Z</option>
                <option value="stock:1">Menos stock</option>
                <option value="price:-1">Más caros</option>
                <option value="margin:-1">Mayor margen</option>
                <option value="margin:1">Menor margen</option>
              </Select>
            )}
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X /> Limpiar filtros
              </Button>
            )}
            {!isMobile && (
              <Segmented
                className="ml-auto"
                size="sm"
                value={view}
                onChange={setView}
                ariaLabel="Vista"
                options={[
                  { value: 'table', label: 'Tabla', icon: <Rows3 /> },
                  { value: 'cards', label: 'Tarjetas', icon: <LayoutGrid /> },
                ]}
              />
            )}
          </div>

          {/* Categorías */}
          <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Categorías">
            {['all', ...categories.filter((c) => counts.get(c))].map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={category === c}
                onClick={() => setCategory(c)}
                className={cn(
                  'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors',
                  category === c ? 'border-fg bg-fg text-bg' : 'border-line-strong text-muted hover:text-fg',
                )}
              >
                {c === 'all' ? 'Todas' : c}
                <span className={cn('tabular text-xs', category === c ? 'opacity-70' : 'text-subtle')}>
                  {c === 'all' ? products.length : counts.get(c)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Boxes />}
            title={products.length ? 'Ningún producto calza con los filtros' : 'Aún no hay productos'}
            action={
              products.length ? (
                <Button variant="outline" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setCreating('')}>
                  <Plus /> Agregar el primero
                </Button>
              )
            }
          >
            {products.length ? 'Prueba con otra búsqueda o categoría.' : 'Agrega productos a mano o impórtalos desde Excel.'}
          </EmptyState>
        ) : effectiveView === 'table' ? (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-surface-2/70 text-left text-xs font-semibold text-subtle uppercase">
                <tr>
                  <SortTh label="Producto" k="name" sort={sort} onSort={toggleSort} className="pl-4" />
                  <SortTh label="Categoría" k="category" sort={sort} onSort={toggleSort} />
                  <SortTh label="Costo" k="cost" sort={sort} onSort={toggleSort} align="right" />
                  <SortTh label="Venta" k="price" sort={sort} onSort={toggleSort} align="right" />
                  <SortTh label="Margen" k="margin" sort={sort} onSort={toggleSort} align="right" />
                  <SortTh label="Stock" k="stock" sort={sort} onSort={toggleSort} align="right" />
                  <th className="px-3 py-2.5 pr-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((p) => {
                  const info = stockInfo.get(p.id)!
                  const m = marginPct(p.cost, p.price)
                  return (
                    <tr key={p.id} className="hover:bg-surface-2/50">
                      <td className="py-2.5 pr-3 pl-4">
                        {/* max-width no funciona en celdas de tabla: se limita el contenido */}
                        <div className="w-48 2xl:w-80">
                          <p className="truncate font-semibold" title={p.name}>
                            {p.name}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-subtle">
                            <span className="font-mono">{p.barcode || 'sin código'}</span>
                            <RotationBadge r={p.rotation} />
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={p.category}
                          onChange={(e) => {
                            actions.updateProduct(p.id, { category: e.target.value })
                            toast.success(`"${p.name}" ahora está en ${e.target.value}`)
                          }}
                          className="h-8 max-w-40 cursor-pointer rounded-lg border border-transparent bg-transparent px-1.5 text-sm hover:border-line-strong focus:border-brand focus:outline-none"
                          aria-label={`Categoría de ${p.name}`}
                        >
                          {!categories.includes(p.category) && <option>{p.category}</option>}
                          {categories.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                      <td className="tabular px-3 py-2 text-right text-muted">{formatCLP(p.cost)}</td>
                      <td className="tabular px-3 py-2 text-right font-semibold">
                        {formatCLP(p.price)}
                        {p.unit === 'kg' && <span className="text-xs font-normal text-subtle">/kg</span>}
                      </td>
                      <td className={cn('tabular px-3 py-2 text-right font-semibold', m < 0 ? 'text-danger-ink' : m < 15 ? 'text-warn-ink' : '')}>
                        {formatPct(m)}
                      </td>
                      <td className="px-3 py-2 text-right" title={describeThreshold(info, p.rotation)}>
                        <div className="flex items-center justify-end gap-2">
                          <span className="tabular font-bold">{formatQty(p.stock, p.unit)}</span>
                          <StockBadge status={info.status} />
                        </div>
                        <p className="tabular mt-0.5 text-xs whitespace-nowrap text-subtle">
                          alerta &lt; {formatQty(info.threshold, p.unit)}
                          {info.daysLeft !== null && ` · ~${Math.floor(info.daysLeft)} días`}
                        </p>
                      </td>
                      <td className="py-2 pr-4 pl-3">
                        <RowActions onEdit={() => setEditing(p)} onAdjust={() => setAdjusting(p)} onDelete={() => setDeleting(p)} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3">
            {shown.map((p) => {
              const info = stockInfo.get(p.id)!
              const m = marginPct(p.cost, p.price)
              return (
                <div key={p.id} className="flex flex-col rounded-2xl border border-line bg-surface p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="line-clamp-2 font-semibold leading-snug">{p.name}</p>
                      <p className="mt-0.5 font-mono text-xs text-subtle">{p.barcode || 'sin código'}</p>
                    </div>
                    <StockBadge status={info.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge>{p.category}</Badge>
                    <RotationBadge r={p.rotation} />
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-surface-2 py-2">
                      <dt className="text-[0.7rem] text-subtle">Venta</dt>
                      <dd className="tabular text-sm font-bold">{formatCLP(p.price)}</dd>
                    </div>
                    <div className="rounded-xl bg-surface-2 py-2">
                      <dt className="text-[0.7rem] text-subtle">Margen</dt>
                      <dd className={cn('tabular text-sm font-bold', m < 0 && 'text-danger-ink')}>{formatPct(m)}</dd>
                    </div>
                    <div className="rounded-xl bg-surface-2 py-2" title={describeThreshold(info, p.rotation)}>
                      <dt className="text-[0.7rem] text-subtle">Stock</dt>
                      <dd className="tabular text-sm font-bold">{formatQty(p.stock, p.unit)}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-subtle">{describeThreshold(info, p.rotation)}</p>
                  <div className="mt-3 flex gap-2 border-t border-line pt-3">
                    <Button size="sm" variant="secondary" className="flex-1" onClick={() => setAdjusting(p)}>
                      <PackagePlus /> Stock
                    </Button>
                    <Button size="sm" variant="secondary" className="flex-1" onClick={() => setEditing(p)}>
                      <Pencil /> Editar
                    </Button>
                    <Button size="icon-sm" variant="danger-soft" onClick={() => setDeleting(p)} aria-label={`Eliminar ${p.name}`}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm text-subtle">
            <span>
              Mostrando {formatInt(shown.length)} de {formatInt(rows.length)} productos
            </span>
            {rows.length > limit && (
              <Button size="sm" variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
                Mostrar más
              </Button>
            )}
          </div>
        )}
      </Card>

      <ProductForm open={Boolean(editing)} product={editing} onClose={() => setEditing(null)} />
      <ProductForm open={creating !== null} initialBarcode={creating || undefined} onClose={() => setCreating(null)} />
      <StockAdjustModal product={adjusting} onClose={() => setAdjusting(null)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return
          actions.deleteProduct(deleting.id)
          toast.success(`"${deleting.name}" eliminado`)
        }}
        title="¿Eliminar producto?"
        confirmLabel="Eliminar"
        danger
      >
        Se eliminará <strong className="text-fg">{deleting?.name}</strong> del inventario. Las ventas pasadas se conservan en los reportes.
      </ConfirmDialog>
      <AutoClassifyModal open={classifying} onClose={() => setClassifying(false)} />
      <LabelsModal open={labelsOpen} onClose={() => setLabelsOpen(false)} preselect={status === 'todos' && !query ? [] : rows.map((p) => p.id)} />
    </div>
  )
}

// ---------- Recepción de mercadería ----------

function ReceivingPanel({
  units,
  items,
  onScan,
  onUndo,
  onClose,
  paused,
}: {
  units: number
  items: { id: string; qty: number; product?: Product }[]
  onScan: (code: string) => void
  onUndo: () => void
  onClose: () => void
  paused: boolean
}) {
  const [camera, setCamera] = useState(false)
  return (
    <Card className="border-brand/60 ring-1 ring-brand/40">
      <div className="flex flex-wrap items-start gap-3 p-4 sm:p-5">
        <span className="grid size-10 place-items-center rounded-xl bg-brand text-on-brand">
          <Truck className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">Recibiendo mercadería</h2>
          <p className="text-sm text-muted">
            Escanea cada unidad que llegó (pistola o cámara): se suma 1 al stock. Si un código no existe, se abre el formulario para
            crearlo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={camera ? 'primary' : 'outline'} onClick={() => setCamera((c) => !c)}>
            {camera ? <CameraOff /> : <Camera />} {camera ? 'Apagar cámara' : 'Cámara'}
          </Button>
          <Button variant="outline" onClick={onUndo} disabled={!units}>
            <Undo2 /> Deshacer último
          </Button>
          <Button variant="primary" onClick={onClose}>
            Terminar
          </Button>
        </div>
      </div>
      {camera && !paused && (
        <div className="px-4 pb-4 sm:px-5">
          <Suspense fallback={<div className="aspect-[4/3] max-w-md animate-pulse rounded-2xl bg-surface-2" />}>
            <CameraScanner className="w-full max-w-md" onDetected={onScan} onClose={() => setCamera(false)} />
          </Suspense>
        </div>
      )}
      <div className="border-t border-line px-4 py-3 sm:px-5">
        <p className="text-sm font-semibold">
          {units} {units === 1 ? 'unidad recibida' : 'unidades recibidas'} · {items.length} {items.length === 1 ? 'producto' : 'productos'}
        </p>
        {items.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {items.slice(0, 8).map((r, i) => (
              <li
                key={r.id}
                className={cn('flex items-center gap-2 rounded-xl border border-line px-3 py-1.5 text-sm', i === 0 && 'animate-flash border-brand')}
              >
                <span className="max-w-48 truncate font-medium">{r.product!.name}</span>
                <Badge tone="brand">+{r.qty}</Badge>
                <span className="tabular text-xs text-subtle">stock {formatQty(r.product!.stock, r.product!.unit)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

// ---------- Piezas pequeñas ----------

function MiniStat({
  label,
  value,
  sub,
  tone,
  active,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'warn' | 'ok'
  active?: boolean
}) {
  return (
    <Card className={cn('h-full p-3.5 sm:p-4', active && 'border-warn ring-1 ring-warn')}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-subtle">
        {tone === 'warn' && <AlertTriangle className="size-3.5 text-warn-ink" />}
        {label}
      </p>
      <p className={cn('tabular mt-1 truncate text-xl font-extrabold sm:text-2xl', tone === 'warn' && 'text-warn-ink')}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-subtle">{sub}</p>}
    </Card>
  )
}

function RotationBadge({ r }: { r: Rotation }) {
  return <Badge tone={r === 'Alta' ? 'info' : r === 'Media' ? 'neutral' : 'neutral'}>{r === 'Alta' ? '⚡ Alta' : r}</Badge>
}

function SortTh({
  label,
  k,
  sort,
  onSort,
  align,
  className,
}: {
  label: string
  k: SortKey
  sort: { key: SortKey; dir: 1 | -1 }
  onSort: (k: SortKey) => void
  align?: 'right'
  className?: string
}) {
  const active = sort.key === k
  const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown
  return (
    <th className={cn('px-3 py-2.5', align === 'right' && 'text-right', className)} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn('inline-flex items-center gap-1 uppercase hover:text-fg', active && 'text-fg')}
      >
        {label}
        <Icon className={cn('size-3.5', !active && 'opacity-40')} />
      </button>
    </th>
  )
}

function RowActions({ onEdit, onAdjust, onDelete }: { onEdit: () => void; onAdjust: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      <Button size="icon-sm" variant="ghost" onClick={onAdjust} aria-label="Ajustar stock" title="Ajustar stock">
        <PackagePlus />
      </Button>
      <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label="Editar" title="Editar">
        <Pencil />
      </Button>
      <Button size="icon-sm" variant="ghost" className="hover:bg-danger-soft hover:text-danger-ink" onClick={onDelete} aria-label="Eliminar" title="Eliminar">
        <Trash2 />
      </Button>
    </div>
  )
}

// ---------- Auto-clasificación ----------

function AutoClassifyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return <AutoClassifyInner onClose={onClose} />
}

function AutoClassifyInner({ onClose }: { onClose: () => void }) {
  const { products } = useData()
  const actions = useActions()
  const toast = useToast()

  // Solo se proponen cambios donde el algoritmo encontró palabras clave
  const proposals = useMemo(
    () =>
      products
        .map((p) => ({ p, guess: inferCategory(p.name) }))
        .filter(({ p, guess }) => guess.score > 0 && guess.category !== p.category)
        .sort((a, b) => a.p.name.localeCompare(b.p.name, 'es')),
    [products],
  )
  // Por defecto se marcan los que hoy están en "Otros" o sin categoría
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(proposals.filter(({ p }) => !p.category || p.category === 'Otros').map(({ p }) => p.id)),
  )

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const apply = () => {
    for (const { p, guess } of proposals) if (selected.has(p.id)) actions.updateProduct(p.id, { category: guess.category })
    toast.success(`${selected.size} productos reclasificados`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="size-5 text-brand-ink" /> Auto-clasificar categorías
        </span>
      }
      description="Revisamos el nombre de cada producto y sugerimos una categoría según palabras clave. Marca los cambios que quieras aplicar."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={apply} disabled={!selected.size}>
            Aplicar {selected.size || ''} {selected.size === 1 ? 'cambio' : 'cambios'}
          </Button>
        </>
      }
    >
      {proposals.length === 0 ? (
        <EmptyState icon={<Sparkles />} title="Todo clasificado">
          Las categorías actuales coinciden con lo que sugiere el algoritmo.
        </EmptyState>
      ) : (
        <>
          <div className="mb-2 flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(proposals.map(({ p }) => p.id)))}>
              Marcar todos
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Desmarcar todos
            </Button>
          </div>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {proposals.map(({ p, guess }) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-surface-2/60">
                  <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs">
                    <Badge>{p.category || 'Sin categoría'}</Badge>→<Badge tone="brand">{guess.category}</Badge>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  )
}
