import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { AppShell } from './components/AppShell'
import { CloudPrompts } from './components/CloudPrompts'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider, useToast } from './components/ui/Toast'
import { UpdatePrompt } from './components/UpdatePrompt'
import { useHashRoute } from './hooks/useHashRoute'
import { useAppearance } from './hooks/useTheme'
import { endSession, forgetPassword, hasPassword, hasValidSession } from './lib/auth'
import { takeSupportTokenFromUrl } from './lib/support'
import Login from './pages/Login'
import Setup from './pages/Setup'
import SupportLink from './pages/SupportLink'
import { AppStoreProvider, useData } from './store/AppStore'

// Cada pantalla se descarga solo cuando se abre (la app carga más rápido)
const Home = lazy(() => import('./pages/Home'))
const POS = lazy(() => import('./pages/POS'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Cash = lazy(() => import('./pages/Cash'))
const More = lazy(() => import('./pages/More'))
const Reports = lazy(() => import('./pages/Reports'))
const ExcelPage = lazy(() => import('./pages/ExcelPage'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const Account = lazy(() => import('./pages/Account'))
const Help = lazy(() => import('./pages/Help'))

// Link de soporte con que se abrió la caja (#/soporte?r=…). Se lee una sola vez, al cargar.
const supportLinkAtStart = takeSupportTokenFromUrl()

function PageFallback() {
  return (
    <div className="grid h-[50vh] place-items-center text-subtle">
      <Loader2 className="size-7 animate-spin" aria-label="Cargando" />
    </div>
  )
}

function Main() {
  const appearance = useAppearance()
  const { route, params } = useHashRoute()
  const { settings } = useData()
  const [pinSet, setPinSet] = useState(hasPassword)
  const [authed, setAuthed] = useState(hasValidSession)
  // Olvidó la clave y ya confirmó su cuenta: solo falta crear una nueva
  const [newPinOnly, setNewPinOnly] = useState(false)
  const toast = useToast()

  // Link de soporte: al abrir la caja o si llega con la caja ya abierta
  const [supportToken, setSupportToken] = useState(supportLinkAtStart)
  useEffect(() => {
    const onHash = () => {
      const t = takeSupportTokenFromUrl()
      if (t) setSupportToken(t)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  // El link es auténtico: se borra la clave vieja y se crea una nueva (no se borra ningún dato)
  const supportUnlocked = useCallback(() => {
    forgetPassword()
    endSession()
    setSupportToken(null)
    setAuthed(false)
    setNewPinOnly(true)
    setPinSet(false)
    toast.success('Link correcto. Ahora crea tu clave nueva.')
  }, [toast])

  const lock = () => {
    endSession()
    setAuthed(false)
  }

  let screen
  if (supportToken) {
    screen = <SupportLink token={supportToken} onUnlocked={supportUnlocked} onClose={() => setSupportToken(null)} />
  } else if (!pinSet) {
    screen = (
      <Setup
        onlyPin={newPinOnly}
        onDone={() => {
          setPinSet(true)
          setNewPinOnly(false)
          setAuthed(true)
        }}
      />
    )
  } else if (!authed) {
    screen = (
      <Login
        businessName={settings.businessName}
        onSuccess={() => setAuthed(true)}
        onForgot={() => {
          setNewPinOnly(true)
          setPinSet(false)
        }}
      />
    )
  } else {
    screen = (
      <AppShell route={route} onLock={lock}>
        <ErrorBoundary resetKey={route}>
          <Suspense fallback={<PageFallback />}>
            {route === 'inicio' && <Home />}
            {route === 'vender' && <POS />}
            {route === 'productos' && <Inventory params={params} />}
            {route === 'caja' && <Cash />}
            {route === 'mas' && (
              <More
                theme={appearance.theme}
                onTheme={appearance.setTheme}
                textSize={appearance.textSize}
                onTextSize={appearance.setTextSize}
                onLock={lock}
              />
            )}
            {route === 'reportes' && <Reports />}
            {route === 'excel' && <ExcelPage />}
            {route === 'ajustes' && <SettingsPage />}
            {route === 'cuenta' && <Account />}
            {route === 'ayuda' && <Help />}
          </Suspense>
        </ErrorBoundary>
      </AppShell>
    )
  }

  return (
    <>
      {screen}
      <CloudPrompts />
      <UpdatePrompt />
    </>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppStoreProvider>
        <Main />
      </AppStoreProvider>
    </ToastProvider>
  )
}
