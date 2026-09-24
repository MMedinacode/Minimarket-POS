// Pruebas con SheetJS real: archivos tal como los generaría Excel u otros programas.
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { buildDemoData } from '../data/mockData'
import { allCategories } from './categories'
import { buildWorkbook, readWorkbookFile } from './excel-io'
import { parseInventoryRows } from './excel-model'

const known = allCategories([])

async function parseFile(file: File) {
  const wb = await readWorkbookFile(file)
  return parseInventoryRows(wb.aoa, known)
}

describe('lectura de archivos', () => {
  it('CSV en UTF-8 con tildes y precios con punto de miles', async () => {
    const csv = [
      'Código,Producto,Categoría,Precio Costo,Precio Venta,Stock,Rotación',
      '0012345678905,Coca-Cola 1.5L,Bebidas,"1.350","2.090",50,Alta',
      ',Pan Amasado,Panadería,1500,2400,"12,5",A',
    ].join('\n')
    const r = await parseFile(new File([csv], 'inv.csv'))
    expect(r.missingColumns).toEqual([])
    expect(r.rows[0].draft).toMatchObject({ barcode: '0012345678905', category: 'Bebidas', cost: 1350, price: 2090, stock: 50, rotation: 'Alta' })
    expect(r.rows[1].draft).toMatchObject({ barcode: '', category: 'Panadería', stock: 13, rotation: 'Alta' })
  })

  it('CSV de Excel chileno (Windows-1252 y punto y coma)', async () => {
    const csv = ['Código;Nombre;Categoría;PrecioCosto;PrecioVenta;Stock;Rotación', '7801;Lentejas Añejas;Abarrotes;$1.890;$2.690;6;Baja'].join('\r\n')
    const bytes = Uint8Array.from(csv, (ch) => ch.charCodeAt(0)) // latin1 = windows-1252 para tildes y ñ
    const r = await parseFile(new File([bytes], 'inv.csv'))
    expect(r.missingColumns).toEqual([])
    expect(r.rows[0].draft).toMatchObject({ barcode: '7801', name: 'Lentejas Añejas', category: 'Abarrotes', cost: 1890, price: 2690, rotation: 'Baja' })
  })

  it('el archivo de ejemplo de public/ se importa sin errores', async () => {
    const { readFileSync } = await import('node:fs')
    const bytes = readFileSync(new URL('../../public/ejemplo-inventario.xlsx', import.meta.url))
    const r = await parseFile(new File([bytes], 'ejemplo-inventario.xlsx'))
    expect(r.rows.length).toBeGreaterThan(60)
    expect(r.rows.every((x) => x.errors.length === 0)).toBe(true)
  })

  it('el .xlsx exportado se reimporta completo (ida y vuelta)', async () => {
    const data = buildDemoData()
    const buffer = XLSX.write(buildWorkbook(data), { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const wb = await readWorkbookFile(new File([buffer], 'respaldo.xlsx'))
    expect(wb.sheetNames).toEqual(['Inventario', 'Ventas', 'Gastos', 'Resumen diario'])
    expect(wb.sheetName).toBe('Inventario')
    const r = parseInventoryRows(wb.aoa, allCategories(data.products.map((p) => p.category)))
    expect(r.rows.filter((x) => x.draft)).toHaveLength(data.products.length)
    const coca = r.rows.find((x) => x.draft?.name === 'Coca-Cola 1.5L')!.draft!
    expect(coca).toMatchObject({ barcode: data.products[0].barcode, price: 1990, cost: 1290, rotation: 'Alta' })
    const pan = r.rows.find((x) => x.draft?.name === 'Pan Hallulla')!.draft!
    expect(pan).toMatchObject({ unit: 'kg', stock: 25.5 })
  })
})
