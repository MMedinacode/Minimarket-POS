import { useMemo, useState, type FormEvent } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  Ban,
  Banknote,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  HandCoins,
  MinusCircle,
  Plus,
  Receipt,
  Scale,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import { axisProps, CHART, ChartTooltip, Legend } from '../components/charts'
import { ConfirmDialog } from '../components/ui/Modal'
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, MoneyInput, Select } from '../components/ui/primitives'
import { useToast } from '../components/ui/Toast'
import { dailySeries, summarizeDay } from '../lib/analytics'
import { addDays, cn, dayKey, formatCLP, formatCLPShort, formatDateLong, formatQty, formatTime, parseDayKey } from '../lib/utils'
import { useActions, useData } from '../store/AppStore'
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, type ExpenseCategory, type Sale } from '../types'

const SUGGESTIONS = [
  'Pago proveedor',
  'Cuenta de luz',
  'Cuenta de agua',
  'Gas',
  'Internet',
  'Arriendo',
  'Sueldo',
  'Bolsas',
  'Artículos de aseo',
  'Imprevisto',
]

export default function Cash() {
  const { sales, expenses } = useData()
  const actions = useActions()
  const toast = useToast()
  const todayKey = dayKey()
  const [day, setDay] = useState(todayKey)
  const isToday = day === todayKey

  const summary = useMemo(() => summarizeDay(sales, expenses, day), [sales, expenses, day])
  const daySales = useMemo(() => sales.filter((s) => dayKey(s.date) === day).sort((a, b) => b.date.localeCompare(a.date)), [sales, day])
  const dayExpenses = useMemo(
    () => expenses.filter((e) => dayKey(e.date) === day).sort((a, b) => b.date.localeCompare(a.date)),
    [expenses, day],
  )
  const week = useMemo(() => dailySeries(sales, expenses, 7, day), [sales, expenses, day])

  const [voiding, setVoiding] = useState<Sale | null>(null)
  const [deletingExp, setDeletingExp] = useState<string | null>(null)

  const move = (n: number) => {
    const next = dayKey(addDays(parseDayKey(day), n))
    if (next <= todayKey) setDay(next)
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Selector de día */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-subtle">{isToday ? 'Hoy' : 'Día seleccionado'}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{formatDateLong(parseDayKey(day))}</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" onClick={() => move(-1)} aria-label="Día anterior">
            <ChevronLeft />
          </Button>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <Input
              type="date"
              value={day}
              max={todayKey}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              className="w-44 pl-9"
              aria-label="Elegir día"
            />
          </div>
          <Button variant="outline" size="icon" onClick={() => move(1)} disabled={isToday} aria-label="Día siguiente">
            <ChevronRight />
          </Button>
          {!isToday && (
            <Button variant="ghost" onClick={() => setDay(todayKey)}>
              Hoy
            </Button>
          )}
        </div>
      </div>

      {/* Balance */}
      <div className="grid gap-3 sm:grid-cols-3">
        <BalanceCard icon={<Receipt />} label="Total ventas" value={summary.revenue} sub={`${summary.transactions} ventas`} />
        <BalanceCard icon={<MinusCircle />} label="Total gastos" value={-summary.expenses} sub={`${dayExpenses.length} registros`} negative />
        <BalanceCard
          icon={<Scale />}
          label="Caja neta"
          value={summary.cashNet}
          sub="Ventas − gastos"
          highlight
        />
      </div>

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-5">
        {/* Columna izquierda: formulario y gastos */}
        <div className="space-y-4 sm:space-y-5 xl:col-span-2">
          <ExpenseForm
            day={day}
            onAdd={(e) => {
              actions.addExpense(e)
              toast.success(`Gasto de ${formatCLP(e.amount)} registrado`)
            }}
          />

          <Card>
            <CardHeader icon={<MinusCircle />} title="Gastos del día" subtitle={formatCLP(summary.expenses)} />
            {dayExpenses.length === 0 ? (
              <EmptyState title="Sin gastos registrados" className="py-8" />
            ) : (
              <ul className="divide-y divide-line px-4 pt-2 pb-3 sm:px-5">
                {dayExpenses.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{e.description}</p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-subtle">
                        {formatTime(e.date)} · <Badge>{e.category}</Badge>
                        {!e.paidFromCash && <Badge tone="info">No salió de caja</Badge>}
                      </p>
                    </div>
                    <span className="tabular text-sm font-bold text-danger-ink">−{formatCLP(e.amount)}</span>
                    <Button size="icon-sm" variant="ghost" onClick={() => setDeletingExp(e.id)} aria-label={`Eliminar gasto ${e.description}`}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Columna derecha: cuadratura y ventas */}
        <div className="space-y-4 sm:space-y-5 xl:col-span-3">
          <Card>
            <CardHeader icon={<Banknote />} title="Cuadratura de caja" subtitle="Cuánta plata debería haber en el cajón al cerrar" />
            <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
              <dl className="space-y-2 text-sm">
                {PAYMENT_METHODS.map((m) => (
                  <div key={m} className="flex justify-between">
                    <dt className="text-muted">{m}</dt>
                    <dd className="tabular font-semibold">{formatCLP(summary.byPayment[m])}</dd>
                  </div>
                ))}
                <div className="flex justify-between border-t border-line pt-2">
                  <dt className="text-muted">Gastos pagados con efectivo</dt>
                  <dd className="tabular font-semibold text-danger-ink">−{formatCLP(summary.cashExpenses)}</dd>
                </div>
              </dl>
              <div className="flex flex-col justify-center rounded-2xl bg-brand-soft p-4 text-center">
                <HandCoins className="mx-auto mb-1 size-7 text-brand-ink" />
                <p className="text-sm font-semibold text-brand-ink">Efectivo esperado en caja</p>
                <p className={cn('tabular text-3xl font-extrabold', summary.expectedCash < 0 ? 'text-danger-ink' : 'text-brand-ink')}>
                  {formatCLP(summary.expectedCash)}
                </p>
                <p className="mt-1 text-xs text-brand-ink/80">Sin contar el fondo inicial de sencillo</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-line p-4 text-sm sm:p-5">
              <div>
                <p className="text-subtle">Utilidad bruta (ventas − costo)</p>
                <p className="tabular text-lg font-bold">{formatCLP(summary.grossProfit)}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-subtle">
                  <TrendingUp className="size-3.5" /> Ganancia neta (− gastos)
                </p>
                <p className={cn('tabular text-lg font-bold', summary.netProfit < 0 ? 'text-danger-ink' : 'text-ok-ink')}>{formatCLP(summary.netProfit)}</p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={<CalendarDays />}
              title="Ventas vs gastos (7 días)"
              actions={
                <Legend
                  items={[
                    { label: 'Ventas', color: CHART.s1 },
                    { label: 'Gastos', color: CHART.s2 },
                  ]}
                />
              }
            />
            <div className="h-56 px-2 pt-3 pb-2 sm:px-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={week} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} width={62} tickFormatter={formatCLPShort} />
                  <Tooltip cursor={{ fill: CHART.cursor }} content={<ChartTooltip valueFormatter={formatCLP} />} />
                  <Bar dataKey="ventas" name="Ventas" fill={CHART.s1} radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="gastos" name="Gastos" fill={CHART.s2} radius={[4, 4, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardHeader icon={<Receipt />} title="Ventas del día" subtitle={`${daySales.filter((s) => !s.voided).length} ventas · ${formatCLP(summary.revenue)}`} />
            {daySales.length === 0 ? (
              <EmptyState title="No hay ventas este día" className="py-8" />
            ) : (
              <ul className="divide-y divide-line px-2 pt-2 pb-2 sm:px-3">
                {daySales.slice(0, 200).map((s) => (
                  <SaleRow key={s.id} sale={s} onVoid={() => setVoiding(s)} />
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(voiding)}
        onClose={() => setVoiding(null)}
        danger
        title={`¿Anular la venta N° ${voiding?.number}?`}
        confirmLabel="Anular venta"
        onConfirm={() => {
          if (!voiding) return
          actions.voidSale(voiding.id)
          toast.success(`Venta N° ${voiding.number} anulada y stock devuelto`)
        }}
      >
        Se devolverán los productos al stock y la venta dejará de sumar en los reportes. Queda registrada como “Anulada” en el Excel.
      </ConfirmDialog>
      <ConfirmDialog
        open={deletingExp !== null}
        onClose={() => setDeletingExp(null)}
        danger
        title="¿Eliminar este gasto?"
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (deletingExp) actions.deleteExpense(deletingExp)
          toast.success('Gasto eliminado')
        }}
      />
    </div>
  )
}

function BalanceCard({
  icon,
  label,
  value,
  sub,
  negative,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: number
  sub: string
  negative?: boolean
  highlight?: boolean
}) {
  return (
    <Card className={cn('p-4 sm:p-5', highlight && 'border-brand/50 bg-brand-soft')}>
      <p className={cn('flex items-center gap-2 text-sm font-semibold [&_svg]:size-4', highlight ? 'text-brand-ink' : 'text-muted')}>
        {icon}
        {label}
      </p>
      <p
        className={cn(
          'tabular mt-1.5 text-3xl font-extrabold tracking-tight',
          negative && value !== 0 && 'text-danger-ink',
          highlight && (value < 0 ? 'text-danger-ink' : 'text-brand-ink'),
        )}
      >
        {negative && value !== 0 ? `−${formatCLP(-value)}` : formatCLP(value)}
      </p>
      <p className={cn('mt-0.5 text-xs', highlight ? 'text-brand-ink/80' : 'text-subtle')}>{sub}</p>
    </Card>
  )
}

function ExpenseForm({
  day,
  onAdd,
}: {
  day: string
  onAdd: (e: { date: string; description: string; category: ExpenseCategory; amount: number; paidFromCash: boolean }) => void
}) {
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('Proveedores')
  const [amount, setAmount] = useState<number | null>(null)
  const [cash, setCash] = useState(true)
  const [error, setError] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!description.trim()) return setError('Escribe una descripción')
    if (!amount || amount <= 0) return setError('Ingresa el monto')
    // Si es hoy se usa la hora actual; si es un día pasado, el mediodía
    const now = new Date()
    const date = day === dayKey(now) ? now : new Date(parseDayKey(day).setHours(12))
    onAdd({ date: date.toISOString(), description: description.trim(), category, amount, paidFromCash: cash })
    setDescription('')
    setAmount(null)
    setError('')
  }

  // Sugiere categoría según lo escrito
  const autoCategory = (text: string) => {
    const t = text.toLowerCase()
    if (/proveedor|distribu|mercader/.test(t)) setCategory('Proveedores')
    else if (/luz|agua|gas|internet|tel[eé]fono/.test(t)) setCategory('Servicios básicos')
    else if (/arriendo/.test(t)) setCategory('Arriendo')
    else if (/sueldo|pago a|turno/.test(t)) setCategory('Sueldos')
    else if (/bolsa|boleta|aseo|papel/.test(t)) setCategory('Insumos')
    else if (/imprevist|repara|arreglo/.test(t)) setCategory('Imprevistos')
  }

  return (
    <Card>
      <CardHeader icon={<Plus />} title="Registrar gasto" subtitle="Pagos a proveedores, cuentas, imprevistos…" />
      <form onSubmit={submit} className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        <Field label="Descripción" htmlFor="exp-desc" className="sm:col-span-2">
          <Input
            id="exp-desc"
            list="exp-suggestions"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              autoCategory(e.target.value)
              setError('')
            }}
            placeholder="Ej: Pago proveedor de bebidas"
          />
          <datalist id="exp-suggestions">
            {SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Monto" htmlFor="exp-amount">
          <MoneyInput
            id="exp-amount"
            value={amount}
            onValueChange={(v) => {
              setAmount(v)
              setError('')
            }}
            placeholder="0"
          />
        </Field>
        <Field label="Categoría" htmlFor="exp-cat">
          <Select id="exp-cat" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm sm:col-span-2">
          <input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} className="size-5 accent-[var(--brand)]" />
          Se pagó con efectivo de la caja
        </label>
        {error && (
          <p className="text-sm font-medium text-danger-ink sm:col-span-2" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" className="sm:col-span-2">
          <Plus /> Agregar gasto
        </Button>
      </form>
    </Card>
  )
}

function SaleRow({ sale, onVoid }: { sale: Sale; onVoid: () => void }) {
  const [open, setOpen] = useState(false)
  const units = sale.items.reduce((a, it) => a + (it.unit === 'kg' ? 1 : it.qty), 0)
  return (
    <li className={cn(sale.voided && 'opacity-60')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2/60"
        aria-expanded={open}
      >
        <span className="tabular w-14 text-xs font-bold text-subtle">N° {sale.number}</span>
        <span className="tabular w-12 text-sm">{formatTime(sale.date)}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted">
          {units} {units === 1 ? 'artículo' : 'artículos'} · {sale.payment}
        </span>
        {sale.voided && (
          <Badge tone="danger">
            <Ban /> Anulada
          </Badge>
        )}
        <span className={cn('tabular text-sm font-bold', sale.voided && 'line-through')}>{formatCLP(sale.total)}</span>
        <ChevronDown className={cn('size-4 text-subtle transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mx-2 mb-2 rounded-xl bg-surface-2 p-3 text-sm">
          <ul className="space-y-1">
            {sale.items.map((it) => (
              <li key={it.productId} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  <span className="tabular text-subtle">{formatQty(it.qty, it.unit)} ×</span> {it.name}
                </span>
                <span className="tabular">{formatCLP(Math.round(it.qty * it.unitPrice))}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
            <span className="text-xs text-subtle">
              Utilidad {formatCLP(sale.total - sale.cost)}
              {sale.received !== null && ` · recibido ${formatCLP(sale.received)} · vuelto ${formatCLP(sale.change ?? 0)}`}
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
