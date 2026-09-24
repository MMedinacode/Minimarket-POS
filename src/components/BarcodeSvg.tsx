import { encodeEan13, isValidEan13 } from '../lib/ean13'

/**
 * Dibuja un código EAN-13 como SVG (se ve nítido en pantalla y al imprimir).
 * Unidades del viewBox = "módulos" (el ancho de la barra más delgada).
 */
export function BarcodeSvg({ code, className }: { code: string; className?: string }) {
  if (!isValidEan13(code)) return null
  const bars = encodeEan13(code)
  const QUIET = 9 // margen en blanco que necesitan los lectores
  const H = 46
  const GUARD = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94])
  const rects: { x: number; w: number; guard: boolean }[] = []
  for (let i = 0; i < bars.length; ) {
    if (bars[i] === '1') {
      let w = 1
      while (bars[i + w] === '1') w++
      rects.push({ x: i, w, guard: GUARD.has(i) })
      i += w
    } else i++
  }
  return (
    <svg viewBox={`0 0 ${95 + QUIET * 2} ${H + 11}`} className={className} role="img" aria-label={`Código de barras ${code}`}>
      <rect width="100%" height="100%" fill="#fff" />
      {rects.map((r) => (
        <rect key={r.x} x={QUIET + r.x} y={0} width={r.w} height={r.guard ? H + 5 : H} fill="#000" />
      ))}
      <g fontFamily="ui-monospace, Menlo, Consolas, monospace" fontSize="9" fill="#000" textAnchor="middle">
        <text x={QUIET - 4} y={H + 9}>
          {code[0]}
        </text>
        <text x={QUIET + 24} y={H + 9} letterSpacing="1.6">
          {code.slice(1, 7)}
        </text>
        <text x={QUIET + 71} y={H + 9} letterSpacing="1.6">
          {code.slice(7)}
        </text>
      </g>
    </svg>
  )
}
