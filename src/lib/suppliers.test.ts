import { describe, expect, it } from 'vitest'
import { normalizeSettings } from '../data/mockData'
import type { Product, Sale } from '../types'
import { periodTotals, salesByCategory, salesByPayment, salesBySupplier, salesByWeekday, soldWithoutCost } from './analytics'
import { applyImport, parseInventoryRows } from './excel-model'
import { cleanSupplier, formatPhone, listSuppliers, matchSupplier, normalizePhone, orderText, supplierKey, whatsappLink } from './suppliers'

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  barcode: '',
  name: 'Producto',
  category: 'Bebidas',
  cost: 500,
  price: 1000,
  stock: 10,
  unit: 'un',
  rotation: 'Media',
  minStock: null,
  warnStock: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

const sale = (over: Partial<Sale> & { productId?: string; category?: string } = {}): Sale => {
  const { productId = 'p1', category = 'Bebidas', ...rest } = over
  const total = rest.total ?? 1000
  return {
    id: Math.random().toString(36),
    number: 1,
    date: '2026-11-04T12:00:00.000Z',
    items: [{ productId, barcode: '', name: 'Producto', category, unit: 'un', qty: 1, unitPrice: total, unitCost: 500, deducted: 1 }],
    total,
    cost: 500,
    payment: 'Efectivo',
    received: null,
    change: null,
    voided: false,
    ...rest,
  }
}

const from = new Date('2026-11-01T00:00:00.000Z')
const to = new Date('2026-11-30T00:00:00.000Z')

describe('proveedores', () => {
  it('"CCU", "ccu" y " Ccu " son el mismo; gana la escritura más usada', () => {
    const list = listSuppliers([{ supplier: 'CCU' }, { supplier: ' ccu ' }, { supplier: 'CCU' }, { supplier: '' }, {}])
    expect(list).toEqual([{ key: 'ccu', name: 'CCU', count: 3 }])
    expect(matchSupplier('  ccu', list)).toBe('CCU')
    expect(matchSupplier('Panadería  Luis', list)).toBe('Panadería Luis')
    expect(supplierKey('Panadería')).toBe(supplierKey('panaderia'))
    expect(cleanSupplier('  a   b ')).toBe('a b')
  })

  it('entiende los celulares chilenos como se suelen escribir', () => {
    expect(normalizePhone('+56 9 1234 5678')).toBe('56912345678')
    expect(normalizePhone('9 1234 5678')).toBe('56912345678')
    expect(normalizePhone('12345678')).toBe('56912345678')
    expect(normalizePhone('0056912345678')).toBe('56912345678')
    expect(normalizePhone('1234')).toBeNull()
    expect(formatPhone('56912345678')).toBe('+56 9 1234 5678')
  })

  it('el mensaje para un proveedor lleva solo saludo, productos y gracias', () => {
    const text = orderText(
      [{ p: { name: 'Bilz 1.5L', category: 'Bebidas', unit: 'un', supplier: 'CCU' }, n: 12 }],
      { businessName: 'Don Pepe', supplier: 'CCU', date: new Date(2026, 10, 4) },
    )
    expect(text).toBe('Hola, soy de Don Pepe. Quiero hacer este pedido (04-11-2026):\n\n• Bilz 1.5L: 12 un\n\nMuchas gracias.')
  })

  it('con todos, separa por proveedor y deja "Sin proveedor" al final', () => {
    const text = orderText(
      [
        { p: { name: 'Lentejas', category: 'Abarrotes', unit: 'un' }, n: 2 },
        { p: { name: 'Bilz', category: 'Bebidas', unit: 'un', supplier: 'CCU' }, n: 6 },
        { p: { name: 'Hallulla', category: 'Panadería', unit: 'kg', supplier: 'Panadería' }, n: 5 },
      ],
      { businessName: 'Don Pepe', date: new Date(2026, 10, 4) },
    )
    expect(text.indexOf('*CCU*')).toBeLessThan(text.indexOf('*Panadería*'))
    expect(text.indexOf('*Panadería*')).toBeLessThan(text.indexOf('*Sin proveedor*'))
  })

  it('sin proveedores anotados, el pedido sigue separado por categoría', () => {
    const text = orderText([{ p: { name: 'Bilz', category: 'Bebidas', unit: 'un' }, n: 6 }], { businessName: 'Don Pepe' })
    expect(text).toContain('*Bebidas*')
    expect(text).not.toContain('Sin proveedor')
  })

  it('un pedido normal va dentro del link de WhatsApp; uno enorme no', () => {
    const corto = whatsappLink('Hola, quiero 2 cajas', '56912345678')
    expect(corto.fits).toBe(true)
    expect(corto.url).toBe('https://wa.me/56912345678?text=Hola%2C%20quiero%202%20cajas')

    const enorme = whatsappLink('• Aceite de maravilla: 12 un\n'.repeat(300), '56912345678')
    expect(enorme).toEqual({ url: 'https://wa.me/56912345678', fits: false })
  })

  it('los teléfonos guardados en ajustes sobreviven a normalizar; los ajustes antiguos parten vacíos', () => {
    expect(normalizeSettings({ supplierPhones: { ccu: '56912345678' } }).supplierPhones).toEqual({ ccu: '56912345678' })
    expect(normalizeSettings({}).supplierPhones).toEqual({})
  })
})

