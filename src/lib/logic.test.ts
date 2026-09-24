import { describe, expect, it } from 'vitest'
import { buildDemoData, buildDemoProducts, DEFAULT_SETTINGS, ean13, SEED_PRODUCTS } from '../data/mockData'
import { reducer } from '../store/reducer'
import type { AppData, Product, Sale } from '../types'
import { dailySeries, marginPct, salesByHour, slowMovers, summarizeDay, topProducts } from './analytics'
import { allCategories, inferCategory, matchCategory } from './categories'
import { applyImport, buildSheets, parseInventoryRows } from './excel-model'
import { buildVelocityMap, getStockInfo } from './stock'
import { dayKey, formatCLP, parseLocaleNumber } from './utils'

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  barcode: '7800000000001',
  name: 'Producto',
  category: 'Abarrotes',
  cost: 500,
  price: 1000,
  stock: 10,
  unit: 'un',
  rotation: 'Media',
  minStock: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

const sale = (over: Partial<Sale> = {}): Sale => ({
  id: 's1',
  number: 1,
  date: new Date().toISOString(),
  items: [{ productId: 'p1', barcode: '', name: 'Producto', category: 'Abarrotes', unit: 'un', qty: 2, unitPrice: 1000, unitCost: 500 }],
  total: 2000,
  cost: 1000,
  payment: 'Efectivo',
  received: 5000,
  change: 3000,
  voided: false,
  ...over,
})

describe('utils', () => {
  it('formatea pesos chilenos', () => {
    expect(formatCLP(1990)).toBe('$1.990')
    expect(formatCLP(1234567)).toBe('$1.234.567')
    expect(formatCLP(-48286)).toBe('-$48.286')
  })
  it('entiende números escritos al estilo chileno', () => {
    expect(parseLocaleNumber('$1.990')).toBe(1990)
    expect(parseLocaleNumber('1.990')).toBe(1990)
    expect(parseLocaleNumber('12.500.000')).toBe(12500000)
    expect(parseLocaleNumber('0,5')).toBe(0.5)
    expect(parseLocaleNumber('1.234,5')).toBe(1234.5)
    expect(parseLocaleNumber('1.5')).toBe(1.5)
    expect(parseLocaleNumber('abc')).toBeNull()
    expect(parseLocaleNumber('')).toBeNull()
  })
})

describe('categorías automáticas', () => {
  it('clasifica bien todos los productos de ejemplo', () => {
    const wrong = SEED_PRODUCTS.filter(([name, cat]) => inferCategory(name).category !== cat).map(
      ([name, cat]) => `${name}: esperaba ${cat}, obtuvo ${inferCategory(name).category}`,
    )
    expect(wrong).toEqual([])
  })
  it('resuelve casos ambiguos por especificidad y posición', () => {
    expect(inferCategory('Papas Fritas Lays 200g').category).toBe('Snacks')
    expect(inferCategory('Papa (kg)').category).toBe('Frutas y Verduras')
    expect(inferCategory('Salsa de Tomate 200g').category).toBe('Abarrotes')
    expect(inferCategory('Té Helado Durazno 1.5L').category).toBe('Bebidas')
    expect(inferCategory('Queso Gauda Laminado').category).toBe('Fiambrería')
    expect(inferCategory('Pañales Babysec G').category).toBe('Higiene Personal')
    expect(inferCategory('Tornillo 3mm').category).toBe('Otros')
  })
  it('normaliza categorías escritas a mano', () => {
    const known = allCategories([])
    expect(matchCategory('lacteos', known)).toBe('Lácteos')
    expect(matchCategory('  BEBIDAS ', known)).toBe('Bebidas')
    expect(matchCategory('mascotas', known)).toBe('Mascotas')
  })
})

describe('stock crítico diferenciado', () => {
  const s = DEFAULT_SETTINGS
  it('usa el umbral según rotación (alta < 10, baja < 2)', () => {
    expect(getStockInfo(product({ rotation: 'Alta', stock: 9 }), s).status).toBe('critico')
    expect(getStockInfo(product({ rotation: 'Alta', stock: 10 }), s).status).toBe('ok')
    expect(getStockInfo(product({ rotation: 'Baja', stock: 2 }), s).status).toBe('ok')
    expect(getStockInfo(product({ rotation: 'Baja', stock: 1 }), s).status).toBe('critico')
    expect(getStockInfo(product({ stock: 0 }), s).status).toBe('agotado')
  })
  it('sube el umbral si el producto se vende más rápido', () => {
    // 8 al día × 2 días de cobertura = alerta bajo 16, aunque la rotación sea baja
    const info = getStockInfo(product({ rotation: 'Baja', stock: 12 }), s, 8)
    expect(info.threshold).toBe(16)
    expect(info.reason).toBe('velocidad')
    expect(info.status).toBe('critico')
    expect(info.daysLeft).toBe(1.5)
  })
  it('respeta el mínimo manual', () => {
    const info = getStockInfo(product({ rotation: 'Alta', stock: 4, minStock: 3 }), s, 20)
    expect(info.threshold).toBe(3)
    expect(info.status).toBe('ok')
  })
  it('calcula la velocidad de venta ignorando ventas anuladas', () => {
    // Ventas de hace 1 hora: si se crean "ahora", pueden quedar 1 ms después de `now`
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
    const v = buildVelocityMap([sale({ date: hourAgo }), sale({ id: 's2', voided: true, date: hourAgo })], new Date(), 14)
    expect(v.get('p1')).toBeCloseTo(2 / 14)
  })
})

