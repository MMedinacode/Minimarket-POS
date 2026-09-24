// Cálculos del dashboard y de caja. Todo es puro (sin React) para poder testearlo.
import { PAYMENT_METHODS, type Expense, type PaymentMethod, type Product, type Sale, type Unit } from '../types'
import { addDays, dayKey, formatDayShort, parseDayKey, startOfDay } from './utils'

export const activeSales = (sales: Sale[]) => sales.filter((s) => !s.voided)

export function saleProfit(sale: Sale): number {
  return sale.total - sale.cost
}

// ---------- Resumen de un día ----------

export interface DaySummary {
  revenue: number
  cost: number
  grossProfit: number
  expenses: number
  cashExpenses: number
  /** Utilidad bruta − gastos */
  netProfit: number
  /** Total ventas − total gastos (lo que pide el módulo de caja) */
  cashNet: number
  transactions: number
  avgTicket: number
  byPayment: Record<PaymentMethod, number>
  /** Ventas en efectivo − gastos pagados desde la caja */
  expectedCash: number
}

export function summarizeDay(sales: Sale[], expenses: Expense[], key: string): DaySummary {
  const byPayment = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0])) as Record<PaymentMethod, number>
  let revenue = 0
  let cost = 0
  let transactions = 0
  for (const s of sales) {
    if (s.voided || dayKey(s.date) !== key) continue
    revenue += s.total
    cost += s.cost
    transactions++
    byPayment[s.payment] += s.total
  }
  let exp = 0
  let cashExp = 0
  for (const e of expenses) {
    if (dayKey(e.date) !== key) continue
    exp += e.amount
    if (e.paidFromCash) cashExp += e.amount
  }
  const grossProfit = revenue - cost
  return {
    revenue,
    cost,
    grossProfit,
    expenses: exp,
    cashExpenses: cashExp,
    netProfit: grossProfit - exp,
    cashNet: revenue - exp,
    transactions,
    avgTicket: transactions ? revenue / transactions : 0,
    byPayment,
    expectedCash: byPayment['Efectivo'] - cashExp,
  }
}

// ---------- Ventas por hora ----------

export interface HourPoint {
  hour: number
  label: string
  total: number
  count: number
}

/**
 * Ventas agrupadas por hora del día. Con days > 1 devuelve el PROMEDIO diario
 * por hora, para comparar con un día normal.
 */
export function salesByHour(sales: Sale[], days: number, now: Date = new Date()): HourPoint[] {
  const from = addDays(startOfDay(now), -(days - 1)).getTime()
  const to = now.getTime()
  const totals = new Array<number>(24).fill(0)
  const counts = new Array<number>(24).fill(0)
  for (const s of sales) {
    if (s.voided) continue
    const d = new Date(s.date)
    const t = d.getTime()
    if (t < from || t > to) continue
    totals[d.getHours()] += s.total
    counts[d.getHours()]++
  }
  // Horario típico de un minimarket (7 a 23 h), ampliado si hay ventas fuera de él
  let first = 7
  let last = 23
  totals.forEach((v, h) => {
    if (v > 0) {
      first = Math.min(first, h)
      last = Math.max(last, h)
    }
  })
  const points: HourPoint[] = []
  for (let h = first; h <= last; h++) {
    points.push({
      hour: h,
      label: `${String(h).padStart(2, '0')}h`,
      total: Math.round(totals[h] / days),
      count: Math.round((counts[h] / days) * 10) / 10,
    })
  }
  return points
}

// ---------- Top productos ----------

export interface ProductRank {
  productId: string
  name: string
  unit: Unit
  qty: number
  revenue: number
  profit: number
}

export function rankProducts(sales: Sale[], from: Date, to: Date = new Date()): ProductRank[] {
  const map = new Map<string, ProductRank>()
  const a = from.getTime()
  const b = to.getTime()
  for (const s of sales) {
    if (s.voided) continue
    const t = new Date(s.date).getTime()
    if (t < a || t > b) continue
    for (const it of s.items) {
      const line = Math.round(it.qty * it.unitPrice)
      const row = map.get(it.productId) ?? {
        productId: it.productId,
        name: it.name,
        unit: it.unit,
        qty: 0,
        revenue: 0,
        profit: 0,
      }
      row.qty += it.qty
      row.revenue += line
      row.profit += line - it.qty * it.unitCost
      map.set(it.productId, row)
    }
  }
  return [...map.values()]
}

