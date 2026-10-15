import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Bell, ChevronDown, Database, KeyRound, RotateCcw, Save, Store, Trash2 } from 'lucide-react'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Button, Card, CardHeader, Field, Input } from '../components/ui/primitives'
import { useToast } from '../components/ui/Toast'
import { changePassword, passwordProblem } from '../lib/auth'
import { levelKey, typeLevels } from '../lib/stock'
import { formatInt, parseQty } from '../lib/utils'
import { useActions, useCloud, useData } from '../store/AppStore'
import type { Unit } from '../types'

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-5">
      <BusinessCard />
      <PasswordCard />
      <AlertsCard />
      <AdvancedCard />
    </div>
  )
}

function BusinessCard() {
  const { settings } = useData()
  const actions = useActions()
  const toast = useToast()
  const [name, setName] = useState(settings.businessName)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    actions.updateSettings({ businessName: name.trim() })
    toast.success('Nombre guardado')
  }

  return (
    <Card>
      <CardHeader icon={<Store />} title="Nombre del negocio" />
      <form onSubmit={submit} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:p-5">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Nombre del negocio" className="h-12 flex-1 text-base" />
        <Button type="submit" variant="primary" size="lg" disabled={!name.trim() || name.trim() === settings.businessName}>
          <Save /> Guardar
        </Button>
      </form>
    </Card>
  )
}

