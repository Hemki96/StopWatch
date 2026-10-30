/**
 * Trainingsplan: Aktive je Bahn, Sätze in fester Reihenfolge und Fortschritt.
 *
 * Sichert ab, dass ein Training nur Vorbereitung bleibt: Aus einem Plan
 * entstehen erst beim Start Satz und Läufe, und der Fortschritt wird vollständig
 * aus den vorhandenen Läufen abgeleitet. Im Fokus stehen die Grenzen aus
 * `training.ts` (1 bis 10 Bahnen, 1 bis 20 Sätze, 1 bis 20 Wiederholungen),
 * das Verschieben ohne Nebenwirkung und die Regel, dass ein laufender Satz Vorrang
 * vor einem späteren offenen hat.
 *
 * Fixtures sind bewusst klein und fest: `basisTraining` hat zwei Bahnen, eine
 * belegte und eine freie, sowie einen Seriensatz und einen Einzellauf. Die
 * Zeitstempel 30 s und 60 s ergeben im 100-m-Lauf Zwischenzeit und Ziel.
 */
import { describe, expect, it } from 'vitest'
import { createLauf, planeLauf, tapLane } from './lauf'
import {
  beschreibeTrainingsSatz,
  ersetzeTrainingsSatz,
  naechsterSatz,
  neuerTrainingsSatz,
  neuesTraining,
  ohneTrainingsSatz,
  ordneAktiveUm,
  pruefeTraining,
  pruefeTrainingsSatz,
  trainingsFortschritt,
  trainingsSatzMeta,
  trainingsSatzTitel,
  trainingVonSatz,
  trainingZusammenfassung,
  verschiebeTrainingsSatz,
} from './training'
import type { Lauf, Satz, Training } from './types'

// Feste Konfiguration für alle Fixtures: 100 m im 50-m-Becken, zwei Längen.
const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

// Zwei Bahnen mit einer Zuordnung und zwei Sätzen: ein Seriensatz (3× im
// 2:00-Takt) und ein einzelner Lauf. Das deckt beide Fortschrittsformen ab.
function basisTraining(): Training {
  return neuesTraining({
    datum: '2026-10-29',
    bahnen: 2,
    aktive: ['s1', null],
    saetze: [
      neuerTrainingsSatz({
        id: 'ts1',
        bezeichnung: 'Einschwimmen',
        konfiguration: K100,
        wiederholungen: 3,
        taktSek: 120,
      }),
      neuerTrainingsSatz({ id: 'ts2', konfiguration: K100, wiederholungen: 1 }),
    ],
  })
}

// Minimaler Satz für die Fortschritts-Tests; die ID verbindet Training und
// Messung.
function satz(id = 'satz1'): Satz {
  return {
    id,
    datum: '2026-10-29',
    bezeichnung: '',
    konfiguration: K100,
    plan: null,
    erstelltAm: 1,
  }
}

// Ein Lauf mit einer Bahn und ohne Startversatz; `schwimmerId` ist gesetzt,
// weil der Fortschritt nur die Läufe zählt, nicht die Namen.
function lauf(satzId = 'satz1'): Lauf {
  return createLauf(K100, [{ nummer: 1, schwimmerId: 's1' }], satzId, {
    startversatzMs: 0,
  })
}

// `planeLauf` setzt den Start auf 0 (Versatz 0), damit „gestartet“ ohne echte
// Uhr prüfbar ist.
function gestartet(laufEintrag: Lauf): Lauf {
  return planeLauf(laufEintrag, 0, 0, 0)
}

// Setzt zwei Anschläge: 30 s als Zwischenzeit und 60 s als Finish im 100-m-Lauf.
function beendet(laufEintrag: Lauf): Lauf {
  const bahn = laufEintrag.bahnen[0]!
  return tapLane(
    tapLane(gestartet(laufEintrag), bahn.id, 30_000, 30_000),
    bahn.id,
    60_000,
    60_000,
  )
}

