import { useEffect, useId, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { CameraOff, Loader2, SwitchCamera, X } from 'lucide-react'
import { readPref, writePref } from '../lib/storage'
import { cn } from '../lib/utils'
import { Button } from './ui/primitives'

type Facing = 'environment' | 'user'

const FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.QR_CODE,
]

// Los inicios y cierres de cámara se encadenan: así nunca hay dos lectores
// peleando por la misma cámara (pasa al cambiar de cámara rápido).
let chain: Promise<void> = Promise.resolve()

function explain(err: unknown): string {
  const msg = String(err instanceof Error ? `${err.name} ${err.message}` : err)
  if (!window.isSecureContext) return 'La cámara solo funciona con HTTPS (en Netlify funciona) o en localhost.'
  if (/NotAllowed|Permission/i.test(msg)) return 'No se dio permiso para usar la cámara. Actívalo en la configuración del navegador.'
  if (/NotFound|Requested device not found|no camera/i.test(msg)) return 'No se encontró ninguna cámara en este dispositivo.'
  if (/NotReadable|in use|Could not start/i.test(msg)) return 'La cámara está siendo usada por otra aplicación.'
  return 'No se pudo iniciar la cámara.'
}

interface Props {
  onDetected: (code: string) => void
  onClose?: () => void
  className?: string
}

/**
 * Lector de códigos de barra con la cámara del celular/tablet/notebook.
 * Soporta EAN-13/8, UPC, Code 128/39, ITF y QR.
 */
export default function CameraScanner({ onDetected, onClose, className }: Props) {
  const regionId = `scan-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [facing, setFacing] = useState<Facing>(() => readPref<Facing>('camera', 'environment'))
  const [status, setStatus] = useState<'starting' | 'running' | 'error'>('starting')
  const [error, setError] = useState('')
  const onDetectedRef = useRef(onDetected)
  const last = useRef({ code: '', t: 0 })

  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    let cancelled = false
    let scanner: Html5Qrcode | null = null
    setStatus('starting')

    chain = chain.then(async () => {
      if (cancelled) return
      scanner = new Html5Qrcode(regionId, {
        formatsToSupport: FORMATS,
        verbose: false,
        // Usa el detector nativo del navegador cuando existe (mucho más rápido en Android)
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      })
      try {
        await scanner.start(
          { facingMode: facing },
          {
            fps: 12,
            qrbox: (w, h) => ({ width: Math.floor(Math.min(w * 0.86, 380)), height: Math.floor(Math.min(h * 0.55, 190)) }),
          },
          (text) => {
            const now = Date.now()
            // Ignora el mismo código leído dos veces seguidas
            if (text === last.current.code && now - last.current.t < 2000) return
            last.current = { code: text, t: now }
            onDetectedRef.current(text.trim())
          },
          () => {
            /* frames sin código: normal */
          },
        )
        if (!cancelled) setStatus('running')
      } catch (err) {
        if (!cancelled) {
          setError(explain(err))
          setStatus('error')
        }
      }
    })

    return () => {
      cancelled = true
      chain = chain.then(async () => {
        const s = scanner as Html5Qrcode | null
        if (!s) return
        try {
          if (s.isScanning) await s.stop()
        } catch {
          /* ya estaba detenido */
        }
        try {
          s.clear()
        } catch {
          /* nada que limpiar */
        }
      })
    }
  }, [facing, regionId])

  const switchCamera = () => {
    const next: Facing = facing === 'environment' ? 'user' : 'environment'
    writePref('camera', next)
    setFacing(next)
  }

  return (
    <div className={cn('relative overflow-hidden rounded-2xl border border-line bg-black', className)}>
      <div id={regionId} className="scanner-view aspect-[4/3] w-full [&>div]:!border-0" />

      {status === 'starting' && (
        <div className="absolute inset-0 grid place-items-center text-white/80">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="size-5 animate-spin" /> Encendiendo cámara…
          </div>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 grid place-items-center bg-surface p-5 text-center">
          <div>
            <CameraOff className="mx-auto mb-2 size-8 text-danger-ink" />
            <p className="text-sm font-medium">{error}</p>
            <p className="mt-1 text-xs text-subtle">Puedes seguir usando la pistola lectora o escribir el código.</p>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-2">
        <span className="rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white">
          {facing === 'environment' ? 'Cámara trasera' : 'Cámara frontal'}
        </span>
        <div className="flex gap-1.5">
          <Button
            size="icon-sm"
            className="bg-black/55 text-white hover:bg-black/70"
            onClick={switchCamera}
            aria-label="Cambiar cámara"
            title="Cambiar entre cámara frontal y trasera"
          >
            <SwitchCamera />
          </Button>
          {onClose && (
            <Button size="icon-sm" className="bg-black/55 text-white hover:bg-black/70" onClick={onClose} aria-label="Apagar cámara">
              <X />
            </Button>
          )}
        </div>
      </div>
      {status === 'running' && (
        <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pt-6 pb-2 text-center text-xs font-medium text-white">
          Apunta al código de barras
        </p>
      )}
    </div>
  )
}
