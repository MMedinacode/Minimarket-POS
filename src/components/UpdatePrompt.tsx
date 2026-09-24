import { RefreshCw } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from './ui/primitives'

/**
 * La app queda guardada en el dispositivo (funciona sin internet).
 * Cuando se publica una versión nueva, se avisa en vez de recargar solo:
 * así nunca se interrumpe una venta a la mitad.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Revisa si hay versión nueva cada 30 minutos
      if (registration) setInterval(() => void registration.update(), 30 * 60_000)
    },
  })

  if (!needRefresh) return null
  return (
    <div className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[90] mx-auto flex max-w-md animate-pop-in items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-xl lg:bottom-4">
      <RefreshCw className="size-5 shrink-0 text-info-ink" />
      <p className="flex-1 text-sm font-medium">Hay una versión nueva de la app.</p>
      <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
        Después
      </Button>
      <Button size="sm" variant="primary" onClick={() => void updateServiceWorker(true)}>
        Actualizar
      </Button>
    </div>
  )
}
