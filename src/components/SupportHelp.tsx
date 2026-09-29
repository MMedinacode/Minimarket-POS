import { useState, type ReactNode } from 'react'
import { Loader2, MessageCircle, Phone } from 'lucide-react'
import {
  formatHelpCode,
  helpMessage,
  redeemSupportToken,
  startHelpRequest,
  SUPPORT_ERROR,
  supportPhoneLabel,
  supportTelUrl,
  whatsappUrl,
} from '../lib/support'
import { Button, Input } from './ui/primitives'

/**
 * "Olvidé mi clave" → pedir ayuda por WhatsApp. Muestra el código de 8 números,
 * abre WhatsApp con el mensaje listo y, si el link de respuesta no abre la caja
 * (ej: iPhone con la caja instalada), deja pegar el mensaje recibido.
 */
export function SupportHelp({ businessName, onUnlocked }: { businessName: string; onUnlocked: () => void }) {
  const [req, setReq] = useState(() => startHelpRequest())
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const sendWhatsApp = () => {
    const url = whatsappUrl(helpMessage(req.code, businessName))
    if (url) window.open(url, '_blank', 'noopener')
  }

  const applyPasted = async () => {
    setBusy(true)
    setError('')
    const result = await redeemSupportToken(pasted)
    setBusy(false)
    if (result === 'ok') return onUnlocked()
    if (result === 'vencido') {
      setReq(startHelpRequest())
      setPasted('')
      return setError('Ese link venció (dura 1 hora). Ya tienes un código nuevo: mándalo otra vez por WhatsApp.')
    }
    setError(SUPPORT_ERROR[result])
  }

  return (
    <div className="space-y-5">
      <Step n={1}>
        <p>Toca el botón y manda el mensaje tal cual. Lleva este código:</p>
        <p className="my-3 text-center font-mono text-3xl font-bold tracking-widest" aria-label={`Código ${req.code.split('').join(' ')}`}>
          {formatHelpCode(req.code)}
        </p>
        <Button variant="primary" size="lg" className="w-full" onClick={sendWhatsApp}>
          <MessageCircle /> Mandar WhatsApp
        </Button>
        <a href={supportTelUrl()} className="mt-2 flex items-center justify-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
          <Phone className="size-4" /> ¿Prefieres llamar? {supportPhoneLabel()} y dicta el código
        </a>
      </Step>

      <Step n={2}>
        <p>
          Te vamos a responder con un <strong>link</strong>. Tócalo <strong>desde este mismo equipo</strong> y crea tu clave nueva. No se borra nada.
        </p>
        <p className="mt-1 text-sm text-subtle">El código sirve por 1 hora.</p>
      </Step>

      <details className="rounded-xl bg-surface-2 p-3">
        <summary className="cursor-pointer font-semibold">¿El link no abre la caja?</summary>
        <p className="mt-2 text-sm text-muted">Mantén apretado el mensaje que te mandamos, toca «Copiar» y pégalo aquí:</p>
        <Input
          className="mt-2"
          value={pasted}
          onChange={(e) => {
            setPasted(e.target.value)
            setError('')
          }}
          placeholder="Pega aquí el mensaje"
          aria-label="Mensaje de soporte"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm font-medium text-danger-ink">
            {error}
          </p>
        )}
        <Button variant="primary" className="mt-2 w-full" disabled={busy || !pasted.trim()} onClick={() => void applyPasted()}>
          {busy && <Loader2 className="animate-spin" />} Usar el link
        </Button>
      </details>
    </div>
  )
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-on-brand font-bold">{n}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
