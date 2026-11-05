import { useState } from 'react'
import { useCloud } from '../store/AppStore'
import { ConfirmDialog } from './ui/Modal'
import { useToast } from './ui/Toast'

/**
 * "Cerrar sesión", para terminar el día o dejar un equipo que no es tuyo.
 * Con cuenta: la cierra en este equipo (con el mismo cuidado de no perder ventas sin subir).
 * Sin cuenta: los datos viven en el equipo, así que queda cerrada con la clave.
 */
export function SignOutDialog({ open, onClose, onClosed }: { open: boolean; onClose: () => void; onClosed: () => void }) {
  const cloud = useCloud()
  const toast = useToast()
  const [unsynced, setUnsynced] = useState<number | null>(null)
  const withAccount = cloud.enabled && Boolean(cloud.user)

  const run = async (force = false) => {
    if (withAccount) {
      try {
        const res = await cloud.api.signOut(force, true)
        if (res.unsynced > 0) {
          setUnsynced(res.unsynced)
          return
        }
      } catch {
        toast.error('No se pudo cerrar la sesión. Revisa tu internet e inténtalo de nuevo.')
        return
      }
    }
    onClosed()
  }

  return (
    <>
      <ConfirmDialog open={open} onClose={onClose} title="¿Cerrar sesión?" confirmLabel="Cerrar sesión" onConfirm={() => void run()}>
        {withAccount ? (
          <>
            Tus productos y ventas quedan respaldados en internet. Para volver a entrar necesitas <strong className="text-fg">tu clave, internet, tu correo y tu contraseña</strong>.
          </>
        ) : (
          <>
            Tus productos y ventas quedan guardados en este equipo. Para volver a entrar hay que escribir <strong className="text-fg">tu clave</strong>.
          </>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={unsynced !== null}
        onClose={() => setUnsynced(null)}
        danger
        title="Hay ventas sin respaldar"
        confirmLabel="Salir igual"
        onConfirm={() => void run(true)}
      >
        Este equipo tiene <strong className="text-fg">{unsynced} cambios</strong> que todavía no llegan a internet (por ejemplo, ventas hechas sin conexión). Si sales ahora se
        perderán. Mejor conéctate a internet y espera a que diga “Todo respaldado”.
      </ConfirmDialog>
    </>
  )
}
