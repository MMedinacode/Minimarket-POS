import { useMemo, useState } from 'react'
import { ClipboardList, Copy, MessageCircle, Share2 } from 'lucide-react'
import { isAlert, isWarning, suggestOrderQty } from '../lib/stock'
import { cn, formatCLP, formatDate, formatQty, parseQty } from '../lib/utils'
import type { Product, StockStatus } from '../types'
import { useData, useDerived } from '../store/AppStore'
import { Modal } from './ui/Modal'
import { Button, EmptyState, Input } from './ui/primitives'
import { useToast } from './ui/Toast'

/**
 * Arma el pedido al proveedor. Los productos en ROJO (muy poco o agotados) entran solos; los
 * AMARILLOS (quedan poco) se ofrecen aparte para sumarlos con un toque. La cantidad sugerida deja
 * el producto bien metido en verde (o ~1 semana de venta); se puede editar.
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

  // Los rojos parten con la cantidad sugerida; los amarillos vacíos hasta que se agreguen
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(red.map((c) => [c.p.id, fmt(c.suggested)])))
  const amount = (p: Product) => parseQty(qty[p.id] ?? '', p.unit) ?? 0
  const yellowAdded = yellow.length > 0 && yellow.every((c) => amount(c.p) > 0)
  const toggleYellow = () =>
    setQty((q) => {
      const next = { ...q }
      for (const c of yellow) next[c.p.id] = yellowAdded ? '' : fmt(c.suggested)
      return next
    })

  const lines = all
    .map(({ p }) => ({ p, n: amount(p) }))
    .filter((l) => l.n > 0)
    .sort((a, b) => a.p.category.localeCompare(b.p.category, 'es') || a.p.name.localeCompare(b.p.name, 'es'))
  const cost = lines.reduce((a, l) => a + l.n * l.p.cost, 0)

  const text = useMemo(() => {
    const out = [`Pedido · ${settings.businessName} · ${formatDate(new Date())}`, '']
    let lastCat = ''
    for (const { p, n } of lines) {
      if (p.category !== lastCat) {
        if (lastCat) out.push('')
        out.push(`*${p.category}*`)
        lastCat = p.category
      }
      out.push(`• ${p.name}: ${formatQty(n, p.unit)}${p.unit === 'un' ? ' un' : ''}`)
    }
    return out.join('\n')
  }, [lines, settings.businessName])

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
        yellow.length ? ` Más abajo puedes agregar ${yellow.length === 1 ? 'el que queda poco' : `los ${yellow.length} que quedan poco`}.` : ''
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
            <Button
              variant="primary"
              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')}
            >
              <MessageCircle /> WhatsApp
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
            {red.length > 0 && (
              <section>
                <h3 className="mb-2 flex items-center gap-2 font-bold">
                  <span className="inline-block size-3 rounded-full bg-danger" aria-hidden /> Hay que pedir ({red.length})
                </h3>
                <OrderList items={red} qty={qty} setQty={setQty} />
              </section>
            )}
            {yellow.length > 0 && (
              <section className="rounded-xl border border-warn/40 bg-warn-soft/40 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 font-bold">
                    <span className="inline-block size-3 rounded-full bg-warn" aria-hidden />
                    {yellow.length} {yellow.length === 1 ? 'producto queda poco' : 'productos quedan poco'}
                  </h3>
                  <Button size="sm" variant={yellowAdded ? 'outline' : 'primary'} onClick={toggleYellow}>
                    {yellowAdded ? 'Quitarlos del pedido' : `Agregar ${yellow.length === 1 ? 'al' : `los ${yellow.length} al`} pedido`}
                  </Button>
                </div>
                <p className="mb-2 text-sm text-muted">Todavía no son urgentes. Agrégalos si quieres aprovechar el pedido.</p>
                <OrderList items={yellow} qty={qty} setQty={setQty} />
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
    </Modal>
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
