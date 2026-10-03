import { useState, type FormEvent } from 'react'
import { ArrowRight, ClipboardCheck, Minus, Plus } from 'lucide-react'
import { cn, formatQty, parseQty, roundQty } from '../lib/utils'
import type { StockAdjustMode } from '../store/reducer'
import { useActions } from '../store/AppStore'
import type { Product } from '../types'
import { Modal } from './ui/Modal'
import { Button, Input } from './ui/primitives'
import { useToast } from './ui/Toast'

const MODES: { value: StockAdjustMode; title: string; question: string; icon: typeof Plus }[] = [
  { value: 'add', title: 'Llegaron más', question: '¿Cuántos llegaron?', icon: Plus },
  { value: 'remove', title: 'Se perdieron o vencieron', question: '¿Cuántos hay que sacar?', icon: Minus },
  { value: 'set', title: 'Los conté y hay…', question: '¿Cuántos contaste?', icon: ClipboardCheck },
]

/** Cambiar la cantidad de un producto: sumar lo que llegó, sacar mermas o poner lo que se contó */
export function StockAdjustModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  if (!product) return null
  return <Inner key={product.id} product={product} onClose={onClose} />
}

function Inner({ product, onClose }: { product: Product; onClose: () => void }) {
  const actions = useActions()
  const toast = useToast()
  const [mode, setMode] = useState<StockAdjustMode>('add')
  const [qty, setQty] = useState('')
  const n = parseQty(qty, product.unit)
  const valid = n !== null && n >= 0 && (mode === 'set' || n > 0)
  const next = !valid ? null : roundQty(Math.max(0, mode === 'set' ? n! : mode === 'add' ? product.stock + n! : product.stock - n!), product.unit)
  const current = MODES.find((m) => m.value === mode)!

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    actions.adjustStock(product.id, mode, n!)
    toast.success(`${product.name}: ahora quedan ${formatQty(next!, product.unit)}`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Cambiar cantidad"
      description={`${product.name} · hoy quedan ${formatQty(product.stock, product.unit)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="lg" type="submit" form="stock-form" disabled={!valid}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="stock-form" onSubmit={submit} className="space-y-4">
        <div className="space-y-2" role="radiogroup" aria-label="Qué pasó">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={mode === m.value}
              onClick={() => setMode(m.value)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left font-semibold transition-colors',
                mode === m.value ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line-strong hover:bg-surface-2',
              )}
            >
              <m.icon className="size-5" /> {m.title}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="adj-qty" className="mb-1.5 block font-semibold">
            {current.question} {product.unit === 'kg' && <span className="font-normal text-subtle">(en kilos)</span>}
          </label>
          <Input id="adj-qty" autoFocus inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" className="tabular h-14 text-2xl font-bold" />
        </div>
        <div className="flex items-center justify-center gap-3 rounded-xl bg-surface-2 py-3 text-lg">
          <span className="text-subtle">Quedarán:</span>
          <span className="tabular font-semibold">{formatQty(product.stock, product.unit)}</span>
          <ArrowRight className="size-5 text-subtle" />
          <span className="tabular font-bold text-brand-ink">{next === null ? '—' : formatQty(next, product.unit)}</span>
        </div>
      </form>
    </Modal>
  )
}
