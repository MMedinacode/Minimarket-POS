import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Cloud, Eye, EyeOff, Loader2, Lock, MessageCircle, Store } from 'lucide-react'
import { AccountPanel } from '../components/AccountPanel'
import { SupportHelp } from '../components/SupportHelp'
import { Modal } from '../components/ui/Modal'
import { Button, ChoiceButton, Input } from '../components/ui/primitives'
import {
  attemptsBeforeLock,
  clearFailedAttempts,
  forgetPassword,
  lockedForMs,
  registerFailedAttempt,
  startSession,
  verifyPassword,
} from '../lib/auth'
import { clearData, freezeStorage, writePref } from '../lib/storage'
import { supportUnlockAvailable } from '../lib/support'
import { useCloud } from '../store/AppStore'

interface Props {
  businessName: string
  onSuccess: () => void
  /** Olvidó la clave y demostró que es el dueño (cuenta o soporte): hay que crear una nueva */
  onForgot: () => void
}

/** Pantalla para abrir la caja con la clave */
export default function Login({ businessName, onSuccess, onForgot }: Props) {
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [lockMs, setLockMs] = useState(() => lockedForMs())
  const [shake, setShake] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  // Cuenta regresiva mientras está bloqueado
  useEffect(() => {
    if (lockMs <= 0) return
    const t = setInterval(() => setLockMs(lockedForMs()), 500)
    return () => clearInterval(t)
  }, [lockMs])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (lockedForMs() > 0 || busy) return
    setBusy(true)
    let ok = false
    try {
      ok = await verifyPassword(password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo comprobar la clave')
      setBusy(false)
      return
    }
    setBusy(false)
    if (ok) {
      clearFailedAttempts()
      startSession()
      onSuccess()
      return
    }
    registerFailedAttempt()
    setPassword('')
    setShake(true)
    setTimeout(() => setShake(false), 400)
    const locked = lockedForMs()
    if (locked > 0) {
      setLockMs(locked)
      setError('')
    } else {
      const left = attemptsBeforeLock()
      setError(left <= 2 ? `Clave incorrecta. Si fallas ${left === 1 ? '1 vez más' : `${left} veces más`}, tendrás que esperar.` : 'Clave incorrecta. Inténtalo de nuevo.')
    }
  }

  const locked = lockMs > 0
  const waitText = lockMs > 60_000 ? `${Math.ceil(lockMs / 60_000)} minutos` : `${Math.ceil(lockMs / 1000)} segundos`

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-bg px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -top-40 -left-32 size-[28rem] rounded-full bg-brand/15 blur-3xl" />
        <div className="absolute -right-32 -bottom-40 size-[26rem] rounded-full bg-chart-1/15 blur-3xl" />
      </div>

      <form onSubmit={submit} className={`relative w-full max-w-sm animate-pop-in rounded-3xl border border-line bg-surface p-7 shadow-xl ${shake ? 'animate-shake' : ''}`}>
        <div className="mb-6 text-center">
          <span className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-brand text-on-brand shadow-lg shadow-brand/25">
            <Store className="size-8" />
          </span>
          <h1 className="text-2xl font-bold">{businessName}</h1>
          <p className="mt-1 text-muted">Escribe tu clave para abrir la caja</p>
        </div>

        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-subtle" />
          <Input
            id="pwd"
            type={show ? 'text' : 'password'}
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError('')
            }}
            disabled={locked}
            aria-label="Clave"
            aria-invalid={Boolean(error)}
            aria-describedby="pwd-error"
            className="h-14 pr-12 pl-12 text-xl tracking-widest"
            placeholder="Tu clave"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-fg"
            aria-label={show ? 'Ocultar clave' : 'Mostrar clave'}
          >
            {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>

        <p id="pwd-error" role="alert" className="mt-2 min-h-6 font-medium text-danger-ink">
          {locked ? `Muchos intentos seguidos. Espera ${waitText} para intentar de nuevo.` : error}
        </p>

        <Button type="submit" variant="primary" size="lg" className="mt-2 w-full" disabled={!password || locked || busy}>
          {busy && <Loader2 className="animate-spin" />} Entrar
        </Button>

        <button type="button" onClick={() => setForgotOpen(true)} className="mt-5 w-full text-center font-semibold text-muted hover:text-fg">
          ¿Olvidaste tu clave?
        </button>
      </form>

      <ForgotModal open={forgotOpen} onClose={() => setForgotOpen(false)} onForgot={onForgot} businessName={businessName} />
    </div>
  )
}

type ForgotView = 'menu' | 'cuenta' | 'whatsapp' | 'borrar'

