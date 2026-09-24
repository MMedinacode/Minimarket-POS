import { Cloud, CloudAlert, CloudCheck, CloudOff, RefreshCw } from 'lucide-react'
import { navigate } from '../hooks/useHashRoute'
import { cn, formatTime } from '../lib/utils'
import { useCloud } from '../store/AppStore'

/** Estado de la sincronización en la barra superior. Tocarlo lleva a Ajustes. */
export function SyncBadge() {
  const { enabled, user, sync } = useCloud()
  if (!enabled) return null

  let tone = 'bg-surface-2 text-muted'
  let Icon = CloudOff
  let label = 'Solo este equipo'
  let title = 'Los datos están solo en este dispositivo. Crea una cuenta para usarlos también en el celular.'

  if (user && sync) {
    if (sync.status === 'syncing' || sync.status === 'loading') {
      tone = 'bg-info-soft text-info-ink'
      Icon = RefreshCw
      label = 'Sincronizando…'
      title = 'Enviando y recibiendo cambios'
    } else if (sync.status === 'offline') {
      tone = 'bg-warn-soft text-warn-ink'
      Icon = CloudOff
      label = sync.pending ? `Sin internet · ${sync.pending} por subir` : 'Sin internet'
      title = 'Puedes seguir vendiendo: los cambios se suben solos cuando vuelva la conexión'
    } else if (sync.status === 'error') {
      tone = 'bg-danger-soft text-danger-ink'
      Icon = CloudAlert
      label = 'Error al sincronizar'
      title = sync.error ?? ''
    } else if (sync.pending) {
      tone = 'bg-info-soft text-info-ink'
      Icon = Cloud
      label = `${sync.pending} por subir`
    } else {
      tone = 'bg-ok-soft text-ok-ink'
      Icon = CloudCheck
      label = 'Sincronizado'
      title = sync.lastSyncAt ? `Última sincronización: ${formatTime(new Date(sync.lastSyncAt))}` : ''
    }
  }

  return (
    <button
      type="button"
      onClick={() => navigate('ajustes')}
      title={title}
      aria-label={`${label}. ${title}`}
      className={cn('flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap sm:px-3', tone)}
    >
      <Icon className={cn('size-4 shrink-0', Icon === RefreshCw && 'animate-spin')} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
