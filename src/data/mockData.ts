// Datos de demostración: inventario típico de un minimarket chileno y 14 días
// de ventas simuladas. Los códigos de barra son FICTICIOS (prefijo 780-9999,
// con dígito verificador EAN-13 válido para que los lectores los acepten).
import type { AppData, Expense, ExpenseCategory, PaymentMethod, Product, Rotation, Sale, SaleItem, Settings, Unit } from '../types'

export const DEFAULT_SETTINGS: Settings = {
  businessName: (import.meta.env?.VITE_BUSINESS_NAME as string | undefined)?.trim() || 'Minimarket Don Pepe',
  thresholds: { Alta: 10, Media: 5, Baja: 2 },
  coverageDays: 2,
  slowMoverDays: 7,
  allowNegativeStock: false,
}

/** Dígito verificador EAN-13 */
export function ean13(base12: string): string {
  const digits = base12.split('').map(Number)
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0)
  return base12 + ((10 - (sum % 10)) % 10)
}

// [nombre, categoría, costo, venta, stock, rotación, unidad, popularidad]
// popularidad = qué tan seguido aparece en las ventas simuladas (0 = nunca se vende)
type Seed = [string, string, number, number, number, Rotation, Unit, number]

export const SEED_PRODUCTS: Seed[] = [
  // Bebidas
  ['Coca-Cola 1.5L', 'Bebidas', 1290, 1990, 36, 'Alta', 'un', 14],
  ['Coca-Cola Zero 1.5L', 'Bebidas', 1290, 1990, 24, 'Alta', 'un', 8],
  ['Coca-Cola Lata 350ml', 'Bebidas', 520, 900, 48, 'Alta', 'un', 9],
  ['Fanta Naranja 1.5L', 'Bebidas', 1150, 1790, 18, 'Media', 'un', 4],
  ['Sprite 1.5L', 'Bebidas', 1150, 1790, 3, 'Media', 'un', 3],
  ['Bilz 1.5L', 'Bebidas', 990, 1590, 10, 'Media', 'un', 3],
  ['Agua Mineral Cachantun sin gas 1.6L', 'Bebidas', 590, 1000, 30, 'Alta', 'un', 7],
  ['Jugo Andina del Valle Durazno 1.5L', 'Bebidas', 890, 1490, 12, 'Media', 'un', 3],
  ['Néctar Watts Naranja 1L', 'Bebidas', 690, 1190, 9, 'Media', 'un', 2],
  ['Cerveza Cristal Lata 470ml', 'Bebidas', 690, 1100, 60, 'Alta', 'un', 10],
  ['Cerveza Escudo Lata 470ml', 'Bebidas', 720, 1150, 8, 'Alta', 'un', 7],
  ['Red Bull 250ml', 'Bebidas', 1150, 1890, 14, 'Media', 'un', 3],
  // Lácteos
  ['Leche Entera Colun 1L', 'Lácteos', 850, 1190, 40, 'Alta', 'un', 12],
  ['Leche Descremada Soprole 1L', 'Lácteos', 870, 1250, 15, 'Media', 'un', 4],
  ['Yogurt Soprole Frutilla 125g', 'Lácteos', 250, 420, 30, 'Alta', 'un', 7],
  ['Mantequilla Colun 250g', 'Lácteos', 1990, 2890, 6, 'Media', 'un', 2],
  ['Quesillo Colun 400g', 'Lácteos', 2190, 3290, 4, 'Baja', 'un', 1],
  ['Manjar Colun 400g', 'Lácteos', 1390, 2190, 7, 'Baja', 'un', 1],
  // Panadería
  ['Pan Hallulla', 'Panadería', 1500, 2400, 25.5, 'Alta', 'kg', 16],
  ['Pan Marraqueta', 'Panadería', 1500, 2400, 18, 'Alta', 'kg', 14],
  ['Pan de Molde Ideal Blanco', 'Panadería', 1690, 2590, 8, 'Media', 'un', 3],
  // Snacks
  ['Papas Fritas Lays Clásicas 200g', 'Snacks', 1590, 2490, 7, 'Alta', 'un', 8],
  ['Papas Lays Corte Americano 110g', 'Snacks', 1090, 1690, 15, 'Alta', 'un', 5],
  ['Ramitas Queso Evercrisp 160g', 'Snacks', 790, 1290, 20, 'Media', 'un', 3],
  ['Doritos Queso 120g', 'Snacks', 1190, 1890, 11, 'Alta', 'un', 5],
  ['Galletas Tritón Vainilla 126g', 'Snacks', 490, 850, 25, 'Alta', 'un', 6],
  ['Galletas Oreo 117g', 'Snacks', 690, 1100, 18, 'Media', 'un', 3],
  ['Chocolate Sahne-Nuss 180g', 'Snacks', 2190, 3290, 5, 'Baja', 'un', 1],
  ['Super 8 29g', 'Snacks', 250, 450, 50, 'Alta', 'un', 9],
  ['Maní Salado Marco Polo 200g', 'Snacks', 1190, 1790, 9, 'Baja', 'un', 1],
  ['Chicle Beldent Menta', 'Snacks', 320, 550, 40, 'Media', 'un', 4],
  // Abarrotes
  ['Arroz Grado 1 Tucapel 1kg', 'Abarrotes', 1290, 1890, 22, 'Media', 'un', 4],
  ['Fideos Spaghetti N°5 Carozzi 400g', 'Abarrotes', 690, 1090, 30, 'Media', 'un', 4],
  ['Azúcar Iansa 1kg', 'Abarrotes', 1090, 1590, 14, 'Media', 'un', 3],
  ['Aceite Maravilla Chef 1L', 'Abarrotes', 1990, 2790, 10, 'Media', 'un', 2],
  ['Harina sin Polvos de Hornear 1kg', 'Abarrotes', 890, 1390, 6, 'Baja', 'un', 1],
  ['Lentejas Wasil 1kg', 'Abarrotes', 1890, 2690, 1, 'Baja', 'un', 1],
  ['Porotos Tórtola 1kg', 'Abarrotes', 1990, 2890, 5, 'Baja', 'un', 0.5],
  ['Garbanzos 1kg', 'Abarrotes', 1790, 2590, 4, 'Baja', 'un', 0],
  ['Huevos Blancos 12 un', 'Abarrotes', 2490, 3500, 10, 'Media', 'un', 4],
  ['Atún Lomitos en Agua Van Camps 160g', 'Abarrotes', 1290, 1990, 12, 'Media', 'un', 2],
  ['Salsa de Tomate Pomarola 200g', 'Abarrotes', 390, 650, 26, 'Alta', 'un', 5],
  ['Mayonesa Hellmanns 372g', 'Abarrotes', 1790, 2590, 9, 'Media', 'un', 2],
  ['Café Nescafé Tradición 170g', 'Abarrotes', 4990, 6990, 5, 'Baja', 'un', 1],
  ['Té Supremo 100 bolsitas', 'Abarrotes', 1890, 2790, 7, 'Baja', 'un', 1],
  ['Sal Lobos 1kg', 'Abarrotes', 390, 690, 12, 'Baja', 'un', 1],
  ['Sopa Maggi Crema de Espárragos', 'Abarrotes', 690, 1090, 3, 'Baja', 'un', 0.5],
  ['Avena Quaker 900g', 'Abarrotes', 1790, 2590, 4, 'Baja', 'un', 0],
  // Fiambrería (a granel)
  ['Jamón Pierna Laminado', 'Fiambrería', 7990, 11990, 2.4, 'Media', 'kg', 5],
  ['Queso Gauda Laminado', 'Fiambrería', 8990, 12990, 1.8, 'Media', 'kg', 5],
  ['Salame Italiano', 'Fiambrería', 9990, 14990, 0.8, 'Baja', 'kg', 1],
  ['Vienesas San Jorge 20 un', 'Fiambrería', 1990, 2990, 10, 'Media', 'un', 3],
  // Frutas y verduras (a granel)
  ['Palta Hass', 'Frutas y Verduras', 3990, 5990, 6.5, 'Alta', 'kg', 6],
  ['Tomate', 'Frutas y Verduras', 1290, 1990, 9, 'Alta', 'kg', 5],
  ['Plátano', 'Frutas y Verduras', 990, 1490, 12, 'Media', 'kg', 3],
  ['Limón', 'Frutas y Verduras', 1490, 2190, 4, 'Media', 'kg', 2],
  // Congelados
  ['Helado Savory Chocolate 1L', 'Congelados', 2490, 3690, 6, 'Baja', 'un', 1],
  ['Hamburguesas de Vacuno 4 un', 'Congelados', 2190, 3290, 8, 'Media', 'un', 2],
  // Limpieza
  ['Detergente Líquido Omo 3L', 'Limpieza', 7990, 10990, 4, 'Baja', 'un', 0.5],
  ['Cloro Clorinda 1L', 'Limpieza', 690, 1190, 12, 'Media', 'un', 2],
  ['Lavaloza Quix Limón 500ml', 'Limpieza', 1190, 1790, 8, 'Media', 'un', 2],
  ['Papel Higiénico Confort 4 un', 'Limpieza', 1990, 2890, 10, 'Media', 'un', 3],
  ['Toalla de Papel Nova 2 un', 'Limpieza', 1590, 2290, 6, 'Baja', 'un', 0],
  ['Esponja Virutex 3 un', 'Limpieza', 790, 1290, 2, 'Baja', 'un', 0],
  // Higiene personal
  ['Pasta Dental Colgate 90g', 'Higiene Personal', 1290, 1990, 8, 'Baja', 'un', 1],
  ['Shampoo Sedal 340ml', 'Higiene Personal', 2490, 3490, 3, 'Baja', 'un', 0],
  ['Jabón Protex 3 un', 'Higiene Personal', 1690, 2490, 5, 'Baja', 'un', 0.5],
  // Otros
  ['Carbón Vegetal 2.5kg', 'Otros', 2490, 3490, 5, 'Baja', 'un', 0],
]

