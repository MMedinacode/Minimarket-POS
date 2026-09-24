import { useState, type FormEvent } from 'react'
import { CloudUpload, KeyRound } from 'lucide-react'
import { readPref, writePref } from '../lib/storage'
import { useCloud } from '../store/AppStore'
import { Modal } from './ui/Modal'
import { Button, Field, Input } from './ui/primitives'
import { useToast } from './ui/Toast'

/**
 * Avisos de la cuenta que pueden aparecer en cualquier pantalla:
 * - Subir los datos que había en este dispositivo a una cuenta vacía.
 * - Crear una contraseña nueva (al llegar desde el correo de recuperación).
 */
export function CloudPrompts() {
  return (
    <>
      <UploadLocalPrompt />
      <RecoveryPrompt />
    </>
  )
}

function UploadLocalPrompt() {
  const { user, sync, localSummary, api } = useCloud()
  const toast = useToast()
  const [dismissed, setDismissed] = useState(false)
  if (!user || !sync?.data || sync.status !== 'synced' || dismissed) return null

  const cloudEmpty = sync.data.products.length === 0 && sync.data.sales.length === 0
  const hasRealLocal = !localSummary.isDemo && localSummary.products > 0
  const key = `uploadAsked:${user.id}`
  if (!cloudEmpty || !hasRealLocal || readPref<boolean>(key, false)) return null

  const close = () => {
    writePref(key, true)
    setDismissed(true)
  }

  return (
    <Modal
      open
      onClose={close}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <CloudUpload className="size-5 text-brand-ink" /> ¿Subir tus datos a la cuenta?
        </span>
      }
      footer={
        <>
          <Button variant="outline" onClick={close}>
            No, empezar vacío
          </Button>
          <Button
            variant="primary"
            data-autofocus
            onClick={() => {
              api.uploadLocal()
              toast.success('Subiendo tus datos a la cuenta…')
              close()
            }}
          >
            Subir datos
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">
        Tu cuenta está vacía y en este dispositivo hay <strong className="text-fg">{localSummary.products} productos</strong> y{' '}
        <strong className="text-fg">{localSummary.sales} ventas</strong>. Si los subes, los verás también en tus otros dispositivos.
      </p>
    </Modal>
  )
}

function RecoveryPrompt() {
  const { recovery, api } = useCloud()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!recovery) return null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 6) return setError('Mínimo 6 caracteres')
    setBusy(true)
    const err = await api.updatePassword(password)
    setBusy(false)
    if (err) setError(err)
    else toast.success('Contraseña actualizada')
  }

  return (
    <Modal
      open
      onClose={() => api.clearRecovery()}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <KeyRound className="size-5" /> Crea tu contraseña nueva
        </span>
      }
      footer={
        <Button variant="primary" type="submit" form="recovery-form" disabled={busy}>
          Guardar contraseña
        </Button>
      }
    >
      <form id="recovery-form" onSubmit={submit}>
        <Field label="Contraseña nueva de la cuenta" htmlFor="rec-pwd" error={error || null}>
          <Input id="rec-pwd" type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
