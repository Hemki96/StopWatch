/**
 * Trainingsbericht als Markdown und PDF.
 *
 * Der Bericht muss den ganzen Plan abbilden: Aktive je Reihe, jeden Satz in
 * fester Reihenfolge und für gestartete Sätze alle Runden, Bahnen, Zielzeiten
 * und Splits. Noch offene Sätze bleiben als Plan sichtbar, damit sich ein
 * Training auch vor dem ersten Start weitergeben lässt.
 */
import { describe, expect, it } from 'vitest'
import { createLauf, korrigiereAnschlag, startAll, tapLane } from '../domain/lauf'
import { neuerTrainingsSatz, neuesTraining, trainingsFortschritt } from '../domain/training'
import type { Lauf, Satz, Schwimmer, Training } from '../domain/types'
import { trainingAlsMarkdown, trainingAlsPdf, trainingDateiname } from './training'

// 100 m im 50-m-Becken: zwei Anschläge ergeben Zwischenzeit und Ziel.
const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

const schwimmer: Schwimmer[] = [
  { id: 's1', name: 'Anna', jahrgang: 2010, notiz: '', erstelltAm: 0 },
  { id: 's2', name: 'Ben', jahrgang: 2011, notiz: '', erstelltAm: 0 },
  { id: 's3', name: 'Clara', jahrgang: 2012, notiz: '', erstelltAm: 0 },
]

const satz: Satz = {
  id: 'satz-1',
  datum: '2026-10-30',
  bezeichnung: 'Einschwimmen',
  konfiguration: K100,
  plan: null,
  erstelltAm: 0,
}

// Ein gestarteter Lauf mit zwei fertigen Bahnen; Bahn 1 bekommt zusätzlich
// eine Handkorrektur, damit der Bericht sie kennzeichnet.
function laufMitZweiBahnen(): Lauf {
  let lauf = createLauf(
    K100,
    [
      { nummer: 1, reihe: 1, schwimmerId: 's1' },
      { nummer: 2, reihe: 1, schwimmerId: 's2' },
    ],
    'satz-1',
    { wiederholung: 1 },
  )
  lauf = startAll(lauf, 0, new Date(2026, 9, 30, 9, 30).getTime())
  const [bahn1, bahn2] = lauf.bahnen
  lauf = tapLane(lauf, bahn1!.id, 31_250, 0)
  lauf = tapLane(lauf, bahn1!.id, 64_000, 0)
  lauf = tapLane(lauf, bahn2!.id, 33_000, 0)
  lauf = tapLane(lauf, bahn2!.id, 67_500, 0)
  return korrigiereAnschlag(lauf, bahn1!.id, 1, 31_000)
}

function fixture(): { training: Training; fortschritt: ReturnType<typeof trainingsFortschritt>; lauf: Lauf } {
  const einschwimmen = neuerTrainingsSatz({
    id: 'ts1',
    bezeichnung: 'Einschwimmen',
    konfiguration: K100,
    wiederholungen: 1,
    taktSek: 120,
  })
  const sprint = neuerTrainingsSatz({
    id: 'ts2',
    bezeichnung: 'Sprint',
    konfiguration: K100,
    wiederholungen: 4,
    taktSek: 90,
  })
  const training = neuesTraining({
    datum: '2026-10-30',
    bezeichnung: 'Kader A',
    bahnen: 2,
    reihen: 2,
    aktive: ['s1', 's2', 's3', null],
    saetze: [einschwimmen, sprint],
  })
  training.gestartet = { ts1: satz.id }
  const lauf = laufMitZweiBahnen()
  return {
    training,
    lauf,
    fortschritt: trainingsFortschritt(training, [satz], [lauf]),
  }
}

describe('trainingAlsMarkdown', () => {
  it('bildet Kopf, Aktive und jeden Satz in der Planreihenfolge ab', () => {
    const { training, fortschritt } = fixture()
    const markdown = trainingAlsMarkdown(training, fortschritt, schwimmer)

    expect(markdown).toContain('# Training: Kader A')
    expect(markdown).toContain('Datum: 30.10.2026')
    expect(markdown).toContain('1 von 2 Sätzen erledigt · 3 Aktive')
    expect(markdown).toContain('## Aktive')
    expect(markdown).toContain('- Reihe 1: Anna, Ben')
    expect(markdown).toContain('- Reihe 2: Clara, —')
    expect(markdown).toContain('## 1. Einschwimmen')
    expect(markdown).toContain('## 2. Sprint')
  })

  it('zeigt Status, Runden, Zielzeiten und Splits', () => {
    const { training, fortschritt } = fixture()
    const markdown = trainingAlsMarkdown(training, fortschritt, schwimmer)

    expect(markdown).toContain('Plan: 100 m · Freistil · 50 m-Becken')
    expect(markdown).toContain('Status: fertig · 1 von 1 Runden vollständig')
    expect(markdown).toContain('Runde 1 · Start 09:30 Uhr')
    expect(markdown).toContain('  - Bahn 1 · Anna · Ziel 01:04,00 · manuell korrigiert')
    expect(markdown).toContain('    - Splits: 50 m 00:31,00 (manuell) · Ziel 01:04,00')
    expect(markdown).toContain('  - Bahn 2 · Ben · Ziel 01:07,50')
  })

  it('nennt noch nicht gestartete Sätze ausdrücklich', () => {
    const { training, fortschritt } = fixture()
    const markdown = trainingAlsMarkdown(training, fortschritt, schwimmer)

    expect(markdown).toContain('Status: offen')
    expect(markdown).toContain('- Noch nicht gestartet.')
  })

  it('markiert offene Aktivenplätze mit einem Gedankenstrich', () => {
    const { training, fortschritt } = fixture()
    const markdown = trainingAlsMarkdown(training, fortschritt, schwimmer)

    expect(markdown).toContain('- Reihe 2: Clara, —')
  })
})

describe('trainingAlsPdf', () => {
  it('erzeugt ein PDF mit denselben Inhalten und einer Seitenzahl', () => {
    const { training, fortschritt } = fixture()
    const pdf = trainingAlsPdf(training, fortschritt, schwimmer)
    let text = ''
    for (const byte of pdf) text += String.fromCharCode(byte)

    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.endsWith('%%EOF\n')).toBe(true)
    expect(text).toContain('Training: Kader A')
    expect(text).toContain('Einschwimmen')
    expect(text).toContain('Seite 1 von 1')
  })
})

describe('trainingDateiname', () => {
  it('nutzt das Trainingsdatum und die gewünschte Endung', () => {
    const { training } = fixture()

    expect(trainingDateiname(training, 'pdf')).toBe('beckenrand-training-2026-10-30.pdf')
    expect(trainingDateiname(training, 'md')).toBe('beckenrand-training-2026-10-30.md')
  })
})
