// Modelo de datos del Excel: cómo se leen las filas importadas y cómo se arman
// las hojas exportadas. No depende de SheetJS, así el visor y los tests lo usan
// directo; excel-io.ts es quien lee y escribe los archivos .xlsx.
import type { AppData, Expense, Product, Rotation, Sale, Settings, Unit } from '../types'
import { activeSales, marginPct } from './analytics'
import { inferCategory, matchCategory } from './categories'
import { STATUS_LABEL, buildVelocityMap, getStockInfo } from './stock'
import { dayKey, formatTime, normalizeText, parseLocaleNumber, roundQty, uid } from './utils'

/** Columnas oficiales del Excel de inventario (en este orden) */
export const INVENTORY_COLUMNS = [
  'CodigoBarras',
  'Nombre',
  'Categoria',
  'PrecioCosto',
  'PrecioVenta',
  'Stock',
  'Rotacion',
  'Unidad',
  'StockMinimo',
] as const

type Field = 'barcode' | 'name' | 'category' | 'cost' | 'price' | 'stock' | 'rotation' | 'unit' | 'minStock'

/** Nombres de columna aceptados (sin tildes, espacios ni símbolos) */
const ALIASES: Record<Field, string[]> = {
  barcode: ['codigobarras', 'codigodebarras', 'codbarras', 'codigo', 'cod', 'ean', 'sku', 'barcode', 'plu'],
  name: ['nombre', 'producto', 'nombreproducto', 'descripcion', 'detalle', 'articulo'],
  category: ['categoria', 'rubro', 'familia', 'seccion', 'tipo'],
  cost: ['preciocosto', 'costo', 'costounitario', 'preciocompra', 'compra'],
  price: ['precioventa', 'precio', 'venta', 'pvp', 'preciounitario', 'valor'],
  stock: ['stock', 'cantidad', 'existencias', 'unidades', 'inventario', 'stockactual'],
  rotation: ['rotacion', 'rotacionaltamediabaja', 'velocidad', 'movimiento'],
  unit: ['unidad', 'um', 'unidadmedida', 'unidaddemedida', 'medida'],
  minStock: ['stockminimo', 'minimo', 'stockcritico', 'alertastock'],
}

const REQUIRED: Field[] = ['name', 'price']

const FIELD_LABEL: Record<Field, string> = {
  barcode: 'CodigoBarras',
  name: 'Nombre',
  category: 'Categoria',
  cost: 'PrecioCosto',
  price: 'PrecioVenta',
  stock: 'Stock',
  rotation: 'Rotacion',
  unit: 'Unidad',
  minStock: 'StockMinimo',
}

const headerKey = (h: unknown) => normalizeText(String(h ?? '')).replace(/[^a-z0-9]/g, '')

function detectField(header: unknown): Field | null {
  const key = headerKey(header)
  if (!key) return null
  for (const [field, list] of Object.entries(ALIASES) as [Field, string[]][]) {
    if (list.includes(key)) return field
  }
  // "Rotacion (Alta/Media/Baja)", "Stock mínimo sugerido", etc.
  if (key.startsWith('rotacion')) return 'rotation'
  if (key.startsWith('codigo')) return 'barcode'
  return null
}

export interface ProductDraft {
  barcode: string
  name: string
  category: string
  cost: number
  price: number
  stock: number
  unit: Unit
  rotation: Rotation
  minStock: number | null
}

export interface ImportRow {
  /** Número de fila tal como se ve en Excel */
  excelRow: number
  /** Código y nombre tal como venían, para ubicar la fila aunque tenga errores */
  preview: { barcode: string; name: string }
  draft: ProductDraft | null
  errors: string[]
  warnings: string[]
}

export interface ParsedImport {
  headerRow: number
  columns: Partial<Record<Field, number>>
  missingColumns: string[]
  rows: ImportRow[]
}

function parseRotation(v: unknown): Rotation | null {
  const s = normalizeText(String(v ?? ''))
  if (!s) return null
  if (['alta', 'a', 'alto', 'high', 'rapida'].includes(s)) return 'Alta'
  if (['media', 'm', 'medio', 'medium', 'normal'].includes(s)) return 'Media'
  if (['baja', 'b', 'bajo', 'low', 'lenta'].includes(s)) return 'Baja'
  return null
}

function parseUnit(v: unknown): Unit | null {
  const s = normalizeText(String(v ?? '')).replace(/\./g, '')
  if (!s) return null
  if (['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos', 'granel', 'peso'].includes(s)) return 'kg'
  if (['un', 'u', 'und', 'unid', 'unidad', 'unidades', 'c/u', 'cu'].includes(s)) return 'un'
  return null
}

