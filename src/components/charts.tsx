// Piezas comunes de los gráficos (Recharts) para que todos se vean iguales
// y respeten el tema claro/oscuro usando variables CSS.
import type { ReactNode } from 'react'

export const CHART = {
  grid: 'var(--chart-grid)',
  axis: 'var(--chart-axis)',
  s1: 'var(--chart-1)',
  s2: 'var(--chart-2)',
  s3: 'var(--chart-3)',
  cursor: 'var(--surface-2)',
}

export const axisProps = {
  tick: { fill: CHART.axis, fontSize: 12 },
  axisLine: false,
  tickLine: false,
} as const

interface TooltipEntry {
  name?: string | number
  value?: number | string | (number | string)[]
  color?: string
  dataKey?: string | number
}

interface ChartTooltipProps {
  active?: boolean
  payload?: readonly TooltipEntry[]
  label?: ReactNode
  valueFormatter?: (v: number) => string
  labelFormatter?: (label: ReactNode) => ReactNode
  extra?: (label: ReactNode) => ReactNode
}

/** Tooltip con los colores del tema: el color identifica la serie, el texto va en tinta normal */
export function ChartTooltip({ active, payload, label, valueFormatter = String, labelFormatter, extra }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-36 rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 font-semibold">{labelFormatter ? labelFormatter(label) : label}</p>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="size-2.5 rounded-sm" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="tabular font-semibold">{valueFormatter(Number(p.value))}</span>
        </div>
      ))}
      {extra?.(label)}
    </div>
  )
}

/** Leyenda simple en HTML (texto en tinta normal, muestra de color al lado) */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}