// Anlegen eines Trainings: Die Aktivenliste hat genau einen Platz je Bahn, es
// gibt immer mindestens einen Satz und eine feste Obergrenze.
describe('neuesTraining', () => {
  // Eine zu kurze Aktivenliste wird mit `null` aufgefüllt; `gestartet` beginnt
  // leer, weil noch kein Satz angelegt wurde.
  it('füllt die Aktiven auf die Bahnenzahl auf', () => {
    const training = neuesTraining({
      datum: '2026-10-29',
      bahnen: 3,
      aktive: ['s1'],
    })
    expect(training.aktive).toEqual(['s1', null, null])
    expect(training.saetze).toHaveLength(1)
    expect(training.gestartet).toEqual({})
  })

  // Die Grenzen aus `MAX_BAHNEN` halten auch bei freien Formulareingaben.
  it('begrenzt die Bahnenzahl', () => {
    expect(neuesTraining({ datum: '2026-10-29', bahnen: 99 }).bahnen).toBe(10)
    expect(neuesTraining({ datum: '2026-10-29', bahnen: 0 }).bahnen).toBe(1)
  })

  // Neue Trainings starten ihre Sätze standardmäßig automatisch; die
  // Einstellung lässt sich beim Anlegen ausdrücklich abschalten.
  it('startet Sätze standardmäßig automatisch', () => {
    expect(neuesTraining({ datum: '2026-10-29', bahnen: 1 }).autostart).toBe(true)
    expect(
      neuesTraining({ datum: '2026-10-29', bahnen: 1, autostart: false }).autostart,
    ).toBe(false)
  })

  // Reihen vervielfachen die Plätze: 3 Bahnen × 2 Reihen ergeben sechs
  // Aktive, Reihe für Reihe.
  it('legt je Reihe dieselbe Bahnzahl an', () => {
    const training = neuesTraining({
      datum: '2026-10-29',
      bahnen: 3,
      reihen: 2,
      aktive: ['s1', 's2', 's3', 's4'],
    })
    expect(training.bahnen).toBe(3)
    expect(training.reihen).toBe(2)
    expect(training.aktive).toEqual(['s1', 's2', 's3', 's4', null, null])
  })

  // Fehlende oder zu große Reihenzahlen werden geklemmt; ältere Pläne ohne
  // Reihen bleiben eine Reihe.
  it('begrenzt die Reihenzahl und ergänzt sie für ältere Pläne', () => {
    expect(neuesTraining({ datum: '2026-10-29', bahnen: 2 }).reihen).toBe(1)
    expect(neuesTraining({ datum: '2026-10-29', bahnen: 2, reihen: 99 }).reihen).toBe(5)
    expect(neuesTraining({ datum: '2026-10-29', bahnen: 2, reihen: 0 }).reihen).toBe(1)
  })
})

// Eine geänderte Aufteilung darf Personen nicht in eine andere Reihe schieben.
describe('ordneAktiveUm', () => {
  // Zwei Reihen à zwei Bahnen: a/b in Reihe 1, c/d in Reihe 2.
  const zweiMalZwei = ['a', 'b', 'c', 'd']

  it('behält die Position innerhalb der Reihe beim Verkleinern', () => {
    expect(
      ordneAktiveUm(zweiMalZwei, { bahnen: 2, reihen: 2 }, { bahnen: 1, reihen: 2 }),
    ).toEqual(['a', 'c'])
  })

  it('füllt neue Bahnen innerhalb einer Reihe mit null auf', () => {
    expect(
      ordneAktiveUm(zweiMalZwei, { bahnen: 2, reihen: 2 }, { bahnen: 3, reihen: 2 }),
    ).toEqual(['a', 'b', null, 'c', 'd', null])
  })

  it('schneidet entfallende Reihen ab und ergänzt neue Reihen leer', () => {
    expect(
      ordneAktiveUm(zweiMalZwei, { bahnen: 2, reihen: 2 }, { bahnen: 2, reihen: 1 }),
    ).toEqual(['a', 'b'])
    expect(
      ordneAktiveUm(zweiMalZwei, { bahnen: 2, reihen: 2 }, { bahnen: 2, reihen: 3 }),
    ).toEqual(['a', 'b', 'c', 'd', null, null])
  })
})

// Beschreibungstexte für die Satzliste: „n×Strecke“ und die Metazeile mit
// Takt und Versatz.
describe('Satzbeschreibung', () => {
  // Eine eigene Bezeichnung ersetzt den automatischen Titel, die Kurzbeschreibung
  // bleibt unverändert.
  it('zeigt Wiederholungen', () => {
    const satz = neuerTrainingsSatz({ konfiguration: K100, wiederholungen: 5 })
    expect(beschreibeTrainingsSatz(satz)).toBe('5×100 m')
    expect(trainingsSatzTitel(satz)).toBe('5×100 m')
    expect(trainingsSatzTitel({ ...satz, bezeichnung: 'Einschwimmen' })).toBe('Einschwimmen')
  })

  // Takt nur bei mehreren Wiederholungen, Versatz nur wenn er größer als 0 ist;
  // sonst bliebe die Zeile mit Nullen gefüllt.
  it('nennt Takt und Versatz nur, wenn sie gelten', () => {
    const einfach = neuerTrainingsSatz({ konfiguration: K100 })
    expect(trainingsSatzMeta(einfach)).toBe('50 m-Becken')

    const serie = neuerTrainingsSatz({
      konfiguration: K100,
      wiederholungen: 4,
      taktSek: 120,
      startversatzMs: 10_000,
    })
    expect(trainingsSatzMeta(serie)).toBe('50 m-Becken · Takt 02:00 · 10 s Reihenversatz')
  })
})

