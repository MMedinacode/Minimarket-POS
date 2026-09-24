import { useState, type FormEvent } from 'react'
import { ArrowRight, Minus, PackagePlus, Plus, Scale } from 'lucide-react'
import { formatQty, parseLocaleNumber, roundQty } from '../lib/utils'
import type { StockAdjustMode } from '../store/reducer'
import { useActions } from '../store/AppStore'
import type { Product } from '../types'
import { Modal } from './ui/Modal'
import { Button, Field, Input, Segmented } from './ui/primitives'
import { useToast } from './ui/Toast'

const LABELS: Record<StockAdjustMode, string> = {
  add: 'Llegó mercadería',
  remove: 'Merma / pérdida',
  set: 'Conteo físico',
}

/** Ajuste rápido de stock: sumar una recepción, restar mermas o fijar un conteo */
export function StockAdjustModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  if (!product) return null
  return <Inner key={product.id} product={product} onClose={onClose} />
}

function Inner({ product, onClose }: { product: Product; onClose: () => void }) {
  const actions = useActions()
  const toast = useToast()
  const [mode, setMode] = useState<StockAdjustMode>('add')
  const [qty, setQty] = useState('')
  const n = parseLocaleNumber(qty)
  const valid = n !== null && n >= 0 && (mode === 'set' || n > 0)
  const next = !valid ? null : roundQty(Math.max(0, mode === 'set' ? n! : mode === 'add' ? product.stock + n! : product.stock - n!), product.unit)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    actions.adjustStock(product.id, mode, n!)
    toast.success(`Stock de "${product.name}": ${formatQty(next!, product.unit)}`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Ajustar stock"
      description={product.name}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="stock-form" disabled={!valid}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="stock-form" onSubmit={submit} className="space-y-4">
        <Segmented
          className="flex w-full"
          size="sm"
          value={mode}
          onChange={setMode}
          ariaLabel="Tipo de ajuste"
          options={[
            { value: 'add', label: 'Sumar', icon: <Plus /> },
            { value: 'remove', label: 'Restar', icon: <Minus /> },
            { value: 'set', label: 'Contar', icon: <Scale /> },
          ]}
        />
        <Field
          label={mode === 'set' ? `Cantidad real contada (${product.unit === 'kg' ? 'kg' : 'unidades'})` : `${LABELS[mode]} (${product.unit === 'kg' ? 'kg' : 'unidades'})`}
          htmlFor="adj-qty"
        >
          <Input
            id="adj-qty"
            autoFocus
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
            className="tabular h-14 text-2xl font-bold"
          />
        </Field>
        <div className="flex items-center justify-center gap-3 rounded-xl bg-surface-2 py-3 text-lg">
          <PackagePlus className="size-5 text-subtle" />
          <span className="tabular font-semibold">{formatQty(product.stock, product.unit)}</span>
          <ArrowRight className="size-5 text-subtle" />
          <span className="tabular font-bold text-brand-ink">{next === null ? '—' : formatQty(next, product.unit)}</span>
        </div>
      </form>
    </Modal>
  )
}
