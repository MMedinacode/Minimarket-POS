import type { Product, Rotation, Sale, Settings, StockStatus, Unit } from '../types'
import { formatQty, normalizeText } from './utils'

/** Días de historial usados para medir qué tan rápido se vende cada producto */
const VELOCITY_WINDOW_DAYS = 14

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

// ---------- Los tres colores del stock ----------
//
//   rojo (muy poco)      stock menor que `red`       → hay que pedir ya
//   amarillo (queda poco) stock menor que `yellow`   → pedir pronto
//   verde (bien)         desde `yellow` hacia arriba
//
// Ej. papas fritas con red 10 y yellow 20: rojo de 0 a 9, amarillo de 10 a 19, verde de 20 en adelante.

/** Los dos números que separan los tres colores */
export interface StockLevels {
  red: number
  yellow: number
}

/**
 * Niveles automáticos por tipo de producto, para uno que se vende "normal". Pensados para un
 * almacén o minimarket de barrio en Chile:
 * - Bebidas y lácteos vienen en packs de 6 y salen todos los días.
 * - Snacks y golosinas se venden de a varios y se piden por caja.
 * - Pan, fiambres, quesos y verduras por kilo se reponen seguido (a veces a diario).
 * - Limpieza, higiene y bazar se venden más lento: con unos pocos alcanza.
 * El dueño los cambia por tipo (Ajustes → Avisos) o por producto (Editar → Más opciones).
 */
export const TYPE_LEVELS: Record<string, Partial<Record<Unit, StockLevels>>> = {
  Bebidas: { un: { red: 6, yellow: 12 } },
  Snacks: { un: { red: 10, yellow: 20 } },
  'Lácteos': { un: { red: 6, yellow: 12 }, kg: { red: 1, yellow: 2 } },
  'Panadería': { un: { red: 5, yellow: 10 }, kg: { red: 3, yellow: 6 } },
  'Fiambrería': { un: { red: 3, yellow: 6 }, kg: { red: 1, yellow: 2 } },
  'Frutas y Verduras': { un: { red: 5, yellow: 10 }, kg: { red: 3, yellow: 6 } },
  Abarrotes: { un: { red: 5, yellow: 10 }, kg: { red: 2, yellow: 5 } },
  Congelados: { un: { red: 3, yellow: 6 }, kg: { red: 1, yellow: 2 } },
  Limpieza: { un: { red: 3, yellow: 6 } },
  'Higiene Personal': { un: { red: 3, yellow: 6 } },
}

/** Tipos que el dueño crea con otro nombre (ej: "Cigarros", "Librería"): se reconocen por palabras */
const TYPE_WORDS: { words: string[]; levels: Partial<Record<Unit, StockLevels>> }[] = [
  { words: ['cigarr', 'tabaco'], levels: { un: { red: 10, yellow: 20 } } },
  { words: ['golosina', 'dulce', 'confite', 'chocolate'], levels: { un: { red: 10, yellow: 20 } } },
  { words: ['licor', 'botiller', 'vino', 'cerveza', 'alcohol'], levels: { un: { red: 6, yellow: 12 } } },
  { words: ['queso', 'carne', 'pollo', 'cecina'], levels: { un: { red: 3, yellow: 6 }, kg: { red: 1, yellow: 2 } } },
  { words: ['mascota', 'perro', 'gato', 'forraje', 'granel'], levels: { un: { red: 3, yellow: 6 }, kg: { red: 5, yellow: 10 } } },
  { words: ['bazar', 'librer', 'papeler', 'juguet', 'regalo', 'ferreter', 'paqueter', 'cotillon'], levels: { un: { red: 2, yellow: 4 } } },
]

const FALLBACK: Record<Unit, StockLevels> = { un: { red: 3, yellow: 6 }, kg: { red: 1, yellow: 2 } }

/** Cuánto pesa la rotación: lo que "se vende mucho" avisa antes, lo que "se vende poco" después */
const ROTATION_FACTOR: Record<Rotation, number> = { Alta: 1.5, Media: 1, Baja: 0.5 }

/** Clave de un tipo de producto en Ajustes: la categoría, separando lo que se vende por unidad y por kilo */
export const levelKey = (category: string, unit: Unit) => `${category}|${unit}`

/** Redondeo amable: unidades enteras (mínimo 1) y kilos de medio en medio (mínimo 0,5) */
function roundLevel(n: number, unit: Unit): number {
  return unit === 'kg' ? Math.max(0.5, Math.round(n * 2) / 2) : Math.max(1, Math.round(n))
}

/** Niveles automáticos de un tipo de producto (para uno que se vende "normal") */
export function typeLevels(category: string, unit: Unit): StockLevels {
  const known = TYPE_LEVELS[category]?.[unit]
  if (known) return known
  const name = normalizeText(category)
  for (const t of TYPE_WORDS) {
    if (t.words.some((w) => name.includes(w)) && t.levels[unit]) return t.levels[unit]!
  }
  return FALLBACK[unit]
}

/**
 * Niveles automáticos de un producto: los de su tipo, ajustados por qué tan rápido se vende
 * (rotación) y por las ventas reales. Si se vende más rápido de lo normal, el rojo sube para
 * alcanzar `coverageDays` días de venta. Ej: 6 papas al día y 2 días → rojo bajo 12.
 */
