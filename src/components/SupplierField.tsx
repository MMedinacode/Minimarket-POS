import { useMemo } from 'react'
import { listSuppliers, supplierKey } from '../lib/suppliers'
import { cn } from '../lib/utils'
import { useData } from '../store/AppStore'
import { Field, Input } from './ui/primitives'

/** "¿Quién te lo trae?": se escribe el nombre o se toca uno de los que ya están anotados */
export function SupplierField({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const { products } = useData()
  const known = useMemo(() => listSuppliers(products), [products])
  const current = supplierKey(value)

  return (
    <Field className={className} label="¿Quién te lo trae? (opcional)" htmlFor="pf-supplier" hint="Sirve para hacerle el pedido a cada proveedor por separado">
      <Input id="pf-supplier" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Ej: CCU, Panadería Don Luis" autoComplete="off" maxLength={60} />
      {known.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {known.slice(0, 8).map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={s.key === current}
              onClick={() => onChange(s.key === current ? '' : s.name)}
              className={cn(
                'min-h-11 max-w-full truncate rounded-xl border px-3 text-sm font-semibold',
                s.key === current ? 'border-brand bg-brand text-on-brand' : 'border-line-strong hover:bg-surface-2',
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </Field>
  )
}
