import { useMemo, useState } from 'react'
import { Ban, Calculator, ChevronDown, ChevronLeft, ChevronRight, HandCoins, Plus, Trash2 } from 'lucide-react'
import { CashCountModal } from '../components/CashCountModal'
import { ExpenseModal } from '../components/ExpenseModal'
import { ConfirmDialog } from '../components/ui/Modal'
import { Badge, Button, Card, CardHeader, EmptyState } from '../components/ui/primitives'
import { useToast } from '../components/ui/Toast'
import { summarizeDay } from '../lib/analytics'
import { addDays, cn, dayKey, formatCLP, formatDateLong, formatQty, formatTime, lineTotal, parseDayKey } from '../lib/utils'
import { useActions, useData } from '../store/AppStore'
import { ALL_PAYMENT_METHODS, type Sale } from '../types'

/** Caja del día: cuánto se vendió, cuánto se gastó y cuánto debería haber en el cajón */
export default function Cash() {
  const { sales, expenses } = useData()
  const actions = useActions()
  const toast = useToast()
  const todayKey = dayKey()
  const [day, setDay] = useState(todayKey)
  const isToday = day === todayKey

  const summary = useMemo(() => summarizeDay(sales, expenses, day), [sales, expenses, day])
  const daySales = useMemo(() => sales.filter((s) => dayKey(s.date) === day).sort((a, b) => b.date.localeCompare(a.date)), [sales, day])
  const dayExpenses = useMemo(() => expenses.filter((e) => dayKey(e.date) === day).sort((a, b) => b.date.localeCompare(a.date)), [expenses, day])

  const [expenseOpen, setExpenseOpen] = useState(false)
  const [voiding, setVoiding] = useState<Sale | null>(null)
  const [deletingExp, setDeletingExp] = useState<string | null>(null)
  const [showSales, setShowSales] = useState(false)
  const [countOpen, setCountOpen] = useState(false)

  const move = (n: number) => {
    const next = dayKey(addDays(parseDayKey(day), n))
    if (next <= todayKey) setDay(next)
  }
  const payments = ALL_PAYMENT_METHODS.filter((m) => summary.byPayment[m] > 0 || ['Efectivo', 'Tarjeta', 'Transferencia'].includes(m))

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-5">
      {/* Día */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => move(-1)} aria-label="Día anterior">
          <ChevronLeft />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-sm font-semibold text-subtle">{isToday ? 'Hoy' : 'Día anterior'}</p>
          <p className="truncate text-lg font-bold">{formatDateLong(parseDayKey(day))}</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => move(1)} disabled={isToday} aria-label="Día siguiente">
          <ChevronRight />
        </Button>
      </div>
      {!isToday && (
        <div className="text-center">
          <Button variant="ghost" onClick={() => setDay(todayKey)}>
            Volver a hoy
          </Button>
        </div>
      )}

      {/* Resumen */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Box label="Vendiste" value={formatCLP(summary.revenue)} sub={`${summary.transactions} ${summary.transactions === 1 ? 'venta' : 'ventas'}`} />
        <Box
          label="Gastaste"
          value={formatCLP(summary.expenses)}
          sub={`${dayExpenses.length} ${dayExpenses.length === 1 ? 'gasto' : 'gastos'}`}
          valueClass={summary.expenses ? 'text-danger-ink' : undefined}
        />
        <Box label="Te queda" value={formatCLP(summary.cashNet)} sub="Lo vendido menos los gastos" highlight />
      </div>

      {/* El cajón */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand-ink">
            <HandCoins className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-muted">En el cajón debería haber</p>
            <p className={cn('tabular text-3xl font-extrabold', summary.expectedCash < 0 && 'text-danger-ink')}>{formatCLP(summary.expectedCash)}</p>
            <p className="text-sm text-subtle">Ventas en efectivo menos los gastos que pagaste con plata de la caja (sin contar el sencillo del inicio)</p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
          {payments.map((m) => (
            <div key={m} className="rounded-xl bg-surface-2 p-2">
              <dt className="text-xs font-semibold text-subtle">{m}</dt>
              <dd className="tabular font-bold">{formatCLP(summary.byPayment[m])}</dd>
            </div>
          ))}
        </dl>
        {isToday && (
          <Button variant="outline" size="lg" className="mt-4 w-full" onClick={() => setCountOpen(true)}>
            <Calculator /> Contar el cajón
          </Button>
        )}
      </Card>

      <Button variant="primary" size="lg" className="w-full" onClick={() => setExpenseOpen(true)}>
        <Plus /> Anotar un gasto
      </Button>

      {/* Gastos */}
      <Card>
        <CardHeader title={isToday ? 'Gastos de hoy' : 'Gastos del día'} subtitle={formatCLP(summary.expenses)} />
        {dayExpenses.length === 0 ? (
          <EmptyState title="No hay gastos anotados" className="py-6" />
        ) : (
          <ul className="divide-y divide-line px-4 pt-2 pb-3 sm:px-5">
            {dayExpenses.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{e.description}</p>
                  <p className="text-sm text-subtle">
                    {formatTime(e.date)} · {e.paidFromCash ? 'con plata de la caja' : 'no salió de la caja'}
                  </p>
                </div>
                <span className="tabular font-bold text-danger-ink">−{formatCLP(e.amount)}</span>
                <Button size="icon-sm" variant="ghost" onClick={() => setDeletingExp(e.id)} aria-label={`Borrar gasto ${e.description}`}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Ventas */}
      <Card>
        <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left sm:px-5" onClick={() => setShowSales((s) => !s)} aria-expanded={showSales}>
          <span>
            <span className="block text-base font-semibold">{isToday ? 'Ventas de hoy' : 'Ventas del día'}</span>
            <span className="text-sm text-subtle">
              {summary.transactions} {summary.transactions === 1 ? 'venta' : 'ventas'} · toca para {showSales ? 'ocultarlas' : 'verlas'}
            </span>
          </span>
          <ChevronDown className={cn('size-5 text-subtle transition-transform', showSales && 'rotate-180')} />
        </button>
        {showSales &&
          (daySales.length === 0 ? (
            <EmptyState title="No hay ventas este día" className="py-6" />
          ) : (
            <ul className="divide-y divide-line border-t border-line px-2 pt-1 pb-2 sm:px-3">
              {daySales.slice(0, 300).map((s) => (
                <SaleRow key={s.id} sale={s} onVoid={() => setVoiding(s)} />
              ))}
            </ul>
          ))}
      </Card>

      <ExpenseModal open={expenseOpen} onClose={() => setExpenseOpen(false)} day={day} />
      <CashCountModal open={countOpen} onClose={() => setCountOpen(false)} expectedCash={summary.expectedCash} />
      <ConfirmDialog
        open={Boolean(voiding)}
        onClose={() => setVoiding(null)}
        danger
        title="¿Anular esta venta?"
        confirmLabel="Anular venta"
        onConfirm={() => {
          if (!voiding) return
          actions.voidSale(voiding.id)
          toast.success('Venta anulada: los productos volvieron al stock')
        }}
      >
        Úsalo si te equivocaste o te devolvieron lo comprado. Los productos vuelven al stock y la venta deja de sumar.
      </ConfirmDialog>
      <ConfirmDialog
        open={deletingExp !== null}
        onClose={() => setDeletingExp(null)}
        danger
        title="¿Borrar este gasto?"
        confirmLabel="Borrar"
        onConfirm={() => {
          if (deletingExp) actions.deleteExpense(deletingExp)
          toast.success('Gasto borrado')
        }}
      />
    </div>
  )
}

function Box({ label, value, sub, highlight, valueClass }: { label: string; value: string; sub: string; highlight?: boolean; valueClass?: string }) {
  return (
    <Card className={cn('p-4 sm:p-5', highlight && 'border-brand/50 bg-brand-soft')}>
      <p className={cn('font-semibold', highlight ? 'text-brand-ink' : 'text-muted')}>{label}</p>
      <p className={cn('tabular mt-1 text-3xl font-extrabold tracking-tight', highlight && 'text-brand-ink', valueClass)}>{value}</p>
      <p className={cn('mt-0.5 text-sm', highlight ? 'text-brand-ink/80' : 'text-subtle')}>{sub}</p>
    </Card>
  )
}

function SaleRow({ sale, onVoid }: { sale: Sale; onVoid: () => void }) {
  const [open, setOpen] = useState(false)
  const units = sale.items.reduce((a, it) => a + (it.unit === 'kg' ? 1 : it.qty), 0)
  return (
    <li className={cn(sale.voided && 'opacity-60')}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-surface-2/60" aria-expanded={open}>
        <span className="tabular w-12 text-sm">{formatTime(sale.date)}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted">
          {units} {units === 1 ? 'producto' : 'productos'} · {sale.payment}
        </span>
        {sale.voided && (
          <Badge tone="danger">
            <Ban /> Anulada
          </Badge>
        )}
        <span className={cn('tabular font-bold', sale.voided && 'line-through')}>{formatCLP(sale.total)}</span>
        <ChevronDown className={cn('size-4 text-subtle transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mx-2 mb-2 rounded-xl bg-surface-2 p-3 text-sm">
          <ul className="space-y-1">
            {sale.items.map((it, i) => (
              <li key={`${it.productId}-${i}`} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  <span className="tabular text-subtle">{formatQty(it.qty, it.unit)} ×</span> {it.name}
                </span>
                <span className="tabular">{formatCLP(lineTotal(it.qty, it.unitPrice))}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
            <span className="text-xs text-subtle">
              Venta N° {sale.number}
              {sale.received !== null && ` · pagó con ${formatCLP(sale.received)} · vuelto ${formatCLP(sale.change ?? 0)}`}
            </span>
            {!sale.voided && (
              <Button size="sm" variant="danger-soft" onClick={onVoid}>
                <Ban /> Anular venta
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}
