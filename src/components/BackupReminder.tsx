import { useState } from 'react'
import { Cloud, Download, Loader2 } from 'lucide-react'
import { navigate } from '../hooks/useHashRoute'
import { backupDue, daysSinceBackup, markBackupDone, snoozeBackup } from '../lib/backup'
import { useCloud, useData } from '../store/AppStore'
import { Button } from './ui/primitives'
import { useToast } from './ui/Toast'

/**
 * Aviso semanal en Inicio para quien usa la caja sin cuenta: descargar el respaldo en Excel.
 * Con cuenta no aparece (el respaldo en línea es automático).
 */
export function BackupReminder() {
  const data = useData()
  const cloud = useCloud()
  const toast = useToast()
  const [due, setDue] = useState(() => backupDue())
  const [busy, setBusy] = useState(false)
  if (!due) return null

  const days = daysSinceBackup()
  const download = async () => {
    setBusy(true)
    try {
      const { exportWorkbook } = await import('../lib/excel-io')
      exportWorkbook(data)
      markBackupDone()
      setDue(false)
      toast.success('Listo: revisa que el archivo esté en Descargas y mándatelo por WhatsApp o correo.', { duration: 8000 })
    } catch (err) {
      console.error(err)
      toast.error('No se pudo descargar el respaldo. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-warn/40 bg-warn-soft p-4 sm:p-5">
      <p className="text-lg font-bold text-warn-ink">{days === null ? 'Guarda un respaldo de tu caja' : `Hace ${days} días que no guardas un respaldo`}</p>
      <p className="mt-1">
        Tus productos y ventas están guardados solo en este equipo. Si se pierde o se echa a perder, con el respaldo recuperas tus
        productos con sus precios y cantidades (las ventas quedan en el archivo para consultarlas).
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void download()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Download />} Descargar respaldo
        </Button>
        {cloud.enabled && (
          <Button variant="outline" onClick={() => navigate('cuenta')}>
            <Cloud /> Respaldo automático
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            snoozeBackup()
            setDue(false)
          }}
        >
          Ahora no
        </Button>
      </div>
    </div>
  )
}