// Prüfung eines einzelnen Trainingssatzes: Ein Einzellauf ist erlaubt, eine
// Serie ab zwei Wiederholungen ebenfalls.
describe('pruefeTrainingsSatz', () => {
  // 8× im 90-s-Takt ist gültig; die Grenzen greifen erst bei 0 Wiederholungen
  // bzw. einem Takt von 0.
  it('akzeptiert einen einzelnen Lauf und eine Serie', () => {
    expect(pruefeTrainingsSatz(neuerTrainingsSatz({ konfiguration: K100 }))).toBeNull()
    expect(
      pruefeTrainingsSatz(
        neuerTrainingsSatz({ konfiguration: K100, wiederholungen: 8, taktSek: 90 }),
      ),
    ).toBeNull()
  })

  it('lehnt null Wiederholungen und einen Takt von null ab', () => {
    const satz = neuerTrainingsSatz({ konfiguration: K100 })
    expect(pruefeTrainingsSatz({ ...satz, wiederholungen: 0 })).not.toBeNull()
    expect(pruefeTrainingsSatz({ ...satz, taktSek: 0 })).not.toBeNull()
  })

  // 75 m im 50-m-Becken ist kein Vielfaches der Beckenlänge; die Meldung nennt
  // den Grund, damit der Trainer die Strecke korrigieren kann.
  it('prüft die Strecke gegen die Beckenlänge', () => {
    const satz = neuerTrainingsSatz({
      konfiguration: { beckenlaengeM: 50, streckeM: 75, schwimmart: 'brust' },
    })
    expect(pruefeTrainingsSatz(satz)).toContain('Vielfaches')
  })
})

// Prüfung des ganzen Trainings: Kopfwerte und jeder einzelne Satz.
describe('pruefeTraining', () => {
  // Die Basisfixture ist vollständig und damit der Referenzfall.
  it('akzeptiert ein vollständiges Training', () => {
    expect(pruefeTraining(basisTraining())).toBeNull()
  })

  it('verlangt eine Aktivenzuordnung je Bahn', () => {
    const training = { ...basisTraining(), aktive: ['s1'] }
    expect(pruefeTraining(training)).toContain('Bahn')
  })

  it('verlangt eine Aktivenzuordnung je Person über alle Reihen', () => {
    const training = { ...basisTraining(), bahnen: 2, reihen: 2, aktive: ['s1', null] }
    expect(pruefeTraining(training)).toContain('Bahn')
    expect(
      pruefeTraining({ ...training, aktive: ['s1', null, null, null] }),
    ).toBeNull()
  })

  it('lehnt zu viele Reihen ab', () => {
    const training = { ...basisTraining(), reihen: 6 }
    expect(pruefeTraining(training)).toContain('Reihen')
  })

  it('verlangt mindestens einen Satz', () => {
    expect(pruefeTraining({ ...basisTraining(), saetze: [] })).toContain('mindestens einen Satz')
  })

  // `autostart` ist optional (ältere Trainings), muss aber, wenn es gesetzt
  // ist, ein Wahrheitswert sein.
  it('prüft den automatischen Satzwechsel auf einen Wahrheitswert', () => {
    expect(pruefeTraining(basisTraining())).toBeNull()
    expect(
      pruefeTraining({ ...basisTraining(), autostart: 'ja' } as unknown as Training),
    ).toContain('automatische')
  })
})

// Bearbeiten der festen Reihenfolge: Ersetzen behält die Position, Entfernen
// und Verschieben ändern nur die Liste der Sätze.
describe('Sätze bearbeiten', () => {
  // Das Ersetzen über die ID lässt die Position stehen; nach dem Verschieben
  // von `ts2` nach vorn wandert die geänderte Bezeichnung mit ihrem Satz.
  it('ersetzt, entfernt und verschiebt Sätze ohne den Rest zu verändern', () => {
    const training = basisTraining()
    const ersetzt = ersetzeTrainingsSatz(training, {
      ...training.saetze[0]!,
      bezeichnung: 'Neu',
    })
    expect(ersetzt.saetze[0]?.bezeichnung).toBe('Neu')
    expect(
      ohneTrainingsSatz(training, 'ts1').saetze.map((eintrag) => eintrag.id),
    ).toEqual(['ts2'])
    const verschoben = verschiebeTrainingsSatz(ersetzt, 'ts2', -1)
    expect(verschoben.saetze.map((eintrag) => eintrag.id)).toEqual(['ts2', 'ts1'])
    expect(verschoben.saetze[1]?.bezeichnung).toBe('Neu')
  })

  // Am Rand ist die Zielposition ungültig; es kommt dasselbe Training zurück.
  it('lässt die Reihenfolge am Rand unverändert', () => {
    const training = basisTraining()
    expect(verschiebeTrainingsSatz(training, 'ts1', -1)).toBe(training)
    expect(verschiebeTrainingsSatz(training, 'ts2', 1)).toBe(training)
  })
})

