import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from './primitives'

// Pila de modales abiertos: Escape solo cierra el de más arriba
const stack: string[] = []

interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Evita cerrar al hacer clic fuera (ej: formularios con datos) */
  persistent?: boolean
  className?: string
}

const SIZES = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-5xl' }

/**
 * Ventana modal accesible: en celular aparece desde abajo (tipo "sheet"),
 * en pantallas grandes centrada. Bloquea el scroll del fondo y devuelve el
 * foco al elemento anterior al cerrarse.
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', persistent, className }: ModalProps) {
  const id = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    stack.push(id)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Foco inicial: el primer elemento con autofocus, o el panel
    requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel || panel.contains(document.activeElement)) return // React ya aplicó autoFocus
      const auto = panel.querySelector<HTMLElement>('[autofocus],[data-autofocus]')
      ;(auto ?? panel).focus()
    })

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
      }
      if (e.key === 'Tab' && panelRef.current) {
        // Mantiene el Tab dentro del modal
        const els = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        )
        if (!els.length) return
        const first = els[0]
        const last = els[els.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = stack.indexOf(id)
      if (i >= 0) stack.splice(i, 1)
      if (!stack.length) document.body.style.overflow = prevOverflow
      previous?.focus?.()
    }
  }, [open, id])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="presentation">
      <div
        className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-[2px]"
        onClick={() => !persistent && onClose()}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full animate-slide-up flex-col rounded-t-3xl border border-line bg-surface shadow-2xl outline-none sm:animate-pop-in sm:rounded-2xl',
          SIZES[size],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-lg font-bold leading-tight">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-subtle">{description}</p>}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar" className="-mr-1.5 -mt-0.5">
            <X />
          </Button>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="safe-bottom flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel = 'Confirmar',
  danger,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: ReactNode
  children?: ReactNode
  confirmLabel?: string
  danger?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          {/* En acciones peligrosas el foco queda en "Cancelar" para que un Enter accidental no borre nada */}
          <Button variant="outline" onClick={onClose} data-autofocus={danger ? true : undefined}>
            Cancelar
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            data-autofocus={danger ? undefined : true}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[0.95rem] text-muted">{children}</div>
    </Modal>
  )
}
