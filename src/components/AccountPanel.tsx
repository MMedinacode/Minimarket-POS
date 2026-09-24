import { useState, type FormEvent } from 'react'
import { ArrowLeft, Eye, EyeOff, Loader2, MailCheck } from 'lucide-react'
import { useCloud } from '../store/AppStore'
import { Button, Field, Input, Segmented } from './ui/primitives'

type View = 'login' | 'signup' | 'reset' | 'sent-confirm' | 'sent-reset'

/**
 * Iniciar sesión / crear cuenta / recuperar contraseña.
 * Se usa en Ajustes y desde la pantalla de acceso.
 */
export function AccountPanel({ onSignedIn, initialView = 'login' }: { onSignedIn?: () => void; initialView?: 'login' | 'signup' }) {
  const { api } = useCloud()
  const [view, setView] = useState<View>(initialView)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [business, setBusiness] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Escribe un correo válido')
    if (view !== 'reset' && password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres')
    setBusy(true)
    try {
      if (view === 'login') {
        const err = await api.signIn(email, password)
        if (err) setError(err)
        else onSignedIn?.()
      } else if (view === 'signup') {
        const res = await api.signUp(email, password, business)
        if (res.error) setError(res.error)
        else if (res.needsConfirmation) setView('sent-confirm')
        else onSignedIn?.()
      } else if (view === 'reset') {
        const err = await api.resetPassword(email)
        if (err) setError(err)
        else setView('sent-reset')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo conectar')
    } finally {
      setBusy(false)
    }
  }

  if (view === 'sent-confirm' || view === 'sent-reset') {
    return (
      <div className="py-2 text-center">
        <MailCheck className="mx-auto size-10 text-ok-ink" />
        <p className="mt-3 font-semibold">Revisa tu correo</p>
        <p className="mt-1 text-sm text-muted">
          {view === 'sent-confirm' ? (
            <>
              Enviamos un link a <strong className="text-fg">{email}</strong> para activar tu cuenta. Ábrelo (revisa también spam) y
              después inicia sesión aquí.
            </>
          ) : (
            <>
              Enviamos un link a <strong className="text-fg">{email}</strong> para crear una contraseña nueva.
            </>
          )}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => setView('login')}>
          Ir a iniciar sesión
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {view === 'reset' ? (
        <button type="button" className="flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg" onClick={() => setView('login')}>
          <ArrowLeft className="size-4" /> Volver
        </button>
      ) : (
        <Segmented
          className="flex w-full"
          value={view as 'login' | 'signup'}
          onChange={(v) => {
            setView(v)
            setError('')
          }}
          ariaLabel="Cuenta"
          options={[
            { value: 'login', label: 'Iniciar sesión' },
            { value: 'signup', label: 'Crear cuenta' },
          ]}
        />
      )}

      {view === 'reset' && <p className="text-sm text-muted">Te enviaremos un link para crear una contraseña nueva.</p>}

      <Field label="Correo" htmlFor="acc-email">
        <Input id="acc-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.cl" />
      </Field>

      {view !== 'reset' && (
        <Field label="Contraseña" htmlFor="acc-pwd" hint={view === 'signup' ? 'Mínimo 6 caracteres' : undefined}>
          <div className="relative">
            <Input
              id="acc-pwd"
              type={show ? 'text' : 'password'}
              autoComplete={view === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute top-1/2 right-1.5 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-subtle hover:bg-surface-2"
              aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
      )}

      {view === 'signup' && (
        <Field label="Nombre del negocio" htmlFor="acc-biz">
          <Input id="acc-biz" value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Ej: Bazar Rosita" maxLength={40} />
        </Field>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger-ink">
          {error}
        </p>
      )}

      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        {view === 'login' ? 'Entrar' : view === 'signup' ? 'Crear cuenta' : 'Enviar link'}
      </Button>

      {view === 'login' && (
        <button type="button" className="w-full text-center text-sm font-semibold text-muted hover:text-fg" onClick={() => setView('reset')}>
          ¿Olvidaste tu contraseña?
        </button>
      )}
    </form>
  )
}
