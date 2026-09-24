import { lazy, Suspense, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { AppShell } from './components/AppShell'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/ui/Toast'
import { useHashRoute } from './hooks/useHashRoute'
import { useTheme } from './hooks/useTheme'
import { endSession, hasValidSession } from './lib/auth'
import { AppStoreProvider, useData } from './store/AppStore'
import Login from './pages/Login'

// Cada módulo se descarga solo cuando se abre (la app carga más rápido)
const Dashboard = lazy(() => import('./pages/Dashboard'))
const POS = lazy(() => import('./pages/POS'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Cash = lazy(() => import('./pages/Cash'))
const ExcelPage = lazy(() => import('./pages/ExcelPage'))
const SettingsPage = lazy(() => import('./pages/Settings'))

function PageFallback() {
  return (
    <div className="grid h-[50vh] place-items-center text-subtle">
      <Loader2 className="size-7 animate-spin" aria-label="Cargando" />
    </div>
  )
}

function AuthedApp() {
  const { theme, toggle } = useTheme()
  const { route, params, navigate } = useHashRoute()
  const { settings } = useData()
  const [authed, setAuthed] = useState(hasValidSession)

  if (!authed) {
    return <Login businessName={settings.businessName} theme={theme} onToggleTheme={toggle} onSuccess={() => setAuthed(true)} />
  }

  const logout = () => {
    endSession()
    setAuthed(false)
  }

  return (
    <AppShell route={route} onNavigate={(r) => navigate(r)} theme={theme} onToggleTheme={toggle} onLogout={logout}>
      <ErrorBoundary resetKey={route}>
        <Suspense fallback={<PageFallback />}>
          {route === 'inicio' && <Dashboard />}
          {route === 'vender' && <POS />}
          {route === 'productos' && <Inventory filter={params.get('filtro')} />}
          {route === 'caja' && <Cash />}
          {route === 'excel' && <ExcelPage />}
          {route === 'ajustes' && <SettingsPage onLogout={logout} />}
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppStoreProvider>
        <AuthedApp />
      </AppStoreProvider>
    </ToastProvider>
  )
}
