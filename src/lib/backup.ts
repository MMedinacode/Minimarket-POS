// Recordatorio de respaldo para quien usa la caja SIN cuenta: ahí los datos viven solo en
// este equipo (si se pierde o se borra el navegador, se pierden). Una vez por semana se le
// ofrece descargar el Excel completo, que se puede volver a cargar.
import { readPref, writePref } from './storage'

const DAY = 86_400_000
export const BACKUP_EVERY_DAYS = 7
const SNOOZE_DAYS = 2

/** Se descargó un respaldo: el reloj parte de nuevo */
export function markBackupDone(now = Date.now()) {
  writePref('respaldo', now)
  writePref('respaldoPospuesto', null)
}

/** "Ahora no": se vuelve a preguntar en 2 días */
export function snoozeBackup(now = Date.now()) {
  writePref('respaldoPospuesto', now + SNOOZE_DAYS * DAY)
}

/**
 * ¿Toca recordar el respaldo? Cuenta desde el último respaldo; si nunca hubo uno,
 * desde la primera vez que se revisó (así no se le pide el mismo día que empieza).
 */
export function backupDue(now = Date.now()): boolean {
  let last = readPref<number | null>('respaldo', null)
  if (last === null) {
    last = readPref<number | null>('respaldoDesde', null)
    if (last === null) {
      writePref('respaldoDesde', now)
      return false
    }
  }
  return now - last >= BACKUP_EVERY_DAYS * DAY && now >= readPref<number>('respaldoPospuesto', 0)
}

/** Días desde el último respaldo (null = nunca se ha descargado uno) */
export function daysSinceBackup(now = Date.now()): number | null {
  const last = readPref<number | null>('respaldo', null)
  return last === null ? null : Math.floor((now - last) / DAY)
}
