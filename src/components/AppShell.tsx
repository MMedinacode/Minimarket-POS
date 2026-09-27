import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, House, Lock, Menu, Package, ShoppingCart, Store, Wallet } from 'lucide-react'
import { MORE_ROUTES, navigate, type Route } from '../hooks/useHashRoute'
import { isAlert } from '../lib/stock'
import { cn, formatDateLong, formatTime } from '../lib/utils'
import { useData, useDerived } from '../store/AppStore'
import { SyncBadge } from './SyncBadge'

// Solo 5 opciones, siempre con texto (los íconos solos confunden)
const NAV: { route: Route; label: string; icon: typeof Store }[] = [
  { route: 'inicio', label: 'Inicio', icon: House },
  { route: 'vender', label: 'Vender', icon: ShoppingCart },
  { route: 'productos', label: 'Productos', icon: Package },
  { route: 'caja', label: 'Caja', icon: Wallet },
  { route: 'mas', label: 'Más', icon: Menu },
]

const TITLES: Partial<Record<Route, string>> = {
  reportes: 'Reportes',
  excel: 'Excel y respaldo',
  ajustes: 'Ajustes',
  cuenta: 'Cuenta y respaldo en línea',
  ayuda: 'Cómo se usa',
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="hidden text-right leading-tight lg:block">
      <div className="tabular text-sm font-semibold">{formatTime(now)}</div>
      <div className="text-xs text-subtle">{formatDateLong(now)}</div>
    </div>
  )
}

interface Props {
  route: Route
  onLock: () => void
  children: ReactNode
}

export function AppShell({ route, onLock, children }: Props) {
  const { settings } = useData()
  const { stockInfo } = useDerived()
  const alerts = useMemo(() => [...stockInfo.values()].filter((i) => isAlert(i.status)).length, [stockInfo])
  const active: Route = MORE_ROUTES.includes(route) ? 'mas' : route
  const title = TITLES[route] ?? NAV.find((n) => n.route === route)?.label

  const navLink = (r: Route, label: string, Icon: typeof Store, mobile: boolean) => (
    <a
      key={r}
      href={`#/${r}`}
      aria-current={active === r ? 'page' : undefined}
      className={
        mobile
          ? cn('relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold', active === r ? 'text-brand-ink' : 'text-muted')
          : cn(
              'flex h-12 items-center gap-3 rounded-xl px-3 text-base font-medium transition-colors',
              active === r ? 'bg-brand-soft font-semibold text-brand-ink' : 'text-muted hover:bg-surface-2 hover:text-fg',
            )
      }
    >
      {mobile ? (
        <span className={cn('grid h-7 w-12 place-items-center rounded-full transition-colors', active === r && 'bg-brand-soft')}>
          <Icon className="size-5" />
        </span>
      ) : (
        <Icon className="size-5" />
      )}
      <span className={mobile ? '' : 'flex-1'}>{label}</span>
      {r === 'productos' && alerts > 0 && (
        <span
          title="Productos que se están acabando"
          className={
            mobile
              ? 'tabular absolute top-1.5 right-[calc(50%-1.6rem)] min-w-5 rounded-full bg-warn px-1 text-center text-[0.65rem] leading-5 font-bold text-black'
              : 'tabular rounded-full bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn-ink'
          }
        >
          {alerts}
        </span>
      )}
    </a>
  )

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Barra lateral (computador) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-line px-5">
          <span className="grid size-9 place-items-center rounded-xl bg-brand text-on-brand">
            <Store className="size-5" />
          </span>
          <p className="min-w-0 truncate font-bold leading-tight">{settings.businessName}</p>
        </div>
        <nav className="flex-1 space-y-1 p-3" aria-label="Principal">
          {NAV.map((n) => navLink(n.route, n.label, n.icon, false))}
        </nav>
        <div className="border-t border-line p-3">
          <button
            type="button"
            onClick={onLock}
            className="flex h-12 w-full items-center gap-3 rounded-xl px-3 font-medium text-muted hover:bg-surface-2 hover:text-fg"
          >
            <Lock className="size-5" /> Bloquear caja
          </button>
        </div>
      </aside>

      {/* Barra superior */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-3 backdrop-blur sm:px-5 lg:h-16">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 lg:hidden">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-on-brand">
            <Store className="size-4" />
          </span>
          <p className="truncate font-bold">{settings.businessName}</p>
        </div>
        <h1 className="hidden flex-1 text-xl font-bold lg:block">{title}</h1>
        <SyncBadge />
        <Clock />
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-3 pt-4 pb-28 sm:px-5 lg:px-6 lg:pb-10">
        {MORE_ROUTES.includes(route) && (
          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('mas')}
              className="flex h-10 items-center gap-1.5 rounded-xl px-2 font-semibold text-muted hover:bg-surface-2 hover:text-fg"
            >
              <ArrowLeft className="size-5" /> Volver
            </button>
            <h1 className="text-xl font-bold lg:hidden">{title}</h1>
          </div>
        )}
        {children}
      </main>

      {/* Navegación inferior (celular y tablet) */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden" aria-label="Principal">
        <div className="mx-auto grid max-w-xl grid-cols-5">{NAV.map((n) => navLink(n.route, n.label, n.icon, true))}</div>
      </nav>
    </div>
  )
}
