import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Boxes, FileSpreadsheet, MoreHorizontal, PackagePlus, Plus, Search, Sparkles, Tag, X } from 'lucide-react'
import { AutoClassifyModal } from '../components/AutoClassifyModal'
import { LabelsModal } from '../components/LabelsModal'
import { ProductForm } from '../components/ProductForm'
import { ReceivingPanel } from '../components/ReceivingPanel'
import { StockAdjustModal } from '../components/StockAdjustModal'
import { Modal } from '../components/ui/Modal'
import { Button, Card, EmptyState, Input, Select, StockBadge } from '../components/ui/primitives'
import { useToast } from '../components/ui/Toast'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import { navigate } from '../hooks/useHashRoute'
import { slowMovers } from '../lib/analytics'
import { beepError, beepOk } from '../lib/sound'
import { isAlert } from '../lib/stock'
import { cn, formatCLP, formatInt, formatQty, normalizeText } from '../lib/utils'
import { useActions, useData, useDerived } from '../store/AppStore'
import type { Product } from '../types'

type Filter = 'todos' | 'acabando' | 'agotado' | 'lentos'
const PAGE = 60
const sameCode = (a: string, b: string) => a === b || (a.replace(/^0+/, '') === b.replace(/^0+/, '') && a !== '')

export default function Inventory({ params }: { params: URLSearchParams }) {
  const { products, sales, settings } = useData()
  const { stockInfo } = useDerived()
  const actions = useActions()
  const toast = useToast()

  const initialFilter = params.get('filtro')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [filter, setFilter] = useState<Filter>(
    initialFilter === 'acabando' || initialFilter === 'agotado' || initialFilter === 'lentos' ? initialFilter : 'todos',
  )
  const [limit, setLimit] = useState(PAGE)

  const [editing, setEditing] = useState<Product | null>(null)
  const [creating, setCreating] = useState<string | null>(null)
  const [adjusting, setAdjusting] = useState<Product | null>(null)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [labelsOpen, setLabelsOpen] = useState(false)
  const [classifying, setClassifying] = useState(false)

  // "Llegó mercadería": cada escaneo suma 1 al stock
  const [receiving, setReceiving] = useState(false)
  const [received, setReceived] = useState<{ id: string; qty: number }[]>([])

  // Atajos desde Inicio: #/productos?recibir=1 · ?nuevo=1 · ?filtro=acabando
  const handled = useRef('')
  useEffect(() => {
    const key = params.toString()
    if (!key || handled.current === key) return
    handled.current = key
    if (params.get('recibir') === '1') setReceiving(true)
    if (params.get('nuevo') === '1') setCreating('')
    const f = params.get('filtro')
    if (f === 'acabando' || f === 'agotado' || f === 'lentos') setFilter(f)
    history.replaceState(null, '', '#/productos') // que al recargar no se repita
  }, [params])
  useEffect(() => setLimit(PAGE), [query, category, filter])

  const findByCode = (code: string) => products.find((p) => p.barcode && sameCode(p.barcode, code.trim()))

  const receive = (code: string) => {
    const p = findByCode(code)
    if (!p) {
      beepError()
      setCreating(code.trim())
      return
    }
    if (p.unit === 'kg') {
      setAdjusting(p) // a granel hay que decir cuántos kilos llegaron
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

  // Escanear aquí: en "llegó mercadería" suma 1; si no, abre el producto (o lo crea)
  const modalOpen = Boolean(editing || creating !== null || adjusting || toolsOpen || labelsOpen || classifying)
  useBarcodeScanner({
    enabled: !modalOpen,
    onScan: (code) => {
      if (receiving) return receive(code)
      const p = findByCode(code)
      if (p) setEditing(p)
      else setCreating(code)
    },
  })

  const categories = useMemo(() => [...new Set(products.map((p) => p.category))].sort((a, b) => a.localeCompare(b, 'es')), [products])
  const slowIds = useMemo(
    () => (filter === 'lentos' ? new Set(slowMovers(products, sales, settings.slowMoverDays).map((s) => s.product.id)) : null),
    [filter, products, sales, settings.slowMoverDays],
  )
  const counts = useMemo(() => {
    let acabando = 0
    let agotado = 0
    for (const i of stockInfo.values()) {
      if (isAlert(i.status)) acabando++
      if (i.status === 'agotado') agotado++
    }
    return { acabando, agotado }
  }, [stockInfo])

  const rows = useMemo(() => {
    const words = normalizeText(query).split(/\s+/).filter(Boolean)
    const list = products.filter((p) => {
      if (category !== 'all' && p.category !== category) return false
      const st = stockInfo.get(p.id)?.status
      if (filter === 'acabando' && !(st && isAlert(st))) return false
      if (filter === 'agotado' && st !== 'agotado') return false
      if (filter === 'lentos' && !slowIds?.has(p.id)) return false
      if (words.length) {
        const hay = normalizeText(`${p.name} ${p.barcode} ${p.category}`)
        if (!words.every((w) => hay.includes(w))) return false
      }
      return true
    })
    if (filter === 'acabando') {
      // Lo más urgente primero: agotados y los que tienen menos respecto a su aviso
      const urgency = (p: Product) => p.stock / (stockInfo.get(p.id)?.threshold || 1)
      return list.sort((a, b) => urgency(a) - urgency(b))
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [products, query, category, filter, stockInfo, slowIds])

  const shown = rows.slice(0, limit)
  const receivedUnits = received.reduce((a, r) => a + r.qty, 0)
  const receivedItems = received
    .map((r) => ({ ...r, product: products.find((p) => p.id === r.id) }))
    .filter((r): r is { id: string; qty: number; product: Product } => Boolean(r.product))

  const chips: { value: Filter; label: string; count?: number; icon?: boolean }[] = [
    { value: 'todos', label: 'Todos', count: products.length },
    { value: 'acabando', label: 'Se están acabando', count: counts.acabando, icon: true },
    { value: 'agotado', label: 'Agotados', count: counts.agotado },
  ]
  if (filter === 'lentos') chips.push({ value: 'lentos', label: 'No se venden' })

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {receiving && (
        <ReceivingPanel
          units={receivedUnits}
          items={receivedItems}
          onScan={receive}
          onUndo={undoLast}
          onClose={() => {
            setReceiving(false)
            if (receivedUnits) toast.success(`Listo: se sumaron ${receivedUnits} ${receivedUnits === 1 ? 'unidad' : 'unidades'} al stock`)
            setReceived([])
          }}
          paused={modalOpen}
        />
      )}

      {/* Buscar y acciones principales */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-subtle" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto por nombre o código…"
            className="h-13 pl-12 text-base"
            aria-label="Buscar productos"
          />
          {query && (
            <button
              type="button"
              className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-subtle hover:bg-surface-2"
              onClick={() => setQuery('')}
              aria-label="Borrar búsqueda"
            >
              <X className="size-5" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button variant="primary" onClick={() => setCreating('')}>
            <Plus /> Agregar producto
          </Button>
          <Button variant={receiving ? 'secondary' : 'outline'} onClick={() => setReceiving(true)} disabled={receiving}>
            <PackagePlus /> Llegó mercadería
          </Button>
          <Button variant="ghost" className="col-span-2 sm:col-span-1" onClick={() => setToolsOpen(true)}>
            <MoreHorizontal /> Más opciones
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setFilter(c.value)}
            aria-pressed={filter === c.value}
            className={cn(
              'flex h-10 items-center gap-1.5 rounded-full border px-4 font-semibold transition-colors',
              filter === c.value ? 'border-fg bg-fg text-bg' : 'border-line-strong bg-surface text-muted hover:text-fg',
            )}
          >
            {c.icon && <AlertTriangle className={cn('size-4', filter !== c.value && 'text-warn-ink')} />}
            {c.label}
            {c.count !== undefined && <span className="tabular opacity-70">{formatInt(c.count)}</span>}
          </button>
        ))}
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-10 w-auto min-w-44 rounded-full"
          aria-label="Filtrar por categoría"
        >
          <option value="all">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      {/* Lista */}
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Boxes />}
            title={products.length ? 'No hay productos con esa búsqueda' : 'Todavía no tienes productos'}
            action={
              products.length ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery('')
                    setCategory('all')
                    setFilter('todos')
                  }}
                >
                  Ver todos
                </Button>
              ) : (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="primary" onClick={() => setCreating('')}>
                    <Plus /> Agregar el primero
                  </Button>
                  <Button variant="outline" onClick={() => navigate('excel')}>
                    <FileSpreadsheet /> Cargar desde Excel
                  </Button>
                </div>
              )
            }
          >
            {products.length ? 'Prueba escribiendo otra palabra.' : 'Agrégalos uno por uno o cárgalos todos juntos desde un Excel.'}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((p) => {
              const info = stockInfo.get(p.id)
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/50">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(p)}>
                    <span className="block truncate text-base font-semibold">{p.name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-subtle">
                      <span className="tabular font-medium text-muted">Quedan {formatQty(p.stock, p.unit)}</span>
                      {info && <StockBadge status={info.status} />}
                      <span className="hidden sm:inline">· {p.category}</span>
                    </span>
                  </button>
                  <span className="tabular shrink-0 text-right text-lg font-bold">
                    {formatCLP(p.price)}
                    {p.unit === 'kg' && <span className="block text-xs font-medium text-subtle">por kilo</span>}
                  </span>
                  <div className="hidden shrink-0 gap-2 sm:flex">
                    <Button size="sm" variant="outline" onClick={() => setAdjusting(p)}>
                      Cambiar cantidad
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                      Editar
                    </Button>
                  </div>
                  <Button size="sm" variant="secondary" className="sm:hidden" onClick={() => setEditing(p)}>
                    Editar
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
        {rows.length > limit && (
          <div className="border-t border-line p-3 text-center">
            <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
              Ver más productos ({formatInt(rows.length - limit)} más)
            </Button>
          </div>
        )}
      </Card>

      <ProductForm open={Boolean(editing)} product={editing} onClose={() => setEditing(null)} />
      <ProductForm open={creating !== null} initialBarcode={creating || undefined} onClose={() => setCreating(null)} />
      <StockAdjustModal product={adjusting} onClose={() => setAdjusting(null)} />
      <AutoClassifyModal open={classifying} onClose={() => setClassifying(false)} />
      <LabelsModal open={labelsOpen} onClose={() => setLabelsOpen(false)} preselect={filter === 'todos' && !query ? [] : rows.map((p) => p.id)} />

      <Modal open={toolsOpen} onClose={() => setToolsOpen(false)} size="sm" title="Más opciones">
        <div className="space-y-2">
          {[
            { icon: Tag, title: 'Imprimir etiquetas', desc: 'Con código de barras, para lo que no trae código', run: () => setLabelsOpen(true) },
            { icon: Sparkles, title: 'Ordenar categorías', desc: 'Pone cada producto en su categoría según el nombre', run: () => setClassifying(true) },
            { icon: FileSpreadsheet, title: 'Cargar o descargar Excel', desc: 'Subir tu lista de productos o sacar un respaldo', run: () => navigate('excel') },
          ].map((o) => (
            <button
              key={o.title}
              type="button"
              onClick={() => {
                setToolsOpen(false)
                o.run()
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left hover:bg-surface-2"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-ink">
                <o.icon className="size-5" />
              </span>
              <span>
                <span className="block font-semibold">{o.title}</span>
                <span className="block text-sm text-subtle">{o.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}
