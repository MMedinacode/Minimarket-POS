import { useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, Database, HardDrive, KeyRound, LogOut, RotateCcw, Save, Store, Trash2 } from 'lucide-react'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Button, Card, CardHeader, Field, Input } from '../components/ui/primitives'
import { useToast } from '../components/ui/Toast'
import { changePassword } from '../lib/auth'
import { formatInt } from '../lib/utils'
import { useActions, useData } from '../store/AppStore'
import { ROTATIONS, type Rotation } from '../types'

export default function SettingsPage({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-5">
      <BusinessCard />
      <StockCard />
      <PasswordCard />
      <DataCard />
      <div className="flex justify-center pt-2 lg:hidden">
        <Button variant="ghost" onClick={onLogout}>
          <LogOut /> Cerrar sesión
        </Button>
      </div>
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
    toast.success('Nombre del negocio actualizado')
  }

  return (
    <Card>
      <CardHeader icon={<Store />} title="Tu negocio" />
      <form onSubmit={submit} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:p-5">
        <Field label="Nombre que aparece en la app" htmlFor="biz" className="flex-1">
          <Input id="biz" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </Field>
        <Button type="submit" variant="primary" disabled={!name.trim() || name.trim() === settings.businessName}>
          <Save /> Guardar
        </Button>
      </form>
    </Card>
  )
}

