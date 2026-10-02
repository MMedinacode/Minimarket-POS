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