export function topProducts(
  sales: Sale[],
  from: Date,
  by: 'qty' | 'revenue',
  limit = 5,
  to: Date = new Date(),
): ProductRank[] {
  return rankProducts(sales, from, to)
    .sort((x, y) => (by === 'qty' ? y.qty - x.qty : y.revenue - x.revenue))
    .slice(0, limit)
}

// ---------- Menor rotación ----------

export interface SlowMover {
  product: Product
  lastSold: Date | null
  /** Días desde la última venta (null = nunca vendido) */
  daysSince: number | null
  /** Plata "dormida" en bodega: stock × costo */
  stockValue: number
}

/** Productos con stock que no se venden hace `days` días o más */
export function slowMovers(products: Product[], sales: Sale[], days: number, now: Date = new Date()): SlowMover[] {
  const last = new Map<string, number>()
  for (const s of sales) {
    if (s.voided) continue
    const t = new Date(s.date).getTime()
    for (const it of s.items) {
      if ((last.get(it.productId) ?? 0) < t) last.set(it.productId, t)
    }
  }
  const limit = now.getTime() - days * 86_400_000
  return products
    .filter((p) => p.stock > 0)
    .map((p) => {
      const t = last.get(p.id)
      return {
        product: p,
        lastSold: t ? new Date(t) : null,
        daysSince: t ? Math.floor((now.getTime() - t) / 86_400_000) : null,
        stockValue: p.stock * p.cost,
      }
    })
    .filter((m) => m.lastSold === null || m.lastSold.getTime() < limit)
    .sort((x, y) => y.stockValue - x.stockValue)
}

// ---------- Serie diaria (últimos N días) ----------

export interface DayPoint {
  key: string
  label: string
  ventas: number
  utilidad: number
  gastos: number
}

export function dailySeries(sales: Sale[], expenses: Expense[], days: number, endKey: string = dayKey()): DayPoint[] {
  const end = parseDayKey(endKey)
  const points: DayPoint[] = []
  const index = new Map<string, DayPoint>()
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(end, -i)
    const p: DayPoint = { key: dayKey(d), label: formatDayShort(d), ventas: 0, utilidad: 0, gastos: 0 }
    points.push(p)
    index.set(p.key, p)
  }
  for (const s of sales) {
    if (s.voided) continue
    const p = index.get(dayKey(s.date))
    if (!p) continue
    p.ventas += s.total
    p.utilidad += s.total - s.cost
  }
  for (const e of expenses) {
    const p = index.get(dayKey(e.date))
    if (p) p.gastos += e.amount
  }
  return points
}

// ---------- Márgenes ----------

/** Margen sobre el precio de venta: (venta − costo) / venta */
export function marginPct(cost: number, price: number): number {
  if (!price) return 0
  return ((price - cost) / price) * 100
}

export interface MarginRow {
  product: Product
  unitProfit: number
  margin: number
}

export function marginRows(products: Product[]): MarginRow[] {
  return products.map((p) => ({ product: p, unitProfit: p.price - p.cost, margin: marginPct(p.cost, p.price) }))
}

export interface CategoryMargin {
  category: string
  margin: number
  products: number
}

/** Margen promedio por categoría, ponderado por precio (no se distorsiona con productos baratos) */
export function categoryMargins(products: Product[]): CategoryMargin[] {
  const acc = new Map<string, { cost: number; price: number; n: number }>()
  for (const p of products) {
    const row = acc.get(p.category) ?? { cost: 0, price: 0, n: 0 }
    row.cost += p.cost
    row.price += p.price
    row.n++
    acc.set(p.category, row)
  }
  return [...acc.entries()]
    .map(([category, r]) => ({ category, margin: marginPct(r.cost, r.price), products: r.n }))
    .sort((a, b) => b.margin - a.margin)
}

export interface InventoryValue {
  atCost: number
  atPrice: number
  potentialProfit: number
  /** Margen del inventario completo ponderado por stock */
  margin: number
  units: number
}

export function inventoryValue(products: Product[]): InventoryValue {
  let atCost = 0
  let atPrice = 0
  let units = 0
  for (const p of products) {
    const s = Math.max(0, p.stock)
    atCost += s * p.cost
    atPrice += s * p.price
    units += p.unit === 'un' ? s : 0
  }
  return { atCost, atPrice, potentialProfit: atPrice - atCost, margin: marginPct(atCost, atPrice), units }
}

/** Variación porcentual; null si no hay base de comparación */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null
  return ((current - previous) / previous) * 100
}
