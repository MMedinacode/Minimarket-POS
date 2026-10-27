import { describe, expect, it } from 'vitest'
import { drawerDifference } from './analytics'
import { raisePrices } from './prices'
import type { Product } from '../types'

const prod = (id: string, price: number) => ({ id, name: id, price }) as Product

describe('subir precios', () => {
  it('sube el porcentaje y redondea hacia arriba', () => {
    const r = raisePrices([prod('a', 1990), prod('b', 1000), prod('c', 450)], 10, 10)
    expect(r.map((c) => c.after)).toEqual([2190, 1100, 500])
  })

  it('redondea a $50 y $100', () => {
    expect(raisePrices([prod('a', 1990)], 10, 50)[0].after).toBe(2200)
    expect(raisePrices([prod('a', 1230)], 5, 100)[0].after).toBe(1300)
  })

  it('no hace nada con porcentaje 0 o inválido', () => {
    expect(raisePrices([prod('a', 1990)], 0, 10)).toEqual([])
    expect(raisePrices([prod('a', 1990)], Number.NaN, 10)).toEqual([])
  })
})

describe('contar el cajón', () => {
  it('justo, sobra y falta', () => {
    // Partió con $20.000, vendió $50.000 en efectivo menos $5.000 de gastos → deberían haber $65.000
    expect(drawerDifference(65_000, 20_000, 45_000)).toBe(0)
    expect(drawerDifference(66_000, 20_000, 45_000)).toBe(1_000)
    expect(drawerDifference(60_000, 20_000, 45_000)).toBe(-5_000)
  })
})

describe('resumen del día por WhatsApp', () => {
  it('trae lo vendido, los gastos, el cajón y lo que más se vendió', async () => {
    const { daySummaryText } = await import('./analytics')
    const item = (name: string, qty: number, unitPrice: number, unit: 'un' | 'kg' = 'un') =>
      ({ productId: name, barcode: '', name, category: 'x', unit, qty, unitPrice, unitCost: 0 })
    const venta = (id: string, hora: string, items: ReturnType<typeof item>[], payment: 'Efectivo' | 'Tarjeta', voided = false) => ({
      id, number: 1, date: new Date(`2026-10-27T${hora}:00`).toISOString(), items, payment, voided, received: null, change: null,
      total: items.reduce((t, i) => t + Math.round(i.qty * i.unitPrice), 0), cost: 0,
    })
    const sales = [
      venta('a', '09:00', [item('Pan', 1.5, 2000, 'kg'), item('Leche', 2, 1100)], 'Efectivo'),
      venta('b', '10:00', [item('Coca-Cola', 1, 2500)], 'Tarjeta'),
      venta('c', '11:00', [item('Cigarros', 1, 5000)], 'Efectivo', true), // anulada: no cuenta
      venta('d', '12:00', [item('Ayer', 1, 9999)], 'Efectivo'),
    ]
    sales[3].date = new Date('2026-10-26T12:00:00').toISOString()
    const expenses = [{ id: 'g', date: new Date('2026-10-27T13:00:00').toISOString(), description: 'Hielo', category: 'Otros', amount: 1000, paidFromCash: true }]
    const text = daySummaryText(sales as never, expenses as never, '2026-10-27', 'Almacén Rosita')
    expect(text).toContain('🛒 Almacén Rosita')
    expect(text).toContain('Vendiste: $7.700 (2 ventas)')
    expect(text).toContain('Efectivo $5.200 · Tarjeta $2.500')
    expect(text).toContain('Gastaste: $1.000')
    expect(text).toContain('En el cajón debería haber: $4.200')
    expect(text).toContain('• Pan: 1,5 kg ($3.000)')
    expect(text).not.toContain('Cigarros')
    expect(text).not.toContain('Ayer')
  })
})
