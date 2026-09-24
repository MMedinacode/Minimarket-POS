import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  ScanBarcode,
  Settings as SettingsIcon,
  Store,
  Sun,
  Wallet,
} from 'lucide-react'
import type { Route } from '../hooks/useHashRoute'
import { isAlert } from '../lib/stock'
import { cn, formatDateLong, formatTime } from '../lib/utils'
import { useData, useDerived } from '../store/AppStore'
import { SyncBadge } from './SyncBadge'
import { Button } from './ui/primitives'

const NAV: { route: Route; label: string; short: string; icon: typeof Store }[] = [
  { route: 'inicio', label: 'Inicio', short: 'Inicio', icon: LayoutDashboard },
  { route: 'vender', label: 'Vender', short: 'Vender', icon: ScanBarcode },
  { route: 'productos', label: 'Productos', short: 'Productos', icon: Package },
  { route: 'caja', label: 'Caja y gastos', short: 'Caja', icon: Wallet },
  { route: 'excel', label: 'Excel', short: 'Excel', icon: FileSpreadsheet },
  { route: 'ajustes', label: 'Ajustes', short: 'Ajustes', icon: SettingsIcon },
]

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="hidden text-right leading-tight md:block">
      <div className="tabular text-sm font-semibold">{formatTime(now)}</div>
      <div className="text-xs text-subtle">{formatDateLong(now)}</div>
    </div>
  )
}

interface Props {
  route: Route
  onNavigate: (r: Route) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onLogout: () => void
  children: ReactNode
}

export function AppShell({ route, onNavigate, theme, onToggleTheme, onLogout, children }: Props) {
  const { settings } = useData()
  const { stockInfo } = useDerived()
  const alerts = useMemo(() => [...stockInfo.values()].filter((i) => isAlert(i.status)).length, [stockInfo])

  const themeButton = (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggleTheme}
      aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Barra lateral (escritorio) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-line px-5">
          <span className="grid size-9 place-items-center rounded-xl bg-brand text-on-brand">
            <Store className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold leading-tight">{settings.businessName}</p>
            <p className="text-xs text-subtle">Caja e inventario</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3" aria-label="Principal">
          {NAV.map(({ route: r, label, icon: Icon }) => (
            <a
              key={r}
              href={`#/${r}`}
              onClick={(e) => {
                e.preventDefault()
                onNavigate(r)
              }}
              aria-current={route === r ? 'page' : undefined}
              className={cn(
                'flex h-11 items-center gap-3 rounded-xl px-3 text-[0.95rem] font-medium transition-colors',
                route === r ? 'bg-brand-soft text-brand-ink font-semibold' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              <Icon className="size-5" />
              <span className="flex-1">{label}</span>
              {r === 'productos' && alerts > 0 && (
                <span className="tabular rounded-full bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn-ink" title="Productos con stock crítico">
                  {alerts}
                </span>
              )}
            </a>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <Button variant="ghost" className="w-full justify-start" onClick={onLogout}>
            <LogOut /> Cerrar sesión
          </Button>
        </div>
      </aside>

      {/* Barra superior */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur sm:px-5 lg:h-16">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 lg:hidden">
          <span className="grid size-8 place-items-center rounded-lg bg-brand text-on-brand">
            <Store className="size-4" />
          </span>
          <p className="truncate font-bold">{settings.businessName}</p>
        </div>
        <h1 className="hidden flex-1 text-lg font-bold lg:block">{NAV.find((n) => n.route === route)?.label}</h1>
        <SyncBadge />
        <Clock />
        {themeButton}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => onNavigate('ajustes')}
          aria-label="Ajustes"
          aria-current={route === 'ajustes' ? 'page' : undefined}
        >
          <SettingsIcon />
        </Button>
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onLogout} aria-label="Cerrar sesión">
          <LogOut />
        </Button>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-3 pt-4 pb-28 sm:px-5 lg:px-6 lg:pb-10">{children}</main>

      {/* Navegación inferior (celular y tablet) */}
      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden"
        aria-label="Principal"
      >
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {NAV.filter((n) => n.route !== 'ajustes').map(({ route: r, short, icon: Icon }) => (
            <a
              key={r}
              href={`#/${r}`}
              onClick={(e) => {
                e.preventDefault()
                onNavigate(r)
              }}
              aria-current={route === r ? 'page' : undefined}
              className={cn(
                'relative flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-semibold',
                route === r ? 'text-brand-ink' : 'text-subtle',
              )}
            >
              <span className={cn('grid h-7 w-12 place-items-center rounded-full transition-colors', route === r && 'bg-brand-soft')}>
                <Icon className="size-5" />
              </span>
              {short}
              {r === 'productos' && alerts > 0 && (
                <span className="tabular absolute top-1.5 right-[calc(50%-1.6rem)] min-w-5 rounded-full bg-warn px-1 text-center text-[0.65rem] leading-5 font-bold text-black">
                  {alerts}
                </span>
              )}
            </a>
          ))}
        </div>
      </nav>
    </div>
  )
}
