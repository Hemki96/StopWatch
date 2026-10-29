// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bestaetigung } from './Bestaetigung'
import { Sheet } from './Sheet'

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
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
})

function taste(key: string, shiftKey = false) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }))
  })
}

describe('Dialog', () => {
  it('hält den Fokus mit Tab und Shift+Tab im Dialog', () => {
    act(() => {
      root.render(
        <Sheet open titel="Test" onClose={() => undefined}>
          <button type="button">Erster</button>
          <button type="button">Letzter</button>
        </Sheet>,
      )
    })

    const panel = container.querySelector('[role="dialog"]')!
    const buttons = [...panel.querySelectorAll('button')]
    const letzter = buttons.at(-1)!
    const erster = buttons[0]!

    letzter.focus()
    taste('Tab')
    expect(document.activeElement).toBe(erster)

    erster.focus()
    taste('Tab', true)
    expect(document.activeElement).toBe(letzter)
  })

  it('gibt beim Schließen den Fokus an den Auslöser zurück', () => {
    const ausloeser = document.createElement('button')
    ausloeser.textContent = 'Öffnen'
    document.body.append(ausloeser)
    ausloeser.focus()

    act(() => {
      root.render(
        <Sheet open titel="Test" onClose={() => undefined}>
          <button type="button">Im Dialog</button>
        </Sheet>,
      )
    })

    // Der Auslöser war vor dem Öffnen fokussiert.
    expect(document.activeElement).not.toBe(ausloeser)
    act(() => {
      root.render(
        <Sheet open={false} titel="Test" onClose={() => undefined}>
          <button type="button">Im Dialog</button>
        </Sheet>,
      )
    })
    expect(document.activeElement).toBe(ausloeser)
    ausloeser.remove()
  })

  it('schließt mit Escape nur den obersten Dialog', () => {
    const sheetSchliessen = vi.fn()
    const bestaetigungAbbrechen = vi.fn()

    act(() => {
      root.render(
        <>
          <Sheet open titel="Sheet" onClose={sheetSchliessen}>
            <p>Inhalt</p>
          </Sheet>
          <Bestaetigung
            open
            titel="Sicher?"
            text="Wirklich?"
            bestaetigenLabel="Ja"
            onBestaetigen={() => undefined}
            onAbbrechen={bestaetigungAbbrechen}
          />
        </>,
      )
    })

    taste('Escape')
    expect(bestaetigungAbbrechen).toHaveBeenCalledTimes(1)
    expect(sheetSchliessen).not.toHaveBeenCalled()
  })

  it('sperrt das Scrollen der Seite, solange ein Dialog offen ist', () => {
    act(() => {
      root.render(
        <Sheet open titel="Test" onClose={() => undefined}>
          <p>Inhalt</p>
        </Sheet>,
      )
    })
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.documentElement.style.overflow).toBe('hidden')
  })
})
