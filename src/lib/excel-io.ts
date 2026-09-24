// Lectura y escritura de archivos .xlsx con SheetJS. Se importa de forma
// diferida (import()) para no cargar la librería hasta que se necesita.
import * as XLSX from 'xlsx'
import type { AppData } from '../types'
import { buildSheets, templateSheet, type SheetData } from './excel-model'
import { dayKey, formatTime } from './utils'

const FORMATS: Record<string, string | undefined> = {
  money: '"$"#,##0',
  pct: '0.0"%"',
  qty: '#,##0.###',
  number: '0',
}

/** Convierte nuestro SheetData en una hoja de SheetJS con anchos y formatos */
function toWorksheet(sheet: SheetData): XLSX.WorkSheet {
  const aoa = [sheet.columns.map((c) => c.header), ...sheet.rows]
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  sheet.columns.forEach((col, c) => {
    const z = FORMATS[col.format]
    if (!z) return
    for (let r = 1; r <= sheet.rows.length; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (cell && cell.t === 'n') cell.z = z
    }
  })

  ws['!cols'] = sheet.columns.map((col, c) => {
    let width = col.header.length
    for (const row of sheet.rows) width = Math.max(width, String(row[c] ?? '').length)
    return { wch: Math.min(45, width + 3) }
  })
  if (sheet.rows.length) {
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sheet.rows.length, c: sheet.columns.length - 1 } }) }
  }
  return ws
}

/** Libro completo: inventario + ventas + gastos + resumen diario */
export function buildWorkbook(data: AppData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  for (const sheet of buildSheets(data)) XLSX.utils.book_append_sheet(wb, toWorksheet(sheet), sheet.name)
  return wb
}

/** Descarga el Excel completo y devuelve el nombre del archivo */
export function exportWorkbook(data: AppData): string {
  const now = new Date()
  const filename = `minimarket_${dayKey(now)}_${formatTime(now).replace(':', '')}.xlsx`
  XLSX.writeFile(buildWorkbook(data), filename, { compression: true })
  return filename
}

export function downloadTemplate() {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, toWorksheet(templateSheet()), 'Inventario')
  XLSX.writeFile(wb, 'plantilla_inventario.xlsx', { compression: true })
}

export interface WorkbookRead {
  sheetName: string
  sheetNames: string[]
  aoa: unknown[][]
}

/**
 * Los CSV no dicen en qué codificación vienen: Excel en Chile los guarda en
 * Windows-1252 ("Código" se rompería) y otros programas en UTF-8. Se prueba
 * UTF-8 estricto y si falla se usa Windows-1252.
 */
function decodeText(buffer: ArrayBuffer): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    text = new TextDecoder('windows-1252').decode(buffer)
  }
  return text.replace(/^﻿/, '')
}

/**
 * Lee un .xlsx/.xls/.csv y devuelve la hoja de inventario como arreglo de filas.
 * Prefiere una hoja llamada "Inventario"; si no existe, usa la primera.
 */
export async function readWorkbookFile(file: File): Promise<WorkbookRead> {
  const buffer = await file.arrayBuffer()
  const isText = /\.(csv|tsv|txt)$/i.test(file.name)
  // En CSV se leen los valores como texto (raw): así "1.350" se interpreta
  // como mil trescientos cincuenta pesos y no como 1,35 (formato de EE.UU.),
  // y los códigos de barra conservan sus ceros a la izquierda.
  const wb = isText
    ? XLSX.read(decodeText(buffer), { type: 'string', raw: true, dense: true })
    : XLSX.read(buffer, { type: 'array', dense: true })
  const sheetName = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'inventario') ?? wb.SheetNames[0]
  if (!sheetName) throw new Error('El archivo no tiene hojas')
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: '', blankrows: false })
  return { sheetName, sheetNames: wb.SheetNames, aoa }
}
