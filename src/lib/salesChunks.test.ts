import { describe, expect, it } from 'vitest'
import type { Sale } from '../types'
import { groupByMonth, joinMonths, monthOf, SalesChunks } from './salesChunks'

const venta = (id: string, date: string) => ({ id, date, items: [], total: 1000 }) as unknown as Sale

describe('ventas guardadas por mes', () => {
  it('agrupa por mes y manda las fechas raras a un grupo aparte (no se pierden)', () => {
    expect(monthOf(venta('a', '2026-10-27T15:00:00.000Z'))).toBe('2026-10')
    expect(monthOf(venta('b', ''))).toBe('otras')
    const g = groupByMonth([venta('a', '2026-09-30T10:00:00Z'), venta('b', '2026-10-01T10:00:00Z'), venta('c', '2026-10-02T10:00:00Z')])
    expect([...g.keys()]).toEqual(['2026-09', '2026-10'])
    expect(g.get('2026-10')!.map((s) => s.id)).toEqual(['b', 'c'])
  })

  it('la primera vez escribe todos los meses y la lista; después, solo el mes que cambió', () => {
    const chunks = new SalesChunks('sales')
    const sep = venta('a', '2026-09-15T10:00:00Z')
    const oct = venta('b', '2026-10-15T10:00:00Z')
    const first = chunks.plan([sep, oct])
    expect(first.put.map(([k]) => k)).toEqual(['sales@2026-09', 'sales@2026-10', 'sales@meses'])
    first.commit()

    // Venta nueva en octubre: septiembre no se toca
    const nueva = venta('c', '2026-10-27T10:00:00Z')
    const second = chunks.plan([sep, oct, nueva])
    expect(second.put.map(([k]) => k)).toEqual(['sales@2026-10'])
    expect(second.remove).toEqual([])
    second.commit()

    // Sin cambios: nada que escribir
    expect(chunks.plan([sep, oct, nueva]).put).toEqual([])

    // Anular una venta de septiembre crea un objeto nuevo: solo se reescribe septiembre
    const anulada = { ...sep, voided: true }
    expect(chunks.plan([anulada, oct, nueva]).put.map(([k]) => k)).toEqual(['sales@2026-09'])
  })

  it('si no se confirma el guardado, la próxima vez lo intenta de nuevo', () => {
    const chunks = new SalesChunks('sales')
    const s = [venta('a', '2026-10-01T10:00:00Z')]
    chunks.plan(s) // falló: no se llamó commit
    expect(chunks.plan(s).put.length).toBe(2)
  })

  it('"Borrar todo" quita los meses que quedaron vacíos y deja la lista vacía', () => {
    const chunks = new SalesChunks('sales')
    chunks.plan([venta('a', '2026-09-01T10:00:00Z'), venta('b', '2026-10-01T10:00:00Z')]).commit()
    const wipe = chunks.plan([])
    expect(wipe.remove).toEqual(['sales@2026-09', 'sales@2026-10'])
    expect(wipe.put).toEqual([['sales@meses', []]])
  })

  it('al abrir junta los meses en orden y avisa si falta alguno', () => {
    const data: Record<string, Sale[]> = { '2026-09': [venta('a', '2026-09-01T10:00:00Z')], '2026-10': [venta('b', '2026-10-01T10:00:00Z')] }
    const ok = joinMonths(['2026-10', '2026-09'], (m) => data[m])
    expect(ok.sales.map((s) => s.id)).toEqual(['a', 'b'])
    expect(ok.missing).toEqual([])
    expect(joinMonths(['2026-09', '2026-11'], (m) => data[m]).missing).toEqual(['2026-11'])
  })

  it('lo leído al abrir no se vuelve a escribir', () => {
    const chunks = new SalesChunks('sales')
    const s = [venta('a', '2026-10-01T10:00:00Z')]
    chunks.remember(groupByMonth(s))
    expect(chunks.plan(s).put).toEqual([])
  })
})
