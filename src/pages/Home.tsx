import { useMemo, useState, type ReactNode } from 'react'
import { BarChart3, ChevronRight, ClipboardList, HandCoins, PackagePlus, Plus, ShoppingCart } from 'lucide-react'
import { DemoBanner } from '../components/DemoBanner'
import { ExpenseModal } from '../components/ExpenseModal'
import { OrderModal } from '../components/OrderModal'
import { navigate } from '../hooks/useHashRoute'
import { summarizeDay } from '../lib/analytics'
import { isAlert } from '../lib/stock'
import { cn, dayKey, formatCLP, formatDateLong } from '../lib/utils'
import { useData, useDerived } from '../store/AppStore'

/** Pantalla de inicio: lo importante del día y botones grandes para cada tarea */
export default function Home() {
  const { sales, expenses, isDemo } = useData()
  const { stockInfo } = useDerived()
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [orderOpen, setOrderOpen] = useState(false)

  const today = dayKey()
  const day = useMemo(() => summarizeDay(sales, expenses, today), [sales, expenses, today])
  const running = useMemo(() => [...stockInfo.values()].filter((i) => isAlert(i.status)).length, [stockInfo])

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="font-medium text-subtle">{formatDateLong(new Date())}</p>
        <h1 className="text-3xl font-extrabold tracking-tight">¡Hola! 👋</h1>
      </div>

      {isDemo && <DemoBanner />}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Vendiste hoy" value={formatCLP(day.revenue)} sub={`${day.transactions} ${day.transactions === 1 ? 'venta' : 'ventas'}`} />
        <Stat
          label="Ganaste hoy"
          value={formatCLP(day.netProfit)}
          sub="Lo vendido, menos lo que te costó y los gastos"
          valueClass={day.netProfit < 0 ? 'text-danger-ink' : 'text-ok-ink'}
        />
        <button type="button" className="text-left" onClick={() => navigate('productos', { filtro: 'acabando' })}>
          <Stat
            label="Se están acabando"
            value={`${running} ${running === 1 ? 'producto' : 'productos'}`}
            sub={running ? 'Toca para ver cuáles' : 'Tienes de todo'}
            valueClass={running ? 'text-warn-ink' : undefined}
            chevron
          />
        </button>
      </div>

      <h2 className="pt-1 text-lg font-bold">¿Qué quieres hacer?</h2>

      <Tile
        primary
        icon={<ShoppingCart />}
        title="Vender"
        desc="Escanear o buscar productos y cobrar"
        onClick={() => navigate('vender')}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Tile
          icon={<PackagePlus />}
          title="Llegó mercadería"
          desc="Sumar lo que te trajo el proveedor"
          onClick={() => navigate('productos', { recibir: '1' })}
        />
        <Tile icon={<HandCoins />} title="Anotar un gasto" desc="Proveedor, luz, bolsas, sueldo…" onClick={() => setExpenseOpen(true)} />
        <Tile icon={<Plus />} title="Agregar un producto" desc="Algo nuevo para vender" onClick={() => navigate('productos', { nuevo: '1' })} />
        <Tile icon={<ClipboardList />} title="Pedido al proveedor" desc="Lista de lo que se está acabando" onClick={() => setOrderOpen(true)} />
      </div>

      <button
        type="button"
        onClick={() => navigate('reportes')}
        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left hover:bg-surface-2"
      >
        <BarChart3 className="size-5 text-subtle" />
        <span className="flex-1 font-semibold">Ver reportes y gráficos</span>
        <ChevronRight className="size-5 text-subtle" />
      </button>

      <ExpenseModal open={expenseOpen} onClose={() => setExpenseOpen(false)} />
      <OrderModal open={orderOpen} onClose={() => setOrderOpen(false)} />
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  valueClass,
  chevron,
}: {
  label: string
  value: string
  sub: string
  valueClass?: string
  chevron?: boolean
}) {
  return (
    <div className="flex h-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-muted">{label}</p>
        <p className={cn('tabular mt-1 truncate text-3xl font-extrabold tracking-tight', valueClass)}>{value}</p>
        <p className="mt-1 text-sm text-subtle">{sub}</p>
      </div>
      {chevron && <ChevronRight className="size-6 shrink-0 text-subtle" />}
    </div>
  )
}

function Tile({
  icon,
  title,
  desc,
  onClick,
  primary,
}: {
  icon: ReactNode
  title: string
  desc: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-transform active:scale-[0.99] sm:p-5',
        primary
          ? 'border-transparent bg-brand text-on-brand shadow-lg shadow-brand/25 hover:bg-brand-hover'
          : 'border-line bg-surface hover:border-brand/50 hover:bg-surface-2',
      )}
    >
      <span
        className={cn(
          'grid shrink-0 place-items-center rounded-2xl [&_svg]:size-7',
          primary ? 'size-16 bg-black/15' : 'size-14 bg-brand-soft text-brand-ink',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block font-bold', primary ? 'text-2xl' : 'text-lg')}>{title}</span>
        <span className={cn('block', primary ? 'text-on-brand/85' : 'text-sm text-subtle')}>{desc}</span>
      </span>
      <ChevronRight className="size-6 shrink-0 opacity-60" />
    </button>
  )
}
