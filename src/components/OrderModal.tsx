import { useMemo, useState, type ReactNode } from 'react'
import { ClipboardList, Copy, MessageCircle, Pencil, Share2, Truck } from 'lucide-react'
import { isAlert, isWarning, suggestOrderQty } from '../lib/stock'
import { cleanSupplier, formatPhone, listSuppliers, NO_SUPPLIER, normalizePhone, orderText, supplierKey, whatsappLink } from '../lib/suppliers'
import { cn, formatCLP, formatQty, parseQty } from '../lib/utils'
import type { Product, StockStatus } from '../types'
import { useActions, useData, useDerived } from '../store/AppStore'
import { SupplierAssignModal } from './SupplierAssignModal'
import { Modal } from './ui/Modal'
import { Button, EmptyState, Input } from './ui/primitives'
import { useToast } from './ui/Toast'

/**
 * Arma el pedido al proveedor. Los productos en ROJO (muy poco o agotados) entran solos; los
 * AMARILLOS (quedan poco) se ofrecen aparte para sumarlos con un toque. La cantidad sugerida deja
 * el producto bien metido en verde (o ~1 semana de venta); se puede editar.
 * Con proveedores anotados, se elige a quién pedirle y el mensaje lleva solo lo que él trae.
 * Se copia o se manda por WhatsApp tal cual.
 */
export function OrderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return <Inner onClose={onClose} />
}

