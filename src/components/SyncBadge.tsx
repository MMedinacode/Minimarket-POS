import { CloudAlert, CloudCheck, CloudOff, CloudUpload, RefreshCw } from 'lucide-react'
import { navigate } from '../hooks/useHashRoute'
import { cn, formatTime } from '../lib/utils'
import { useCloud } from '../store/AppStore'

/**
 * Estado del respaldo en línea, en palabras simples. Solo aparece si hay
 * cuenta; tocarlo lleva a "Cuenta y respaldo".
 */
export function SyncBadge() {
  const { user, sync } = useCloud()
  if (!user || !sync) return null

  let tone = 'bg-ok-soft text-ok-ink'
  let Icon = CloudCheck
  let label = 'Guardado'
  let title = sync.lastSyncAt ? `Todo respaldado en línea (${formatTime(new Date(sync.lastSyncAt))})` : 'Todo respaldado en línea'

  if (sync.status === 'syncing' || sync.status === 'loading') {
    tone = 'bg-info-soft text-info-ink'
    Icon = RefreshCw
    label = 'Guardando…'
    title = 'Enviando y recibiendo cambios'
  } else if (sync.status === 'offline') {
    tone = 'bg-warn-soft text-warn-ink'
    Icon = CloudOff
    label = sync.pending ? `Sin internet (${sync.pending})` : 'Sin internet'
    title = 'Puedes seguir vendiendo: se guarda en este equipo y se sube solo cuando vuelva internet'
  } else if (sync.status === 'error') {
    tone = 'bg-danger-soft text-danger-ink'
    Icon = CloudAlert
    label = 'Revisar respaldo'
    title = sync.error ?? ''
  } else if (sync.pending) {
    tone = 'bg-info-soft text-info-ink'
    Icon = CloudUpload
    label = 'Guardando…'
  }

  return (
    <button
      type="button"
      onClick={() => navigate('cuenta')}
      title={title}
      aria-label={`${label}. ${title}`}
      className={cn('flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold whitespace-nowrap', tone)}
    >
      <Icon className={cn('size-4 shrink-0', Icon === RefreshCw && 'animate-spin')} />
      {label}
    </button>
  )
}
