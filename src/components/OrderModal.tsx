import { useMemo, useState } from 'react'
import { ClipboardList, Copy, MessageCircle, Share2 } from 'lucide-react'
import { isAlert, suggestOrderQty } from '../lib/stock'
import { cn, formatCLP, formatDate, formatQty, parseLocaleNumber } from '../lib/utils'
import { useData, useDerived } from '../store/AppStore'
import { Modal } from './ui/Modal'
import { Button, EmptyState, Input } from './ui/primitives'
import { useToast } from './ui/Toast'

/**
 * Arma el pedido al proveedor con los productos en stock crítico.
 * La cantidad sugerida alcanza para ~1 semana de venta; se puede editar.
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

  const candidates = useMemo(
    () =>
      products
        .map((p) => ({ p, info: stockInfo.get(p.id)! }))
        .filter(({ info }) => info && isAlert(info.status))
        .map(({ p, info }) => ({ p, suggested: suggestOrderQty(p, info) }))
        .filter((x) => x.suggested > 0)
        .sort((a, b) => a.p.category.localeCompare(b.p.category, 'es') || a.p.name.localeCompare(b.p.name, 'es')),
    [products, stockInfo],
  )
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(candidates.map((c) => [c.p.id, String(c.suggested).replace('.', ',')])),
  )

  const lines = candidates
    .map(({ p }) => ({ p, n: parseLocaleNumber(qty[p.id] ?? '') ?? 0 }))
    .filter((l) => l.n > 0)
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
      description="Productos en stock crítico. La cantidad sugerida alcanza para ~1 semana de venta; cámbiala si quieres."
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
      {candidates.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title="No hay nada que pedir">
          Ningún producto está en stock crítico.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
          <ul className="divide-y divide-line rounded-xl border border-line">
            {candidates.map(({ p }) => {
              const n = parseLocaleNumber(qty[p.id] ?? '') ?? 0
              return (
                <li key={p.id} className={cn('flex items-center gap-3 px-3 py-2', n <= 0 && 'opacity-50')}>
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
                      className="tabular h-9 w-20 text-right"
                      aria-label={`Cantidad a pedir de ${p.name}`}
                    />
                    <span className="w-6 text-xs text-subtle">{p.unit}</span>
                  </div>
                </li>
              )
            })}
          </ul>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-subtle uppercase">Así se envía</p>
            <pre className="scrollbar-thin max-h-80 overflow-auto rounded-xl bg-surface-2 p-3 font-sans text-xs whitespace-pre-wrap">{text}</pre>
            <p className="mt-2 text-xs text-subtle">Deja una cantidad en 0 para sacarla del pedido.</p>
          </div>
        </div>
      )}
    </Modal>
  )
}