/** Códigos de barra: Excel los guarda como número y puede agregar ".0" o notación científica */
function parseBarcode(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? v.toFixed(0) : String(v)
  return String(v ?? '').trim().replace(/\s+/g, '')
}

/**
 * Convierte las filas crudas de la hoja (arreglo de arreglos) en productos
 * validados. Busca la fila de encabezados en las primeras 10 filas, así funciona
 * aunque el Excel tenga un título arriba.
 */
export function parseInventoryRows(aoa: unknown[][], knownCategories: readonly string[]): ParsedImport {
  let headerRow = -1
  let columns: Partial<Record<Field, number>> = {}
  for (let r = 0; r < Math.min(aoa.length, 10); r++) {
    const found: Partial<Record<Field, number>> = {}
    ;(aoa[r] ?? []).forEach((cell, c) => {
      const f = detectField(cell)
      if (f && found[f] === undefined) found[f] = c
    })
    if (Object.keys(found).length >= 2) {
      headerRow = r
      columns = found
      break
    }
  }

  if (headerRow === -1) {
    return {
      headerRow: -1,
      columns: {},
      missingColumns: REQUIRED.map((f) => FIELD_LABEL[f]),
      rows: [],
    }
  }

  const missingColumns = REQUIRED.filter((f) => columns[f] === undefined).map((f) => FIELD_LABEL[f])
  if (missingColumns.length) return { headerRow: headerRow + 1, columns, missingColumns, rows: [] }

  const get = (row: unknown[], f: Field) => (columns[f] === undefined ? undefined : row[columns[f]!])
  const seenBarcodes = new Map<string, number>()
  const seenNames = new Map<string, number>()
  const rows: ImportRow[] = []

  for (let r = headerRow + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? []
    if (row.every((c) => c === null || c === undefined || String(c).trim() === '')) continue
    const excelRow = r + 1
    const errors: string[] = []
    const warnings: string[] = []

    const name = String(get(row, 'name') ?? '').trim().replace(/\s+/g, ' ')
    if (!name) errors.push('Falta el nombre')

    const barcode = parseBarcode(get(row, 'barcode'))
    const nameKey = normalizeText(name)
    if (barcode) {
      const prev = seenBarcodes.get(barcode)
      if (prev) errors.push(`Código repetido (ya está en la fila ${prev})`)
    } else if (name) {
      const prev = seenNames.get(nameKey)
      if (prev) errors.push(`Producto sin código repetido (fila ${prev})`)
    }

    const price = parseLocaleNumber(get(row, 'price'))
    if (price === null || price <= 0) errors.push('Precio de venta inválido')

    let cost = parseLocaleNumber(get(row, 'cost'))
    if (cost === null || cost < 0) {
      warnings.push('Sin costo: se dejó en $0')
      cost = 0
    } else if (price !== null && cost > price) {
      warnings.push('El costo es mayor que el precio (se vende a pérdida)')
    }

    let unit = parseUnit(get(row, 'unit'))
    if (!unit) unit = 'un'

    let stock = parseLocaleNumber(get(row, 'stock'))
    if (stock === null) {
      warnings.push('Sin stock: se dejó en 0')
      stock = 0
    } else if (stock < 0) {
      warnings.push('Stock negativo: se dejó en 0')
      stock = 0
    } else if (unit === 'un' && !Number.isInteger(stock)) {
      warnings.push('Stock con decimales en producto por unidad: se redondeó')
    }

    let rotation = parseRotation(get(row, 'rotation'))
    if (!rotation) {
      if (String(get(row, 'rotation') ?? '').trim()) warnings.push('Rotación no reconocida: se usó Media')
      rotation = 'Media'
    }

    let category = matchCategory(String(get(row, 'category') ?? ''), knownCategories)
    if (!category && name) {
      category = inferCategory(name).category
      warnings.push(`Categoría asignada automáticamente: ${category}`)
    }

    const minRaw = get(row, 'minStock')
    const minStock = String(minRaw ?? '').trim() === '' ? null : parseLocaleNumber(minRaw)

    // Solo las filas válidas "reservan" su código: si la fila 5 tiene un error,
    // una fila 6 correcta con el mismo código no debe rechazarse por duplicada.
    if (!errors.length) {
      if (barcode) seenBarcodes.set(barcode, excelRow)
      else seenNames.set(nameKey, excelRow)
    }

    rows.push({
      excelRow,
      preview: { barcode, name },
      errors,
      // En filas que se omiten, las advertencias solo meten ruido
      warnings: errors.length ? [] : warnings,
      draft: errors.length
        ? null
        : {
            barcode,
            name,
            category,
            cost: Math.round(cost),
            price: Math.round(price!),
            stock: roundQty(stock, unit),
            unit,
            rotation,
            minStock: minStock !== null && minStock >= 0 ? minStock : null,
          },
    })
  }

  return { headerRow: headerRow + 1, columns, missingColumns: [], rows }
}

