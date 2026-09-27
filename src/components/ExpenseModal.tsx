import { useEffect, useState } from 'react'
import { Droplet, Flame, House, Lightbulb, PenLine, ShoppingBag, Truck, UserRound, Wifi } from 'lucide-react'
import { dayKey, formatCLP, parseDayKey, cn } from '../lib/utils'
import { useActions } from '../store/AppStore'
import type { ExpenseCategory } from '../types'
import { Modal } from './ui/Modal'
import { Button, Input, MoneyInput } from './ui/primitives'
import { useToast } from './ui/Toast'

const OPTIONS: { label: string; category: ExpenseCategory; icon: typeof Truck }[] = [
  { label: 'Proveedor', category: 'Proveedores', icon: Truck },
  { label: 'Luz', category: 'Servicios básicos', icon: Lightbulb },
  { label: 'Agua', category: 'Servicios básicos', icon: Droplet },
  { label: 'Gas', category: 'Servicios básicos', icon: Flame },
  { label: 'Internet o teléfono', category: 'Servicios básicos', icon: Wifi },
  { label: 'Arriendo', category: 'Arriendo', icon: House },
  { label: 'Sueldo', category: 'Sueldos', icon: UserRound },
  { label: 'Bolsas e insumos', category: 'Insumos', icon: ShoppingBag },
  { label: 'Otro', category: 'Otros', icon: PenLine },
]

/** "Anotar un gasto": elegir en qué, escribir cuánto y listo */
export function ExpenseModal({ open, onClose, day }: { open: boolean; onClose: () => void; day?: string }) {
  const actions = useActions()
  const toast = useToast()
  const [choice, setChoice] = useState<number | null>(null)
  const [detail, setDetail] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [fromCash, setFromCash] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setChoice(null)
    setDetail('')
    setAmount(null)
    setFromCash(true)
    setError('')
  }, [open])

  if (!open) return null

  const save = () => {
    if (choice === null) return setError('Elige en qué gastaste')
    if (!amount || amount <= 0) return setError('Escribe cuánto gastaste')
    const opt = OPTIONS[choice]
    const now = new Date()
    // Si es un día pasado, se anota al mediodía de ese día
    const date = !day || day === dayKey(now) ? now : new Date(parseDayKey(day).setHours(12))
    actions.addExpense({
      date: date.toISOString(),
      description: detail.trim() ? `${opt.label}: ${detail.trim()}` : opt.label,
      category: opt.category,
      amount,
      paidFromCash: fromCash,
    })
    toast.success(`Gasto de ${formatCLP(amount)} anotado`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Anotar un gasto"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="lg" onClick={save}>
            Guardar gasto
          </Button>
        </>
      }
    >
      <p className="mb-2 font-semibold">¿En qué gastaste?</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {OPTIONS.map((o, i) => (
          <button
            key={o.label}
            type="button"
            onClick={() => {
              setChoice(i)
              setError('')
            }}
            aria-pressed={choice === i}
            className={cn(
              'flex min-h-14 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors',
              choice === i ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line-strong hover:bg-surface-2',
            )}
          >
            <o.icon className="size-5 shrink-0" />
            {o.label}
          </button>
        ))}
      </div>

      <label htmlFor="exp-amount" className="mt-5 mb-1.5 block font-semibold">
        ¿Cuánto?
      </label>
      <MoneyInput
        id="exp-amount"
        value={amount}
        onValueChange={(v) => {
          setAmount(v)
          setError('')
        }}
        placeholder="0"
        className="h-14 text-2xl font-bold"
      />

      <label htmlFor="exp-detail" className="mt-4 mb-1.5 block text-sm font-medium text-muted">
        Detalle (opcional)
      </label>
      <Input id="exp-detail" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Ej: Coca-Cola, cuenta de septiembre…" maxLength={80} />

      <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl bg-surface-2 p-3">
        <input type="checkbox" checked={fromCash} onChange={(e) => setFromCash(e.target.checked)} className="size-6 accent-[var(--brand)]" />
        <span className="text-sm">
          <span className="block font-semibold">Lo pagué con plata de la caja</span>
          <span className="text-subtle">Así se descuenta de lo que debería haber en el cajón</span>
        </span>
      </label>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger-ink">
          {error}
        </p>
      )}
    </Modal>
  )
}