describe('reducer', () => {
  const base: AppData = { products: [product()], sales: [], expenses: [], settings: DEFAULT_SETTINGS, isDemo: false }

  it('registrar una venta descuenta stock y asigna correlativo', () => {
    const { number: _n, ...s } = sale()
    const next = reducer(base, { type: 'registerSale', sale: s })
    expect(next.products[0].stock).toBe(8)
    expect(next.sales[0].number).toBe(1)
    const again = reducer(next, { type: 'registerSale', sale: { ...s, id: 's2' } })
    expect(again.sales[1].number).toBe(2)
    expect(again.products[0].stock).toBe(6)
  })
  it('anular una venta devuelve el stock una sola vez', () => {
    const { number: _n, ...s } = sale()
    const sold = reducer(base, { type: 'registerSale', sale: s })
    const voided = reducer(sold, { type: 'voidSale', id: 's1' })
    expect(voided.products[0].stock).toBe(10)
    expect(voided.sales[0].voided).toBe(true)
    expect(reducer(voided, { type: 'voidSale', id: 's1' }).products[0].stock).toBe(10)
  })
  it('no deja stock negativo salvo que se permita', () => {
    const { number: _n, ...s } = sale({ items: [{ ...sale().items[0], qty: 15 }] })
    expect(reducer(base, { type: 'registerSale', sale: s }).products[0].stock).toBe(0)
    const allow = { ...base, settings: { ...DEFAULT_SETTINGS, allowNegativeStock: true } }
    expect(reducer(allow, { type: 'registerSale', sale: s }).products[0].stock).toBe(-5)
  })
  it('ajusta stock: sumar, restar y fijar conteo', () => {
    expect(reducer(base, { type: 'adjustStock', id: 'p1', mode: 'add', qty: 5 }).products[0].stock).toBe(15)
    expect(reducer(base, { type: 'adjustStock', id: 'p1', mode: 'remove', qty: 3 }).products[0].stock).toBe(7)
    expect(reducer(base, { type: 'adjustStock', id: 'p1', mode: 'set', qty: 4 }).products[0].stock).toBe(4)
  })
})

describe('caja y analítica', () => {
  const today = dayKey()
  it('balance del día: ventas − gastos, y efectivo esperado', () => {
    const sales = [sale(), sale({ id: 's2', payment: 'Débito', total: 3000, cost: 1800 }), sale({ id: 's3', voided: true, total: 9999 })]
    const expenses = [
      { id: 'e1', date: new Date().toISOString(), description: 'Luz', category: 'Servicios básicos' as const, amount: 1500, paidFromCash: false },
      { id: 'e2', date: new Date().toISOString(), description: 'Bolsas', category: 'Insumos' as const, amount: 500, paidFromCash: true },
    ]
    const d = summarizeDay(sales, expenses, today)
    expect(d.revenue).toBe(5000)
    expect(d.transactions).toBe(2)
    expect(d.expenses).toBe(2000)
    expect(d.cashNet).toBe(3000)
    expect(d.grossProfit).toBe(2200)
    expect(d.netProfit).toBe(200)
    expect(d.expectedCash).toBe(2000 - 500)
  })
  it('ventas por hora y top productos', () => {
    const at = new Date()
    at.setHours(13, 15, 0, 0)
    const hours = salesByHour([sale({ date: at.toISOString() })], 1, new Date(at.getTime() + 60_000))
    expect(hours.find((h) => h.hour === 13)?.total).toBe(2000)
    const top = topProducts([sale()], new Date(Date.now() - 86_400_000), 'qty')
    expect(top[0]).toMatchObject({ productId: 'p1', qty: 2, revenue: 2000, profit: 1000 })
  })
  it('detecta productos sin ventas recientes', () => {
    const old = new Date(Date.now() - 10 * 86_400_000).toISOString()
    const list = slowMovers([product(), product({ id: 'p2', name: 'Nuevo' })], [sale({ date: old })], 7)
    expect(list.map((m) => m.product.id).sort()).toEqual(['p1', 'p2'])
    expect(list.find((m) => m.product.id === 'p2')?.lastSold).toBeNull()
  })
  it('margen sobre precio de venta', () => {
    expect(marginPct(1290, 1990)).toBeCloseTo(35.18, 1)
  })
})

