import { lazy, Suspense, useMemo, useState, type FormEvent } from 'react'
import { Camera, Sparkles, TrendingUp } from 'lucide-react'
import { allCategories, inferCategory } from '../lib/categories'
import { marginPct } from '../lib/analytics'
import { beepOk } from '../lib/sound'
import { getStockInfo, suggestRotation } from '../lib/stock'
import { cn, formatCLP, formatPct, parseLocaleNumber, roundQty } from '../lib/utils'
import { useActions, useData, useDerived } from '../store/AppStore'
import { ROTATIONS, type Product, type Rotation, type Unit } from '../types'
import { Modal } from './ui/Modal'
import { Button, Field, Input, MoneyInput, Segmented, Select } from './ui/primitives'
import { useToast } from './ui/Toast'

const CameraScanner = lazy(() => import('./CameraScanner'))
const NEW_CATEGORY = '__nueva__'

interface Props {
  open: boolean
  onClose: () => void
  /** Si viene, se edita; si no, se crea uno nuevo */
  product?: Product | null
  initialBarcode?: string
  onSaved?: (p: Product) => void
}

export function ProductForm(props: Props) {
  // Se monta de nuevo cada vez que se abre, así el formulario parte limpio
  if (!props.open) return null
  return <ProductFormInner key={props.product?.id ?? props.initialBarcode ?? 'new'} {...props} />
}

