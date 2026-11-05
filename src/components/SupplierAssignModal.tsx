import { useMemo, useState } from 'react'
import { Search, Truck } from 'lucide-react'
import { cleanSupplier, listSuppliers, matchSupplier, supplierKey } from '../lib/suppliers'
import { normalizeText } from '../lib/utils'
import { useActions, useData } from '../store/AppStore'
import { SupplierField } from './SupplierField'
import { Modal } from './ui/Modal'
import { Badge, Button, EmptyState, Input, Segmented, Select } from './ui/primitives'
import { useToast } from './ui/Toast'

/**
 * Anotar el proveedor de muchos productos de una vez: se escribe quién es, se marcan los
 * productos que trae y listo. Sin esto habría que abrir los productos uno por uno.
 */
export function SupplierAssignModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return <Inner onClose={onClose} />
}

function Inner({ onClose }: { onClose: () => void }) {
  const { products } = useData()
  const actions = useActions()
  const toast = useToast()
  const [supplier, setSupplier] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [show, setShow] = useState<'sin' | 'todos'>('sin')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  const categories = useMemo(() => [...new Set(products.map((p) => p.category))].sort((a, b) => a.localeCompare(b, 'es')), [products])
  const rows = useMemo(() => {
    const q = normalizeText(query.trim())
    return products
      .filter((p) => show === 'todos' || !supplierKey(p.supplier))
      .filter((p) => category === 'all' || p.category === category)
      .filter((p) => !q || normalizeText(p.name).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [products, query, category, show])
  const allMarked = rows.length > 0 && rows.every((p) => selected.has(p.id))

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s)
      for (const p of rows) {
        if (allMarked) n.delete(p.id)
        else n.add(p.id)
      }
      return n
    })

  const name = cleanSupplier(supplier)
  const apply = () => {
    const final = matchSupplier(name, listSuppliers(products))
    for (const id of selected) actions.updateProduct(id, { supplier: final })
    toast.success(`${selected.size} ${selected.size === 1 ? 'producto anotado' : 'productos anotados'} con ${final}`)
    setSelected(new Set())
    setSupplier('')
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Truck className="size-5 text-brand-ink" /> Anotar proveedores
        </span>
      }
      description="Escribe quién trae los productos, márcalos y toca Guardar. Luego sigue con el próximo proveedor."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Terminar
          </Button>
          <Button variant="primary" onClick={apply} disabled={!name || !selected.size}>
            Guardar {selected.size || ''} {selected.size === 1 ? 'producto' : 'productos'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <SupplierField value={supplier} onChange={setSupplier} />
        <Segmented
          value={show}
          onChange={setShow}
          ariaLabel="Qué productos mostrar"
          options={[
            { value: 'sin', label: 'Los que faltan' },
            { value: 'todos', label: 'Todos' },
          ]}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-subtle" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto" aria-label="Buscar producto" className="pl-10" />
          </div>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoría">
            <option value="all">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={<Truck />} title={show === 'sin' && !query && category === 'all' ? '¡Todos tienen proveedor!' : 'No hay productos con ese filtro'} />
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={toggleAll}>
              {allMarked ? 'Desmarcar estos' : `Marcar estos ${rows.length}`}
            </Button>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {rows.map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-2/60">
                    <input type="checkbox" className="size-5 shrink-0 accent-[var(--brand)]" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                    <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                    {p.supplier && <Badge className="max-w-32 truncate">{p.supplier}</Badge>}
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  )
}
