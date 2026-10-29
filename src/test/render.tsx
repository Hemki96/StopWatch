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
  aktualisiere: (ui: ReactNode) => void
  unmount: () => void
}

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

/** Wartet, bis `bedingung` wahr ist. Nützlich für asynchrone Effekte. */
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
