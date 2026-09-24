import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Unit } from '../types'

/** Une clases de Tailwind resolviendo conflictos (ej: "p-2" + "p-4" = "p-4") */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ---------- Números y moneda ----------

const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const intFmt = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })
const decFmt = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 })
const pctFmt = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 })

/** 1990 → "$1.990" · -500 → "-$500" (Intl daría "$-500") */
export function formatCLP(n: number): string {
  const v = Math.round(Number.isFinite(n) ? n : 0)
  return v < 0 ? `-${clp.format(-v)}` : clp.format(v)
}

/** Versión compacta para ejes de gráficos: 125000 → "$125 mil" */
export function formatCLPShort(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${pctFmt.format(abs / 1_000_000)} M`
  if (abs >= 1_000) return `${sign}$${intFmt.format(Math.round(abs / 1_000))} mil`
  return formatCLP(n)
}

export function formatInt(n: number): string {
  return intFmt.format(n)
}

export function formatPct(n: number): string {
  return `${pctFmt.format(Number.isFinite(n) ? n : 0)}%`
}

/** Cantidad según unidad: 3 → "3" · 0.25 kg → "0,25 kg" */
export function formatQty(qty: number, unit: Unit): string {
  return unit === 'kg' ? `${decFmt.format(qty)} kg` : intFmt.format(qty)
}

/** Redondea cantidades: unidades enteras, kilos a 3 decimales */
export function roundQty(qty: number, unit: Unit): number {
  return unit === 'kg' ? Math.round(qty * 1000) / 1000 : Math.round(qty)
}

/**
 * Convierte texto escrito a mano o venido de Excel en número.
 * Acepta "$1.990", "1.990", "1990", "0,5", "1.234,5" (formato chileno).
 */
export function parseLocaleNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value === null || value === undefined) return null
  let s = String(value).trim().replace(/[$\s]/g, '').replace(/clp/i, '')
  if (!s) return null
  const hasDot = s.includes('.')
  const hasComma = s.includes(',')
  if (hasDot && hasComma) {
    // 1.234,5 → punto de miles y coma decimal
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (hasComma) {
    s = s.replace(',', '.')
  } else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // 1.990 o 12.500.000 → son puntos de miles
    s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// ---------- Texto ----------

/** Minúsculas y sin tildes: "Lácteos" → "lacteos" */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

// ---------- IDs ----------

/** ID único. randomUUID no existe en http:// (ej: probar desde el celular por IP local) */
export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`
}

// ---------- Fechas (siempre en hora local del negocio) ----------

const pad = (n: number) => String(n).padStart(2, '0')

/** Clave de día local "2026-09-23" */
export function dayKey(d: Date | string | number = new Date()): string {
  const x = new Date(d)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}

/** "2026-09-23" → Date a medianoche local */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function startOfDay(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function formatTime(iso: string | Date): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "23-09-2026" */
export function formatDate(iso: string | Date): string {
  const d = new Date(iso)
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`
}

const longDate = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
const shortDay = new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: 'numeric' })

/** "martes, 23 de septiembre" */
export function formatDateLong(d: Date | string): string {
  const s = longDate.format(new Date(d))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "mar 23" */
export function formatDayShort(d: Date | string): string {
  return shortDay.format(new Date(d)).replace('.', '')
}

/** Descarga un Blob como archivo */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