function Inner({ onClose }: { onClose: () => void }) {
  const { products, settings } = useData()
  const { stockInfo } = useDerived()
  const toast = useToast()

  const { red, yellow } = useMemo(() => {
    const byOrder = (a: Candidate, b: Candidate) => a.p.category.localeCompare(b.p.category, 'es') || a.p.name.localeCompare(b.p.name, 'es')
    const pick = (test: (s: StockStatus) => boolean) =>
      products
        .map((p) => ({ p, info: stockInfo.get(p.id) }))
        .filter((x) => x.info && test(x.info.status))
        .map(({ p, info }) => ({ p, suggested: suggestOrderQty(p, info!) }))
        .filter((x) => x.suggested > 0)
        .sort(byOrder)
    return { red: pick(isAlert), yellow: pick(isWarning) }
  }, [products, stockInfo])
  const all = useMemo(() => [...red, ...yellow], [red, yellow])

  // A quién se le pide: 'todos', la clave de un proveedor o '' (los que no tienen proveedor)
  const [chosen, setWho] = useState('todos')
  const [assigning, setAssigning] = useState(false)
  // Nombres de los proveedores que tienen algo por pedir (los demás no se ofrecen)
  const groups = useMemo(() => {
    const names = new Map(listSuppliers(products).map((s) => [s.key, s.name]))
    const keys = [...new Set(all.map((c) => supplierKey(c.p.supplier)))]
    return keys
      .map((key) => ({ key, name: key ? (names.get(key) ?? cleanSupplier(all.find((c) => supplierKey(c.p.supplier) === key)!.p.supplier ?? '')) : NO_SUPPLIER }))
      .sort((a, b) => Number(!a.key) - Number(!b.key) || a.name.localeCompare(b.name, 'es'))
  }, [products, all])
  const hasSuppliers = groups.some((g) => g.key)
  // Si el proveedor elegido ya no tiene nada por pedir (ej: llegó su mercadería), se vuelve a "Todos"
  const who = groups.some((g) => g.key === chosen) ? chosen : 'todos'
  const inGroup = (c: Candidate) => who === 'todos' || supplierKey(c.p.supplier) === who
  const redHere = red.filter(inGroup)
  const yellowHere = yellow.filter(inGroup)
  const supplierName = who && who !== 'todos' ? groups.find((g) => g.key === who)?.name : undefined

  // Los rojos parten con la cantidad sugerida; los amarillos vacíos hasta que se agreguen
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(red.map((c) => [c.p.id, fmt(c.suggested)])))
  const amount = (p: Product) => parseQty(qty[p.id] ?? '', p.unit) ?? 0
  const yellowAdded = yellowHere.length > 0 && yellowHere.every((c) => amount(c.p) > 0)
  const toggleYellow = () =>
    setQty((q) => {
      const next = { ...q }
      for (const c of yellowHere) next[c.p.id] = yellowAdded ? '' : fmt(c.suggested)
      return next
    })

  const allLines = all
    .map(({ p }) => ({ p, n: amount(p) }))
    .filter((l) => l.n > 0)
    .sort((a, b) => a.p.category.localeCompare(b.p.category, 'es') || a.p.name.localeCompare(b.p.name, 'es'))
  const lines = allLines.filter((l) => who === 'todos' || supplierKey(l.p.supplier) === who)
  const cost = lines.reduce((a, l) => a + l.n * l.p.cost, 0)
  const countFor = (key: string) => allLines.filter((l) => supplierKey(l.p.supplier) === key).length

  const text = orderText(lines, { businessName: settings.businessName, supplier: supplierName })
  const phone = supplierName ? settings.supplierPhones[who] : undefined

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Pedido copiado: pégalo en WhatsApp o en un correo')
    } catch {
      toast.error('No se pudo copiar. Selecciona el texto y cópialo a mano.')
    }
  }
  const share = async () => {
    try {
      await navigator.share({ title: 'Pedido', text })
    } catch {
      /* el usuario canceló */
    }
  }
  const sendWhatsApp = async () => {
    const { url, fits } = whatsappLink(text, phone)
    if (fits) {
      window.open(url, '_blank', 'noopener')
      return
    }
    // Un pedido enorme no cabe en el link: se copia para pegarlo en WhatsApp
    try {
      await navigator.clipboard.writeText(text)
      toast.success('El pedido es muy largo para mandarlo directo. Ya lo copiamos: abre WhatsApp y pégalo.')
      if (phone) window.open(url, '_blank', 'noopener')
    } catch {
      toast.error('El pedido es muy largo para WhatsApp. Elige un proveedor para mandarlo por partes.')
    }
  }
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <ClipboardList className="size-5" /> Pedido al proveedor
        </span>
      }
      description={`Lo que está en rojo ya va en el pedido. Te sugerimos cuánto pedir; puedes cambiar los números.${
        yellowHere.length ? ` Más abajo puedes agregar ${yellowHere.length === 1 ? 'el que queda poco' : `los ${yellowHere.length} que quedan poco`}.` : ''
      }`}
      footer={
        lines.length > 0 && (
          <>
            <span className="mr-auto text-sm text-subtle">
              Costo estimado: <strong className="tabular text-fg">{formatCLP(cost)}</strong>
            </span>
            <Button variant="outline" onClick={copy}>
              <Copy /> Copiar
            </Button>
            {canShare && (
              <Button variant="outline" onClick={share}>
                <Share2 /> Compartir
              </Button>
            )}
            <Button variant="primary" className="max-w-full" onClick={sendWhatsApp}>
              <MessageCircle /> <span className="truncate">{supplierName ? `Mandar a ${supplierName}` : 'WhatsApp'}</span>
            </Button>
          </>
        )
      }
    >
      {all.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title="No hay nada que pedir">
          Tienes suficiente de todo por ahora.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
          <div className="space-y-4">
            {hasSuppliers ? (
              <section aria-label="Elige a quién le pides">
                <p className="mb-1.5 font-bold">¿A quién le vas a pedir?</p>
                <div className="flex flex-wrap gap-2">
                  <WhoButton active={who === 'todos'} onClick={() => setWho('todos')}>
                    Todos ({allLines.length})
                  </WhoButton>
                  {groups.map((g) => (
                    <WhoButton key={g.key} active={who === g.key} onClick={() => setWho(g.key)}>
                      {g.name} ({countFor(g.key)})
                    </WhoButton>
                  ))}
                </div>
                {supplierName && <SupplierPhone key={who} name={supplierName} supplierKey={who} />}
              </section>
            ) : (
              <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3">
                <p className="min-w-0 flex-1 basis-56 text-sm text-muted">
                  ¿Le compras a varios proveedores? Anota quién trae cada producto y aquí podrás hacer un pedido para cada uno.
                </p>
                <Button size="sm" variant="outline" onClick={() => setAssigning(true)}>
                  <Truck /> Anotar proveedores
                </Button>
              </section>
            )}
            {redHere.length > 0 && (
              <section>
                <h3 className="mb-2 flex items-center gap-2 font-bold">
                  <span className="inline-block size-3 rounded-full bg-danger" aria-hidden /> Hay que pedir ({redHere.length})
                </h3>
                <OrderList items={redHere} qty={qty} setQty={setQty} />
              </section>
            )}
            {yellowHere.length > 0 && (
              <section className="rounded-xl border border-warn/40 bg-warn-soft/40 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 font-bold">
                    <span className="inline-block size-3 rounded-full bg-warn" aria-hidden />
                    {yellowHere.length} {yellowHere.length === 1 ? 'producto queda poco' : 'productos quedan poco'}
                  </h3>
                  <Button size="sm" variant={yellowAdded ? 'outline' : 'primary'} onClick={toggleYellow}>
                    {yellowAdded ? 'Quitarlos del pedido' : `Agregar ${yellowHere.length === 1 ? 'al' : `los ${yellowHere.length} al`} pedido`}
                  </Button>
                </div>
                <p className="mb-2 text-sm text-muted">Todavía no son urgentes. Agrégalos si quieres aprovechar el pedido.</p>
                <OrderList items={yellowHere} qty={qty} setQty={setQty} />
              </section>
            )}
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-subtle uppercase">Así se envía</p>
            <pre className="scrollbar-thin max-h-80 overflow-auto rounded-xl bg-surface-2 p-3 font-sans text-xs whitespace-pre-wrap">{text}</pre>
            <p className="mt-2 text-xs text-subtle">Deja una cantidad vacía o en 0 para sacarla del pedido.</p>
          </div>
        </div>
      )}
      <SupplierAssignModal open={assigning} onClose={() => setAssigning(false)} />
    </Modal>
  )
}

function WhoButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-11 max-w-full truncate rounded-xl border px-3 py-2 text-sm font-semibold',
        active ? 'border-brand bg-brand text-on-brand' : 'border-line-strong bg-surface hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  )
}

/** El WhatsApp del proveedor es opcional: con él, el botón abre directo su conversación */
function SupplierPhone({ name, supplierKey: key }: { name: string; supplierKey: string }) {
  const { settings } = useData()
  const actions = useActions()
  const toast = useToast()
  const saved = settings.supplierPhones[key]
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(saved ?? '')
  const [error, setError] = useState('')

  const save = () => {
    const { [key]: _old, ...rest } = settings.supplierPhones
    const clean = value.trim()
    const phone = clean ? normalizePhone(clean) : null
    if (clean && !phone) return setError('Escribe un celular de 9 dígitos, ej: 9 1234 5678')
    actions.updateSettings({ supplierPhones: phone ? { ...rest, [key]: phone } : rest })
    toast.success(phone ? `WhatsApp de ${name} guardado` : `WhatsApp de ${name} borrado`)
    setError('')
    setEditing(false)
  }

  if (saved && !editing) {
    return (
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-muted">
        Se manda al WhatsApp de {name}: <strong className="tabular text-fg">{formatPhone(saved)}</strong>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          <Pencil /> Cambiar
        </Button>
      </p>
    )
  }
  if (!editing) {
    return (
      <Button size="sm" variant="ghost" className="mt-1 max-w-full" onClick={() => setEditing(true)}>
        <MessageCircle /> <span className="truncate">Guardar el WhatsApp de {name}</span>
      </Button>
    )
  }
  return (
    <div className="mt-2">
      <label className="mb-1 block text-sm font-medium text-muted" htmlFor="order-phone">
        ¿Cuál es el WhatsApp de {name}? (Déjalo vacío para borrarlo)
      </label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="order-phone"
          autoFocus
          inputMode="tel"
          placeholder="9 1234 5678"
          className="h-11 min-w-0 flex-1 basis-40"
          value={value}
          aria-invalid={Boolean(error)}
          onChange={(e) => {
            setValue(e.target.value)
            setError('')
          }}
        />
        <Button variant="primary" onClick={save}>
          Guardar
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger-ink">
          {error}
        </p>
      )}
    </div>
  )
}

interface Candidate {
  p: Product
  suggested: number
}

const fmt = (n: number) => String(n).replace('.', ',')

/** Lista de productos del pedido, con la cantidad editable (vacía o 0 = no se pide) */
function OrderList({
  items,
  qty,
  setQty,
}: {
  items: Candidate[]
  qty: Record<string, string>
  setQty: (fn: (q: Record<string, string>) => Record<string, string>) => void
}) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
      {items.map(({ p }) => {
        const n = parseQty(qty[p.id] ?? '', p.unit) ?? 0
        return (
          <li key={p.id} className={cn('flex items-center gap-3 px-3 py-2', n <= 0 && 'opacity-60')}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{p.name}</p>
              <p className="text-xs text-subtle">
                {p.category} · quedan {formatQty(p.stock, p.unit)}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                value={qty[p.id] ?? ''}
                onChange={(e) => setQty((q) => ({ ...q, [p.id]: e.target.value }))}
                inputMode="decimal"
                placeholder="0"
                className="tabular h-11 w-20 text-right"
                aria-label={`Cantidad a pedir de ${p.name}`}
              />
              <span className="w-6 text-xs text-subtle">{p.unit}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
