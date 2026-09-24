// Genera public/ejemplo-inventario.xlsx con los productos de demostración.
// Uso: node scripts/generar-ejemplo.mjs   (Node 22.18+ lee el .ts directamente)
import * as fs from 'node:fs'
import * as XLSX from 'xlsx'
import { buildDemoProducts } from '../src/data/mockData.ts'

XLSX.set_fs(fs)

const header = ['CodigoBarras', 'Nombre', 'Categoria', 'PrecioCosto', 'PrecioVenta', 'Stock', 'Rotacion', 'Unidad', 'StockMinimo']
const rows = buildDemoProducts().map((p) => [p.barcode, p.name, p.category, p.cost, p.price, p.stock, p.rotation, p.unit, ''])
const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
ws['!cols'] = header.map((h, i) => ({ wch: Math.max(h.length, ...rows.map((r) => String(r[i]).length)) + 2 }))
// Formato peso chileno en las columnas de precio
for (let r = 1; r <= rows.length; r++) for (const c of [3, 4]) ws[XLSX.utils.encode_cell({ r, c })].z = '"$"#,##0'

const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
XLSX.writeFile(wb, 'public/ejemplo-inventario.xlsx', { compression: true })
console.log(`OK: public/ejemplo-inventario.xlsx (${rows.length} productos)`)
