import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '../../lib/utils'

type Kind = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: number
  kind: Kind
  message: ReactNode
  action?: { label: string; onClick: () => void }
}

type ToastFn = (message: ReactNode, opts?: { action?: ToastItem['action']; duration?: number }) => void

interface ToastApi {
  success: ToastFn
  error: ToastFn
  warning: ToastFn
  info: ToastFn
}

const ToastContext = createContext<ToastApi | null>(null)

const ICONS = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info }
const STYLES: Record<Kind, string> = {
  success: 'text-ok-ink',
  error: 'text-danger-ink',
  warning: 'text-warn-ink',
  info: 'text-info-ink',
}

/** Avisos cortos arriba de la pantalla (venta registrada, producto no encontrado, etc.) */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (kind: Kind): ToastFn =>
      (message, opts) => {
        const id = ++counter.current
        setItems((list) => [...list.slice(-3), { id, kind, message, action: opts?.action }])
        setTimeout(() => dismiss(id), opts?.duration ?? (kind === 'error' ? 5000 : 3200))
      },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({ success: push('success'), error: push('error'), warning: push('warning'), info: push('info') }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3"
          aria-live="polite"
          role="status"
        >
          {items.map((t) => {
            const Icon = ICONS[t.kind]
            return (
              <div
                key={t.id}
                className="pointer-events-auto flex w-full max-w-md animate-pop-in items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-xl"
              >
                <Icon className={cn('size-5 shrink-0', STYLES[t.kind])} />
                <div className="min-w-0 flex-1 text-sm font-medium">{t.message}</div>
                {t.action && (
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-sm font-bold text-brand-ink hover:bg-surface-2"
                    onClick={() => {
                      t.action!.onClick()
                      dismiss(t.id)
                    }}
                  >
                    {t.action.label}
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Cerrar aviso"
                  className="rounded-lg p-1 text-subtle hover:bg-surface-2 hover:text-fg"
                  onClick={() => dismiss(t.id)}
                >
                  <X className="size-4" />
                </button>
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}
