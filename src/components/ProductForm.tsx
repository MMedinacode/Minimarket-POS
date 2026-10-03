import { lazy, Suspense, useMemo, useState, type FormEvent } from 'react'
import { Camera, ChevronDown, Sparkles, Trash2, TrendingUp } from 'lucide-react'
import { allCategories, inferCategory } from '../lib/categories'
import { nextInternalCode } from '../lib/ean13'
import { beepOk } from '../lib/sound'
import { getStockInfo, suggestRotation } from '../lib/stock'
import { cn, formatCLP, parseQty, roundQty } from '../lib/utils'
import { useActions, useData, useDerived } from '../store/AppStore'
import { ROTATION_LABEL, ROTATIONS, type Product, type Rotation, type Unit } from '../types'
import { ConfirmDialog, Modal } from './ui/Modal'
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

function ProductFormInner({ onClose, product, initialBarcode, onSaved }: Props) {
  const { products, settings } = useData()
  const { velocity } = useDerived()
  const actions = useActions()
  const toast = useToast()
  const editing = Boolean(product)

  const [name, setName] = useState(product?.name ?? '')
  const [price, setPrice] = useState<number | null>(product?.price ?? null)
  const [cost, setCost] = useState<number | null>(product?.cost ?? null)
  const [stock, setStock] = useState(product ? String(product.stock).replace('.', ',') : '')
  const [unit, setUnit] = useState<Unit>(product?.unit ?? 'un')
  const [barcode, setBarcode] = useState(product?.barcode ?? initialBarcode ?? '')
  const [category, setCategory] = useState(product?.category ?? '')
  const [categoryTouched, setCategoryTouched] = useState(Boolean(product))
  const [customCategory, setCustomCategory] = useState(false)
  const [rotation, setRotation] = useState<Rotation>(product?.rotation ?? 'Media')
  const [minStock, setMinStock] = useState(product?.minStock != null ? String(product.minStock) : '')
  const [scanning, setScanning] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const categories = useMemo(() => allCategories(products.map((p) => p.category)), [products])
  const guess = useMemo(() => inferCategory(name), [name])
  // Mientras no elija una categoría a mano, se sugiere según el nombre
  const effectiveCategory = categoryTouched ? category : guess.score > 0 ? guess.category : category || 'Otros'
  const isSuggested = !categoryTouched && guess.score > 0

  const v = product ? (velocity.get(product.id) ?? 0) : 0
  const suggested = product && v > 0 ? suggestRotation(v) : null
  const unitProfit = (price ?? 0) - (cost ?? 0)
  const per = unit === 'kg' ? 'por kilo' : 'por cada uno'

  const autoThreshold = useMemo(() => {
    const draft = { ...(product ?? ({} as Product)), rotation, unit, stock: 0, minStock: null }
    return getStockInfo(draft as Product, settings, v).threshold
  }, [product, rotation, unit, settings, v])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const cleanName = name.trim().replace(/\s+/g, ' ')
    const code = barcode.trim()
    const stockN = stock.trim() ? parseQty(stock, unit) : 0
    const minN = minStock.trim() ? parseQty(minStock, unit) : null

    if (!cleanName) errs.name = 'Escribe el nombre del producto'
    if (!price || price <= 0) errs.price = 'Escribe a cuánto lo vendes'
    if (stockN === null || stockN < 0) errs.stock = 'Escribe un número (puede ser 0)'
    if (minStock.trim() && (minN === null || minN < 0)) errs.minStock = 'Escribe un número'
    if (code) {
      const dup = products.find((p) => p.barcode === code && p.id !== product?.id)
      if (dup) errs.barcode = `Ese código ya lo tiene "${dup.name}"`
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
      // La cantidad solo se envía si se cambió: así no se pisa una venta que
      // otra caja hizo mientras este formulario estaba abierto.
      const { stock: newStock, ...rest } = data
      const patch = newStock !== roundQty(product.stock, product.unit) || unit !== product.unit ? data : rest
      actions.updateProduct(product.id, patch)
      toast.success(`"${cleanName}" guardado`)
      onSaved?.({ ...product, ...patch })
    } else {
      const created = actions.addProduct(data)
      toast.success(`"${cleanName}" agregado`)
      onSaved?.(created)
    }
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      persistent
      size="lg"
      title={editing ? 'Editar producto' : 'Agregar producto'}
      footer={
        <>
          {editing && (
            <Button variant="ghost" className="mr-auto text-danger-ink hover:bg-danger-soft" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Eliminar
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="lg" type="submit" form="product-form">
            Guardar
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="¿Cómo se llama?" htmlFor="pf-name" error={errors.name} className="sm:col-span-2">
          <Input
            id="pf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Coca-Cola 1.5L"
            autoFocus
            aria-invalid={Boolean(errors.name)}
            className="h-12 text-base"
          />
        </Field>

        <Field label={unit === 'kg' ? '¿A cuánto vendes el kilo?' : '¿A cuánto lo vendes?'} htmlFor="pf-price" error={errors.price}>
          <MoneyInput id="pf-price" value={price} onValueChange={setPrice} placeholder="0" aria-invalid={Boolean(errors.price)} className="h-12 text-lg font-bold" />
        </Field>
        <Field label={unit === 'kg' ? '¿Cuánto te costó el kilo?' : '¿Cuánto te costó?'} htmlFor="pf-cost" hint="Opcional: sirve para saber cuánto ganas">
          <MoneyInput id="pf-cost" value={cost} onValueChange={setCost} placeholder="0" className="h-12 text-lg" />
        </Field>

        {price ? (
          <div
            className={cn(
              'flex items-center gap-3 rounded-xl px-4 py-3 sm:col-span-2',
              unitProfit < 0 ? 'bg-danger-soft text-danger-ink' : 'bg-ok-soft text-ok-ink',
            )}
          >
            <TrendingUp className="size-5 shrink-0" />
            {unitProfit < 0 ? (
              <span>
                <strong>Ojo:</strong> lo vendes más barato de lo que te costó. Pierdes {formatCLP(-unitProfit)} {per}.
              </span>
            ) : (
              <span>
                Ganas <strong className="tabular">{formatCLP(unitProfit)}</strong> {per}.
              </span>
            )}
          </div>
        ) : null}

        <Field label={unit === 'kg' ? '¿Cuántos kilos tienes?' : '¿Cuántos tienes?'} htmlFor="pf-stock" error={errors.stock}>
          <Input id="pf-stock" value={stock} onChange={(e) => setStock(e.target.value)} inputMode="decimal" placeholder="0" className="tabular h-12 text-lg" />
        </Field>
        <Field label="Se vende por">
          <Segmented
            className="flex w-full"
            value={unit}
            onChange={setUnit}
            ariaLabel="Se vende por"
            options={[
              { value: 'un', label: 'Unidad' },
              { value: 'kg', label: 'Kilo' },
            ]}
          />
        </Field>

        <Field
          label="Código de barras"
          htmlFor="pf-code"
          error={errors.barcode}
          className="sm:col-span-2"
          hint={
            barcode ? (
              'Si el producto trae código, escanéalo con la pistola o la cámara.'
            ) : (
              <span>
                ¿No trae código?{' '}
                <button
                  type="button"
                  className="font-semibold text-brand-ink underline"
                  onClick={() => setBarcode(nextInternalCode(products.map((p) => p.barcode)))}
                >
                  Crear uno
                </button>{' '}
                y después imprime su etiqueta (Productos → Más opciones).
              </span>
            )
          }
        >
          <div className="flex gap-2">
            <Input
              id="pf-code"
              data-scan-target
              value={barcode}
              onChange={(e) => setBarcode(e.target.value.replace(/\s/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              placeholder="Opcional"
              inputMode="numeric"
              autoComplete="off"
              className="font-mono"
            />
            <Button variant={scanning ? 'primary' : 'outline'} onClick={() => setScanning((s) => !s)}>
              <Camera /> <span className="hidden sm:inline">Cámara</span>
            </Button>
          </div>
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
          className="sm:col-span-2"
          label={
            <span className="flex items-center gap-1.5">
              Categoría
              {isSuggested && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[0.7rem] font-semibold text-brand-ink">
                  <Sparkles className="size-3" /> Elegida sola
                </span>
              )}
            </span>
          }
          htmlFor="pf-cat"
          error={errors.category}
        >
          {customCategory ? (
            <div className="flex gap-2">
              <Input id="pf-cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Nombre de la categoría nueva" autoFocus />
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
              <option value={NEW_CATEGORY}>+ Crear otra categoría…</option>
            </Select>
          )}
        </Field>

        {/* Lo menos usado, escondido para no confundir */}
        <details className="group rounded-xl border border-line sm:col-span-2">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-semibold">
            Más opciones (aviso cuando se acaba)
            <ChevronDown className="size-5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-2">
            <Field
              className="sm:col-span-2"
              label="¿Qué tan rápido se vende?"
              hint={
                suggested && suggested !== rotation ? (
                  <span>
                    Según las ventas, este producto {ROTATION_LABEL[suggested].toLowerCase()}.{' '}
                    <button type="button" className="font-semibold text-brand-ink underline" onClick={() => setRotation(suggested)}>
                      Cambiar a “{ROTATION_LABEL[suggested]}”
                    </button>
                  </span>
                ) : (
                  'Sirve para avisarte a tiempo cuando se está acabando'
                )
              }
            >
              <Segmented
                className="flex w-full"
                value={rotation}
                onChange={setRotation}
                ariaLabel="Qué tan rápido se vende"
                options={ROTATIONS.map((r) => ({ value: r, label: ROTATION_LABEL[r] }))}
              />
            </Field>
            <Field
              className="sm:col-span-2"
              label="Avisarme cuando queden menos de"
              htmlFor="pf-min"
              error={errors.minStock}
              hint={minStock.trim() ? 'Se usará este número' : `Si lo dejas vacío, avisa solo (ahora: menos de ${autoThreshold})`}
            >
              <Input id="pf-min" value={minStock} onChange={(e) => setMinStock(e.target.value)} inputMode="decimal" placeholder="Automático" className="tabular max-w-40" />
            </Field>
          </div>
        </details>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        danger
        title="¿Eliminar este producto?"
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (!product) return
          actions.deleteProduct(product.id)
          toast.success(`"${product.name}" eliminado`)
          onClose()
        }}
      >
        Se quitará <strong className="text-fg">{product?.name}</strong> de la lista. Las ventas que ya hiciste se mantienen en los reportes.
      </ConfirmDialog>
    </Modal>
  )
}
