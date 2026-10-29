import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  fehler: Error | null
}

/**
 * Fängt Render-Fehler ab, damit mitten im Training keine weiße Seite steht.
 * Der Zustand ist bewusst nicht wiederherstellbar: Neu laden ist die einzige
 * verlässliche Aktion, weil der Speicher außerhalb von React liegt.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { fehler: null }

  static getDerivedStateFromError(fehler: Error): State {
    return { fehler }
  }

  componentDidCatch(fehler: Error, info: ErrorInfo): void {
    console.error('Unerwarteter Fehler in der Oberfläche:', fehler, info.componentStack)
  }

  render() {
    if (!this.state.fehler) return this.props.children

    return (
      <div role="alert" className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
        <div className="w-full max-w-sm">
          <h1 className="text-lg font-semibold">Etwas ist schiefgelaufen</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Die Ansicht konnte nicht dargestellt werden. Bereits gespeicherte Zeiten bleiben
            erhalten. Lade die App neu, um weiterzumachen.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 h-14 w-full rounded-xl bg-accent text-base font-bold text-accent-fg"
          >
            Neu laden
          </button>
        </div>
      </div>
    )
  }
}
