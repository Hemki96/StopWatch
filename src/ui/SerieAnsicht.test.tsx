/**
 * Serienzeile jenseits der Domäne: die Trennung von Messfläche und Zielknopf.
 *
 * Seit #60 liegt „Ziel“ nicht mehr in der Messfläche. Vorher war der Knopf in
 * ein `role="button"` verschachtelt: ungültiges ARIA, das Screenreader die
 * Zielaktion verschlucken lässt, und ein Fehltipp auf der Zeile beendete die
 * Runde. Geprüft wird, dass beide Aktionen getrennte Flächen haben, der
 * Zielknopf genau einmal auslöst und ein Tap auf der Zeile weiterhin einen
 * Anschlag erfasst.
 */
// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLauf, startAll } from '../domain/lauf'
import type { Lauf, SatzPlan } from '../domain/types'
import { render } from '../test/render'
import { SerieAnsicht } from './SerieAnsicht'

/** Zwei Wiederholungen auf offener Strecke; nur die erste Runde läuft. */
const PLAN: SatzPlan = { wiederholungen: 2, taktSek: 60, startversatzMs: 0 }

/** Eine angefangene Serie mit einer Bahn auf offener Strecke. */
function offeneSerie(): { runden: Lauf[]; bahnId: string } {
  const runde = startAll(
    createLauf(
      { beckenlaengeM: 50, streckeM: null, schwimmart: 'freistil' },
      [{ nummer: 1 }],
      'satz-1',
      { wiederholung: 1 },
    ),
    0,
    1,
  )
  return { runden: [runde], bahnId: runde.bahnen[0]!.id }
}

/** Rendert die Serienansicht mit beobachtbaren Aktionen. */
function ansicht({
  onTap = () => undefined,
  onFinish = () => undefined,
}: {
  onTap?: (bahnIndex: number, now: number, wallNow: number) => void
  onFinish?: (bahnIndex: number, now: number, wallNow: number) => void
} = {}) {
  const { runden } = offeneSerie()
  const ergebnis = render(
    <SerieAnsicht
      runden={runden}
      plan={PLAN}
      now={1_000}
      schwimmerName={() => null}
      onTap={onTap}
      onUndo={() => undefined}
      onFinish={onFinish}
    />,
  )
  return ergebnis
}

/** Sucht einen Knopf über seinen sichtbaren Text. */
function knopf(container: HTMLElement, text: string): HTMLButtonElement {
  const treffer = [...container.querySelectorAll('button')].find(
    (element) => element.textContent === text,
  )
  if (!treffer) throw new Error(`Knopf „${text}“ fehlt`)
  return treffer
}

function zeiger(element: Element, typ: 'pointerdown' | 'pointerup'): void {
  act(() => {
    element.dispatchEvent(new Event(typ, { bubbles: true }))
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SerieAnsicht: Ziel getrennt von der Messfläche', () => {
  it('zeigt ohne Schwimmer die Bahnnummer statt „Ohne Namen“', () => {
    const ergebnis = ansicht()

    expect(ergebnis.container.textContent).toContain('Bahn 1')
    expect(ergebnis.container.textContent).not.toContain('Ohne Namen')
    ergebnis.unmount()
  })

  it('verschachtelt den Zielknopf nicht in die Messfläche', () => {
    const ergebnis = ansicht()
    const flaeche = ergebnis.container.querySelector<HTMLElement>('[role="button"]')!
    const ziel = knopf(ergebnis.container, 'Ziel')

    expect(ergebnis.container.querySelectorAll('[role="button"]')).toHaveLength(1)
    expect(flaeche.querySelector('button')).toBeNull()
    expect(flaeche.contains(ziel)).toBe(false)
    // Tab erreicht beide Aktionen: die Messfläche über `tabIndex`, den
    // Zielknopf als natives `button` in Dokumentreihenfolge.
    expect(flaeche.getAttribute('tabindex')).toBe('0')
    expect(ziel.getAttribute('type')).toBe('button')
    expect(ziel.closest('[role="button"]')).toBeNull()
    ergebnis.unmount()
  })

  it('beendet die Runde über den Zielknopf, ohne einen Anschlag zu erfassen', () => {
    const onTap = vi.fn()
    const onFinish = vi.fn()
    const ergebnis = ansicht({ onTap, onFinish })

    act(() => knopf(ergebnis.container, 'Ziel').click())

    expect(onFinish).toHaveBeenCalledOnce()
    // Der Bahn-Index der Zeile, nicht die Lauf-Id: `beendeSerie` arbeitet so.
    expect(onFinish.mock.calls[0]![0]).toBe(0)
    expect(onTap).not.toHaveBeenCalled()
    ergebnis.unmount()
  })

  it('erfasst beim Tippen auf die Zeile weiterhin einen Anschlag', () => {
    const onTap = vi.fn()
    const onFinish = vi.fn()
    const ergebnis = ansicht({ onTap, onFinish })
    const flaeche = ergebnis.container.querySelector<HTMLElement>('[role="button"]')!

    zeiger(flaeche, 'pointerdown')
    zeiger(flaeche, 'pointerup')

    expect(onTap).toHaveBeenCalledOnce()
    expect(onTap.mock.calls[0]![0]).toBe(0)
    expect(onFinish).not.toHaveBeenCalled()
    ergebnis.unmount()
  })
})

describe('SerieAnsicht: Eingabewege erreichen dieselbe Aktion', () => {
  // Die Doppeltipp-Sperre sitzt in `tippeSerie`/`beendeSerie`; die Ansicht muss
  // jeden Eingabeweg genau einmal dorthin leiten, sonst greift sie nicht.
  it('wertet einen reinen Klick ohne Pointer als einen Tap', () => {
    const onTap = vi.fn()
    const ergebnis = ansicht({ onTap })
    const flaeche = ergebnis.container.querySelector<HTMLElement>('[role="button"]')!

    // VoiceOver/TalkBack lösen nur `click` aus.
    act(() => flaeche.click())

    expect(onTap).toHaveBeenCalledOnce()
    expect(onTap.mock.calls[0]![0]).toBe(0)
    ergebnis.unmount()
  })

  it('zählt Pointer-Up plus den folgenden Klick nicht doppelt', () => {
    const onTap = vi.fn()
    const ergebnis = ansicht({ onTap })
    const flaeche = ergebnis.container.querySelector<HTMLElement>('[role="button"]')!

    act(() => {
      zeiger(flaeche, 'pointerdown')
      zeiger(flaeche, 'pointerup')
    })
    // Der Browser schickt den Klick direkt nach dem Pointer-Up.
    act(() => flaeche.click())

    expect(onTap).toHaveBeenCalledOnce()
    ergebnis.unmount()
  })

  it('wertet Enter als einen Tap und ignoriert den folgenden Klick', () => {
    const onTap = vi.fn()
    const ergebnis = ansicht({ onTap })
    const flaeche = ergebnis.container.querySelector<HTMLElement>('[role="button"]')!

    act(() => {
      flaeche.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      flaeche.click()
    })

    expect(onTap).toHaveBeenCalledOnce()
    ergebnis.unmount()
  })
})