function ProductFormInner({ open, onClose, product, initialBarcode, onSaved }: Props) {
  const { products, settings } = useData()
  const { velocity } = useDerived()
  const actions = useActions()
  const toast = useToast()
  const editing = Boolean(product)

  const [barcode, setBarcode] = useState(product?.barcode ?? initialBarcode ?? '')
  const [name, setName] = useState(product?.name ?? '')
  const [category, setCategory] = useState(product?.category ?? '')
  const [categoryTouched, setCategoryTouched] = useState(Boolean(product))
  const [customCategory, setCustomCategory] = useState(false)
  const [unit, setUnit] = useState<Unit>(product?.unit ?? 'un')
  const [cost, setCost] = useState<number | null>(product?.cost ?? null)
  const [price, setPrice] = useState<number | null>(product?.price ?? null)
  const [stock, setStock] = useState(product ? String(product.stock).replace('.', ',') : '')
  const [rotation, setRotation] = useState<Rotation>(product?.rotation ?? 'Media')
  const [minStock, setMinStock] = useState(product?.minStock != null ? String(product.minStock) : '')
  const [scanning, setScanning] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const categories = useMemo(() => allCategories(products.map((p) => p.category)), [products])
  const guess = useMemo(() => inferCategory(name), [name])
  // Mientras el usuario no elija una categoría a mano, se sugiere según el nombre
  const effectiveCategory = categoryTouched ? category : guess.score > 0 ? guess.category : category || 'Otros'
  const isSuggested = !categoryTouched && guess.score > 0

  const v = product ? (velocity.get(product.id) ?? 0) : 0
  const suggested = product && v > 0 ? suggestRotation(v) : null
  const unitProfit = (price ?? 0) - (cost ?? 0)
  const margin = marginPct(cost ?? 0, price ?? 0)

  const previewThreshold = useMemo(() => {
    const min = minStock.trim() ? parseLocaleNumber(minStock) : null
    const draft = { ...(product ?? ({} as Product)), rotation, unit, stock: 0, minStock: min }
    return getStockInfo(draft as Product, settings, v).threshold
  }, [minStock, product, rotation, unit, settings, v])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const cleanName = name.trim().replace(/\s+/g, ' ')
    const code = barcode.trim()
    const stockN = stock.trim() ? parseLocaleNumber(stock) : 0
    const minN = minStock.trim() ? parseLocaleNumber(minStock) : null

    if (!cleanName) errs.name = 'Escribe el nombre del producto'
    if (!price || price <= 0) errs.price = 'El precio de venta debe ser mayor a $0'
    if (stockN === null || stockN < 0) errs.stock = 'Stock inválido'
    if (minStock.trim() && (minN === null || minN < 0)) errs.minStock = 'Número inválido'
    if (code) {
      const dup = products.find((p) => p.barcode === code && p.id !== product?.id)
      if (dup) errs.barcode = `Ese código ya es de "${dup.name}"`
    }
    const cat = (customCategory ? category.trim() : effectiveCategory) || 'Otros'
    if (customCategory && !category.trim()) errs.category = 'Escribe el nombre de la categoría'

    setErrors(errs)
    if (Object.keys(errs).length) return

    const data = {
      barcode: code,
      name: cleanName,
      category: cat,
      unit,
      cost: cost ?? 0,
      price: price!,
      stock: roundQty(stockN ?? 0, unit),
      rotation,
      minStock: minN,
    }
    if (product) {
      actions.updateProduct(product.id, data)
      toast.success(`"${cleanName}" actualizado`)
      onSaved?.({ ...product, ...data })
    } else {
      const created = actions.addProduct(data)
      toast.success(`"${cleanName}" agregado al inventario`)
      onSaved?.(created)
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      persistent
      size="lg"
      title={editing ? 'Editar producto' : 'Nuevo producto'}
      description={editing ? product!.name : 'Completa los datos. La categoría se sugiere sola según el nombre.'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="product-form">
            {editing ? 'Guardar cambios' : 'Agregar producto'}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Código de barras" htmlFor="pf-code" error={errors.barcode} hint="Escanéalo con la pistola o la cámara. Opcional para productos a granel.">
          <div className="flex gap-2">
            <Input
              id="pf-code"
              data-scan-target
              value={barcode}
              onChange={(e) => setBarcode(e.target.value.replace(/\s/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              placeholder="7801234567890"
              inputMode="numeric"
              autoComplete="off"
              autoFocus={!initialBarcode}
              className="font-mono"
            />
            <Button variant={scanning ? 'primary' : 'outline'} size="icon" onClick={() => setScanning((s) => !s)} aria-label="Escanear con la cámara">
              <Camera />
            </Button>
          </div>
        </Field>

        <Field label="Nombre" htmlFor="pf-name" error={errors.name}>
          <Input
            id="pf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Coca-Cola 1.5L"
            autoFocus={Boolean(initialBarcode)}
            aria-invalid={Boolean(errors.name)}
          />
        </Field>

        {scanning && (
          <div className="sm:col-span-2">
            <Suspense fallback={<div className="aspect-[4/3] animate-pulse rounded-2xl bg-surface-2" />}>
              <CameraScanner
                className="mx-auto max-w-md"
                onClose={() => setScanning(false)}
                onDetected={(code) => {
                  beepOk()
                  setBarcode(code)
                  setScanning(false)
                }}
              />
            </Suspense>
          </div>
        )}

        <Field
          label={
            <span className="flex items-center gap-1.5">
              Categoría
              {isSuggested && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[0.7rem] font-semibold text-brand-ink">
                  <Sparkles className="size-3" /> Sugerida
                </span>
              )}
            </span>
          }
          htmlFor="pf-cat"
          error={errors.category}
        >
          {customCategory ? (
            <div className="flex gap-2">
              <Input id="pf-cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Nombre de la nueva categoría" autoFocus />
              <Button variant="ghost" onClick={() => setCustomCategory(false)}>
                Volver
              </Button>
            </div>
          ) : (
            <Select
              id="pf-cat"
              value={effectiveCategory}
              onChange={(e) => {
                if (e.target.value === NEW_CATEGORY) {
                  setCustomCategory(true)
                  setCategory('')
                } else setCategory(e.target.value)
                setCategoryTouched(true)
              }}
            >
              {!categories.includes(effectiveCategory) && <option value={effectiveCategory}>{effectiveCategory}</option>}
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value={NEW_CATEGORY}>+ Nueva categoría…</option>
            </Select>
          )}
        </Field>

        <Field label="Se vende por">
          <Segmented
            className="flex w-full"
            value={unit}
            onChange={setUnit}
            ariaLabel="Unidad de venta"
            options={[
              { value: 'un', label: 'Unidad' },
              { value: 'kg', label: 'Kilo (granel)' },
            ]}
          />
        </Field>

        <Field label={unit === 'kg' ? 'Precio costo por kg' : 'Precio costo'} htmlFor="pf-cost">
          <MoneyInput id="pf-cost" value={cost} onValueChange={setCost} placeholder="0" />
        </Field>

        <Field label={unit === 'kg' ? 'Precio venta por kg' : 'Precio venta'} htmlFor="pf-price" error={errors.price}>
          <MoneyInput id="pf-price" value={price} onValueChange={setPrice} placeholder="0" aria-invalid={Boolean(errors.price)} />
        </Field>

        {/* Utilidad calculada en vivo */}
        <div
          className={cn(
            'flex items-center gap-3 rounded-xl px-4 py-3 text-sm sm:col-span-2',
            !price ? 'bg-surface-2 text-subtle' : unitProfit < 0 ? 'bg-danger-soft text-danger-ink' : 'bg-ok-soft text-ok-ink',
          )}
        >
          <TrendingUp className="size-5 shrink-0" />
          {!price ? (
            'Ingresa los precios para ver la utilidad'
          ) : unitProfit < 0 ? (
            <span>
              <strong>Ojo:</strong> se vende bajo el costo, pierdes {formatCLP(-unitProfit)} por {unit === 'kg' ? 'kg' : 'unidad'}.
            </span>
          ) : (
            <span>
              Ganas <strong className="tabular">{formatCLP(unitProfit)}</strong> por {unit === 'kg' ? 'kg' : 'unidad'} · margen{' '}
              <strong className="tabular">{formatPct(margin)}</strong>
            </span>
          )}
        </div>

        <Field label={unit === 'kg' ? 'Stock (kg)' : 'Stock (unidades)'} htmlFor="pf-stock" error={errors.stock}>
          <Input
            id="pf-stock"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="tabular"
          />
        </Field>

        <Field
          label="Stock mínimo (opcional)"
          htmlFor="pf-min"
          error={errors.minStock}
          hint={minStock.trim() ? 'Se usará este número en vez del automático' : `Vacío = automático (hoy: alerta bajo ${previewThreshold})`}
        >
          <Input id="pf-min" value={minStock} onChange={(e) => setMinStock(e.target.value)} inputMode="decimal" placeholder="Automático" className="tabular" />
        </Field>

        <Field
          className="sm:col-span-2"
          label="Rotación (qué tan rápido se vende)"
          hint={
            suggested ? (
              <span>
                Según las ventas recientes ({v.toFixed(1).replace('.', ',')} al día) sugerimos <strong>{suggested}</strong>.{' '}
                {suggested !== rotation && (
                  <button type="button" className="font-semibold text-brand-ink underline" onClick={() => setRotation(suggested)}>
                    Usar {suggested}
                  </button>
                )}
              </span>
            ) : (
              `Alta: alerta bajo ${settings.thresholds.Alta} · Media: bajo ${settings.thresholds.Media} · Baja: bajo ${settings.thresholds.Baja}`
            )
          }
        >
          <Segmented
            className="flex w-full"
            value={rotation}
            onChange={setRotation}
            ariaLabel="Rotación"
            options={ROTATIONS.map((r) => ({ value: r, label: r }))}
          />
        </Field>
      </form>
    </Modal>
  )
}
