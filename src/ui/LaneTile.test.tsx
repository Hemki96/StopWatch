/**
 * Verhalten der Bahnkachel jenseits der Domäne.
 *
 * Geprüft wird der Langdruck: Er nimmt nach 450 ms den letzten Anschlag
 * zurück, darf das aber nicht mehr tun, wenn die Kachel inzwischen ausgebaut
 * wurde (etwa durch einen Tab-Wechsel). Ohne den Unmount-Cleanup feuert der
 * Timer weiter und macht eine Messung rückgängig, die niemand mehr sieht.
 * Dazu kommt die Trennung von Messfläche und Zielknopf (#60): Der Zielknopf
 * liegt außerhalb der Messfläche, beendet die Bahn und erfasst dabei keinen
 * Anschlag.
 */
// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLauf, startAll } from '../domain/lauf'
import type { Lauf } from '../domain/types'
import { render } from '../test/render'
import { LaneTile } from './LaneTile'

const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

/** Eine laufende Bahn mit einem Anschlag; damit ist Zurücknehmen möglich. */
function laufendeBahn(): Lauf {
  const lauf = startAll(createLauf(K100, [{ nummer: 1 }]), 0, 1)
  return {
    ...lauf,
    bahnen: lauf.bahnen.map((bahn) => ({
      ...bahn,
      anschlaege: [{ laengeNr: 1, splitMs: 30_000, erfasstAt: 2, istFinish: false }],
    })),
  }
}

function pointerDown(element: Element): void {
  act(() => {
    element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  })
}

function pointerUp(element: Element): void {
  act(() => {
    element.dispatchEvent(new Event('pointerup', { bubbles: true }))
  })
}

/** Eine laufende Bahn ohne feste Strecke; nur sie bekommt einen Zielknopf. */
function offeneBahn(): Lauf {
  return startAll(
    createLauf(
      { beckenlaengeM: 50, streckeM: null, schwimmart: 'freistil' },
      [{ nummer: 1 }],
    ),
    0,
    1,
  )
}

/** Rendert eine laufende Bahn auf offener Strecke mit ihren beiden Aktionen. */
function offeneKachel({
  onTap = () => undefined,
  onFinish = () => undefined,
}: {
  onTap?: (bahnId: string, now: number, wallNow: number) => void
  onFinish?: (bahnId: string, now: number, wallNow: number) => void
} = {}) {
  const lauf = offeneBahn()
  const ergebnis = render(
    <LaneTile
      bahn={lauf.bahnen[0]!}
      konfiguration={lauf.konfiguration}
      now={1_000}
      ersatzName="Lauf 1, Bahn 1"
      schwimmerName={null}
      onTap={onTap}
      onUndo={() => undefined}
      onFinish={onFinish}
    />,
  )
  return { ...ergebnis, bahnId: lauf.bahnen[0]!.id }
}

/** Sucht einen Knopf über seinen sichtbaren Text. */
function knopf(container: HTMLElement, text: string): HTMLButtonElement {
  const treffer = [...container.querySelectorAll('button')].find(
    (element) => element.textContent === text,
  )
  if (!treffer) throw new Error(`Knopf „${text}“ fehlt`)
  return treffer
}

