/**
 * Minimale Render-Helfer für alle UI- und Hook-Tests.
 *
 * Das Projekt bringt bewusst keine zusätzliche Testbibliothek mit; für Hooks
 * und einzelne Bausteine reicht React selbst. Diese Datei kapselt drei Dinge,
 * die sonst in jedem Test stünden: das Setzen von
 * `IS_REACT_ACT_ENVIRONMENT` (sonst warnt React 19 bei jedem `act`), das
 * Mounten in einem eigenen Container samt Aufräumen und das Warten auf
 * asynchrone Effekte. `renderHook` merkt sich den zuletzt zurückgegebenen
 * Wert, damit Tests direkt gegen `aktuell()` prüfen können.
 *
 * Bewusste Grenzen: Es gibt keinen `rerender` mit neuen Props und keine
 * Query-Helfer; Tests greifen direkt auf `container` zu. Das hält die Helfer
 * klein und die Abhängigkeiten bei null.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ReactNode } from 'react'

/**
 * Kleiner Ersatz für Testing Library: Die App bringt keine zusätzliche
 * Testbibliothek mit, und für Hooks und einzelne Bausteine reicht React selbst.
 */
export interface RenderErgebnis {
  container: HTMLDivElement
  root: Root
  /** Rendert einen neuen Baum in denselben Root (für Zustandswechsel wie `open`). */
  aktualisiere: (ui: ReactNode) => void
  unmount: () => void
}

/** Mountet `ui` in einen frischen Container am `body` und rendert einmal. */
export function render(ui: ReactNode): RenderErgebnis {
  // React 19 warnt sonst bei jedem `act` in der Testumgebung.
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(ui))

  return {
    container,
    root,
    aktualisiere: (naechste) => act(() => root.render(naechste)),
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

/** Wie `render`, merkt sich aber den zuletzt zurückgegebenen Hook-Wert. */
export function renderHook<T>(hook: () => T): RenderErgebnis & { aktuell: () => T } {
  let wert!: T
  const ergebnis = render(<Probe />)

  function Probe() {
    wert = hook()
    return null
  }

  return { ...ergebnis, aktuell: () => wert }
}

/**
 * Wartet, bis `bedingung` wahr ist. Nützlich für asynchrone Effekte.
 *
 * Pollt in `act`, damit React die dadurch ausgelösten Aktualisierungen
 * verarbeitet, und bricht nach `timeoutMs` mit einer klaren Meldung ab, statt
 * den Test hängen zu lassen. `bedingung` darf selbst asynchron sein (etwa ein
 * IndexedDB-Lesevorgang).
 */
export async function warteAuf(
  bedingung: () => boolean | Promise<boolean>,
  timeoutMs = 2000,
): Promise<void> {
  const ende = Date.now() + timeoutMs
  while (!(await bedingung())) {
    if (Date.now() > ende) throw new Error('Bedingung wurde nicht rechtzeitig wahr.')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}
