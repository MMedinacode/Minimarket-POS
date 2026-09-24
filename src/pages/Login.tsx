import { useEffect, useState, type FormEvent } from 'react'
import { Cloud, Eye, EyeOff, Lock, Moon, Store, Sun } from 'lucide-react'
import { AccountPanel } from '../components/AccountPanel'
import { Modal } from '../components/ui/Modal'
import { useCloud } from '../store/AppStore'
import {
  clearFailedAttempts,
  defaultPasswordHint,
  isUsingDefaultPassword,
  lockedForMs,
  registerFailedAttempt,
  startSession,
  verifyPassword,
} from '../lib/auth'
import { Button, Input } from '../components/ui/primitives'

interface Props {
  businessName: string
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onSuccess: () => void
}

/** Pantalla de acceso con contraseña máster (sin registro de usuarios) */
export default function Login({ businessName, theme, onToggleTheme, onSuccess }: Props) {
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [lockMs, setLockMs] = useState(lockedForMs)
  const [shake, setShake] = useState(false)
  const cloud = useCloud()
  const [accountOpen, setAccountOpen] = useState(false)

  // Cuenta regresiva cuando está bloqueado por intentos fallidos
  useEffect(() => {
    if (lockMs <= 0) return
    const t = setInterval(() => setLockMs(lockedForMs()), 500)
    return () => clearInterval(t)
  }, [lockMs])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (lockedForMs() > 0) return
    if (verifyPassword(password)) {
      clearFailedAttempts()
      startSession()
      onSuccess()
      return
    }
    const attempts = registerFailedAttempt()
    setPassword('')
    setShake(true)
    setTimeout(() => setShake(false), 400)
    const locked = lockedForMs()
    if (locked > 0) {
      setLockMs(locked)
      setError('Demasiados intentos. Espera unos segundos.')
    } else {
      setError(`Contraseña incorrecta (${attempts} de 5 intentos)`)
    }
  }

  const locked = lockMs > 0

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-bg px-4 py-10">
      {/* Fondo decorativo */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -top-40 -left-32 size-[28rem] rounded-full bg-brand/15 blur-3xl" />
        <div className="absolute -right-32 -bottom-40 size-[26rem] rounded-full bg-chart-1/15 blur-3xl" />
      </div>

      <Button
        variant="outline"
        size="icon"
        className="absolute top-4 right-4"
        onClick={onToggleTheme}
        aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      >
        {theme === 'dark' ? <Sun /> : <Moon />}
      </Button>

      <form
        onSubmit={submit}
        className={`relative w-full max-w-sm animate-pop-in rounded-3xl border border-line bg-surface p-7 shadow-xl ${shake ? 'animate-shake' : ''}`}
      >
        <div className="mb-6 text-center">
          <span className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-brand text-on-brand shadow-lg shadow-brand/25">
            <Store className="size-8" />
          </span>
          <h1 className="text-2xl font-bold">{businessName}</h1>
          <p className="mt-1 text-sm text-subtle">Caja e inventario</p>
        </div>

        <label htmlFor="pwd" className="mb-1.5 block text-sm font-medium text-muted">
          Contraseña
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-subtle" />
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
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'pwd-error' : undefined}
            className="h-14 pr-12 pl-11 text-lg tracking-wider"
            placeholder="••••"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-fg"
            aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>

        <p id="pwd-error" role="alert" className="mt-2 min-h-5 text-sm font-medium text-danger-ink">
          {locked ? `Bloqueado. Intenta de nuevo en ${Math.ceil(lockMs / 1000)} s` : error}
        </p>

        <Button type="submit" variant="primary" size="lg" className="mt-2 w-full" disabled={!password || locked}>
          Entrar
        </Button>

        {isUsingDefaultPassword() && (
          <p className="mt-5 rounded-xl bg-info-soft px-3 py-2.5 text-center text-xs text-info-ink">
            Contraseña inicial: <strong className="font-mono text-sm">{defaultPasswordHint()}</strong>
            <br />
            Cámbiala en <strong>Ajustes</strong> después de entrar.
          </p>
        )}

        {cloud.enabled && !cloud.user && (
          <>
            <div className="my-5 flex items-center gap-3 text-xs text-subtle">
              <span className="h-px flex-1 bg-line" /> o <span className="h-px flex-1 bg-line" />
            </div>
            <Button variant="outline" className="w-full" onClick={() => setAccountOpen(true)}>
              <Cloud /> Entrar con mi cuenta
            </Button>
            <p className="mt-2 text-center text-xs text-subtle">Para usar los mismos datos en el PC y el celular</p>
          </>
        )}
        {cloud.user && (
          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-subtle">
            <Cloud className="size-3.5" /> Cuenta: {cloud.user.email}
          </p>
        )}
      </form>

      <Modal open={accountOpen} onClose={() => setAccountOpen(false)} size="sm" title="Tu cuenta">
        <AccountPanel
          onSignedIn={() => {
            setAccountOpen(false)
            clearFailedAttempts()
            startSession()
            onSuccess()
          }}
        />
      </Modal>
    </div>
  )
}
