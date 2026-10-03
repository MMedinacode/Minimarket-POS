import { useEffect, useState, type FormEvent } from 'react'
import { Bell, ChevronDown, Database, KeyRound, RotateCcw, Save, Store, Trash2 } from 'lucide-react'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Button, Card, CardHeader, Field, Input } from '../components/ui/primitives'
import { useToast } from '../components/ui/Toast'
import { changePassword, passwordProblem } from '../lib/auth'
import { formatInt } from '../lib/utils'
import { useActions, useCloud, useData } from '../store/AppStore'
import { ROTATIONS, type Rotation } from '../types'

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

const ALERT_LABEL: Record<Rotation, string> = {
  Alta: 'Los que se venden mucho',
  Media: 'Los que se venden normal',
  Baja: 'Los que se venden poco',
}

const EXAMPLES: Record<Rotation, string> = {
  Alta: 'Ej: bebidas, pan, cigarros',
  Media: 'Ej: leche, arroz, fideos',
  Baja: 'Ej: legumbres, aseo, regalos',
}

function AlertsCard() {
  const { settings } = useData()
  const actions = useActions()
  const toast = useToast()
  const [values, setValues] = useState<Record<Rotation, string>>(() => ({
    Alta: String(settings.thresholds.Alta),
    Media: String(settings.thresholds.Media),
    Baja: String(settings.thresholds.Baja),
  }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    // Un campo vacío no es 0: si se guardara 0, esos productos nunca avisarían que se acaban
    if (ROTATIONS.some((r) => !values[r].trim())) return toast.error('Completa los tres números (pueden ser 0)')
    const parsed = ROTATIONS.map((r) => [r, Number(values[r].replace(',', '.'))] as const)
    if (parsed.some(([, n]) => !Number.isFinite(n) || n < 0)) return toast.error('Escribe números (pueden ser 0)')
    actions.updateSettings({ thresholds: Object.fromEntries(parsed) as Record<Rotation, number> })
    toast.success('Avisos guardados')
  }

  return (
    <Card>
      <CardHeader icon={<Bell />} title="Avisos de “se está acabando”" subtitle="Avisarme cuando queden menos de…" />
      <form onSubmit={submit} className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          {ROTATIONS.map((r) => (
            <Field key={r} label={ALERT_LABEL[r]} htmlFor={`th-${r}`} hint={EXAMPLES[r]}>
              <Input
                id={`th-${r}`}
                inputMode="decimal"
                value={values[r]}
                onChange={(e) => setValues((v) => ({ ...v, [r]: e.target.value }))}
                className="tabular h-12 text-lg"
              />
            </Field>
          ))}
        </div>
        <p className="text-sm text-subtle">Si un producto se empieza a vender más rápido de lo normal, la caja te avisa antes por su cuenta.</p>
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
