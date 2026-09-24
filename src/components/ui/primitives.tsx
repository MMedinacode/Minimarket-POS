// Componentes base reutilizables (botones, tarjetas, inputs, badges...).
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { StockStatus } from '../../types'

// ---------- Button ----------

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'danger-soft'
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-hover shadow-sm',
  secondary: 'bg-surface-2 text-fg hover:bg-line',
  outline: 'border border-line-strong bg-surface text-fg hover:bg-surface-2',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger text-white hover:brightness-110 shadow-sm',
  'danger-soft': 'bg-danger-soft text-danger-ink hover:brightness-95 dark:hover:brightness-125',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-[0.95rem] gap-2 rounded-xl',
  lg: 'h-14 px-6 text-lg gap-2.5 rounded-xl',
  icon: 'size-11 rounded-xl',
  'icon-sm': 'size-9 rounded-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center font-semibold whitespace-nowrap transition-[background-color,filter,color,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-[1.15em] [&_svg]:shrink-0',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
})

// ---------- Card ----------

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04)]', className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted [&_svg]:size-[18px]">{icon}</span>}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold leading-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-subtle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

// ---------- Inputs ----------

const inputBase =
  'h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[0.95rem] text-fg placeholder:text-subtle/80 transition-colors focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/20 disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(inputBase, className)} {...props} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(inputBase, 'cursor-pointer pr-8', className)} {...props}>
      {children}
    </select>
  )
})

/** Input de pesos chilenos: muestra "12.990" mientras se escribe y entrega el número */
export const MoneyInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
    value: number | null
    onValueChange: (n: number | null) => void
  }
>(function MoneyInput({ value, onValueChange, className, ...props }, ref) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle">$</span>
      <input
        ref={ref}
        inputMode="numeric"
        autoComplete="off"
        className={cn(inputBase, 'tabular pl-7', className)}
        value={value === null || Number.isNaN(value) ? '' : value.toLocaleString('es-CL')}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '')
          onValueChange(digits ? Number(digits.slice(0, 12)) : null)
        }}
        {...props}
      />
    </div>
  )
})

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  className?: string
  htmlFor?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-sm text-danger-ink" role="alert">
          <XCircle className="size-3.5" /> {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-subtle">{hint}</p>
      ) : null}
    </div>
  )
}

// ---------- Badge ----------

type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info'

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  brand: 'bg-brand-soft text-brand-ink',
  ok: 'bg-ok-soft text-ok-ink',
  warn: 'bg-warn-soft text-warn-ink',
  danger: 'bg-danger-soft text-danger-ink',
  info: 'bg-info-soft text-info-ink',
}

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Estado de stock: siempre con ícono + texto, nunca solo color */
export function StockBadge({ status, className }: { status: StockStatus; className?: string }) {
  if (status === 'agotado')
    return (
      <Badge tone="danger" className={className}>
        <XCircle /> Agotado
      </Badge>
    )
  if (status === 'critico')
    return (
      <Badge tone="warn" className={className}>
        <AlertTriangle /> Crítico
      </Badge>
    )
  return (
    <Badge tone="ok" className={className}>
      <CheckCircle2 /> OK
    </Badge>
  )
}

// ---------- Segmented control ----------

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
  ariaLabel,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; icon?: ReactNode }[]
  className?: string
  size?: 'sm' | 'md'
  ariaLabel?: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('inline-flex rounded-xl bg-surface-2 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors [&_svg]:size-4',
            size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-sm',
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-subtle hover:text-fg',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---------- Estado vacío ----------

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode
  title: ReactNode
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      {icon && (
        <div className="mb-3 grid size-14 place-items-center rounded-2xl bg-surface-2 text-subtle [&_svg]:size-7">{icon}</div>
      )}
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-subtle">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[0.7rem] font-semibold text-muted">
      {children}
    </kbd>
  )
}
