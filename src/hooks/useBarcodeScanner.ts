import { useEffect, useRef } from 'react'

interface Options {
  onScan: (code: string) => void
  enabled?: boolean
  /** Largo mínimo del código (EAN-8 = 8, PLU cortos = 4) */
  minLength?: number
  /** Tiempo promedio máximo entre teclas para considerarlo pistola (ms) */
  maxAvgInterval?: number
}

type Editable = HTMLInputElement | HTMLTextAreaElement

const isEditable = (el: EventTarget | null): el is Editable =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement

/** Cambia el valor de un input controlado por React y avisa del cambio */
function restoreValue(el: Editable, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Detecta lectores de código de barras tipo pistola (USB o Bluetooth).
 *
 * Estas pistolas se comportan como un teclado que escribe MUY rápido
 * (menos de 50 ms entre teclas) y terminan con Enter. Una persona
 * no escribe tan rápido, así que así se distingue una de otra.
 *
 * - Funciona sin que el cursor esté en ningún campo.
 * - Si el cursor estaba en otro campo (ej: "monto recibido"), se deshace lo
 *   que la pistola escribió ahí, para no ensuciar ese campo.
 * - Los inputs con el atributo data-scan-target reciben el código tal cual
 *   (ej: el campo "código de barras" del formulario de producto).
 */
export function useBarcodeScanner({ onScan, enabled = true, minLength = 4, maxAvgInterval = 50 }: Options) {
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    if (!enabled) return
    let buffer = ''
    let times: number[] = []
    let snapshot: { el: Editable; value: string } | null = null

    const reset = () => {
      buffer = ''
      times = []
      snapshot = null
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return
      const now = performance.now()

      if (e.key === 'Enter' || e.key === 'Tab') {
        const last = times[times.length - 1] ?? 0
        const intervals = times.slice(1).map((t, i) => t - times[i])
        const avg = intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : Infinity
        const isScan = buffer.length >= minLength && now - last < 100 && avg <= maxAvgInterval
        if (isScan) {
          const target = e.target as HTMLElement | null
          if (target?.closest?.('[data-scan-target]')) {
            // El campo quiere el código: se deja pasar normal
            reset()
            return
          }
          e.preventDefault()
          e.stopPropagation()
          if (snapshot) restoreValue(snapshot.el, snapshot.value)
          const code = buffer
          reset()
          onScanRef.current(code)
          return
        }
        reset()
        return
      }

      if (e.key.length !== 1 || e.repeat) {
        // Teclas especiales (flechas, Shift...) no cuentan, pero Shift no corta la ráfaga
        if (e.key !== 'Shift') reset()
        return
      }

      const last = times[times.length - 1]
      if (last === undefined || now - last > 100) {
        // Empieza una ráfaga nueva: guardamos cómo estaba el campo con foco
        buffer = ''
        times = []
        snapshot = isEditable(e.target) ? { el: e.target, value: e.target.value } : null
      }
      buffer += e.key
      times.push(now)
    }

    // Fase de captura: vemos la tecla antes que cualquier input
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [enabled, minLength, maxAvgInterval])
}
