import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, Check, Cloud, Eye, EyeOff, FlaskConical, Loader2, PackageOpen, Store } from 'lucide-react'
import { AccountPanel } from '../components/AccountPanel'
import { Modal } from '../components/ui/Modal'
import { Button, ChoiceButton, Input } from '../components/ui/primitives'
import { cryptoAvailable, passwordProblem, setPassword, startSession } from '../lib/auth'
import { cn } from '../lib/utils'
import { useActions, useCloud, useData } from '../store/AppStore'

type Step = 'welcome' | 'pin' | 'name' | 'start'

/**
 * Primera vez en este dispositivo: crear la clave, poner el nombre del negocio
 * y elegir cómo empezar. Si viene de "olvidé mi clave" (ya entró con su
 * cuenta o el soporte le mandó un link válido), solo crea la clave nueva.
 */
export default function Setup({ onDone, onlyPin }: { onDone: () => void; onlyPin?: boolean }) {
  const data = useData()
  const actions = useActions()
  const cloud = useCloud()
  const [step, setStep] = useState<Step>(onlyPin ? 'pin' : 'welcome')
  // (onlyPin = ya confirmó su cuenta o usó un link de soporte en "olvidé mi clave")
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [show, setShow] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [viaAccount, setViaAccount] = useState(Boolean(onlyPin))

  // Si ya hay datos reales (o vienen de la cuenta) no se pregunta cómo empezar
  const hasRealData = viaAccount || Boolean(cloud.user) || (!data.isDemo && data.products.length > 0)
  const steps: Step[] = hasRealData ? ['pin'] : ['pin', 'name', 'start']
  const stepNumber = steps.indexOf(step) + 1

  const finish = async (start?: 'demo' | 'empty') => {
    setBusy(true)
    setError('')
    try {
      await setPassword(pin)
      if (!hasRealData && name.trim()) actions.updateSettings({ businessName: name.trim() })
      if (start === 'empty') actions.endDemo(false)
      if (start === 'demo' && !data.isDemo) actions.loadDemo()
      startSession()
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la clave')
      setBusy(false)
    }
  }

  const submitPin = (e: FormEvent) => {
    e.preventDefault()
    const problem = passwordProblem(pin)
    if (problem) return setError(problem)
    if (pin !== pin2) return setError('Las dos claves no son iguales. Escríbelas de nuevo.')
    setError('')
    if (hasRealData) void finish()
    else setStep('name')
  }

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-bg px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -top-40 -left-32 size-[28rem] rounded-full bg-brand/15 blur-3xl" />
        <div className="absolute -right-32 -bottom-40 size-[26rem] rounded-full bg-chart-1/15 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-pop-in rounded-3xl border border-line bg-surface p-6 shadow-xl sm:p-8">
        {step !== 'welcome' && (
          <div className="mb-5 flex items-center justify-between">
            {step !== 'pin' || !onlyPin ? (
              <button
                type="button"
                onClick={() => setStep(step === 'pin' ? 'welcome' : step === 'name' ? 'pin' : 'name')}
                className="flex items-center gap-1 font-semibold text-muted hover:text-fg"
              >
                <ArrowLeft className="size-5" /> Atrás
              </button>
            ) : (
              <span />
            )}
            {steps.length > 1 && (
              <span className="text-sm font-semibold text-subtle">
                Paso {stepNumber} de {steps.length}
              </span>
            )}
          </div>
        )}

        {step === 'welcome' && cloud.user && !viaAccount && (
          // Hay una cuenta abierta en este equipo: para crear la clave hay que demostrar que es el dueño
          <div>
            <Title>Confirma que eres tú</Title>
            <p className="mt-1 mb-4 text-muted">Este equipo tiene tu cuenta abierta. Escribe la contraseña de la cuenta para crear la clave de la caja.</p>
            <AccountPanel
              loginOnly
              ownerCheck
              onSignedIn={() => {
                setViaAccount(true)
                setStep('pin')
              }}
            />
          </div>
        )}

        {step === 'welcome' && !(cloud.user && !viaAccount) && (
          <div className="text-center">
            <span className="mx-auto mb-5 grid size-20 place-items-center rounded-3xl bg-brand text-on-brand shadow-lg shadow-brand/25">
              <Store className="size-10" />
            </span>
            <h1 className="text-3xl font-extrabold">¡Bienvenido!</h1>
            <p className="mt-2 text-lg text-muted">Vamos a dejar lista tu caja. Son 3 pasos cortos.</p>
            <Button variant="primary" size="lg" className="mt-7 w-full" onClick={() => setStep('pin')}>
              Comenzar
            </Button>
            {cloud.enabled && (
              <Button variant="ghost" className="mt-3 w-full" onClick={() => setAccountOpen(true)}>
                <Cloud /> Ya uso la caja en otro equipo
              </Button>
            )}
          </div>
        )}

        {step === 'pin' && (
          <form onSubmit={submitPin} noValidate>
            <Title>{onlyPin ? 'Crea tu clave nueva' : 'Crea tu clave'}</Title>
            <p className="mt-1 text-muted">La vas a escribir cada vez que abras la caja. No se la muestres a los clientes.</p>
            {!cryptoAvailable() && (
              <p className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">
                Abre la caja desde su dirección segura (que empieza con https://) para poder crear la clave.
              </p>
            )}
            <label htmlFor="pin1" className="mt-5 mb-1.5 block font-semibold">
              Tu clave
            </label>
            <div className="relative">
              <Input
                id="pin1"
                type={show ? 'text' : 'password'}
                autoFocus
                autoComplete="new-password"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value)
                  setError('')
                }}
                className="h-14 pr-12 text-xl tracking-widest"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-subtle hover:bg-surface-2"
                aria-label={show ? 'Ocultar clave' : 'Mostrar clave'}
              >
                {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
            <Rules pin={pin} />
            <label htmlFor="pin2" className="mt-4 mb-1.5 block font-semibold">
              Escríbela otra vez
            </label>
            <Input
              id="pin2"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={pin2}
              onChange={(e) => {
                setPin2(e.target.value)
                setError('')
              }}
              className="h-14 text-xl tracking-widest"
            />
            <ErrorText>{error}</ErrorText>
            <Button type="submit" variant="primary" size="lg" className="mt-2 w-full" disabled={busy || !pin || !pin2}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {hasRealData ? 'Guardar y entrar' : 'Siguiente'}
            </Button>
          </form>
        )}

        {step === 'name' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setStep('start')
            }}
          >
            <Title>¿Cómo se llama tu negocio?</Title>
            <p className="mt-1 text-muted">Aparece arriba en la pantalla. Lo puedes cambiar cuando quieras.</p>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Ej: Bazar Rosita" maxLength={40} className="mt-5 h-14 text-lg" />
            <Button type="submit" variant="primary" size="lg" className="mt-5 w-full">
              Siguiente
            </Button>
          </form>
        )}

        {step === 'start' && (
          <div>
            <Title>¿Cómo quieres empezar?</Title>
            <div className="mt-5 space-y-3">
              <ChoiceButton
                icon={<FlaskConical />}
                title="Probar primero con ejemplos"
                desc="Productos y ventas de mentira para practicar sin miedo. Después se borran con un botón."
                onClick={() => void finish('demo')}
                disabled={busy}
              />
              <ChoiceButton
                icon={<PackageOpen />}
                title="Empezar con mis productos"
                desc="La caja parte vacía y agregas tus productos (uno por uno o desde un Excel)."
                onClick={() => void finish('empty')}
                disabled={busy}
              />
            </div>
            <ErrorText>{error}</ErrorText>
          </div>
        )}
      </div>

      <Modal open={accountOpen} onClose={() => setAccountOpen(false)} size="sm" title="Entrar con tu cuenta">
        <AccountPanel
          loginOnly
          onSignedIn={() => {
            setAccountOpen(false)
            setViaAccount(true)
            setStep('pin')
          }}
        />
      </Modal>
    </div>
  )
}

function Title({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-extrabold">{children}</h1>
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-3 min-h-6 font-medium text-danger-ink">
      {children}
    </p>
  )
}

/** Muestra en vivo si la clave cumple lo mínimo */
function Rules({ pin }: { pin: string }) {
  const long = pin.trim().length >= 6
  const problem = pin ? passwordProblem(pin) : null
  const ok = long && !problem
  return (
    <ul className="mt-2 space-y-1 text-sm">
      <li className={cn('flex items-center gap-1.5', long ? 'text-ok-ink' : 'text-subtle')}>
        <Check className="size-4" /> Al menos 6 números o letras
      </li>
      <li className={cn('flex items-center gap-1.5', ok ? 'text-ok-ink' : pin && long ? 'text-danger-ink' : 'text-subtle')}>
        <Check className="size-4" /> {pin && long && problem ? problem : 'Que no sea fácil de adivinar (nada de 123456 ni 111111)'}
      </li>
    </ul>
  )
}