describe('Excel: columna Proveedor', () => {
  const header = ['Nombre', 'PrecioVenta', 'Proveedor']

  it('se lee y queda en el producto nuevo', () => {
    const { rows } = parseInventoryRows([header, ['Bilz', 1590, ' CCU ']], [])
    const { products } = applyImport([], [rows[0].draft!], 'merge')
    expect(products[0].supplier).toBe('CCU')
  })

  it('si la celda o la columna no viene, no borra el proveedor que ya tenía', () => {
    const existing = [product({ name: 'Bilz', supplier: 'CCU' })]
    const conCeldaVacia = parseInventoryRows([header, ['Bilz', 1590, '']], [])
    expect(applyImport(existing, [conCeldaVacia.rows[0].draft!], 'merge').products[0].supplier).toBe('CCU')
    const sinColumna = parseInventoryRows([['Nombre', 'PrecioVenta'], ['Bilz', 1590]], [])
    expect(applyImport(existing, [sinColumna.rows[0].draft!], 'merge').products[0].supplier).toBe('CCU')
  })
})

describe('reportes por período', () => {
  it('suma solo lo del período y no cuenta las anuladas', () => {
    const sales = [sale({ total: 1000 }), sale({ total: 500, voided: true }), sale({ total: 700, date: '2026-10-01T12:00:00.000Z' })]
    expect(periodTotals(sales, [], from, to)).toMatchObject({ ventas: 1000, ganancia: 500, transacciones: 1, diasConVentas: 1 })
  })

  it('ventas por categoría con su %, de mayor a menor', () => {
    const rows = salesByCategory([sale({ total: 3000 }), sale({ total: 1000, category: 'Panadería' })], from, to)
    expect(rows.map((r) => [r.name, r.total, r.pct])).toEqual([
      ['Bebidas', 3000, 75],
      ['Panadería', 1000, 25],
    ])
  })

  it('lo que no cabe se junta en "Otros"', () => {
    const sales = ['A', 'B', 'C', 'D'].map((category, i) => sale({ category, total: 4000 - i * 1000 }))
    const rows = salesByCategory(sales, from, to, 3)
    expect(rows.map((r) => r.name)).toEqual(['A', 'B', 'Otros'])
    expect(rows[2].total).toBe(3000)
  })

  it('si ya hay una categoría "Otros", lo que sobra se suma a ella', () => {
    const sales = ['A', 'Otros', 'C', 'D'].map((category, i) => sale({ category, total: 4000 - i * 1000 }))
    const rows = salesByCategory(sales, from, to, 3)
    expect(rows.map((r) => [r.name, r.total])).toEqual([
      ['A', 4000],
      ['Otros', 6000],
    ])
  })

  it('ventas por proveedor; un monto suelto o sin proveedor va a "Sin proveedor"', () => {
    const products = [product({ id: 'a', supplier: 'CCU' }), product({ id: 'b', supplier: ' CCU ' }), product({ id: 'c' })]
    const sales = [sale({ productId: 'a', total: 1000 }), sale({ productId: 'b', total: 1000 }), sale({ productId: 'c', total: 500 }), sale({ productId: 'suelto', total: 500 })]
    expect(salesBySupplier(sales, products, from, to).map((r) => [r.name, r.total])).toEqual([
      ['CCU', 2000],
      ['Sin proveedor', 1000],
    ])
  })

  it('cuenta los productos vendidos sin costo anotado (la ganancia sale más alta de lo real)', () => {
    const sinCosto = (productId: string) => {
      const s = sale({ productId })
      return { ...s, items: s.items.map((i) => ({ ...i, unitCost: 0 })) }
    }
    const sales = [sinCosto('a'), sinCosto('a'), sinCosto('b'), sale({ productId: 'c' }), { ...sinCosto('d'), voided: true }]
    expect(soldWithoutCost(sales, from, to)).toBe(2)
    expect(soldWithoutCost([sale()], from, to)).toBe(0)
  })

  it('débito y crédito de ventas antiguas cuentan como Tarjeta', () => {
    const rows = salesByPayment([sale({ payment: 'Débito' }), sale({ payment: 'Crédito' }), sale({ payment: 'Efectivo' })], from, to)
    expect(rows.map((r) => [r.name, r.total])).toEqual([
      ['Tarjeta', 2000],
      ['Efectivo', 1000],
    ])
  })

  it('el promedio por día de la semana divide por las veces que ese día aparece en el período', () => {
    // Dos miércoles en 14 días (4 y 28 de octubre no caben; 21 y 28 sí)
    const sales = [sale({ date: '2026-10-28T15:00:00.000Z', total: 3000 }), sale({ date: '2026-10-21T15:00:00.000Z', total: 1000 })]
    const week = salesByWeekday(sales, 14, '2026-11-02')
    expect(week.map((d) => d.label)).toEqual(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'])
    expect(week[2].total).toBe(2000)
  })
})