export type ImportMode = 'merge' | 'replace'

export interface ImportOutcome {
  products: Product[]
  added: number
  updated: number
}

/**
 * Aplica los productos del Excel al inventario.
 * - merge: actualiza los que ya existen (por código, o por nombre si no tienen código) y agrega los nuevos.
 * - replace: el inventario queda exactamente como el Excel.
 */
export function applyImport(existing: Product[], drafts: ProductDraft[], mode: ImportMode, now = new Date()): ImportOutcome {
  const iso = now.toISOString()
  const make = (d: ProductDraft): Product => ({ ...d, id: uid(), createdAt: iso, updatedAt: iso })

  if (mode === 'replace') {
    return { products: drafts.map(make), added: drafts.length, updated: 0 }
  }

  const products = [...existing]
  const byCode = new Map<string, number>()
  const byName = new Map<string, number>()
  products.forEach((p, i) => {
    if (p.barcode) byCode.set(p.barcode, i)
    byName.set(normalizeText(p.name), i)
  })

  let added = 0
  let updated = 0
  for (const d of drafts) {
    let idx = d.barcode ? byCode.get(d.barcode) : undefined
    if (idx === undefined) {
      // Por nombre solo si el existente no tiene código (ej: pan a granel al que luego se le puso código)
      const byNameIdx = byName.get(normalizeText(d.name))
      if (byNameIdx !== undefined && (!d.barcode || !products[byNameIdx].barcode)) idx = byNameIdx
    }
    if (idx !== undefined) {
      const prev = products[idx]
      products[idx] = { ...prev, ...d, barcode: d.barcode || prev.barcode, updatedAt: iso }
      if (d.barcode) byCode.set(d.barcode, idx)
      updated++
    } else {
      const p = make(d)
      products.push(p)
      if (p.barcode) byCode.set(p.barcode, products.length - 1)
      byName.set(normalizeText(p.name), products.length - 1)
      added++
    }
  }
  return { products, added, updated }
}

// ---------- Hojas de exportación (también las usa el visor) ----------

export type Cell = string | number
export type ColumnFormat = 'text' | 'money' | 'number' | 'qty' | 'pct'

export interface SheetData {
  name: string
  columns: { header: string; format: ColumnFormat }[]
  rows: Cell[][]
}

export function inventorySheet(products: Product[], settings: Settings, velocity: Map<string, number>): SheetData {
  const sorted = [...products].sort(
    (a, b) => a.category.localeCompare(b.category, 'es') || a.name.localeCompare(b.name, 'es'),
  )
  return {
    name: 'Inventario',
    columns: [
      { header: 'CodigoBarras', format: 'text' },
      { header: 'Nombre', format: 'text' },
      { header: 'Categoria', format: 'text' },
      { header: 'PrecioCosto', format: 'money' },
      { header: 'PrecioVenta', format: 'money' },
      { header: 'Stock', format: 'qty' },
      { header: 'Rotacion', format: 'text' },
      { header: 'Unidad', format: 'text' },
      { header: 'StockMinimo', format: 'qty' },
      { header: 'Utilidad', format: 'money' },
      { header: 'Margen %', format: 'pct' },
      { header: 'EstadoStock', format: 'text' },
      { header: 'ValorStockCosto', format: 'money' },
    ],
    rows: sorted.map((p) => {
      const info = getStockInfo(p, settings, velocity.get(p.id) ?? 0)
      return [
        p.barcode,
        p.name,
        p.category,
        p.cost,
        p.price,
        p.stock,
        p.rotation,
        p.unit,
        p.minStock ?? '',
        p.price - p.cost,
        Math.round(marginPct(p.cost, p.price) * 10) / 10,
        STATUS_LABEL[info.status],
        Math.round(Math.max(0, p.stock) * p.cost),
      ]
    }),
  }
}