function StockCard() {
  const { settings } = useData()
  const actions = useActions()
  const toast = useToast()
  const [thresholds, setThresholds] = useState<Record<Rotation, string>>(() => ({
    Alta: String(settings.thresholds.Alta),
    Media: String(settings.thresholds.Media),
    Baja: String(settings.thresholds.Baja),
  }))
  const [coverage, setCoverage] = useState(String(settings.coverageDays))
  const [slow, setSlow] = useState(String(settings.slowMoverDays))
  const [allowNegative, setAllowNegative] = useState(settings.allowNegativeStock)

  const num = (s: string) => {
    const n = Number(s.replace(',', '.'))
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const t = { Alta: num(thresholds.Alta), Media: num(thresholds.Media), Baja: num(thresholds.Baja) }
    const c = num(coverage)
    const s = num(slow)
    if (Object.values(t).some((v) => v === null) || c === null || s === null || s < 1) {
      toast.error('Revisa los números: deben ser positivos')
      return
    }
    actions.updateSettings({
      thresholds: t as Record<Rotation, number>,
      coverageDays: c,
      slowMoverDays: Math.round(s),
      allowNegativeStock: allowNegative,
    })
    toast.success('Reglas de stock actualizadas')
  }

  const help: Record<Rotation, string> = {
    Alta: 'Bebidas, pan, cigarros, snacks',
    Media: 'Lácteos, abarrotes comunes',
    Baja: 'Legumbres, aseo, productos ocasionales',
  }

  return (
    <Card>
      <CardHeader
        icon={<AlertTriangle />}
        title="Stock crítico"
        subtitle="Cada producto alerta según su rotación. Si se vende más rápido de lo esperado, el sistema sube el umbral solo."
      />
      <form onSubmit={submit} className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          {ROTATIONS.map((r) => (
            <Field key={r} label={`Rotación ${r.toLowerCase()}: alertar bajo`} htmlFor={`th-${r}`} hint={help[r]}>
              <Input
                id={`th-${r}`}
                inputMode="decimal"
                value={thresholds[r]}
                onChange={(e) => setThresholds((t) => ({ ...t, [r]: e.target.value }))}
                className="tabular"
              />
            </Field>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Días de venta que debe cubrir el stock"
            htmlFor="cov"
            hint="Ej: 2 = si un producto vende 8 al día, alerta cuando quedan menos de 16"
          >
            <Input id="cov" inputMode="decimal" value={coverage} onChange={(e) => setCoverage(e.target.value)} className="tabular" />
          </Field>
          <Field label="Días sin ventas para “menor rotación”" htmlFor="slow" hint="Aparecen en el dashboard como productos lentos">
            <Input id="slow" inputMode="numeric" value={slow} onChange={(e) => setSlow(e.target.value)} className="tabular" />
          </Field>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
          <input
            type="checkbox"
            className="mt-0.5 size-5 accent-[var(--brand)]"
            checked={allowNegative}
            onChange={(e) => setAllowNegative(e.target.checked)}
          />
          <span className="text-sm">
            <span className="block font-semibold">Permitir vender sin stock en el sistema</span>
            <span className="text-subtle">
              Útil si todavía no cuadras el inventario: la venta se registra aunque el sistema diga 0 unidades.
            </span>
          </span>
        </label>
        <div className="flex justify-end">
          <Button type="submit" variant="primary">
            <Save /> Guardar reglas
          </Button>
        </div>
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

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (next !== repeat) return setError('Las contraseñas nuevas no coinciden')
    const err = changePassword(current, next)
    if (err) return setError(err)
    setCurrent('')
    setNext('')
    setRepeat('')
    setError('')
    toast.success('Contraseña cambiada')
  }

  return (
    <Card>
      <CardHeader icon={<KeyRound />} title="Contraseña máster" subtitle="La que se pide al abrir la app en este dispositivo" />
      <form onSubmit={submit} className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
        <Field label="Actual" htmlFor="pw-cur">
          <Input id="pw-cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="Nueva" htmlFor="pw-new">
          <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Repetir nueva" htmlFor="pw-rep">
          <Input id="pw-rep" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </Field>
        {error && (
          <p className="text-sm font-medium text-danger-ink sm:col-span-3" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end sm:col-span-3">
          <Button type="submit" variant="primary" disabled={!current || !next || !repeat}>
            <KeyRound /> Cambiar contraseña
          </Button>
        </div>
      </form>
    </Card>
  )
}

function DataCard() {
  const { products, sales, expenses, settings } = useData()
  const actions = useActions()
  const toast = useToast()
  const [usage, setUsage] = useState<string | null>(null)
  const [confirmDemo, setConfirmDemo] = useState(false)
  const [wipeOpen, setWipeOpen] = useState(false)
  const [wipeText, setWipeText] = useState('')

  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((e) => {
        if (e.usage !== undefined) setUsage(`${(e.usage / 1024 / 1024).toFixed(1).replace('.', ',')} MB usados`)
      })
      .catch(() => {})
  }, [products, sales, expenses])

  return (
    <Card>
      <CardHeader icon={<Database />} title="Datos" subtitle="Todo se guarda en este navegador. Exporta el Excel seguido como respaldo." />
      <div className="space-y-4 p-4 sm:p-5">
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            ['Productos', products.length],
            ['Ventas', sales.length],
            ['Gastos', expenses.length],
          ].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-surface-2 p-3">
              <p className="tabular text-2xl font-extrabold">{formatInt(Number(v))}</p>
              <p className="text-xs text-subtle">{l}</p>
            </div>
          ))}
        </div>
        {usage && (
          <p className="flex items-center gap-2 text-sm text-subtle">
            <HardDrive className="size-4" /> {usage} en este dispositivo
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setConfirmDemo(true)}>
            <RotateCcw /> Cargar datos de demostración
          </Button>
          <Button variant="danger-soft" onClick={() => setWipeOpen(true)}>
            <Trash2 /> Borrar todos los datos
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDemo}
        onClose={() => setConfirmDemo(false)}
        danger
        title="¿Cargar datos de demostración?"
        confirmLabel="Reemplazar con demo"
        onConfirm={() => {
          actions.loadDemo()
          toast.success('Datos de demostración cargados')
        }}
      >
        Esto <strong className="text-fg">reemplaza</strong> tus productos, ventas y gastos por los de ejemplo. Descarga tu Excel antes si
        quieres conservarlos.
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
            <Button variant="outline" onClick={() => setWipeOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={wipeText.trim().toUpperCase() !== 'BORRAR'}
              onClick={async () => {
                await actions.wipeAll(settings)
                setWipeOpen(false)
                setWipeText('')
                toast.success('Datos borrados. El sistema quedó vacío.')
              }}
            >
              Borrar definitivamente
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Se eliminarán <strong className="text-fg">todos</strong> los productos, ventas y gastos de este dispositivo. No se puede deshacer.
          Escribe <strong className="font-mono text-fg">BORRAR</strong> para confirmar.
        </p>
        <Input className="mt-3" value={wipeText} onChange={(e) => setWipeText(e.target.value)} autoFocus aria-label="Escribe BORRAR para confirmar" />
      </Modal>
    </Card>
  )
}
