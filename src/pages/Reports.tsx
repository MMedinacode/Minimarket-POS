import { useMemo, useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  Clock,
  Moon,
  PackageX,
  Percent,
  Receipt,
  Sparkles,
  Star,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { axisProps, CHART, ChartTooltip, Legend } from '../components/charts'
import { Badge, Button, Card, CardHeader, EmptyState, Segmented } from '../components/ui/primitives'
import { navigate } from '../hooks/useHashRoute'
import {
  categoryMargins,
  dailySeries,
  inventoryValue,
  marginRows,
  pctChange,
  salesByHour,
  slowMovers,
  summarizeDay,
  topProducts,
} from '../lib/analytics'
import { addDays, cn, dayKey, formatCLP, formatCLPShort, formatInt, formatPct, formatQty, startOfDay } from '../lib/utils'
import { useData } from '../store/AppStore'

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

  return (
    <div className="space-y-4 sm:space-y-5">
      <p className="text-muted">Números y gráficos para ver cómo va el negocio. Para el día a día no necesitas esta pantalla.</p>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          icon={<BadgeDollarSign />}
          label="Vendido hoy"
          value={formatCLP(summary.revenue)}
          foot={
            change === null ? (
              <span>Ayer a esta hora no había ventas</span>
            ) : (
              <span className={cn('inline-flex items-center gap-0.5 font-semibold', change >= 0 ? 'text-ok-ink' : 'text-danger-ink')}>
                {change >= 0 ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                {formatPct(Math.abs(change))} <span className="font-normal text-subtle">que ayer a esta hora</span>
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

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-5">
        <HourlyCard className="xl:col-span-3" />
        <TopProductsCard className="xl:col-span-2" />
      </div>

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-5">
        <WeekCard className="xl:col-span-3" />
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

// ---------- Top 5 productos ----------

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function TopProductsCard({ className }: { className?: string }) {
  const { sales } = useData()
  const [range, setRange] = useState<'hoy' | 'semana'>('semana')
  const [by, setBy] = useState<'revenue' | 'qty'>('revenue')
  const data = useMemo(() => {
    const from = range === 'hoy' ? startOfDay() : addDays(startOfDay(), -6)
    return topProducts(sales, from, by).map((r) => ({ ...r, short: truncate(r.name, 22), value: by === 'qty' ? r.qty : r.revenue }))
  }, [sales, range, by])

  return (
    <Card className={className}>
      <CardHeader
        icon={<Star />}
        title="Los 5 que más se venden"
        subtitle={by === 'revenue' ? 'Según la plata que dejaron' : 'Según cuántos se vendieron'}
        actions={
          <Segmented
            size="sm"
            value={range}
            onChange={setRange}
            ariaLabel="Período"
            options={[
              { value: 'hoy', label: 'Hoy' },
              { value: 'semana', label: '7 días' },
            ]}
          />
        }
      />
      <div className="px-4 pt-2 sm:px-5">
        <Segmented
          size="sm"
          value={by}
          onChange={setBy}
          ariaLabel="Ordenar por"
          options={[
            { value: 'revenue', label: '$ Ventas' },
            { value: 'qty', label: 'Unidades' },
          ]}
        />
      </div>
      {data.length === 0 ? (
        <EmptyState icon={<Star />} title="Sin ventas en este período" className="h-64" />
      ) : (
        <div className="h-64 px-2 pb-3 sm:h-[17rem] sm:px-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 64, bottom: 0, left: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="short" {...axisProps} width={150} tick={{ ...axisProps.tick, fill: 'var(--fg-muted)' }} />
              <Tooltip
                cursor={{ fill: CHART.cursor }}
                content={
                  <ChartTooltip
                    valueFormatter={(v) => (by === 'qty' ? formatInt(Math.round(v * 10) / 10) : formatCLP(v))}
                  />
                }
              />
              <Bar dataKey="value" name={by === 'qty' ? 'Unidades' : 'Ventas'} fill={CHART.s1} radius={[0, 4, 4, 0]} maxBarSize={26}>
                <LabelList
                  dataKey="value"
                  position="right"
                  className="tabular"
                  style={{ fill: 'var(--fg)', fontSize: 12, fontWeight: 600 }}
                  formatter={(v: unknown) => (by === 'qty' ? formatInt(Number(v)) : formatCLPShort(Number(v)))}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

// ---------- Últimos 7 días ----------

function WeekCard({ className }: { className?: string }) {
  const { sales, expenses } = useData()
  const data = useMemo(() => dailySeries(sales, expenses, 7), [sales, expenses])
  const total = data.reduce((a, d) => a + d.ventas, 0)
  const profit = data.reduce((a, d) => a + d.utilidad, 0)

  return (
    <Card className={className}>
      <CardHeader
        icon={<Wallet />}
        title="Últimos 7 días"
        subtitle={`Vendido ${formatCLP(total)} · ganado ${formatCLP(profit)}`}
        actions={
          <Legend
            items={[
              { label: 'Ventas', color: CHART.s1 },
              { label: 'Ganancia', color: CHART.s3 },
            ]}
          />
        }
      />
      <div className="h-64 px-2 pt-3 pb-2 sm:h-72 sm:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={62} tickFormatter={formatCLPShort} />
            <Tooltip cursor={{ fill: CHART.cursor }} content={<ChartTooltip valueFormatter={formatCLP} />} />
            <Bar dataKey="ventas" name="Ventas" fill={CHART.s1} radius={[4, 4, 0, 0]} maxBarSize={30} />
            <Bar dataKey="utilidad" name="Ganancia" fill={CHART.s3} radius={[4, 4, 0, 0]} maxBarSize={30} />
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