function kachel(onUndo: () => void) {
  const lauf = laufendeBahn()
  return render(
    <LaneTile
      bahn={lauf.bahnen[0]!}
      konfiguration={lauf.konfiguration}
      now={1_000}
      ersatzName="Lauf 1, Bahn 1"
      schwimmerName={null}
      onTap={() => undefined}
      onUndo={onUndo}
      onFinish={() => undefined}
    />,
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe('LaneTile', () => {
  it('zeigt ohne Schwimmer Lauf und Bahn statt einer leeren Zeile', () => {
    const tile = offeneKachel()

    expect(tile.container.textContent).toContain('Lauf 1, Bahn 1')
    tile.unmount()
  })

  it('nimmt nach langem Drücken den letzten Anschlag zurück', () => {
    vi.useFakeTimers()
    const onUndo = vi.fn()
    const tile = kachel(onUndo)

    pointerDown(tile.container.querySelector('[role="button"]')!)
    act(() => vi.advanceTimersByTime(500))

    expect(onUndo).toHaveBeenCalledOnce()
    tile.unmount()
  })

  it('nimmt den letzten Anschlag auch per Tastatur zurück', () => {
    const onUndo = vi.fn()
    const tile = kachel(onUndo)

    act(() => {
      tile.container
        .querySelector('[role="button"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
    })

    expect(onUndo).toHaveBeenCalledOnce()
    tile.unmount()
  })

  it('nimmt nach dem Unmount nichts mehr zurück', () => {
    vi.useFakeTimers()
    const onUndo = vi.fn()
    const tile = kachel(onUndo)

    pointerDown(tile.container.querySelector('[role="button"]')!)
    tile.unmount()
    act(() => vi.advanceTimersByTime(500))

    expect(onUndo).not.toHaveBeenCalled()
  })
})

// Seit #60 liegt „Ziel“ nicht mehr in der Messfläche: Zwei Geschwisterknöpfe
// statt eines Knopfs im Knopf. Sonst verschluckt ein Screenreader die
// Zielaktion, und ein Fehltipp auf der Kachel beendet die Bahn vorzeitig.
// Die große Zeit liegt in einem `role="button"` und wäre dort für Screenreader
// abgeflacht. Sie steht deshalb zusätzlich in einem sr-only-Text, den
// `aria-describedby` referenziert. Der Text zieht höchstens einmal pro Sekunde
// nach, damit weder der Frame-Tick noch eine Vorlesehilfe im Dauerlauf landet.
describe('LaneTile: Zeit für Screenreader', () => {
  it('nennt Zeit, Länge und letzten Anschlag und drosselt auf eine Sekunde', () => {
    vi.useFakeTimers()
    const lauf = laufendeBahn()
    const bahn = lauf.bahnen[0]!
    const darstellen = (now: number) => (
      <LaneTile
        bahn={bahn}
        konfiguration={lauf.konfiguration}
        now={now}
        ersatzName="Lauf 1, Bahn 1"
        schwimmerName={null}
        onTap={() => undefined}
        onUndo={() => undefined}
        onFinish={() => undefined}
      />
    )
    const tile = render(darstellen(1_000))
    const flaeche = tile.container.querySelector<HTMLElement>('[role="button"]')!
    const beschreibungId = flaeche.getAttribute('aria-describedby')!.split(' ')[0]!
    const beschreibung = () =>
      tile.container.querySelector(`#${beschreibungId}`)?.textContent ?? ''

    expect(beschreibung()).toContain('Zeit 00:01,00')
    expect(beschreibung()).toContain('Länge 2 von 2')
    expect(beschreibung()).toContain('Letzter Anschlag 00:30,00')

    // Viele Frame-Renders innerhalb derselben Sekunde ändern nichts.
    tile.aktualisiere(darstellen(1_500))
    tile.aktualisiere(darstellen(1_900))
    expect(beschreibung()).toContain('Zeit 00:01,00')

    act(() => vi.advanceTimersByTime(999))
    expect(beschreibung()).toContain('Zeit 00:01,00')
    act(() => vi.advanceTimersByTime(1))
    expect(beschreibung()).toContain('Zeit 00:01,90')

    tile.unmount()
  })

  it('hat keine Live-Region; der Frame-Tick löst keine Ansage aus', () => {
    vi.useFakeTimers()
    const tile = kachel(() => undefined)

    expect(tile.container.querySelector('[aria-live]')).toBeNull()
    act(() => vi.advanceTimersByTime(5_000))
    expect(tile.container.querySelector('[aria-live]')).toBeNull()

    tile.unmount()
  })
})

describe('LaneTile: Ziel getrennt von der Messfläche', () => {
  it('verschachtelt den Zielknopf nicht in die Messfläche', () => {
    const tile = offeneKachel()
    const flaeche = tile.container.querySelector<HTMLElement>('[role="button"]')!
    const ziel = knopf(tile.container, 'Ziel')

    // Genau eine Messfläche, und in ihr steckt kein weiterer Knopf.
    expect(tile.container.querySelectorAll('[role="button"]')).toHaveLength(1)
    expect(flaeche.querySelector('button')).toBeNull()
    expect(flaeche.contains(ziel)).toBe(false)
    // Beide Aktionen sind per Tab erreichbar: die Messfläche über `tabIndex`,
    // der Zielknopf als natives `button` ohne abweichende Reihenfolge.
    expect(flaeche.getAttribute('tabindex')).toBe('0')
    expect(ziel.getAttribute('type')).toBe('button')
    expect(ziel.getAttribute('tabindex')).toBeNull()
    expect(ziel.closest('[role="button"]')).toBeNull()
    tile.unmount()
  })

  it('beendet die Bahn über den Zielknopf, ohne einen Anschlag zu erfassen', () => {
    const onTap = vi.fn()
    const onFinish = vi.fn()
    const tile = offeneKachel({ onTap, onFinish })

    act(() => knopf(tile.container, 'Ziel').click())

    expect(onFinish).toHaveBeenCalledOnce()
    expect(onFinish.mock.calls[0]![0]).toBe(tile.bahnId)
    // Der Zielknopf teilt sich keine Fläche mit dem Anschlag.
    expect(onTap).not.toHaveBeenCalled()
    tile.unmount()
  })

  it('erfasst beim Tippen auf die Messfläche weiterhin einen Anschlag', () => {
    const onTap = vi.fn()
    const onFinish = vi.fn()
    const tile = offeneKachel({ onTap, onFinish })
    const flaeche = tile.container.querySelector<HTMLElement>('[role="button"]')!

    pointerDown(flaeche)
    pointerUp(flaeche)

    expect(onTap).toHaveBeenCalledOnce()
    expect(onTap.mock.calls[0]![0]).toBe(tile.bahnId)
    expect(onFinish).not.toHaveBeenCalled()
    tile.unmount()
  })
})
