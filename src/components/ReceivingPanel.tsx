import { lazy, Suspense, useState } from 'react'
import { Camera, CameraOff, Truck, Undo2 } from 'lucide-react'
import { cn, formatQty } from '../lib/utils'
import type { Product } from '../types'
import { Badge, Button, Card } from './ui/primitives'

const CameraScanner = lazy(() => import('./CameraScanner'))

/**
 * "Llegó mercadería": mientras está abierto, cada código escaneado (pistola
 * o cámara) suma 1 al stock de ese producto.
 */
export function ReceivingPanel({
  units,
  items,
  onScan,
  onUndo,
  onClose,
  paused,
}: {
  units: number
  items: { id: string; qty: number; product: Product }[]
  onScan: (code: string) => void
  onUndo: () => void
  onClose: () => void
  /** Hay un formulario abierto encima: se apaga la cámara */
  paused: boolean
}) {
  const [camera, setCamera] = useState(false)
  return (
    <Card className="border-brand/60 ring-1 ring-brand/40">
      <div className="flex flex-wrap items-start gap-3 p-4 sm:p-5">
        <span className="grid size-11 place-items-center rounded-xl bg-brand text-on-brand">
          <Truck className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">Llegó mercadería</h2>
          <p className="text-muted">
            Escanea cada producto que llegó: <strong className="text-fg">cada escaneo suma 1</strong>. Si un producto no existe, se abre
            el formulario para agregarlo.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 px-4 pb-4 sm:px-5">
        <Button variant={camera ? 'primary' : 'outline'} onClick={() => setCamera((c) => !c)}>
          {camera ? <CameraOff /> : <Camera />} {camera ? 'Apagar cámara' : 'Usar la cámara'}
        </Button>
        <Button variant="outline" onClick={onUndo} disabled={!units}>
          <Undo2 /> Deshacer el último
        </Button>
        <Button variant="primary" className="ml-auto" onClick={onClose}>
          Terminar
        </Button>
      </div>
      {camera && !paused && (
        <div className="px-4 pb-4 sm:px-5">
          <Suspense fallback={<div className="aspect-[4/3] max-w-md animate-pulse rounded-2xl bg-surface-2" />}>
            <CameraScanner className="w-full max-w-md" onDetected={onScan} onClose={() => setCamera(false)} />
          </Suspense>
        </div>
      )}
      <div className="border-t border-line px-4 py-3 sm:px-5">
        <p className="font-semibold">
          {units === 0
            ? 'Todavía no escaneas nada'
            : `${units} ${units === 1 ? 'unidad sumada' : 'unidades sumadas'} en ${items.length} ${items.length === 1 ? 'producto' : 'productos'}`}
        </p>
        {items.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {items.slice(0, 8).map((r, i) => (
              <li
                key={r.id}
                className={cn('flex items-center gap-2 rounded-xl border border-line px-3 py-1.5 text-sm', i === 0 && 'animate-flash border-brand')}
              >
                <span className="max-w-48 truncate font-medium">{r.product.name}</span>
                <Badge tone="brand">+{r.qty}</Badge>
                <span className="tabular text-xs text-subtle">ahora {formatQty(r.product.stock, r.product.unit)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
