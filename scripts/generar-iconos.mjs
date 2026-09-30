// Genera los íconos PNG de la app (los que usan Android e iPhone al "Agregar a pantalla de inicio")
// a partir del mismo dibujo de public/favicon.svg: fondo verde y un código de barras blanco.
// Uso: npm run iconos   (sin librerías: dibuja los rectángulos y escribe el PNG a mano)
import { writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'

const GREEN = [0x04, 0x78, 0x57]
// Barras del favicon, en un lienzo de 64×64: [x, ancho]; todas van de y=16 a y=48
const BARS = [[14, 4], [21, 2], [26, 5], [34, 2], [39, 3], [45, 5]]

/** ¿El punto (x, y) cae dentro del rectángulo redondeado? */
function inRoundRect(x, y, rx, ry, w, h, r) {
  if (x < rx || y < ry || x > rx + w || y > ry + h) return false
  const cx = Math.min(Math.max(x, rx + r), rx + w - r)
  const cy = Math.min(Math.max(y, ry + r), ry + h - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

/**
 * Dibuja el ícono de `size` px. `fullBleed` = fondo hasta las esquinas (iPhone y "maskable"
 * de Android, que recortan la forma solos); si no, esquinas redondeadas y transparentes.
 */
function render(size, fullBleed) {
  const S = 4 // 4×4 muestras por píxel para que los bordes no se vean dentados
  const px = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let pxl = 0; pxl < size; pxl++) {
      let bg = 0
      let bar = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = ((pxl + (sx + 0.5) / S) / size) * 64
          const y = ((py + (sy + 0.5) / S) / size) * 64
          if (!(fullBleed || inRoundRect(x, y, 0, 0, 64, 64, 14))) continue
          bg++
          if (BARS.some(([bx, bw]) => inRoundRect(x, y, bx, 16, bw, 32, 1))) bar++
        }
      }
      const total = S * S
      const white = bg ? bar / bg : 0
      const i = (py * size + pxl) * 4
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(GREEN[c] + (255 - GREEN[c]) * white)
      px[i + 3] = Math.round((bg / total) * 255)
    }
  }
  return encodePng(size, px)
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 6 // RGBA
  const rows = []
  for (let y = 0; y < size; y++) rows.push(Buffer.from([0]), rgba.subarray(y * size * 4, (y + 1) * size * 4))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const files = {
  'public/icon-192.png': render(192, false),
  'public/icon-512.png': render(512, false),
  'public/icon-maskable-512.png': render(512, true),
  'public/apple-touch-icon.png': render(180, true),
}
for (const [path, png] of Object.entries(files)) {
  writeFileSync(path, png)
  console.log(`✓ ${path} (${(png.length / 1024).toFixed(1)} KB)`)
}
