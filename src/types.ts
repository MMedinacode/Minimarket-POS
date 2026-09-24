// Tipos del dominio: productos, ventas, gastos y configuración del negocio.

export type Rotation = 'Alta' | 'Media' | 'Baja'
export const ROTATIONS: Rotation[] = ['Alta', 'Media', 'Baja']

/** 'un' = se vende por unidad · 'kg' = se vende a granel por peso */
export type Unit = 'un' | 'kg'

export type PaymentMethod = 'Efectivo' | 'Débito' | 'Crédito' | 'Transferencia'
export const PAYMENT_METHODS: PaymentMethod[] = ['Efectivo', 'Débito', 'Crédito', 'Transferencia']

export interface Product {
  id: string
  /** Puede estar vacío (ej: pan a granel sin código) */
  barcode: string
  name: string
  category: string
  /** Precio de costo en CLP (por unidad o por kg) */
  cost: number
  /** Precio de venta en CLP (por unidad o por kg) */
  price: number
  stock: number
  unit: Unit
  rotation: Rotation
  /** Umbral de alerta manual. null = se calcula por rotación y velocidad de venta */
  minStock: number | null
  createdAt: string
  updatedAt: string
}

export interface SaleItem {
  productId: string
  barcode: string
  name: string
  category: string
  unit: Unit
  qty: number
  unitPrice: number
  unitCost: number
}

export interface Sale {
  id: string
  /** Correlativo visible (N° 1, 2, 3...) */
  number: number
  /** Fecha y hora ISO */
  date: string
  items: SaleItem[]
  total: number
  cost: number
  payment: PaymentMethod
  /** Monto recibido en efectivo (solo pago en efectivo) */
  received: number | null
  change: number | null
  voided: boolean
  voidedAt?: string
}

export const EXPENSE_CATEGORIES = [
  'Proveedores',
  'Servicios básicos',
  'Arriendo',
  'Sueldos',
  'Insumos',
  'Imprevistos',
  'Otros',
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export interface Expense {
  id: string
  date: string
  description: string
  category: ExpenseCategory
  amount: number
  /** true si el dinero salió de la caja (afecta el efectivo esperado) */
  paidFromCash: boolean
}

export interface Settings {
  businessName: string
  /** Alerta de stock crítico por rotación: Alta < 10, Media < 5, Baja < 2 */
  thresholds: Record<Rotation, number>
  /** Días de venta que el stock debe cubrir antes de alertar (usa la velocidad real) */
  coverageDays: number
  /** Días sin ventas para considerar un producto de "menor rotación" */
  slowMoverDays: number
  /** Permitir vender aunque el sistema diga que no hay stock */
  allowNegativeStock: boolean
}

export interface AppData {
  products: Product[]
  sales: Sale[]
  expenses: Expense[]
  settings: Settings
  /** true mientras se usan los datos de ejemplo */
  isDemo: boolean
}

export type StockStatus = 'agotado' | 'critico' | 'ok'
