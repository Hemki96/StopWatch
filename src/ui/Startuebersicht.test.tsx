/**
 * Startübersicht: letzte Prüfung vor dem Start der Uhr.
 *
 * Die Tests sichern die drei Teile: Der Rahmen zeigt Titel, Werte und die
 * beiden Wege (starten oder ändern), die Lauf-Übersicht macht Becken, Strecke,
 * Reihen, Schwimmer und Takt sichtbar — inklusive freier Bahnen und der
 * Warnung bei zu kurzem Takt —, und die Trainings-Übersicht hebt genau den
 * Satz hervor, dessen Uhr gleich beginnt.
 */
// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { neuerTrainingsSatz, neuesTraining, trainingsFortschritt } from '../domain/training'
import { render } from '../test/render'
import {
  Startuebersicht,
  StartuebersichtLauf,
  StartuebersichtTraining,
  Zeile,
} from './Startuebersicht'

// Dialoge sperren das Scrollen auf `body` und `html`; ohne Rücksetzen würde der
// nächste Test die Sperre erben.
afterEach(() => {
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
  vi.restoreAllMocks()
})

/** Findet einen Knopf über seinen sichtbaren Text. */
function knopf(container: HTMLElement, text: string): HTMLButtonElement {
  const gefunden = [...container.querySelectorAll('button')].find(
    (kandidat) => kandidat.textContent?.trim() === text,
  )
  if (!gefunden) throw new Error(`Knopf „${text}“ fehlt`)
  return gefunden
}

describe('Startuebersicht', () => {
  it('zeigt die Werte und meldet Start, Ändern und Schließen getrennt', () => {
    const start = vi.fn()
    const aendern = vi.fn()
    const schliessen = vi.fn()
    const ergebnis = render(
      <Startuebersicht
        open
        titel="Start prüfen"
        text="Erst mit „Jetzt starten“ beginnt die Uhr."
        startLabel="Jetzt starten"
        onStart={start}
        onClose={schliessen}
        onAendern={aendern}
        aendernLabel="Einstellungen ändern"
      >
        <Zeile label="Strecke" wert="100 m" />
      </Startuebersicht>,
    )

    expect(ergebnis.container.textContent).toContain('Start prüfen')
    expect(ergebnis.container.textContent).toContain('100 m')
    // Der Dialog trägt den Titel als Beschriftung; Screenreader lesen ihn vor.
    expect(ergebnis.container.querySelector('[role="dialog"]')?.textContent).toContain(
      'Start prüfen',
    )

    act(() => knopf(ergebnis.container, 'Jetzt starten').click())
    expect(start).toHaveBeenCalledOnce()
    expect(schliessen).not.toHaveBeenCalled()

    act(() => knopf(ergebnis.container, 'Einstellungen ändern').click())
    expect(aendern).toHaveBeenCalledOnce()

    act(() =>
      ergebnis.container.querySelector<HTMLButtonElement>('button[aria-label="Schließen"]')!.click(),
    )
    expect(schliessen).toHaveBeenCalledOnce()
    ergebnis.unmount()
  })
})

describe('StartuebersichtLauf', () => {
  it('zeigt Serie, Reihen, Startzeiten und freie Bahnen', () => {
    const ergebnis = render(
      <StartuebersichtLauf
        konfiguration={{ beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' }}
        bahnen={2}
        reihen={2}
        namen={['Anna', null, 'Ben', 'Clara']}
        startversatzMs={10_000}
        plan={{ wiederholungen: 3, taktSek: 120, startversatzMs: 10_000 }}
      />,
    )

    const text = ergebnis.container.textContent ?? ''
    expect(text).toContain('50 m')
    expect(text).toContain('3×100 m')
    expect(text).toContain('Freistil')
    expect(text).toContain('4 Personen in 2 Reihen')
    expect(text).toContain('R1 0 s · R2 10 s')
    expect(text).toContain('02:00')
    // Jede Reihe eigene Bahnüberschrift; leere Plätze heißen „frei“.
    expect(ergebnis.container.querySelectorAll('ul')).toHaveLength(2)
    expect(text).toContain('Anna')
    expect(text).toContain('frei')
    expect(text).toContain('Clara')
    ergebnis.unmount()
  })

  it('warnt, wenn der Takt kürzer als der Reihenversatz ist', () => {
    const ergebnis = render(
      <StartuebersichtLauf
        konfiguration={{ beckenlaengeM: 50, streckeM: 50, schwimmart: 'brust' }}
        bahnen={1}
        reihen={2}
        namen={[null, null]}
        startversatzMs={15_000}
        plan={{ wiederholungen: 2, taktSek: 5, startversatzMs: 15_000 }}
      />,
    )

    expect(ergebnis.container.textContent).toContain('Der Takt ist kürzer als der Startversatz')
    ergebnis.unmount()
  })
})

describe('StartuebersichtTraining', () => {
  it('zeigt Aktive und Reihenfolge und hebt den nächsten Satz hervor', () => {
    const training = neuesTraining({
      datum: '2026-10-29',
      bezeichnung: 'Kader A',
      bahnen: 2,
      reihen: 1,
      aktive: ['a', null],
      saetze: [
        neuerTrainingsSatz({ bezeichnung: 'Einschwimmen' }),
        neuerTrainingsSatz({
          bezeichnung: 'Hauptteil',
          konfiguration: { beckenlaengeM: 50, streckeM: 200, schwimmart: 'freistil' },
          wiederholungen: 4,
          taktSek: 180,
        }),
      ],
    })
    const fortschritt = trainingsFortschritt(training, [], [])
    const ergebnis = render(
      <StartuebersichtTraining
        training={training}
        fortschritt={fortschritt}
        namen={['Anna', null]}
        startSatzId={training.saetze[1]!.id}
      />,
    )

    const text = ergebnis.container.textContent ?? ''
    expect(text).toContain('2 in 1 Reihe')
    expect(text).toContain('2 · 0 erledigt')
    expect(text).toContain('Anna')
    expect(text).toContain('frei')
    expect(text).toContain('Einschwimmen')
    expect(text).toContain('Hauptteil')
    // Nur der Satz, dessen Uhr gleich startet, trägt „startet jetzt“.
    expect(text.match(/startet jetzt/g)).toHaveLength(1)
    expect(ergebnis.container.querySelector('[aria-current="step"]')?.textContent).toContain(
      'Hauptteil',
    )
    ergebnis.unmount()
  })
})