describe('Excel: importación', () => {
  const known = allCategories([])
  it('acepta títulos con tildes, espacios y alias, y números chilenos', () => {
    const aoa = [
      ['Mi planilla de inventario'],
      [],
      ['Código de Barras', 'Producto', 'Categoría', 'Precio Costo', 'Precio Venta', 'Stock', 'Rotación (Alta/Media/Baja)'],
      [7801234500017, 'Coca-Cola 1.5L', 'bebidas', '$1.290', '$1.990', 24, 'alta'],
      ['', 'Lentejas 1kg', '', 1890, 2690, '6', 'B'],
    ]
    const r = parseInventoryRows(aoa, known)
    expect(r.missingColumns).toEqual([])
    expect(r.headerRow).toBe(3)
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0].draft).toMatchObject({ barcode: '7801234500017', category: 'Bebidas', cost: 1290, price: 1990, stock: 24, rotation: 'Alta' })
    expect(r.rows[1].draft).toMatchObject({ category: 'Abarrotes', rotation: 'Baja', stock: 6 })
    expect(r.rows[1].warnings.join()).toMatch(/automáticamente/)
  })
  it('marca errores y omite filas inválidas', () => {
    const aoa = [
      ['CodigoBarras', 'Nombre', 'PrecioVenta'],
      ['111', 'A', 1000],
      ['111', 'B', 1000],
      ['222', '', 1000],
      ['333', 'C', 'gratis'],
    ]
    const r = parseInventoryRows(aoa, known)
    expect(r.rows.filter((x) => x.draft)).toHaveLength(1)
    expect(r.rows[1].errors[0]).toMatch(/repetido/)
    expect(r.rows[2].errors[0]).toMatch(/nombre/)
    expect(r.rows[3].errors[0]).toMatch(/Precio/)
    expect(r.rows[3].preview).toEqual({ barcode: '333', name: 'C' })
  })
  it('una fila con error no bloquea a otra válida con el mismo código', () => {
    const aoa = [
      ['CodigoBarras', 'Nombre', 'PrecioVenta'],
      ['444', '', 1000],
      ['444', 'Chocolate', 800],
    ]
    const r = parseInventoryRows(aoa, known)
    expect(r.rows[0].errors).toHaveLength(1)
    expect(r.rows[1].errors).toEqual([])
    expect(r.rows[1].draft?.name).toBe('Chocolate')
  })
  it('avisa si faltan columnas obligatorias', () => {
    expect(parseInventoryRows([['Codigo', 'Stock'], ['1', 2]], known).missingColumns).toEqual(['Nombre', 'PrecioVenta'])
  })
  it('combinar actualiza por código y agrega nuevos; reemplazar deja solo el Excel', () => {
    const existing = [product({ id: 'x', barcode: '111', name: 'Viejo', price: 500 })]
    const drafts = [
      { barcode: '111', name: 'Actualizado', category: 'Bebidas', cost: 1, price: 900, stock: 3, unit: 'un' as const, rotation: 'Alta' as const, minStock: null },
      { barcode: '222', name: 'Nuevo', category: 'Bebidas', cost: 1, price: 900, stock: 3, unit: 'un' as const, rotation: 'Alta' as const, minStock: null },
    ]
    const merged = applyImport(existing, drafts, 'merge')
    expect(merged).toMatchObject({ added: 1, updated: 1 })
    expect(merged.products.find((p) => p.barcode === '111')).toMatchObject({ id: 'x', name: 'Actualizado', price: 900 })
    const replaced = applyImport(existing, drafts.slice(1), 'replace')
    expect(replaced.products.map((p) => p.name)).toEqual(['Nuevo'])
  })
  it('el Excel exportado se puede volver a importar sin perder datos', () => {
    const data = buildDemoData()
    const [inventory] = buildSheets(data)
    const aoa = [inventory.columns.map((c) => c.header), ...inventory.rows]
    const r = parseInventoryRows(aoa, allCategories(data.products.map((p) => p.category)))
    expect(r.rows.every((x) => x.errors.length === 0)).toBe(true)
    const byName = new Map(data.products.map((p) => [p.name, p]))
    for (const row of r.rows) {
      const original = byName.get(row.draft!.name)!
      expect(row.draft).toMatchObject({
        barcode: original.barcode,
        category: original.category,
        cost: original.cost,
        price: original.price,
        stock: original.stock,
        unit: original.unit,
        rotation: original.rotation,
      })
    }
  })
})

describe('datos de demostración', () => {
  it('genera códigos EAN-13 válidos y únicos', () => {
    expect(ean13('780999900001')).toHaveLength(13)
    const products = buildDemoProducts()
    const codes = products.map((p) => p.barcode)
    expect(new Set(codes).size).toBe(codes.length)
  })
  it('genera historial de ventas coherente', () => {
    const data = buildDemoData()
    expect(data.sales.length).toBeGreaterThan(300)
    for (const s of data.sales.slice(0, 50)) {
      expect(s.total).toBe(s.items.reduce((a, it) => a + Math.round(it.qty * it.unitPrice), 0))
      if (s.payment === 'Efectivo') expect(s.change).toBe(s.received! - s.total)
    }
    const series = dailySeries(data.sales, data.expenses, 7)
    expect(series).toHaveLength(7)
    expect(series.slice(0, 6).every((d) => d.ventas > 0)).toBe(true)
  })
})
