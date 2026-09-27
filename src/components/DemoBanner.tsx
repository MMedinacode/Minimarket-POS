import { useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { navigate } from '../hooks/useHashRoute'
import { useActions } from '../store/AppStore'
import { Modal } from './ui/Modal'
import { Button } from './ui/primitives'
import { useToast } from './ui/Toast'

/** Aviso mientras se usan los datos de ejemplo, con la salida para empezar de verdad */
export function DemoBanner() {
  const actions = useActions()
  const toast = useToast()
  const [open, setOpen] = useState(false)

  const finish = (keepProducts: boolean) => {
    actions.endDemo(keepProducts)
    setOpen(false)
    toast.success(keepProducts ? 'Listo: se borraron las ventas de ejemplo' : 'Listo: la caja quedó vacía para tus productos')
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-info-ink/25 bg-info-soft p-4 text-info-ink sm:flex-row sm:items-center">
      <FlaskConical className="size-7 shrink-0" />
      <div className="flex-1">
        <p className="font-bold">Estos son productos y ventas de ejemplo</p>
        <p className="text-sm opacity-90">Sirven para probar la caja sin miedo. Cuando quieras empezar de verdad, toca el botón.</p>
      </div>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Empezar de verdad
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} size="sm" title="Empezar de verdad">
        <p className="text-muted">¿Qué hacemos con los productos de ejemplo?</p>
        <div className="mt-4 space-y-2">
          <Button variant="primary" size="lg" className="w-full" onClick={() => finish(false)}>
            Borrar todo y empezar vacío
          </Button>
          <Button variant="outline" size="lg" className="h-auto w-full py-3 whitespace-normal" onClick={() => finish(true)}>
            Mantener los productos (les cambio el precio) y borrar solo las ventas
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setOpen(false)
              navigate('excel')
            }}
          >
            Tengo mis productos en un Excel
          </Button>
        </div>
      </Modal>
    </div>
  )
}
