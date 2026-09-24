import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface State {
  error: Error | null
}

/**
 * Si una pantalla falla, muestra un aviso con botón para recargar en vez de
 * dejar toda la caja en blanco. Los datos no se pierden: están guardados.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error en la pantalla:', error, info.componentStack)
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    // Al cambiar de módulo se intenta de nuevo
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto size-10 text-warn-ink" />
        <h2 className="mt-3 text-lg font-bold">Algo falló en esta pantalla</h2>
        <p className="mt-1 text-sm text-muted">Tus datos están guardados. Recarga la página para seguir trabajando.</p>
        <p className="mt-3 rounded-lg bg-surface-2 p-2 font-mono text-xs break-words text-subtle">{this.state.error.message}</p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 font-semibold text-on-brand"
        >
          <RotateCcw className="size-4" /> Recargar
        </button>
      </div>
    )
  }
}