function PasswordCard() {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (next !== repeat) return setError('Las dos claves nuevas no son iguales')
    const problem = passwordProblem(next)
    if (problem) return setError(problem)
    setBusy(true)
    const err = await changePassword(current, next).catch((x: unknown) => (x instanceof Error ? x.message : 'No se pudo cambiar'))
    setBusy(false)
    if (err) return setError(err)
    setCurrent('')
    setNext('')
    setRepeat('')
    setError('')
    toast.success('Clave cambiada')
  }

  return (
    <Card>
      <CardHeader icon={<KeyRound />} title="Clave de la caja" subtitle="La que se pide al abrir la caja en este equipo" />
      <form onSubmit={submit} className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
        <Field label="Clave actual" htmlFor="pw-cur">
          <Input id="pw-cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="Clave nueva" htmlFor="pw-new" hint="Al menos 6 números o letras, difícil de adivinar">
          <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Repite la nueva" htmlFor="pw-rep">
          <Input id="pw-rep" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </Field>
        {error && (
          <p className="font-medium text-danger-ink sm:col-span-3" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end sm:col-span-3">
          <Button type="submit" variant="primary" disabled={busy || !current || !next || !repeat}>
            <KeyRound /> Cambiar clave
          </Button>
        </div>
      </form>
    </Card>
  )
}

/**
 * Avisos de stock por tipo de producto (categoría, separando unidad y kilo). Vacío = automático.
 * Ej: "Fiambrería (por kilo)": rojo bajo 1 kg, amarillo bajo 2 kg.
 */
function AlertsCard() {
  const { settings, products } = useData()
  const actions = useActions()
  const toast = useToast()
  const groups = useMemo(() => {
    const m = new Map<string, { category: string; unit: Unit; count: number }>()
    for (const p of products) {
      const k = levelKey(p.category, p.unit)
      const g = m.get(k) ?? { category: p.category, unit: p.unit, count: 0 }
      g.count++
      m.set(k, g)
    }
    return [...m.entries()].sort((a, b) => a[1].category.localeCompare(b[1].category, 'es') || a[1].unit.localeCompare(b[1].unit))
  }, [products])
  const [values, setValues] = useState<Record<string, { red: string; yellow: string }>>(() =>
    Object.fromEntries(
      Object.entries(settings.stockLevels ?? {}).map(([k, l]) => [k, { red: String(l.red).replace('.', ','), yellow: String(l.yellow).replace('.', ',') }]),
    ),
  )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const out: Record<string, { red: number; yellow: number }> = {}
    for (const [k, g] of groups) {
      const v = values[k]
      if (!v || (!v.red.trim() && !v.yellow.trim())) continue // vacío = automático
      const auto = typeLevels(g.category, g.unit)
      const red = v.red.trim() ? parseQty(v.red, g.unit) : null
      const yellow = v.yellow.trim() ? parseQty(v.yellow, g.unit) : null
      if ((v.red.trim() && (red === null || red < 0)) || (v.yellow.trim() && (yellow === null || yellow < 0))) {
        return toast.error(`Revisa los números de ${g.category}`)
      }
      const r = red ?? (yellow !== null ? (g.unit === 'kg' ? yellow / 2 : Math.floor(yellow / 2)) : auto.red)
      const y = yellow ?? r * 2
      if (y < r) return toast.error(`En ${g.category}, el amarillo debe ser igual o mayor que el rojo`)
      out[k] = { red: r, yellow: y }
    }
    actions.updateSettings({ stockLevels: out })
    toast.success('Avisos guardados')
  }

  return (
    <Card>
      <CardHeader icon={<Bell />} title="Avisos de stock por tipo de producto" subtitle="Cuándo se pone rojo (muy poco) y amarillo (queda poco)" />
      <form onSubmit={submit} className="space-y-4 p-4 sm:p-5">
        <p className="hidden text-sm font-semibold sm:block">
          <span className="inline-block size-3 rounded-full bg-danger" aria-hidden /> Rojo: menos de ·{' '}
          <span className="inline-block size-3 rounded-full bg-warn" aria-hidden /> Amarillo: menos de
        </p>
        <p className="text-sm text-muted">
          El número gris es el automático. Deja vacío para que sea automático (según el tipo de producto y lo que vendes). Si un producto tiene sus propios números
          (Editar → Más opciones), se usan esos.
        </p>
        {groups.length === 0 ? (
          <p className="text-subtle">Agrega productos para configurar sus avisos.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {groups.map(([k, g]) => {
              const auto = typeLevels(g.category, g.unit)
              const v = values[k] ?? { red: '', yellow: '' }
              const set = (field: 'red' | 'yellow', text: string) => setValues((all) => ({ ...all, [k]: { ...v, [field]: text } }))
              return (
                <li key={k} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem] sm:items-center">
                  <span className="font-semibold">
                    {g.category} <span className="font-normal text-subtle">({g.unit === 'kg' ? 'por kilo' : 'por unidad'} · {g.count})</span>
                  </span>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="inline-block size-3 shrink-0 rounded-full bg-danger" aria-hidden />
                    <span className="w-28 shrink-0 sm:hidden">Rojo, menos de</span>
                    <Input
                      value={v.red}
                      onChange={(e) => set('red', e.target.value)}
                      inputMode="decimal"
                      placeholder={String(auto.red).replace('.', ',')}
                      aria-label={`Rojo para ${g.category}: menos de`}
                      className="tabular"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="inline-block size-3 shrink-0 rounded-full bg-warn" aria-hidden />
                    <span className="w-28 shrink-0 sm:hidden">Amarillo, menos de</span>
                    <Input
                      value={v.yellow}
                      onChange={(e) => set('yellow', e.target.value)}
                      inputMode="decimal"
                      placeholder={String(auto.yellow).replace('.', ',')}
                      aria-label={`Amarillo para ${g.category}: menos de`}
                      className="tabular"
                    />
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        <div className="flex justify-end">
          <Button type="submit" variant="primary">
            <Save /> Guardar avisos
          </Button>
        </div>
      </form>
    </Card>
  )
}

/** Lo que casi nunca se toca, escondido para no confundir */
function AdvancedCard() {
  const { settings, products, sales, expenses } = useData()
  const actions = useActions()
  const toast = useToast()
  const inCloud = Boolean(useCloud().user)
  const [coverage, setCoverage] = useState(String(settings.coverageDays))
  const [slow, setSlow] = useState(String(settings.slowMoverDays))
  const [allowNegative, setAllowNegative] = useState(settings.allowNegativeStock)
  const [usage, setUsage] = useState<string | null>(null)
  const [confirmDemo, setConfirmDemo] = useState(false)
  const [wipeOpen, setWipeOpen] = useState(false)
  const [wipeText, setWipeText] = useState('')

  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((e) => e.usage !== undefined && setUsage(`${(e.usage / 1024 / 1024).toFixed(1).replace('.', ',')} MB`))
      .catch(() => {})
  }, [products, sales, expenses])

  const save = (e: FormEvent) => {
    e.preventDefault()
    const c = Number(coverage.replace(',', '.'))
    const s = Number(slow)
    if (!coverage.trim() || !Number.isFinite(c) || c < 0 || !Number.isInteger(s) || s < 1) return toast.error('Revisa los números')
    actions.updateSettings({ coverageDays: c, slowMoverDays: s, allowNegativeStock: allowNegative })
    toast.success('Opciones guardadas')
  }

  return (
    <Card>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <span>
            <span className="block text-base font-semibold">Opciones avanzadas</span>
            <span className="text-sm text-subtle">Casi nunca hace falta tocarlas</span>
          </span>
          <ChevronDown className="size-5 text-subtle transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-6 border-t border-line p-4 sm:p-5">
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Días de venta que debe alcanzar el stock" htmlFor="cov" hint="Ej: 2 = si vendes 8 al día, avisa cuando queden menos de 16">
                <Input id="cov" inputMode="decimal" value={coverage} onChange={(e) => setCoverage(e.target.value)} className="tabular" />
              </Field>
              <Field label="Días sin ventas para “no se vende”" htmlFor="slow" hint="Se muestran en Reportes">
                <Input id="slow" inputMode="numeric" value={slow} onChange={(e) => setSlow(e.target.value)} className="tabular" />
              </Field>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
              <input type="checkbox" className="mt-0.5 size-5 accent-[var(--brand)]" checked={allowNegative} onChange={(e) => setAllowNegative(e.target.checked)} />
              <span className="text-sm">
                <span className="block font-semibold">Dejar vender aunque la caja diga que no hay</span>
                <span className="text-subtle">Útil mientras todavía no cuentas bien lo que tienes.</span>
              </span>
            </label>
            <div className="flex justify-end">
              <Button type="submit" variant="outline">
                <Save /> Guardar
              </Button>
            </div>
          </form>

          <div className="space-y-3 border-t border-line pt-5">
            <p className="flex items-center gap-2 font-semibold">
              <Database className="size-5 text-subtle" /> Datos
            </p>
            <p className="text-sm text-muted">
              {formatInt(products.length)} productos · {formatInt(sales.length)} ventas · {formatInt(expenses.length)} gastos
              {usage && ` · ${usage} en este equipo`}
            </p>
            <div className="flex flex-wrap gap-2">
              {!inCloud && (
                <Button variant="outline" onClick={() => setConfirmDemo(true)}>
                  <RotateCcw /> Cargar datos de ejemplo
                </Button>
              )}
              <Button variant="danger-soft" onClick={() => setWipeOpen(true)}>
                <Trash2 /> Borrar todos los datos
              </Button>
            </div>
          </div>
        </div>
      </details>

      <ConfirmDialog
        open={confirmDemo}
        onClose={() => setConfirmDemo(false)}
        danger
        title="¿Cargar datos de ejemplo?"
        confirmLabel="Cargar ejemplos"
        onConfirm={() => {
          actions.loadDemo()
          toast.success('Datos de ejemplo cargados')
        }}
      >
        Esto <strong className="text-fg">reemplaza</strong> tus productos, ventas y gastos por los de ejemplo. Descarga un Excel antes si quieres
        guardarlos.
      </ConfirmDialog>

      <Modal
        open={wipeOpen}
        onClose={() => {
          setWipeOpen(false)
          setWipeText('')
        }}
        size="sm"
        title="Borrar todos los datos"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setWipeOpen(false)
                setWipeText('') // si no, al volver a abrir ya estaría escrito BORRAR
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={wipeText.trim().toUpperCase() !== 'BORRAR'}
              onClick={() => {
                actions.wipeAll()
                setWipeOpen(false)
                setWipeText('')
                toast.success('Datos borrados')
              }}
            >
              Borrar definitivamente
            </Button>
          </>
        }
      >
        <p className="text-muted">
          Se borrarán <strong className="text-fg">todos</strong> los productos, ventas y gastos{' '}
          {inCloud ? <strong className="text-fg">de tu cuenta, en todos tus equipos</strong> : 'de este equipo'}. No se puede deshacer. Escribe{' '}
          <strong className="font-mono text-fg">BORRAR</strong> para confirmar.
        </p>
        <Input className="mt-3" value={wipeText} onChange={(e) => setWipeText(e.target.value)} autoFocus aria-label="Escribe BORRAR para confirmar" />
      </Modal>
    </Card>
  )
}
