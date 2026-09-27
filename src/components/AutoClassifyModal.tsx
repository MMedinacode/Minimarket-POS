import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { inferCategory } from '../lib/categories'
import { useActions, useData } from '../store/AppStore'
import { Modal } from './ui/Modal'
import { Badge, Button, EmptyState } from './ui/primitives'
import { useToast } from './ui/Toast'

/** Revisa los nombres y propone la categoría que corresponde; el dueño elige cuáles aplicar */
export function AutoClassifyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return <Inner onClose={onClose} />
}

function Inner({ onClose }: { onClose: () => void }) {
  const { products } = useData()
  const actions = useActions()
  const toast = useToast()

  // Solo se proponen cambios donde se reconocieron palabras clave
  const proposals = useMemo(
    () =>
      products
        .map((p) => ({ p, guess: inferCategory(p.name) }))
        .filter(({ p, guess }) => guess.score > 0 && guess.category !== p.category)
        .sort((a, b) => a.p.name.localeCompare(b.p.name, 'es')),
    [products],
  )
  // Se marcan de entrada los que hoy están en "Otros" o sin categoría
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
    toast.success(`${selected.size} ${selected.size === 1 ? 'producto ordenado' : 'productos ordenados'}`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="size-5 text-brand-ink" /> Ordenar categorías automáticamente
        </span>
      }
      description="Según el nombre de cada producto, te sugerimos la categoría. Marca los cambios que quieras hacer."
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
        <EmptyState icon={<Sparkles />} title="Todo está en orden">
          Las categorías de tus productos ya calzan con sus nombres.
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
                <label className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-surface-2/60">
                  <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
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
