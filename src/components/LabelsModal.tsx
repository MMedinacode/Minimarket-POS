import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Minus, Plus, Printer, Search, Tag, Wand2 } from 'lucide-react'
import { internalCodes, isValidEan13 } from '../lib/ean13'
import { cn, formatCLP, normalizeText } from '../lib/utils'
import { useActions, useData } from '../store/AppStore'
import type { Product } from '../types'
import { BarcodeSvg } from './BarcodeSvg'
import { Modal } from './ui/Modal'
import { Badge, Button, Input } from './ui/primitives'
import { useToast } from './ui/Toast'

const PER_SHEET = 21

/**
 * Etiquetas con código de barras para pegar en los productos (hoja A4 de
 * 3×7 = 21 etiquetas de 63,5×38,1 mm, formato Avery L7160; en papel normal
 * se recortan por las líneas). Pensado para bazares: a lo que no trae código
 * se le genera uno interno y desde ahí se vende escaneando.
 */
export function LabelsModal({ open, onClose, preselect = [] }: { open: boolean; onClose: () => void; preselect?: string[] }) {
  if (!open) return null
  return <Inner onClose={onClose} preselect={preselect} />
}

function Inner({ onClose, preselect }: { onClose: () => void; preselect: string[] }) {
  const { products } = useData()
  const actions = useActions()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [copies, setCopies] = useState<Map<string, number>>(() => new Map(preselect.map((id) => [id, 1])))
  const [showPrice, setShowPrice] = useState(true)
  const [printing, setPrinting] = useState(false)

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const list = useMemo(() => {
    const q = normalizeText(query)
    return products
      .filter((p) => !q || normalizeText(`${p.name} ${p.barcode} ${p.category}`).includes(q))
      .sort((a, b) => Number(Boolean(a.barcode)) - Number(Boolean(b.barcode)) || a.name.localeCompare(b.name, 'es'))
      .slice(0, 150)
  }, [products, query])

  const selected = [...copies.entries()].map(([id, n]) => ({ p: byId.get(id), n })).filter((x): x is { p: Product; n: number } => Boolean(x.p))
  const total = selected.reduce((a, x) => a + x.n, 0)
  const withoutCode = selected.filter((x) => !x.p.barcode)
  const notPrintable = selected.filter((x) => x.p.barcode && !isValidEan13(x.p.barcode))

  const setN = (id: string, n: number) =>
    setCopies((m) => {
      const next = new Map(m)
      if (n <= 0) next.delete(id)
      else next.set(id, Math.min(n, 200))
      return next
    })

  const generateCodes = () => {
    const codes = internalCodes(
      products.map((p) => p.barcode).filter(Boolean),
      withoutCode.length,
    )
    withoutCode.forEach((x, i) => actions.updateProduct(x.p.id, { barcode: codes[i] }))
    toast.success(`${codes.length} códigos internos creados. Ya se pueden escanear en la caja.`)
  }

  // Imprime cuando la hoja ya está dibujada
  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(false)
    window.addEventListener('afterprint', done, { once: true })
    const t = setTimeout(() => window.print(), 100)
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', done)
    }
  }, [printing])

  const labels = selected.flatMap(({ p, n }) => Array.from({ length: n }, () => p))

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="xl"
        title={
          <span className="flex items-center gap-2">
            <Tag className="size-5" /> Imprimir etiquetas con código de barras
          </span>
        }
        description="Hoja A4 de 21 etiquetas (3×7, tipo Avery L7160). En papel normal se recortan por las líneas."
        footer={
          <>
            <span className="mr-auto text-sm text-subtle">
              {total} {total === 1 ? 'etiqueta' : 'etiquetas'} · {Math.max(1, Math.ceil(total / PER_SHEET))} {total > PER_SHEET ? 'hojas' : 'hoja'}
            </span>
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
            <Button variant="primary" disabled={!total || withoutCode.length > 0} onClick={() => setPrinting(true)}>
              <Printer /> Imprimir
            </Button>
          </>
        }
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap gap-2">
              <div className="relative min-w-48 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto…" className="h-10 pl-9" />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-10"
                onClick={() => setCopies(new Map(products.filter((p) => !p.barcode && p.unit === 'un').map((p) => [p.id, 1])))}
              >
                Todos los sin código
              </Button>
              {copies.size > 0 && (
                <Button size="sm" variant="ghost" className="h-10" onClick={() => setCopies(new Map())}>
                  Quitar todos
                </Button>
              )}
            </div>
            <ul className="scrollbar-thin max-h-[45dvh] divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {list.map((p) => {
                const n = copies.get(p.id) ?? 0
                return (
                  <li key={p.id} className={cn('flex items-center gap-3 px-3 py-2', n > 0 && 'bg-brand-soft/60')}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{p.name}</p>
                      <p className="font-mono text-xs text-subtle">
                        {p.barcode || <span className="font-sans font-semibold text-warn-ink">sin código</span>}
                      </p>
                    </div>
                    {n === 0 ? (
                      <Button size="sm" variant="outline" onClick={() => setN(p.id, 1)}>
                        <Plus /> Agregar
                      </Button>
                    ) : (
                      <div className="flex items-center rounded-lg border border-line-strong bg-surface">
                        <button type="button" className="grid size-8 place-items-center" onClick={() => setN(p.id, n - 1)} aria-label="Una menos">
                          <Minus className="size-4" />
                        </button>
                        <span className="tabular w-8 text-center text-sm font-bold">{n}</span>
                        <button type="button" className="grid size-8 place-items-center" onClick={() => setN(p.id, n + 1)} aria-label="Una más">
                          <Plus className="size-4" />
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="space-y-3">
            {withoutCode.length > 0 && (
              <div className="rounded-xl bg-warn-soft p-3 text-sm text-warn-ink">
                <p className="font-semibold">
                  {withoutCode.length === 1 ? '1 producto elegido no tiene código' : `${withoutCode.length} productos elegidos no tienen código`}
                </p>
                <p className="mt-1">Se les crea un código interno (empieza con 20) que funciona con la pistola y la cámara.</p>
                <Button size="sm" variant="primary" className="mt-2" onClick={generateCodes}>
                  <Wand2 /> Generar códigos
                </Button>
              </div>
            )}
            {notPrintable.length > 0 && (
              <p className="rounded-xl bg-info-soft p-3 text-xs text-info-ink">
                {notPrintable.length} tienen un código que no es EAN-13 (ej: PLU de granel): su etiqueta sale solo con nombre y precio.
              </p>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
              Mostrar el precio en la etiqueta
            </label>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-subtle uppercase">Vista previa</p>
              {labels[0] ? (
                <div className="w-full max-w-[260px] rounded-lg border border-dashed border-line-strong bg-white p-3 text-black">
                  <LabelContent p={labels[0]} showPrice={showPrice} />
                </div>
              ) : (
                <p className="text-sm text-subtle">Elige productos de la lista.</p>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {printing &&
        createPortal(
          <div className="print-sheet">
            <div className="labels">
              {labels.map((p, i) => (
                <div key={i} className="label">
                  <LabelContent p={p} showPrice={showPrice} />
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

function LabelContent({ p, showPrice }: { p: Product; showPrice: boolean }) {
  return (
    <div className="flex h-full flex-col">
      <p className="line-clamp-2 text-[11px] leading-tight font-semibold">{p.name}</p>
      {showPrice && (
        <p className="text-lg leading-tight font-extrabold">
          {formatCLP(p.price)}
          {p.unit === 'kg' && <span className="text-[10px]"> /kg</span>}
        </p>
      )}
      <div className="mt-auto">{isValidEan13(p.barcode) ? <BarcodeSvg code={p.barcode} className="h-auto w-full" /> : p.barcode && <Badge>{p.barcode}</Badge>}</div>
    </div>
  )
}
