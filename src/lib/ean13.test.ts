import { describe, expect, it } from 'vitest'
// Librería independiente, usada SOLO para comprobar que nuestras barras son correctas
import JsBarcodeEAN13 from 'jsbarcode/bin/barcodes/EAN_UPC/EAN13.js'
import { checkDigit, encodeEan13, internalCodes, isInternalCode, isValidEan13, nextInternalCode } from './ean13'

const reference = (code: string): string => {
  const Ctor = (JsBarcodeEAN13 as unknown as { default?: unknown }).default ?? JsBarcodeEAN13
  return new (Ctor as new (c: string, o: object) => { encode(): { data: string } })(code, { flat: true }).encode().data
}

describe('EAN-13', () => {
  it('calcula el dígito verificador', () => {
    expect(checkDigit('590123412345')).toBe(7)
    expect(isValidEan13('5901234123457')).toBe(true)
    expect(isValidEan13('5901234123458')).toBe(false)
    expect(isValidEan13('123')).toBe(false)
  })

  it('dibuja las mismas barras que una librería de referencia', () => {
    const codes = ['5901234123457', '7801234500013', '0012345678905', ...internalCodes([], 5)]
    for (let first = 0; first <= 9; first++) {
      const base = `${first}23456789012`
      codes.push(base + checkDigit(base)) // cubre las 10 tablas de paridad
    }
    for (const code of codes) {
      const bars = encodeEan13(code)
      expect(bars).toHaveLength(95)
      expect(bars).toBe(reference(code))
    }
  })

  it('genera códigos internos (prefijo 20) sin repetir', () => {
    const first = nextInternalCode(['7801234500013'])
    expect(first).toBe('2000000000015')
    expect(isInternalCode(first)).toBe(true)
    expect(nextInternalCode([first])).toBe('2000000000022')
    const batch = internalCodes([first], 3)
    expect(new Set(batch).size).toBe(3)
    expect(batch).not.toContain(first)
    expect(batch.every(isValidEan13)).toBe(true)
  })
})
