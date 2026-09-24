// Códigos de barra EAN-13: validación, códigos internos y dibujo de las barras.
//
// Los códigos que empiezan con 20–29 están reservados por GS1 para uso
// interno de cada tienda, así que nunca chocan con un producto de fábrica.
// Se usan para etiquetar lo que no trae código (típico en bazares).

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
// R = L invertido (0↔1) · G = R al revés
const R = L.map((c) => [...c].map((b) => (b === '0' ? '1' : '0')).join(''))
const G = R.map((c) => [...c].reverse().join(''))
// Qué tabla (L o G) usa cada dígito de la izquierda, según el primer dígito
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

export const INTERNAL_PREFIX = '20'

export function checkDigit(first12: string): number {
  const sum = [...first12].reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0)
  return (10 - (sum % 10)) % 10
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && checkDigit(code.slice(0, 12)) === Number(code[12])
}

export function isInternalCode(code: string): boolean {
  return isValidEan13(code) && code.startsWith(INTERNAL_PREFIX)
}

/** Siguiente código interno libre: 20 + correlativo de 10 dígitos + verificador */
export function nextInternalCode(existing: Iterable<string>): string {
  let max = 0
  const used = new Set<string>()
  for (const c of existing) {
    used.add(c)
    if (isInternalCode(c)) max = Math.max(max, Number(c.slice(2, 12)))
  }
  let n = max + 1
  for (;;) {
    const base = INTERNAL_PREFIX + String(n).padStart(10, '0')
    const code = base + checkDigit(base)
    if (!used.has(code)) return code
    n++
  }
}

/** Genera `count` códigos internos seguidos que no estén en uso */
export function internalCodes(existing: Iterable<string>, count: number): string[] {
  const all = new Set(existing)
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const code = nextInternalCode(all)
    all.add(code)
    out.push(code)
  }
  return out
}

/** Las 95 barras del EAN-13 como texto de 0 y 1 (1 = barra negra) */
export function encodeEan13(code: string): string {
  if (!isValidEan13(code)) throw new Error(`Código EAN-13 inválido: ${code}`)
  const d = [...code].map(Number)
  const parity = PARITY[d[0]]
  let left = ''
  for (let i = 1; i <= 6; i++) left += (parity[i - 1] === 'L' ? L : G)[d[i]]
  let right = ''
  for (let i = 7; i <= 12; i++) right += R[d[i]]
  return `101${left}01010${right}101`
}
