import { useEffect, useState } from 'react'
import { dayKey } from '../lib/utils'

/**
 * El día de hoy ("2026-10-26") que se actualiza solo: si la caja queda abierta de noche,
 * a la mañana "Vendiste hoy" vuelve a $0 en vez de seguir mostrando lo de ayer.
 * Revisa cada minuto y al volver a la pestaña (el celular congela los timers en segundo plano).
 */
export function useToday(): string {
  const [today, setToday] = useState(() => dayKey())
  useEffect(() => {
    const check = () => setToday(dayKey()) // mismo texto = React no vuelve a dibujar
    const timer = setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return today
}
