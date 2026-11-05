// Proveedores: quién trae cada producto y el mensaje de pedido para cada uno.
import type { Product } from '../types'
import { formatDate, formatQty, normalizeText } from './utils'

/** Nombre del grupo de productos que aún no tienen proveedor */
export const NO_SUPPLIER = 'Sin proveedor'

/** Quita espacios de más: " ccu  chile " → "ccu chile" */
export function cleanSupplier(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

/** Clave para comparar nombres: "CCU", "ccu" y " Ccu " son el mismo proveedor */
export function supplierKey(name: string | undefined): string {
  return normalizeText(cleanSupplier(name ?? ''))
}

export interface SupplierInfo {
  key: string
  name: string
  /** Cuántos productos trae */
  count: number
}

/** Proveedores anotados en los productos, ordenados por nombre. Con varias escrituras, gana la más usada. */
export function listSuppliers(products: Pick<Product, 'supplier'>[]): SupplierInfo[] {
  const spellings = new Map<string, Map<string, number>>()
  for (const p of products) {
    const name = cleanSupplier(p.supplier ?? '')
    if (!name) continue
    const key = supplierKey(name)
    const names = spellings.get(key) ?? new Map<string, number>()
    names.set(name, (names.get(name) ?? 0) + 1)
    spellings.set(key, names)
  }
  return [...spellings.entries()]
    .map(([key, names]) => {
      const sorted = [...names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
      return { key, name: sorted[0][0], count: sorted.reduce((a, [, n]) => a + n, 0) }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

/**
 * Tope prudente para el link de WhatsApp: el texto va dentro de la dirección y un link enorme
 * puede no abrir. Con esto cabe sin problemas el pedido normal a un proveedor (unos 100 productos).
 */
const MAX_WHATSAPP_LINK = 4000

/** Link para abrir WhatsApp con el mensaje escrito. Si no cabe (`fits: false`), el link va sin el texto */
export function whatsappLink(text: string, phone?: string): { url: string; fits: boolean } {
  const base = `https://wa.me/${phone ?? ''}`
  const url = `${base}?text=${encodeURIComponent(text)}`
  return url.length <= MAX_WHATSAPP_LINK ? { url, fits: true } : { url: base, fits: false }
}

/** Si ya existe ese proveedor con otra escritura ("ccu" y "CCU"), se usa la que ya estaba */
export function matchSupplier(name: string, known: SupplierInfo[]): string {
  const clean = cleanSupplier(name)
  return known.find((s) => s.key === supplierKey(clean))?.name ?? clean
}

/**
 * Deja un teléfono chileno como lo pide WhatsApp (56 + 9 + 8 dígitos).
 * Acepta "+56 9 1234 5678", "912345678" y "12345678". null si no parece un celular.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^00/, '')
  if (/^569\d{8}$/.test(digits)) return digits
  if (/^9\d{8}$/.test(digits)) return `56${digits}`
  if (/^\d{8}$/.test(digits)) return `569${digits}`
  return null
}

/** +56 9 1234 5678 */
export function formatPhone(phone: string): string {
  return /^569\d{8}$/.test(phone) ? `+56 9 ${phone.slice(3, 7)} ${phone.slice(7)}` : `+${phone}`
}

export interface OrderLine {
  p: Pick<Product, 'name' | 'category' | 'unit' | 'supplier'>
  n: number
}

const itemLine = ({ p, n }: OrderLine) => `• ${p.name}: ${formatQty(n, p.unit)}${p.unit === 'un' ? ' un' : ''}`

/** Grupos en orden alfabético, con "Sin proveedor" al final */
function groupLines(lines: OrderLine[], label: (l: OrderLine) => string): [string, OrderLine[]][] {
  const groups = new Map<string, OrderLine[]>()
  for (const l of lines) {
    const k = label(l)
    groups.set(k, [...(groups.get(k) ?? []), l])
  }
  return [...groups.entries()].sort(
    ([a], [b]) => Number(a === NO_SUPPLIER) - Number(b === NO_SUPPLIER) || a.localeCompare(b, 'es'),
  )
}

/**
 * Texto del pedido.
 * - Para un proveedor: mensaje listo para mandárselo, solo con lo que él trae.
 * - Con todos: lista para el dueño, separada por proveedor (o por categoría si no hay proveedores).
 */
export function orderText(lines: OrderLine[], opts: { businessName: string; supplier?: string; date?: Date }): string {
  const date = formatDate(opts.date ?? new Date())
  const out: string[] = []
  const pushGroups = (groups: [string, OrderLine[]][]) => {
    groups.forEach(([title, list], i) => {
      if (i > 0) out.push('')
      out.push(`*${title}*`, ...list.map(itemLine))
    })
  }

  if (opts.supplier) {
    out.push(`Hola, soy de ${opts.businessName}. Quiero hacer este pedido (${date}):`, '')
    const byCategory = groupLines(lines, (l) => l.p.category)
    if (byCategory.length > 1) pushGroups(byCategory)
    else out.push(...lines.map(itemLine))
    out.push('', 'Muchas gracias.')
    return out.join('\n')
  }

  out.push(`Pedido · ${opts.businessName} · ${date}`, '')
  const hasSuppliers = lines.some((l) => cleanSupplier(l.p.supplier ?? ''))
  pushGroups(groupLines(lines, (l) => (hasSuppliers ? cleanSupplier(l.p.supplier ?? '') || NO_SUPPLIER : l.p.category)))
  return out.join('\n')
}
