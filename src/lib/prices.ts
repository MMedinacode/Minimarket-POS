import type { Product } from '../types'

export interface PriceChange {
  id: string
  name: string
  before: number
  after: number
}

/**
 * Subir precios en un porcentaje, redondeando hacia arriba (ej: a $10, $50 o $100).
 * Ej: $1.990 + 10% = $2.189 → redondeado a $10 = $2.190.
 * Solo devuelve los productos cuyo precio cambia.
 */
export function raisePrices(products: Product[], percent: number, roundTo: number): PriceChange[] {
  if (!(percent > 0) || !(roundTo > 0)) return []
  const changes: PriceChange[] = []
  for (const p of products) {
    // Se redondea el resultado a 6 decimales antes de subir al múltiplo: evita que 1.1 × 1000 = 1100,0000001 suba a 1110
    const raw = Math.round(p.price * (1 + percent / 100) * 1e6) / 1e6
    const after = Math.ceil(raw / roundTo) * roundTo
    if (after !== p.price) changes.push({ id: p.id, name: p.name, before: p.price, after })
  }
  return changes
}