// Fortschritt wird aus `gestartet`, den Sätzen und den Läufen abgeleitet; es
// gibt keinen separat gespeicherten Status.
describe('trainingsFortschritt', () => {
  // Ohne Zuordnung und ohne Läufe ist jeder Satz offen.
  it('meldet nicht angelegte Sätze als offen', () => {
    const fortschritt = trainingsFortschritt(basisTraining(), [], [])
    expect(fortschritt.map((eintrag) => eintrag.status)).toEqual(['offen', 'offen'])
    expect(trainingZusammenfassung(fortschritt)).toEqual({ fertig: 0, gesamt: 2 })
  })

  // Drei Stufen: angelegt aber unberührt (`bereit`), gestartet (`laeuft`) und
  // vollständig (`fertig`). `fertigeRunden` zählt die abgeschlossenen Läufe.
  it('unterscheidet angelegt, laufend und fertig', () => {
    const training = basisTraining()
    training.gestartet = { ts1: 'satz1', ts2: 'satz2' }

    const angelegt = trainingsFortschritt(training, [satz('satz1'), satz('satz2')], [
      lauf('satz1'),
      lauf('satz2'),
    ])
    expect(angelegt.map((eintrag) => eintrag.status)).toEqual(['bereit', 'bereit'])

    const laufend = trainingsFortschritt(training, [satz('satz1'), satz('satz2')], [
      gestartet(lauf('satz1')),
      lauf('satz2'),
    ])
    expect(laufend[0]?.status).toBe('laeuft')
    expect(laufend[1]?.status).toBe('bereit')

    const fertig = trainingsFortschritt(training, [satz('satz1'), satz('satz2')], [
      beendet(lauf('satz1')),
      lauf('satz2'),
    ])
    expect(fertig[0]?.status).toBe('fertig')
    expect(fertig[0]?.fertigeRunden).toBe(1)
    expect(trainingZusammenfassung(fertig)).toEqual({ fertig: 1, gesamt: 2 })
  })

  // Eine Zuordnung auf einen gelöschten Satz bleibt folgenlos: Der Satz gilt
  // wieder als offen (`satz: null`), damit das Training weiterbedienbar ist.
  it('behandelt eine verwaiste Zuordnung wieder als offen', () => {
    const training = basisTraining()
    training.gestartet = { ts1: 'gibt-es-nicht' }
    const fortschritt = trainingsFortschritt(training, [], [])
    expect(fortschritt[0]?.status).toBe('offen')
    expect(fortschritt[0]?.satz).toBeNull()
  })
})

// Rückweg vom gemessenen Satz zum Plan: Der automatische Wechsel braucht das
// Training, aus dem der sichtbare Satz entstanden ist.
describe('trainingVonSatz', () => {
  it('findet das Training über die gestartete Zuordnung', () => {
    const training = basisTraining()
    training.gestartet = { ts1: 'satz1' }
    expect(trainingVonSatz([training], 'satz1')?.id).toBe(training.id)
    expect(trainingVonSatz([training], 'unbekannt')).toBeNull()
    expect(trainingVonSatz([training], null)).toBeNull()
  })
})

// Auswahl des nächsten Satzes für die Kopfzeile: laufende oder angelegte Sätze
// zuerst, sonst der erste offene.
describe('naechsterSatz', () => {
  // `ts1` ist noch offen, `ts2` läuft bereits; der Trainer macht dort weiter, wo
  // gerade gemessen wird.
  it('bevorzugt den laufenden Satz vor einem späteren offenen', () => {
    const training = basisTraining()
    training.gestartet = { ts2: 'satz2' }
    const fortschritt = trainingsFortschritt(training, [satz('satz2')], [
      gestartet(lauf('satz2')),
    ])
    expect(fortschritt.map((eintrag) => eintrag.status)).toEqual(['offen', 'laeuft'])
    expect(naechsterSatz(fortschritt)?.eintrag.id).toBe('ts2')
  })

  it('nimmt sonst den ersten offenen Satz', () => {
    const fortschritt = trainingsFortschritt(basisTraining(), [], [])
    expect(naechsterSatz(fortschritt)?.eintrag.id).toBe('ts1')
  })

  // Sind alle Sätze fertig, gibt es nichts mehr zu starten.
  it('liefert null, wenn alle Sätze fertig sind', () => {
    const training = basisTraining()
    training.gestartet = { ts1: 'satz1', ts2: 'satz2' }
    const fortschritt = trainingsFortschritt(training, [satz('satz1'), satz('satz2')], [
      beendet(lauf('satz1')),
      beendet(lauf('satz2')),
    ])
    expect(naechsterSatz(fortschritt)).toBeNull()
  })
})