/** PRNG determinista (mulberry32): mismos datos de demo cada vez */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickWeighted<T>(items: T[], weights: number[], r: number): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let x = r * total
  for (let i = 0; i < items.length; i++) {
    x -= weights[i]
    if (x <= 0) return items[i]
  }
  return items[items.length - 1]
}

const makeId = (prefix: string, n: number) => `${prefix}-${n.toString(36).padStart(5, '0')}`

export function buildDemoProducts(now: Date = new Date()): Product[] {
  const iso = now.toISOString()
  let plu = 1000
  return SEED_PRODUCTS.map(([name, category, cost, price, stock, rotation, unit], i) => ({
    id: makeId('demo-p', i + 1),
    // A granel usan un código corto (PLU) que se digita a mano
    barcode: unit === 'kg' ? String(++plu) : ean13(`7809999${String(i + 1).padStart(5, '0')}`),
    name,
    category,
    cost,
    price,
    stock,
    unit,
    rotation,
    minStock: null,
    createdAt: iso,
    updatedAt: iso,
  }))
}

// Peso de cada hora del día en las ventas (horas punta: desayuno, almuerzo y salida del trabajo)
const HOUR_WEIGHTS: Record<number, number> = {
  8: 3, 9: 4, 10: 3, 11: 3, 12: 5, 13: 7, 14: 5, 15: 3, 16: 3, 17: 5, 18: 8, 19: 10, 20: 8, 21: 5, 22: 2,
}

