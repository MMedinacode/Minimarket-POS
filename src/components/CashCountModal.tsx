import { useEffect, useState } from 'react'
import { CheckCircle2, TrendingDown, TrendingUp } from 'lucide-react'
import { drawerDifference } from '../lib/analytics'
import { readPref, writePref } from '../lib/storage'
import { cn, formatCLP } from '../lib/utils'
import { Modal } from './ui/Modal'
import { Field, MoneyInput } from './ui/primitives'

/**
 * "Contar el cajón" al cerrar el día. No guarda nada en los datos de la caja: solo
 * ayuda a ver si está justo, sobra o falta. El sencillo del inicio se recuerda en este equipo.
 */
export function CashCountModal({ open, onClose, expectedCash }: { open: boolean; onClose: () => void; expectedCash: number }) {
  const [starting, setStarting] = useState<number | null>(null)
  const [counted, setCounted] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    setStarting(readPref<number | null>('sencillo', null))
    setCounted(null)
  }, [open])

  const diff = counted === null ? null : drawerDifference(counted, starting ?? 0, expectedCash)

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Contar el cajón">
      <div className="space-y-4">
        <Field label="¿Con cuánto sencillo partiste el día?" htmlFor="cc-start" hint="Lo que dejaste en el cajón al abrir. Si no dejaste nada, déjalo vacío.">
          <MoneyInput
            id="cc-start"
            value={starting}
            onValueChange={(n) => {
              setStarting(n)
              writePref('sencillo', n)
            }}
            className="h-12 text-lg"
          />
        </Field>
        <Field label="¿Cuánta plata hay ahora en el cajón?" htmlFor="cc-count" hint="Cuenta billetes y monedas.">
          <MoneyInput id="cc-count" value={counted} onValueChange={setCounted} autoFocus className="h-12 text-lg" />
        </Field>

        <div className="rounded-xl bg-surface-2 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Sencillo del inicio</span>
            <span className="tabular">{formatCLP(starting ?? 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Ventas en efectivo menos gastos</span>
            <span className="tabular">{formatCLP(expectedCash)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold">
            <span>Debería haber</span>
            <span className="tabular">{formatCLP((starting ?? 0) + expectedCash)}</span>
          </div>
        </div>

        {diff !== null && (
          <div
            role="status"
            className={cn(
              'flex items-start gap-3 rounded-xl p-4',
              diff === 0 ? 'bg-ok-soft text-ok-ink' : diff > 0 ? 'bg-warn-soft text-warn-ink' : 'bg-danger-soft text-danger-ink',
            )}
          >
            {diff === 0 ? <CheckCircle2 className="size-7 shrink-0" /> : diff > 0 ? <TrendingUp className="size-7 shrink-0" /> : <TrendingDown className="size-7 shrink-0" />}
            <div>
              <p className="text-xl font-extrabold">
                {diff === 0 ? '¡Está justo!' : diff > 0 ? `Sobran ${formatCLP(diff)}` : `Faltan ${formatCLP(-diff)}`}
              </p>
              {diff !== 0 && (
                <p className="mt-1 text-fg">
                  {diff > 0
                    ? 'Puede que una venta no se haya anotado en la caja, o que el sencillo del inicio fuera más.'
                    : 'Revisa si anotaste todos los gastos que pagaste con plata del cajón, o si se dio mal un vuelto.'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
