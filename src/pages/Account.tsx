import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Cloud, CloudOff, LogOut, RefreshCw, ShieldCheck, Smartphone, WifiOff } from 'lucide-react'
import { AccountPanel } from '../components/AccountPanel'
import { ConfirmDialog } from '../components/ui/Modal'
import { Badge, Button, Card, CardHeader } from '../components/ui/primitives'
import { useToast } from '../components/ui/Toast'
import { formatDate, formatTime } from '../lib/utils'
import { useCloud } from '../store/AppStore'

const BENEFITS = [
  { icon: Smartphone, text: 'Los mismos productos, ventas y stock en el computador y en el celular, al instante.' },
  { icon: ShieldCheck, text: 'Respaldo automático en internet: si se pierde o se rompe el equipo, tus datos siguen ahí.' },
  { icon: WifiOff, text: 'Si se corta internet sigues vendiendo: se sube solo cuando vuelve.' },
]

/** Cuenta en la nube: crear, entrar, ver el estado del respaldo y salir */
export default function Account() {
  const cloud = useCloud()
  const toast = useToast()
  const [confirmOut, setConfirmOut] = useState<number | null>(null)

  if (!cloud.enabled) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader icon={<CloudOff />} title="Respaldo en línea no activado" subtitle="Por ahora los datos quedan solo en este equipo." />
        <p className="px-4 pt-3 pb-5 text-muted sm:px-5">
          Para usar la caja en varios equipos, quien instaló el sistema debe activar el respaldo en línea (Supabase). Mientras tanto,
          descarga un Excel de respaldo seguido desde <strong className="text-fg">Más → Excel y respaldo</strong>.
        </p>
      </Card>
    )
  }

  if (!cloud.user) {
    return (
      <Card className="mx-auto max-w-3xl">
        <CardHeader icon={<Cloud />} title="Usa tu caja en el computador y en el celular" subtitle="Crea una cuenta gratis o entra con la que ya tienes" />
        <div className="grid gap-6 p-4 sm:p-5 md:grid-cols-2">
          <ul className="space-y-4">
            {BENEFITS.map((b) => (
              <li key={b.text} className="flex gap-3">
                <b.icon className="mt-0.5 size-6 shrink-0 text-brand-ink" />
                <span className="text-muted">{b.text}</span>
              </li>
            ))}
          </ul>
          <AccountPanel onSignedIn={() => toast.success('¡Listo! Tus datos ahora se respaldan en línea')} />
        </div>
      </Card>
    )
  }

  const s = cloud.sync
  const status =
    !s || s.status === 'loading' || s.status === 'syncing'
      ? { icon: <RefreshCw className="size-4 animate-spin" />, text: 'Guardando…', tone: 'info' as const }
      : s.status === 'offline'
        ? { icon: <WifiOff className="size-4" />, text: 'Sin internet: se guarda en este equipo y se sube después', tone: 'warn' as const }
        : s.status === 'error'
          ? { icon: <AlertTriangle className="size-4" />, text: `Problema: ${s.error}`, tone: 'danger' as const }
          : { icon: <CheckCircle2 className="size-4" />, text: 'Todo respaldado', tone: 'ok' as const }

  const signOut = async (force = false) => {
    const res = await cloud.api.signOut(force)
    if (res.unsynced > 0) setConfirmOut(res.unsynced)
    else toast.success('Cerraste la cuenta en este equipo')
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader icon={<Cloud />} title="Tu cuenta" subtitle={cloud.user.email} />
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone} className="px-3 py-1.5 text-sm">
            {status.icon} {status.text}
          </Badge>
          {s && s.pending > 0 && <Badge tone="info">{s.pending} cambios por subir</Badge>}
        </div>
        {s?.lastSyncAt && (
          <p className="text-subtle">
            Último respaldo: {formatDate(new Date(s.lastSyncAt))} a las {formatTime(new Date(s.lastSyncAt))}
          </p>
        )}
        <p className="text-muted">
          Para usar la caja en otro equipo, abre la misma dirección allí y elige <strong className="text-fg">“Ya uso la caja en otro equipo”</strong>{' '}
          con este mismo correo.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => cloud.api.syncNow()}>
            <RefreshCw /> Respaldar ahora
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            <LogOut /> Cerrar la cuenta en este equipo
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOut !== null}
        onClose={() => setConfirmOut(null)}
        danger
        title="Hay cambios sin subir"
        confirmLabel="Salir igual"
        onConfirm={() => void signOut(true)}
      >
        Este equipo tiene <strong className="text-fg">{confirmOut} cambios</strong> que todavía no llegan a internet (por ejemplo, ventas hechas sin
        conexión). Si sales ahora se perderán. Mejor conéctate a internet y espera a que diga “Todo respaldado”.
      </ConfirmDialog>
    </Card>
  )
}
