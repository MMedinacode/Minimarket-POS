import { describeLevels, type StockLevels } from '../lib/stock'
import { cn } from '../lib/utils'
import type { Unit } from '../types'

/**
 * Los tres rangos de un producto o tipo de producto, con su color:
 * Rojo (muy poco) · Amarillo (queda poco) · Verde (bien).
 */
export function StockLevelsLegend({ levels, unit, className }: { levels: StockLevels; unit: Unit; className?: string }) {
  const d = describeLevels(levels, unit)
  const rows = [
    { dot: 'bg-danger', name: 'Muy poco', text: d.red, hint: 'hay que pedir' },
    { dot: 'bg-warn', name: 'Queda poco', text: d.yellow, hint: 'pedir pronto' },
    { dot: 'bg-ok', name: 'Bien', text: d.green, hint: '' },
  ]
  return (
    <ul className={cn('space-y-1 text-sm', className)}>
      {rows.map((r) => (
        <li key={r.name} className="flex items-baseline gap-2">
          <span className={cn('inline-block size-3 shrink-0 translate-y-0.5 rounded-full', r.dot)} aria-hidden />
          <span>
            <strong className="font-semibold">{r.name}:</strong> {r.text}
            {r.hint && <span className="text-subtle"> ({r.hint})</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}