export function autoLevels(product: Pick<Product, 'category' | 'unit' | 'rotation'>, velocity = 0, coverageDays = 2): StockLevels {
  const base = typeLevels(product.category, product.unit)
  const f = ROTATION_FACTOR[product.rotation] ?? 1
  let red = roundLevel(base.red * f, product.unit)
  let yellow = roundLevel(base.yellow * f, product.unit)
  if (velocity > 0) {
    red = Math.max(red, roundLevel(velocity * coverageDays, product.unit))
    yellow = Math.max(yellow, roundLevel(velocity * coverageDays * 2, product.unit))
  }
  const step = product.unit === 'kg' ? 0.5 : 1
  return { red, yellow: Math.max(yellow, red + step) }
}

/**
 * Niveles que el dueño escribió en el producto. Si escribió solo uno, el otro se deduce:
 * amarillo = el doble del rojo (ej: quesos rojo 1 kg → amarillo 2 kg) o rojo = la mitad del amarillo.
 */
function ownLevels(p: Product): StockLevels | null {
  const red = p.minStock ?? null
  const yellow = p.warnStock ?? null
  if (red === null && yellow === null) return null
  if (red !== null && yellow !== null) return { red, yellow: Math.max(yellow, red) }
  if (red !== null) return { red, yellow: red * 2 }
  const half = p.unit === 'kg' ? Math.floor(yellow! * 2) / 4 : Math.floor(yellow! / 2)
  return { red: half, yellow: yellow! }
}

/** De dónde salen los números: del producto, del tipo de producto (Ajustes) o automáticos */
export type LevelSource = 'producto' | 'tipo' | 'automatico'

export interface StockInfo {
  status: StockStatus
  /** Bajo este número: rojo */
  red: number
  /** Bajo este número (y desde `red`): amarillo */
  yellow: number
  source: LevelSource
  /** Unidades/día vendidas (0 si no hay ventas recientes) */
  velocity: number
  /** Días que alcanza el stock al ritmo actual (null = sin ventas recientes) */
  daysLeft: number | null
}

/**
 * Color del stock de un producto. Los números salen, en este orden, de:
 * 1. el producto (si el dueño los escribió en Editar → Más opciones),
 * 2. su tipo de producto (si los escribió en Ajustes → Avisos),
 * 3. lo automático (tipo de producto + rotación + ventas reales).
 */
export function getStockInfo(product: Product, settings: Settings, velocity = 0): StockInfo {
  let levels: StockLevels
  let source: LevelSource
  const own = ownLevels(product)
  const byType = settings.stockLevels?.[levelKey(product.category, product.unit)]
  if (own) {
    levels = own
    source = 'producto'
  } else if (byType) {
    levels = byType
    source = 'tipo'
  } else {
    levels = autoLevels(product, velocity, settings.coverageDays)
    source = 'automatico'
  }

  let status: StockStatus = 'ok'
  if (product.stock <= 0) status = 'agotado'
  else if (product.stock < levels.red) status = 'critico'
  else if (product.stock < levels.yellow) status = 'cerca'

  const daysLeft = velocity > 0 ? Math.max(0, product.stock) / velocity : null
  return { status, red: levels.red, yellow: levels.yellow, source, velocity, daysLeft }
}

/** Rotación sugerida según ventas reales (para ayudar al dueño a clasificar) */
export function suggestRotation(velocity: number): Rotation {
  if (velocity >= 3) return 'Alta'
  if (velocity >= 0.7) return 'Media'
  return 'Baja'
}

/**
 * Cuánto pedir al proveedor: lo necesario para quedar bien en verde (amarillo + rojo; ej. papas
 * 10/20 → llegar a 30), o para cubrir `days` días de venta si se vende más rápido que eso.
 * Kilos se redondean a medio kilo; unidades hacia arriba.
 */
export function suggestOrderQty(product: Product, info: StockInfo, days = 7): number {
  const target = Math.max(info.yellow + info.red, info.velocity * days)
  const need = target - Math.max(0, product.stock)
  if (need <= 0) return 0
  return product.unit === 'kg' ? Math.ceil(need * 2) / 2 : Math.ceil(need)
}

/** Rojo: agotado o muy poco (hay que pedir ya) */
export function isAlert(status: StockStatus): boolean {
  return status === 'agotado' || status === 'critico'
}

/** Amarillo: queda poco (pedir pronto) */
export function isWarning(status: StockStatus): boolean {
  return status === 'cerca'
}

export const STATUS_LABEL: Record<StockStatus, string> = {
  agotado: 'Agotado',
  critico: 'Muy poco',
  cerca: 'Queda poco',
  ok: 'Bien',
}

/** Los tres rangos en palabras, para mostrarlos: rojo "menos de 10", amarillo "de 10 a 19", verde "20 o más" */
export function describeLevels(levels: StockLevels, unit: Unit): { red: string; yellow: string; green: string } {
  const q = (n: number) => formatQty(n, unit)
  const red = levels.red > 0 ? `menos de ${q(levels.red)}` : 'solo cuando se acaba'
  let yellow: string
  if (levels.yellow <= levels.red) yellow = 'no se usa'
  else if (unit === 'kg') yellow = `de ${q(levels.red)} a ${q(levels.yellow)}`
  else yellow = levels.yellow - 1 === levels.red ? q(levels.red) : `de ${q(levels.red)} a ${q(levels.yellow - 1)}`
  return { red, yellow, green: `${q(levels.yellow)} o más` }
}