/** Genera ventas y gastos realistas para los últimos `days` días (hasta la hora actual) */
export function buildDemoHistory(products: Product[], now: Date = new Date(), days = 14): { sales: Sale[]; expenses: Expense[] } {
  const rand = rng(20260923)
  const popularity = new Map(SEED_PRODUCTS.map((s, i) => [makeId('demo-p', i + 1), s[7]]))
  const sellable = products.filter((p) => (popularity.get(p.id) ?? 0) > 0)
  const weights = sellable.map((p) => popularity.get(p.id) ?? 0)
  const hours = Object.keys(HOUR_WEIGHTS).map(Number)
  const hourW = hours.map((h) => HOUR_WEIGHTS[h])
  const payments: PaymentMethod[] = ['Efectivo', 'Débito', 'Crédito', 'Transferencia']
  const payW = [45, 40, 5, 10]

  const sales: Sale[] = []
  const expenses: Expense[] = []
  let saleN = 0
  let expN = 0

  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d)
    const weekday = day.getDay()
    const weekend = weekday === 0 || weekday === 6
    const txCount = Math.round((weekend ? 55 : 42) + rand() * 14)

    const times: Date[] = []
    for (let t = 0; t < txCount; t++) {
      const h = pickWeighted(hours, hourW, rand())
      const time = new Date(day)
      time.setHours(h, Math.floor(rand() * 60), Math.floor(rand() * 60))
      if (time <= now) times.push(time)
    }
    times.sort((a, b) => a.getTime() - b.getTime())

    for (const time of times) {
      const lineCount = pickWeighted([1, 2, 3, 4, 5], [34, 30, 20, 10, 6], rand())
      const lines = new Map<string, SaleItem>()
      for (let l = 0; l < lineCount; l++) {
        const p = pickWeighted(sellable, weights, rand())
        const qty =
          p.unit === 'kg' ? Math.round((0.2 + rand() * 0.8) * 20) / 20 : pickWeighted([1, 2, 3], [75, 20, 5], rand())
        const prev = lines.get(p.id)
        if (prev) prev.qty = Math.round((prev.qty + qty) * 1000) / 1000
        else
          lines.set(p.id, {
            productId: p.id,
            barcode: p.barcode,
            name: p.name,
            category: p.category,
            unit: p.unit,
            qty,
            unitPrice: p.price,
            unitCost: p.cost,
          })
      }
      const items = [...lines.values()]
      const total = items.reduce((a, it) => a + Math.round(it.qty * it.unitPrice), 0)
      const cost = items.reduce((a, it) => a + Math.round(it.qty * it.unitCost), 0)
      const payment = pickWeighted(payments, payW, rand())
      let received: number | null = null
      if (payment === 'Efectivo') {
        const step = total <= 2000 ? 1000 : total <= 8000 ? pickWeighted([1000, 5000], [60, 40], rand()) : 10000
        received = Math.ceil(total / step) * step
      }
      saleN++
      sales.push({
        id: makeId('demo-s', saleN),
        number: saleN,
        date: time.toISOString(),
        items,
        total,
        cost,
        payment,
        received,
        change: received !== null ? received - total : null,
        voided: false,
      })
    }

    // Gastos del día
    const addExpense = (hour: number, description: string, category: ExpenseCategory, amount: number, cash = true) => {
      const t = new Date(day)
      t.setHours(hour, Math.floor(rand() * 50), 0)
      if (t > now) return
      expN++
      expenses.push({ id: makeId('demo-e', expN), date: t.toISOString(), description, category, amount, paidFromCash: cash })
    }
    // (hoy = d 0 solo tiene gastos chicos, para que la demo parta con un día normal)
    if (d % 3 === 1) addExpense(10, 'Pago proveedor bebidas (Andina)', 'Proveedores', Math.round((60 + rand() * 60) * 1000))
    if (d % 4 === 2) addExpense(9, 'Pago proveedor pan (panadería)', 'Proveedores', Math.round((25 + rand() * 15) * 1000))
    if (d % 7 === 2) addExpense(11, 'Distribuidora abarrotes', 'Proveedores', Math.round((90 + rand() * 80) * 1000), false)
    if (d === 5) addExpense(16, 'Cuenta de luz', 'Servicios básicos', 48_900, false)
    if (d === 9) addExpense(15, 'Internet y teléfono', 'Servicios básicos', 21_990, false)
    if (d % 5 === 0) addExpense(13, 'Bolsas y boletas', 'Insumos', Math.round((5 + rand() * 6) * 1000))
    if (d === 3) addExpense(18, 'Reparación refrigerador', 'Imprevistos', 35_000)
  }

  return { sales, expenses }
}

export function buildDemoData(now: Date = new Date()): AppData {
  const products = buildDemoProducts(now)
  const { sales, expenses } = buildDemoHistory(products, now)
  return { products, sales, expenses, settings: { ...DEFAULT_SETTINGS }, isDemo: true }
}

export function buildEmptyData(settings: Settings = DEFAULT_SETTINGS): AppData {
  return { products: [], sales: [], expenses: [], settings: { ...settings }, isDemo: false }
}
