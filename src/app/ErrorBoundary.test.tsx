// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

function Wirft(): never {
  throw new Error('Testfehler')
}

describe('ErrorBoundary', () => {
  it('zeigt statt der weißen Seite eine Meldung mit Neuladen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    act(() => {
      root.render(
        <ErrorBoundary>
          <Wirft />
        </ErrorBoundary>,
      )
    })

    expect(container.textContent).toContain('Etwas ist schiefgelaufen')
    expect(container.textContent).toContain('Neu laden')
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
  })
})
