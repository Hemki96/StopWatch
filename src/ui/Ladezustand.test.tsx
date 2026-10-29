/**
 * Ladeflächen für nachgeladene Screens.
 *
 * Die Tests sichern die zwei Zusagen der `React.lazy`-Grenze: Während ein Chunk
 * fehlt, steht eine als Status vorlesbare Fläche statt eines leeren Bereichs,
 * und der Fokus bleibt beim auslösenden Element. Sobald der Chunk eintrifft,
 * ersetzt der Inhalt den Fallback ohne Zwischenzustand.
 */
// @vitest-environment jsdom
import { act, lazy, Suspense, type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from '../test/render'
import { BereichLadezustand, DialogLadezustand } from './Ladezustand'

describe('Ladezustand', () => {
  it('ersetzt den ausstehenden Screen durch einen vorgelesenen Status und lässt den Fokus stehen', async () => {
    // Ein kontrolliertes Versprechen steht für den noch fehlenden Chunk; so ist
    // der Fallback deterministisch sichtbar, bevor der Inhalt erscheint.
    let aufloesen!: (modul: { default: () => ReactElement }) => void
    const Verspaetet = lazy(
      () =>
        new Promise<{ default: () => ReactElement }>((fertig) => {
          aufloesen = fertig
        }),
    )

    function Rahmen() {
      return (
        <div>
          <button type="button">Bereich öffnen</button>
          <Suspense fallback={<BereichLadezustand text="Verlauf wird geladen …" />}>
            <Verspaetet />
          </Suspense>
        </div>
      )
    }

    const ergebnis = render(<Rahmen />)
    const status = ergebnis.container.querySelector('[role="status"]')
    expect(status?.getAttribute('aria-live')).toBe('polite')
    expect(status?.textContent).toContain('Verlauf wird geladen')

    // Der Auslöser bleibt fokussiert: Der Fallback verschiebt den Fokus nicht
    // und fängt ihn auch nicht ab.
    const knopf = ergebnis.container.querySelector('button')!
    knopf.focus()
    expect(document.activeElement).toBe(knopf)

    await act(async () => {
      aufloesen({ default: () => <p>Verlauf bereit</p> })
    })

    expect(ergebnis.container.textContent).toContain('Verlauf bereit')
    expect(ergebnis.container.querySelector('[role="status"]')).toBeNull()
    expect(document.activeElement).toBe(knopf)

    ergebnis.unmount()
  })

  it('deckt mit dem Dialog-Ladezustand die spätere Vollbildfläche ab', () => {
    const ergebnis = render(<DialogLadezustand text="Lauf wird geladen …" />)
    const status = ergebnis.container.querySelector('[role="status"]')

    expect(status?.getAttribute('aria-live')).toBe('polite')
    expect(status?.textContent).toContain('Lauf wird geladen')
    // Die Fläche liegt fest über dem Screen, damit das Detail nichts verschiebt.
    expect(status?.className).toContain('fixed')
    expect(status?.className).toContain('inset-0')

    ergebnis.unmount()
  })
})
