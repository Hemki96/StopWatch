/**
 * Sichtbare Rücknahme in der Fußzeile.
 *
 * Geprüft wird, was die Barrierefreiheit braucht: Der Knopf ist während der
 * Messung sichtbar, nennt sein Ziel im Vorlesetext, bleibt ohne offene Änderung
 * deaktiviert und ruft die Rücknahme genau einmal auf. Langes Drücken und
 * Backspace/Delete auf der Bahn bleiben unabhängig davon bestehen.
 */
// @vitest-environment jsdom
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from '../test/render'
import { Ruecknahme } from './Ruecknahme'

const ZIEL = { kurz: 'Bahn 2 · R3', lang: 'Bahn 2, Max, Runde 3' }

/** Der einzige Knopf der Zeile; sein Text beginnt immer mit „Zurück“. */
function zurueckKnopf(container: HTMLElement): HTMLButtonElement {
  const treffer = [...container.querySelectorAll('button')].find((element) =>
    element.textContent?.startsWith('Zurück'),
  )
  if (!treffer) throw new Error('Knopf „Zurück“ fehlt')
  return treffer
}

describe('Ruecknahme', () => {
  it('zeigt Knopf und Erklärung im laufenden Lauf', () => {
    const ergebnis = render(<Ruecknahme ziel={ZIEL} onUndo={() => undefined} />)

    const knopf = zurueckKnopf(ergebnis.container)
    // Sichtbar, nicht deaktiviert und mit dem Ziel in der Beschriftung.
    expect(knopf.hidden).toBe(false)
    expect(knopf.disabled).toBe(false)
    expect(knopf.textContent).toBe('Zurück · Bahn 2 · R3')
    // Die Fußzeile erklärt die Geste auch für Sehende.
    expect(ergebnis.container.textContent).toContain(
      'Langes Drücken oder „Zurück“ nimmt den letzten Anschlag zurück.',
    )

    ergebnis.unmount()
  })

  it('ist ohne offene Änderung sichtbar, aber deaktiviert', () => {
    const onUndo = vi.fn()
    const ergebnis = render(<Ruecknahme ziel={null} onUndo={onUndo} />)

    const knopf = zurueckKnopf(ergebnis.container)
    expect(knopf.disabled).toBe(true)
    expect(knopf.getAttribute('aria-label')).toBe('Zurück: nichts zurückzunehmen')

    act(() => knopf.click())
    expect(onUndo).not.toHaveBeenCalled()

    ergebnis.unmount()
  })

  it('nennt Bahn, Namen und Runde im Vorlesetext', () => {
    const ergebnis = render(<Ruecknahme ziel={ZIEL} onUndo={() => undefined} />)

    const knopf = zurueckKnopf(ergebnis.container)
    const beschriftung = knopf.getAttribute('aria-label') ?? ''
    // „Zurück“ bleibt im Vorlesetext, damit Sprachsteuerung den sichtbaren
    // Text weiterhin findet (Label in Name).
    expect(beschriftung).toContain('Zurück')
    expect(beschriftung).toContain('Bahn 2')
    expect(beschriftung).toContain('Max')
    expect(beschriftung).toContain('Runde 3')
    // Der statische Hinweis ist als Beschreibung verknüpft, nicht als Name.
    expect(knopf.getAttribute('aria-describedby')).toBe('ruecknahme-hinweis')
    expect(ergebnis.container.querySelector('#ruecknahme-hinweis')?.textContent).toContain(
      'letzten Anschlag',
    )
    // Natives Bedienelement, per Tab erreichbar und mit 44-px-Mindesthöhe.
    expect(knopf.tagName).toBe('BUTTON')
    expect(knopf.getAttribute('type')).toBe('button')
    expect(knopf.getAttribute('tabindex')).toBeNull()
    expect(knopf.classList.contains('min-h-11')).toBe(true)

    ergebnis.unmount()
  })

  it('ruft die Rücknahme genau einmal auf', () => {
    const onUndo = vi.fn()
    const ergebnis = render(<Ruecknahme ziel={ZIEL} onUndo={onUndo} />)

    act(() => zurueckKnopf(ergebnis.container).click())

    expect(onUndo).toHaveBeenCalledOnce()
    ergebnis.unmount()
  })
})