export function salesSheet(sales: Sale[]): SheetData {
  const rows: Cell[][] = []
  const sorted = [...sales].sort((a, b) => b.date.localeCompare(a.date))
  for (const s of sorted) {
    for (const it of s.items) {
      const subtotal = Math.round(it.qty * it.unitPrice)
      const cost = Math.round(it.qty * it.unitCost)
      rows.push([
        dayKey(s.date),
        formatTime(s.date),
        s.number,
        it.barcode,
        it.name,
        it.category,
        it.qty,
        it.unit,
        it.unitPrice,
        subtotal,
        cost,
        subtotal - cost,
        s.payment,
        s.voided ? 'Anulada' : 'Válida',
      ])
    }
  }
  return {
    name: 'Ventas',
    columns: [
      { header: 'Fecha', format: 'text' },
      { header: 'Hora', format: 'text' },
      { header: 'NVenta', format: 'number' },
      { header: 'CodigoBarras', format: 'text' },
      { header: 'Producto', format: 'text' },
      { header: 'Categoria', format: 'text' },
      { header: 'Cantidad', format: 'qty' },
      { header: 'Unidad', format: 'text' },
      { header: 'PrecioUnitario', format: 'money' },
      { header: 'Subtotal', format: 'money' },
      { header: 'Costo', format: 'money' },
      { header: 'Utilidad', format: 'money' },
      { header: 'MedioPago', format: 'text' },
      { header: 'Estado', format: 'text' },
    ],
    rows,
  }
}

export function expensesSheet(expenses: Expense[]): SheetData {
  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date))
  return {
    name: 'Gastos',
    columns: [
      { header: 'Fecha', format: 'text' },
      { header: 'Hora', format: 'text' },
      { header: 'Descripcion', format: 'text' },
      { header: 'Categoria', format: 'text' },
      { header: 'Monto', format: 'money' },
      { header: 'PagadoDesdeCaja', format: 'text' },
    ],
    rows: sorted.map((e) => [
      dayKey(e.date),
      formatTime(e.date),
      e.description,
      e.category,
      e.amount,
      e.paidFromCash ? 'Sí' : 'No',
    ]),
  }
}

export function dailySummarySheet(sales: Sale[], expenses: Expense[]): SheetData {
  const days = new Map<string, { n: number; total: number; cost: number; exp: number }>()
  const get = (k: string) => {
    let d = days.get(k)
    if (!d) days.set(k, (d = { n: 0, total: 0, cost: 0, exp: 0 }))
    return d
  }
  for (const s of activeSales(sales)) {
    const d = get(dayKey(s.date))
    d.n++
    d.total += s.total
    d.cost += s.cost
  }
  for (const e of expenses) get(dayKey(e.date)).exp += e.amount
  const rows = [...days.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([k, d]) => [k, d.n, d.total, d.cost, d.total - d.cost, d.exp, d.total - d.exp, d.total - d.cost - d.exp])
  return {
    name: 'Resumen diario',
    columns: [
      { header: 'Fecha', format: 'text' },
      { header: 'NVentas', format: 'number' },
      { header: 'TotalVentas', format: 'money' },
      { header: 'CostoVendido', format: 'money' },
      { header: 'UtilidadBruta', format: 'money' },
      { header: 'Gastos', format: 'money' },
      { header: 'CajaNeta', format: 'money' },
      { header: 'GananciaNeta', format: 'money' },
    ],
    rows,
  }
}

/** Todas las hojas del libro exportado, con los datos actuales */
export function buildSheets(data: AppData): SheetData[] {
  const velocity = buildVelocityMap(data.sales)
  return [
    inventorySheet(data.products, data.settings, velocity),
    salesSheet(data.sales),
    expensesSheet(data.expenses),
    dailySummarySheet(data.sales, data.expenses),
  ]
}

/** Plantilla vacía con 3 filas de ejemplo para que el dueño la complete */
export function templateSheet(): SheetData {
  return {
    name: 'Inventario',
    columns: INVENTORY_COLUMNS.map((h) => ({
      header: h,
      format: h.startsWith('Precio') ? ('money' as const) : ('text' as const),
    })),
    rows: [
      ['7801234500017', 'Coca-Cola 1.5L', 'Bebidas', 1290, 1990, 24, 'Alta', 'un', ''],
      ['', 'Pan Hallulla', 'Panadería', 1500, 2400, 20, 'Alta', 'kg', ''],
      ['7801234500024', 'Lentejas 1kg', '', 1890, 2690, 6, 'Baja', 'un', 2],
    ],
  }
}