/**
 * Olvidó la clave. Con cuenta: confirma la contraseña de la cuenta. Con ayuda
 * por WhatsApp: el soporte le manda un link firmado. En ambos casos crea una
 * clave nueva sin perder nada. Si no hay ninguna de las dos, la única forma
 * segura es borrar los datos del equipo.
 */
function ForgotModal({ open, onClose, onForgot, businessName }: { open: boolean; onClose: () => void; onForgot: () => void; businessName: string }) {
  const cloud = useCloud()
  const [view, setView] = useState<ForgotView>('menu')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  if (!open) return null

  const withAccount = cloud.enabled
  const withSupport = supportUnlockAvailable()
  const close = () => {
    setView('menu')
    setText('')
    onClose()
  }
  // Ya demostró que es el dueño: se borra la clave vieja y se crea una nueva
  const unlocked = () => {
    forgetPassword()
    close()
    onForgot()
  }

  const eraseDevice = async () => {
    setBusy(true)
    freezeStorage() // que nada vuelva a escribir los datos mientras se borran
    // Si había una cuenta abierta se cierra: si no, se podría entrar a sus datos creando otra clave
    if (cloud.user) await cloud.api.signOut(true).catch(() => {})
    await clearData()
    writePref('cart', null)
    forgetPassword()
    location.reload()
  }

  const back = (
    <button type="button" onClick={() => setView('menu')} className="mb-3 flex items-center gap-1 font-semibold text-muted hover:text-fg">
      <ArrowLeft className="size-5" /> Volver
    </button>
  )

  const accountChoice = withAccount && (
    <ChoiceButton icon={<Cloud />} title="Entrar con mi cuenta" desc="Con tu correo y la contraseña de tu cuenta." onClick={() => setView('cuenta')} />
  )
  const supportChoice = withSupport && (
    <ChoiceButton icon={<MessageCircle />} title="Pedir ayuda por WhatsApp" desc="Te ayudamos a crear una clave nueva." onClick={() => setView('whatsapp')} />
  )

  return (
    <Modal open onClose={close} size="sm" title={view === 'whatsapp' ? 'Pedir ayuda por WhatsApp' : '¿Olvidaste tu clave?'}>
      {view === 'menu' && (
        <div className="space-y-3">
          {(withAccount || withSupport) && <p className="text-muted">No te preocupes: tus productos y ventas no se pierden.</p>}
          {/* Si ya tiene la cuenta abierta aquí, lo más rápido es su contraseña */}
          {cloud.user ? (
            <>
              {accountChoice}
              {supportChoice}
            </>
          ) : (
            <>
              {supportChoice}
              {accountChoice}
            </>
          )}
          <div className="rounded-xl bg-surface-2 p-3 text-sm">
            {withAccount || withSupport ? (
              <p className="font-semibold">¿Nada de esto te sirve?</p>
            ) : (
              <>
                <p className="font-semibold">Sin cuenta no se puede recuperar</p>
                <p className="mt-1 text-muted">
                  Por seguridad, la única forma es borrar los datos de este equipo y empezar de nuevo. Si tienes un Excel de respaldo, después lo
                  puedes cargar.
                </p>
              </>
            )}
            <Button variant="ghost" size="sm" className="mt-2 text-danger-ink" onClick={() => setView('borrar')}>
              Borrar todo y empezar de nuevo
            </Button>
          </div>
        </div>
      )}

      {view === 'cuenta' && (
        <div>
          {back}
          <AccountPanel loginOnly onSignedIn={unlocked} />
        </div>
      )}

      {view === 'whatsapp' && (
        <div>
          {back}
          <SupportHelp businessName={businessName} onUnlocked={unlocked} />
        </div>
      )}

      {view === 'borrar' && (
        <div>
          <p className="text-muted">
            Se borrarán <strong className="text-fg">todos los productos, ventas y gastos de este equipo</strong>
            {cloud.user ? ' y se cerrará la cuenta aquí (lo que está en la nube no se borra)' : ''}. No se puede deshacer. Escribe{' '}
            <strong className="font-mono text-fg">BORRAR</strong> para confirmar.
          </p>
          <Input className="mt-3" value={text} onChange={(e) => setText(e.target.value)} autoFocus aria-label="Escribe BORRAR para confirmar" />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setView('menu')}>
              Volver
            </Button>
            <Button variant="danger" disabled={busy || text.trim().toUpperCase() !== 'BORRAR'} onClick={() => void eraseDevice()}>
              {busy && <Loader2 className="animate-spin" />} Borrar todo
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
