import { useEffect, useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { raisePrices } from '../lib/prices'
import { formatCLP } from '../lib/utils'
import { useActions, useData } from '../store/AppStore'
import { Modal } from './ui/Modal'
import { Button, Field, Input, Segmented, Select } from './ui/primitives'
import { useToast } from './ui/Toast'

const QUICK = ['5', '10', '15', '20'] as const
const ROUNDING = [
  { value: '10', label: 'A $10' },
  { value: '50', label: 'A $50' },
  { value: '100', label: 'A $100' },
]

/**
 * "Subir precios" (ej: cuando el proveedor sube todo): un porcentaje para todos los
 * productos o para una categoría, con vista previa y "Deshacer" después.
 */
export function PriceRaiseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { products } = useData()
  const actions = useActions()
  const toast = useToast()
  const [category, setCategory] = useState('all')
  const [percent, setPercent] = useState('10')
  const [roundTo, setRoundTo] = useState('10')

  useEffect(() => {
    if (!open) return
    setCategory('all')
    setPercent('10')
    setRoundTo('10')
  }, [open])

  const categories = useMemo(() => [...new Set(products.map((p) => p.category))].sort((a, b) => a.localeCompare(b, 'es')), [products])
  const pct = Number(percent.replace(',', '.'))
  const changes = useMemo(() => {
    const list = category === 'all' ? products : products.filter((p) => p.category === category)
    return raisePrices(list, pct, Number(roundTo))
  }, [products, category, pct, roundTo])

  const apply = () => {
    const done = changes
    for (const c of done) actions.updateProduct(c.id, { price: c.after })
    onClose()
    toast.success(`Listo: ${done.length} ${done.length === 1 ? 'precio subido' : 'precios subidos'}`, {
      duration: 10_000,
      action: {
        label: 'Deshacer',
        onClick: () => {
          for (const c of done) actions.updateProduct(c.id, { price: c.before })
          toast.info('Se dejaron los precios como estaban')
        },
      },
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Subir precios"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={apply} disabled={!changes.length}>
            Subir {changes.length} {changes.length === 1 ? 'precio' : 'precios'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="¿A qué productos?" htmlFor="pr-cat">
          <Select id="pr-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">Todos ({products.length})</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c} ({products.filter((p) => p.category === c).length})
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <p className="mb-1.5 font-semibold">¿Cuánto subir?</p>
          <div className="flex flex-wrap items-center gap-2">
            {QUICK.map((q) => (
              <Button key={q} variant={percent === q ? 'primary' : 'outline'} onClick={() => setPercent(q)}>
                {q}%
              </Button>
            ))}
            <div className="flex items-center gap-1.5">
              <Input
                value={percent}
                onChange={(e) => setPercent(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5))}
                inputMode="decimal"
                aria-label="Otro porcentaje"
                className="w-20 text-center"
              />
              <span className="font-semibold">%</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">Redondear hacia arriba</span>
          <Segmented value={roundTo} onChange={setRoundTo} ariaLabel="Redondear" options={ROUNDING} />
        </div>

        <div className="rounded-xl bg-surface-2 p-3">
          {changes.length === 0 ? (
            <p className="text-center text-muted">Escribe cuánto quieres subir para ver cómo quedan los precios.</p>
          ) : (
            <>
              <p className="mb-2 text-sm font-semibold text-muted">Así quedan (algunos ejemplos):</p>
              <ul className="space-y-1.5">
                {changes.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="tabular text-subtle line-through">{formatCLP(c.before)}</span>
                    <ArrowRight className="size-4 shrink-0 text-subtle" />
                    <span className="tabular font-bold">{formatCLP(c.after)}</span>
                  </li>
                ))}
              </ul>
              {changes.length > 6 && <p className="mt-2 text-sm text-subtle">…y {changes.length - 6} más.</p>}
            </>
          )}
        </div>
        <p className="text-sm text-subtle">Lo que te costó cada producto no cambia. Si te equivocas, toca «Deshacer» en el aviso que aparece después.</p>
      </div>
    </Modal>
  )
}
