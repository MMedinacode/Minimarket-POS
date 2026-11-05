import { useMemo, useState, type ReactNode } from 'react'
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  CalendarDays,
  ChevronDown,
  Clock,
  LineChart,
  Moon,
  PackageX,
  Percent,
  Receipt,
  Shapes,
  Sparkles,
  Star,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { axisProps, CHART, ChartTooltip, Legend, RankBars } from '../components/charts'
import { Badge, Button, Card, CardHeader, EmptyState, Segmented } from '../components/ui/primitives'
import { navigate } from '../hooks/useHashRoute'
import {
  categoryMargins,
  dailySeries,
  inventoryValue,
  marginRows,
  pctChange,
  periodTotals,
  soldWithoutCost,
  salesByCategory,
  salesByHour,
  salesByPayment,
  salesBySupplier,
  salesByWeekday,
  slowMovers,
  summarizeDay,
  topProducts,
} from '../lib/analytics'
import { addDays, cn, dayKey, formatCLP, formatCLPShort, formatDate, formatInt, formatPct, formatQty, startOfDay } from '../lib/utils'
import { useData } from '../store/AppStore'

type Period = '7' | '30' | '90'
interface Range {
  from: Date
  to: Date
}

export default function Reports() {
  const { sales, expenses, settings } = useData()
  const now = useMemo(() => new Date(), [sales, expenses]) // se recalcula con cada venta

  const today = dayKey(now)
  const summary = useMemo(() => summarizeDay(sales, expenses, today), [sales, expenses, today])

  // Comparación justa: ayer hasta esta misma hora
  const yesterdaySameTime = useMemo(() => {
    const limit = addDays(now, -1).getTime()
    const key = dayKey(addDays(now, -1))
    return sales.filter((s) => !s.voided && dayKey(s.date) === key && new Date(s.date).getTime() <= limit).reduce((a, s) => a + s.total, 0)
  }, [sales, now])
  const change = pctChange(summary.revenue, yesterdaySameTime)

  // Período elegido, comparado con los mismos días justo antes (hasta esta misma hora)
  const [period, setPeriod] = useState<Period>('7')
  const days = DAYS[period]
  const range = useMemo<Range>(() => ({ from: addDays(startOfDay(now), -(days - 1)), to: now }), [now, days])
  const totals = useMemo(() => periodTotals(sales, expenses, range.from, range.to), [sales, expenses, range])
  const noCost = useMemo(() => soldWithoutCost(sales, range.from, range.to), [sales, range])
  const before = useMemo(
    () => periodTotals(sales, expenses, addDays(range.from, -days), addDays(range.to, -days)),
    [sales, expenses, range, days],
  )

  return (
    <div className="space-y-4 sm:space-y-5">
      <p className="text-muted">Números y gráficos para ver cómo va el negocio. Para el día a día no necesitas esta pantalla.</p>

      {/* Tarjetas resumen */}
      <h2 className="text-xl font-bold">Hoy</h2>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          icon={<BadgeDollarSign />}
          label="Vendido hoy"
          value={formatCLP(summary.revenue)}
          foot={
            change === null ? (
              <span>Ayer a esta hora no había ventas</span>
            ) : (
              <span className={cn('inline-flex flex-wrap items-center gap-x-1 font-semibold', change >= 0 ? 'text-ok-ink' : 'text-danger-ink')}>
                {change >= 0 ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                {formatPct(Math.abs(change))} {change >= 0 ? 'más' : 'menos'} <span className="font-normal text-subtle">que ayer a esta hora</span>
              </span>
            )
          }
        />
        <KpiCard
          icon={<TrendingUp />}
          label="Ganancia de hoy"
          value={formatCLP(summary.netProfit)}
          valueClass={summary.netProfit < 0 ? 'text-danger-ink' : undefined}
          foot={
            <span>
              Ganado en ventas {formatCLP(summary.grossProfit)} − gastos {formatCLP(summary.expenses)}
            </span>
          }
        />
        <KpiCard icon={<Receipt />} label="Ventas de hoy" value={formatInt(summary.transactions)} foot={<span>Promedio por venta {formatCLP(summary.avgTicket)}</span>} />
        <KpiCard icon={<Wallet />} label="Gastos de hoy" value={formatCLP(summary.expenses)} foot={<span>Anotados en Caja</span>} />
      </div>

      {/* Lo que cambia con el período elegido */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <h2 className="text-xl font-bold">Cómo te ha ido</h2>
        <Segmented value={period} onChange={setPeriod} ariaLabel="Período" options={PERIOD_OPTIONS} />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard icon={<BadgeDollarSign />} label="Vendiste" value={formatCLP(totals.ventas)} foot={<Change now={totals.ventas} before={before.ventas} days={days} />} />
        <KpiCard icon={<TrendingUp />} label="Ganaste en ventas" value={formatCLP(totals.ganancia)} foot={<Change now={totals.ganancia} before={before.ganancia} days={days} />} />
        <KpiCard icon={<CalendarDays />} label="Promedio por día" value={formatCLP(totals.diasConVentas ? totals.ventas / totals.diasConVentas : 0)} foot={<span>{formatInt(totals.transacciones)} ventas en {totals.diasConVentas} {totals.diasConVentas === 1 ? 'día' : 'días'}</span>} />
        <KpiCard icon={<Receipt />} label="Gastos anotados" value={formatCLP(totals.gastos)} foot={<span>En estos {days} días</span>} />
      </div>
      {noCost > 0 && (
        <p className="text-sm text-muted">
          <strong>Ojo:</strong> la ganancia sale más alta de lo real porque {noCost === 1 ? '1 producto vendido no tiene anotado' : `${noCost} productos vendidos no tienen anotado`} cuánto te
          costó. Anótalo en Productos.
        </p>
      )}
      <TrendCard days={days} range={range} />
      <div className="grid gap-4 sm:gap-5 xl:grid-cols-2">
        <ShareCard range={range} />
        <TopProductsCard range={range} />
        <WeekdayCard days={days} />
        <PaymentCard range={range} />
      </div>

      {/* Lo demás */}
      <h2 className="pt-2 text-xl font-bold">Más detalles</h2>
      <div className="grid gap-4 sm:gap-5 xl:grid-cols-5">
        <HourlyCard className="xl:col-span-3" />
        <SlowMoversCard className="xl:col-span-2" days={settings.slowMoverDays} />
      </div>

      <MarginCard />
    </div>
  )
}

// ---------- Tarjeta KPI ----------

function KpiCard({
  icon,
  label,
  value,
  foot,
  valueClass,
}: {
  icon: ReactNode
  label: string
  value: string
  foot?: ReactNode
  valueClass?: string
}) {
  return (
    <Card className="h-full p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-muted">{label}</p>
        <span className="grid size-9 place-items-center rounded-xl bg-brand-soft text-brand-ink [&_svg]:size-[18px]">{icon}</span>
      </div>
      <p className={cn('tabular mt-2 truncate text-2xl font-extrabold tracking-tight sm:text-3xl', valueClass)}>{value}</p>
      {foot && <div className="mt-1 text-xs text-subtle">{foot}</div>}
    </Card>
  )
}

// ---------- Tendencia del período ----------

const DAYS: Record<Period, number> = { '7': 7, '30': 30, '90': 90 }
const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
  { value: '90', label: '3 meses' },
]

/** Comparación con los días anteriores: flecha + palabra, nunca solo el color */
function Change({ now, before, days }: { now: number; before: number; days: number }) {
  const change = pctChange(now, before)
  if (change === null) return <span>Sin ventas en los {days} días anteriores</span>
  const up = change >= 0
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-1 font-semibold', up ? 'text-ok-ink' : 'text-danger-ink')}>
      {up ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
      {formatPct(Math.abs(change))} {up ? 'más' : 'menos'} <span className="font-normal text-subtle">que los {days} días anteriores</span>
    </span>
  )
}

function TrendCard({ days, range }: { days: number; range: Range }) {
  const { sales, expenses } = useData()
  const data = useMemo(() => dailySeries(sales, expenses, days), [sales, expenses, days])
  const best = data.reduce((b, d) => (d.ventas > b.ventas ? d : b), data[0])
  const hasSales = data.some((d) => d.ventas > 0)

  return (
    <Card>
      <CardHeader
        icon={<LineChart />}
        title="Cómo han ido las ventas"
        subtitle={hasSales ? `Tu mejor día fue ${best.label}: ${formatCLP(best.ventas)}` : 'Aún no hay ventas en este período'}
        actions={
          <Legend
            items={[
              { label: 'Ventas', color: CHART.s1 },
              { label: 'Ganancia', color: CHART.s3 },
            ]}
          />
        }
      />
      <div className="h-64 px-2 pt-3 pb-2 sm:h-72 sm:px-4" role="img" aria-label={`Ventas y ganancia de cada día, desde ${formatDate(range.from)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={28} />
            <YAxis {...axisProps} width={62} tickFormatter={formatCLPShort} />
            <Tooltip cursor={{ stroke: CHART.axis, strokeDasharray: '3 3' }} content={<ChartTooltip valueFormatter={formatCLP} />} />
            <Area type="monotone" dataKey="ventas" name="Ventas" stroke={CHART.s1} strokeWidth={2} fill={CHART.s1} fillOpacity={0.12} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)' }} />
            <Line type="monotone" dataKey="utilidad" name="Ganancia" stroke={CHART.s3} strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details className="group border-t border-line">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-2 font-semibold sm:px-5">
          Ver los números día por día
          <ChevronDown className="size-5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="scrollbar-thin max-h-72 overflow-y-auto px-4 pb-4 sm:px-5">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold text-subtle uppercase">
              <tr>
                <th className="py-2">Día</th>
                <th className="py-2 text-right">Vendido</th>
                <th className="py-2 text-right">Ganancia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...data].reverse().map((d) => (
                <tr key={d.key}>
                  <td className="py-1.5">{d.label}</td>
                  <td className="tabular py-1.5 text-right">{formatCLP(d.ventas)}</td>
                  <td className="tabular py-1.5 text-right">{formatCLP(d.utilidad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  )
}

// ---------- Qué se vende: categorías y proveedores ----------

function ShareCard({ range }: { range: Range }) {
  const { sales, products } = useData()
  const hasSuppliers = useMemo(() => products.some((p) => p.supplier?.trim()), [products])
  const [by, setBy] = useState<'cat' | 'prov'>('cat')
  const group = hasSuppliers ? by : 'cat'
  const rows = useMemo(
    () => (group === 'cat' ? salesByCategory(sales, range.from, range.to) : salesBySupplier(sales, products, range.from, range.to)),
    [sales, products, range, group],
  )

  return (
    <Card>
      <CardHeader icon={<Shapes />} title="Qué es lo que más vendes" subtitle={group === 'cat' ? 'Plata que dejó cada categoría' : 'Plata que dejó lo que trae cada proveedor'} />
      {hasSuppliers && (
        <div className="px-4 pt-3 sm:px-5">
          <Segmented
            size="sm"
            value={by}
            onChange={setBy}
            ariaLabel="Agrupar por"
            options={[
              { value: 'cat', label: 'Por categoría' },
              { value: 'prov', label: 'Por proveedor' },
            ]}
          />
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState icon={<Shapes />} title="Sin ventas en este período" className="h-56" />
      ) : (
        <div className="p-4 sm:p-5">
          <RankBars items={rows.map((r) => ({ name: r.name, value: r.total, note: formatPct(r.pct) }))} />
        </div>
      )}
    </Card>
  )
}

// ---------- Top 5 productos ----------

function TopProductsCard({ range }: { range: Range }) {
  const { sales } = useData()
  const [by, setBy] = useState<'revenue' | 'qty'>('revenue')
  const data = useMemo(() => topProducts(sales, range.from, by, 5, range.to), [sales, range, by])

  return (
    <Card>
      <CardHeader icon={<Star />} title="Los 5 que más se venden" subtitle={by === 'revenue' ? 'Según la plata que dejaron' : 'Según cuántos se vendieron'} />
      <div className="px-4 pt-3 sm:px-5">
        <Segmented
          size="sm"
          value={by}
          onChange={setBy}
          ariaLabel="Ordenar por"
          options={[
            { value: 'revenue', label: 'Por plata' },
            { value: 'qty', label: 'Por cantidad' },
          ]}
        />
      </div>
      {data.length === 0 ? (
        <EmptyState icon={<Star />} title="Sin ventas en este período" className="h-56" />
      ) : (
        <div className="p-4 sm:p-5">
          <RankBars
            items={data.map((r) => ({
              id: r.productId,
              name: r.name,
              value: by === 'qty' ? r.qty : r.revenue,
              label: by === 'qty' ? `${formatQty(r.qty, r.unit)}${r.unit === 'un' ? ' un' : ''}` : formatCLP(r.revenue),
            }))}
          />
        </div>
      )}
    </Card>
  )
}

// ---------- Días de la semana ----------

const DAY_NAME: Record<string, string> = { Lun: 'lunes', Mar: 'martes', Mié: 'miércoles', Jue: 'jueves', Vie: 'viernes', Sáb: 'sábado', Dom: 'domingo' }

function WeekdayCard({ days }: { days: number }) {
  const { sales } = useData()
  const data = useMemo(() => salesByWeekday(sales, days), [sales, days])
  const best = data.reduce((b, d) => (d.total > b.total ? d : b), data[0])
  const empty = data.every((d) => d.total === 0)

  return (
    <Card>
      <CardHeader
        icon={<CalendarDays />}
        title="Qué días vendes más"
        subtitle={empty ? 'Aún no hay ventas en este período' : `En promedio, tu mejor día es el ${DAY_NAME[best.label]}: ${formatCLP(best.total)}`}
      />
      <div className="h-56 px-2 pt-3 pb-2 sm:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="label" {...axisProps} interval={0} />
            <YAxis {...axisProps} width={62} tickFormatter={formatCLPShort} />
            <Tooltip cursor={{ fill: CHART.cursor }} content={<ChartTooltip valueFormatter={formatCLP} labelFormatter={(l) => `Un ${DAY_NAME[String(l)]} normal`} />} />
            <Bar dataKey="total" name="Promedio" fill={CHART.s1} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

// ---------- Cómo te pagan ----------

const PAY_COLOR: Record<string, string> = { Efectivo: CHART.s1, Tarjeta: CHART.s2, Transferencia: CHART.s3 }

function PaymentCard({ range }: { range: Range }) {
  const { sales } = useData()
  const rows = useMemo(() => salesByPayment(sales, range.from, range.to), [sales, range])

  return (
    <Card>
      <CardHeader icon={<Wallet />} title="Cómo te pagan" subtitle="Efectivo, tarjeta y transferencia" />
      {rows.length === 0 ? (
        <EmptyState icon={<Wallet />} title="Sin ventas en este período" className="h-56" />
      ) : (
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex h-4 gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {rows.map((r) => (
              <div key={r.name} style={{ width: `${r.pct}%`, background: PAY_COLOR[r.name] ?? CHART.axis }} />
            ))}
          </div>
          <ul className="space-y-2.5">
            {rows.map((r) => (
              <li key={r.name} className="flex items-center gap-2.5">
                <span className="size-3 shrink-0 rounded-sm" style={{ background: PAY_COLOR[r.name] ?? CHART.axis }} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                <span className="tabular font-semibold">{formatCLP(r.total)}</span>
                <span className="tabular w-14 text-right text-sm text-subtle">{formatPct(r.pct)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

// ---------- Ventas por hora ----------

function HourlyCard({ className }: { className?: string }) {
  const { sales } = useData()
  const [range, setRange] = useState<'hoy' | 'semana'>('hoy')
  const days = range === 'hoy' ? 1 : 7
  const data = useMemo(() => salesByHour(sales, days), [sales, days])
  const peak = data.reduce((best, p) => (p.total > best.total ? p : best), data[0])
  const empty = data.every((p) => p.total === 0)

  return (
    <Card className={className}>
      <CardHeader
        icon={<Clock />}
        title="Ventas por hora"
        subtitle={
          empty
            ? 'Aún no hay ventas en este período'
            : `Hora peak: ${peak.label.replace('h', ':00')} (${formatCLP(peak.total)}${range === 'semana' ? ' promedio' : ''})`
        }
        actions={
          <Segmented
            size="sm"
            value={range}
            onChange={setRange}
            ariaLabel="Período"
            options={[
              { value: 'hoy', label: 'Hoy' },
              { value: 'semana', label: 'Promedio 7 días' },
            ]}
          />
        }
      />
      <div className="h-64 px-2 pt-3 pb-2 sm:h-72 sm:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
            <YAxis {...axisProps} width={62} tickFormatter={formatCLPShort} />
            <Tooltip
              cursor={{ fill: CHART.cursor }}
              content={
                <ChartTooltip
                  valueFormatter={formatCLP}
                  labelFormatter={(l) => `${String(l).replace('h', ':00')} – ${String(l).replace('h', ':59')}`}
                />
              }
            />
            <Bar dataKey="total" name={range === 'hoy' ? 'Ventas' : 'Promedio diario'} fill={CHART.s1} radius={[4, 4, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

// ---------- Menor rotación ----------

function SlowMoversCard({ className, days }: { className?: string; days: number }) {
  const { products, sales } = useData()
  const list = useMemo(() => slowMovers(products, sales, days), [products, sales, days])
  const dormant = list.reduce((a, m) => a + m.stockValue, 0)

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        icon={<Moon />}
        title="Productos que no se venden"
        subtitle={list.length ? `Nadie los compró en ${days} días o más · ${formatCLP(dormant)} guardados en bodega` : `Todos se vendieron en los últimos ${days} días`}
        actions={
          list.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => navigate('productos', { filtro: 'lentos' })}>
              Ver <ArrowRight />
            </Button>
          )
        }
      />
      {list.length === 0 ? (
        <EmptyState icon={<Sparkles />} title="¡Todo se está moviendo!" className="flex-1" />
      ) : (
        <ul className="flex-1 divide-y divide-line px-4 pt-2 pb-3 sm:px-5">
          {list.slice(0, 6).map((m) => (
            <li key={m.product.id} className="flex items-center gap-3 py-2.5">
              <PackageX className="size-5 shrink-0 text-subtle" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{m.product.name}</p>
                <p className="text-xs text-subtle">
                  {m.daysSince === null ? 'Nunca vendido' : `Última venta hace ${m.daysSince} días`} · stock {formatQty(m.product.stock, m.product.unit)}
                </p>
              </div>
              <Badge tone="warn">{formatCLP(m.stockValue)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ---------- Análisis de margen ----------

function MarginCard() {
  const { products } = useData()
  const [mode, setMode] = useState<'mejor' | 'peor'>('mejor')
  const value = useMemo(() => inventoryValue(products), [products])
  const byCategory = useMemo(() => categoryMargins(products).map((c) => ({ ...c, value: Math.round(c.margin * 10) / 10 })), [products])
  const rows = useMemo(() => {
    const all = marginRows(products)
    return mode === 'mejor'
      ? all.sort((a, b) => b.unitProfit - a.unitProfit).slice(0, 8)
      : all.sort((a, b) => a.margin - b.margin).slice(0, 8)
  }, [products, mode])
  const lowMargin = useMemo(() => marginRows(products).filter((r) => r.margin < 15).length, [products])
  const maxMargin = Math.max(1, ...rows.map((r) => Math.abs(r.margin)))

  return (
    <Card>
      <CardHeader
        icon={<Percent />}
        title="Cuánto ganas con cada producto"
        subtitle="La diferencia entre lo que te cuesta y lo que cobras"
      />
      <div className="grid gap-3 px-4 pt-4 sm:grid-cols-3 sm:px-5">
        <Stat label="De cada $1.000 que vendes, ganas" value={formatCLP(value.margin * 10)} hint="En promedio, con lo que tienes hoy" />
        <Stat label="Ganarías si vendes todo lo que tienes" value={formatCLP(value.potentialProfit)} hint={`Costo ${formatCLP(value.atCost)} → venta ${formatCLP(value.atPrice)}`} />
        <Stat
          label="Productos que dejan muy poca ganancia"
          value={formatInt(lowMargin)}
          hint={lowMargin ? 'Revisa si conviene subir el precio' : 'Ninguno'}
          warn={lowMargin > 0}
        />
      </div>

      <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted">% de ganancia por categoría</h3>
          <div style={{ height: Math.max(180, byCategory.length * 34) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory} layout="vertical" margin={{ top: 0, right: 52, bottom: 0, left: 0 }}>
                <XAxis type="number" hide domain={[0, 'dataMax']} />
                <YAxis type="category" dataKey="category" {...axisProps} width={130} tick={{ ...axisProps.tick, fill: 'var(--fg-muted)' }} />
                <Tooltip
                  cursor={{ fill: CHART.cursor }}
                  content={<ChartTooltip valueFormatter={(v) => formatPct(v)} />}
                />
                <Bar dataKey="value" name="Margen" fill={CHART.s3} radius={[0, 4, 4, 0]} maxBarSize={22}>
                  <LabelList
                    dataKey="value"
                    position="right"
                    style={{ fill: 'var(--fg)', fontSize: 12, fontWeight: 600 }}
                    formatter={(v: unknown) => formatPct(Number(v))}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-muted">{mode === 'mejor' ? 'Los que más ganancia dejan por unidad' : 'Los que dejan menos ganancia'}</h3>
            <Segmented
              size="sm"
              value={mode}
              onChange={setMode}
              ariaLabel="Ranking"
              options={[
                { value: 'mejor', label: 'Más ganancia' },
                { value: 'peor', label: 'Menos ganancia' },
              ]}
            />
          </div>
          <div className="scrollbar-thin overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-surface-2/70 text-left text-xs font-semibold text-subtle uppercase">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-right">Te cuesta</th>
                  <th className="px-3 py-2 text-right">Lo vendes</th>
                  <th className="px-3 py-2 text-right">Ganas</th>
                  <th className="w-36 px-3 py-2">% ganancia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(({ product: p, unitProfit, margin }) => (
                  <tr key={p.id}>
                    <td className="max-w-48 truncate px-3 py-2 font-medium" title={p.name}>
                      {p.name}
                    </td>
                    <td className="tabular px-3 py-2 text-right text-muted">{formatCLP(p.cost)}</td>
                    <td className="tabular px-3 py-2 text-right">{formatCLP(p.price)}</td>
                    <td className={cn('tabular px-3 py-2 text-right font-semibold', unitProfit < 0 && 'text-danger-ink')}>{formatCLP(unitProfit)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(2, (Math.abs(margin) / maxMargin) * 100)}%`,
                              background: margin < 0 ? 'var(--danger)' : CHART.s3,
                            }}
                          />
                        </div>
                        <span className={cn('tabular w-12 text-right text-xs font-semibold', margin < 15 && 'text-warn-ink', margin < 0 && 'text-danger-ink')}>
                          {formatPct(margin)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Card>
  )
}

function Stat({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3.5">
      <p className="text-xs font-semibold text-subtle">{label}</p>
      <p className={cn('tabular mt-1 text-xl font-extrabold', warn && 'text-warn-ink')}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-subtle">{hint}</p>}
    </div>
  )
}
