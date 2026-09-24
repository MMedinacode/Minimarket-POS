import type { Product, Rotation, Sale, Settings, StockStatus } from '../types'

/** Días de historial usados para medir qué tan rápido se vende cada producto */
export const VELOCITY_WINDOW_DAYS = 14

/**
 * Unidades vendidas por día (promedio de los últimos N días) para cada producto.
 * Se calcula una vez y se reutiliza en toda la pantalla.
 */
export function buildVelocityMap(sales: Sale[], now: Date = new Date(), days = VELOCITY_WINDOW_DAYS): Map<string, number> {
  const since = now.getTime() - days * 86_400_000
  const totals = new Map<string, number>()
  for (const sale of sales) {
    if (sale.voided) continue
    const t = new Date(sale.date).getTime()
    if (t < since || t > now.getTime()) continue
    for (const item of sale.items) {
      totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.qty)
    }
  }
  const velocity = new Map<string, number>()
  for (const [id, qty] of totals) velocity.set(id, qty / days)
  return velocity
}

export type ThresholdReason = 'manual' | 'rotacion' | 'velocidad'

export interface StockInfo {
  status: StockStatus
  /** Se alerta cuando el stock queda BAJO este número */
  threshold: number
  reason: ThresholdReason
  /** Unidades/día vendidas (0 si no hay ventas recientes) */
  velocity: number
  /** Días que alcanza el stock al ritmo actual (null = sin ventas recientes) */
  daysLeft: number | null
}

/**
 * Stock crítico diferenciado:
 * 1. Si el dueño fijó un mínimo manual, se usa ese.
 * 2. Si no, se usa el umbral de su rotación (Alta < 10, Media < 5, Baja < 2).
 * 3. Si el producto se está vendiendo más rápido de lo que su rotación indica,
 *    el umbral sube para cubrir `coverageDays` días de venta.
 *    Ej: si salen 6 papas fritas al día y coverageDays = 2 → alerta bajo 12.
 */
export function getStockInfo(product: Product, settings: Settings, velocity = 0): StockInfo {
  let threshold: number
  let reason: ThresholdReason

  if (product.minStock !== null && product.minStock !== undefined) {
    threshold = product.minStock
    reason = 'manual'
  } else {
    const base = settings.thresholds[product.rotation] ?? 0
    const bySpeed = velocity > 0 ? Math.ceil(velocity * settings.coverageDays * 10) / 10 : 0
    if (bySpeed > base) {
      threshold = product.unit === 'kg' ? bySpeed : Math.ceil(bySpeed)
      reason = 'velocidad'
    } else {
      threshold = base
      reason = 'rotacion'
    }
  }

  let status: StockStatus = 'ok'
  if (product.stock <= 0) status = 'agotado'
  else if (product.stock < threshold) status = 'critico'

  const daysLeft = velocity > 0 ? Math.max(0, product.stock) / velocity : null
  return { status, threshold, reason, velocity, daysLeft }
}

/** Rotación sugerida según ventas reales (para ayudar al dueño a clasificar) */
export function suggestRotation(velocity: number): Rotation {
  if (velocity >= 3) return 'Alta'
  if (velocity >= 0.7) return 'Media'
  return 'Baja'
}

/**
 * Cuánto pedir al proveedor: lo necesario para llegar al doble del umbral de
 * alerta, o para cubrir `days` días de venta si se vende más rápido que eso.
 * Kilos se redondean a medio kilo; unidades hacia arriba.
 */
export function suggestOrderQty(product: Product, info: StockInfo, days = 7): number {
  const target = Math.max(info.threshold * 2, info.velocity * days)
  const need = target - Math.max(0, product.stock)
  if (need <= 0) return 0
  return product.unit === 'kg' ? Math.ceil(need * 2) / 2 : Math.ceil(need)
}

export function isAlert(status: StockStatus): boolean {
  return status === 'agotado' || status === 'critico'
}

export const STATUS_LABEL: Record<StockStatus, string> = {
  agotado: 'Agotado',
  critico: 'Crítico',
  ok: 'OK',
}

export function describeThreshold(info: StockInfo, rotation: Rotation): string {
  const n = Number.isInteger(info.threshold) ? info.threshold : info.threshold.toFixed(1)
  if (info.reason === 'manual') return `Alerta bajo ${n} (mínimo manual)`
  if (info.reason === 'velocidad') return `Alerta bajo ${n} (se vende rápido)`
  return `Alerta bajo ${n} (rotación ${rotation.toLowerCase()})`
}
