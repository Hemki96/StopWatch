import { describe, expect, it } from 'vitest'
import { createLauf, planeLauf, tapLane } from './lauf'
import {
  beschreibeTrainingsSatz,
  ersetzeTrainingsSatz,
  naechsterSatz,
  neuerTrainingsSatz,
  neuesTraining,
  ohneTrainingsSatz,
  pruefeTraining,
  pruefeTrainingsSatz,
  trainingsFortschritt,
  trainingsSatzMeta,
  trainingsSatzTitel,
  trainingZusammenfassung,
  verschiebeTrainingsSatz,
} from './training'
import type { Lauf, Satz, Training } from './types'

const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

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

function lauf(satzId = 'satz1'): Lauf {
  return createLauf(K100, [{ nummer: 1, schwimmerId: 's1' }], satzId, {
    startversatzMs: 0,
  })
}

function gestartet(laufEintrag: Lauf): Lauf {
  return planeLauf(laufEintrag, 0, 0, 0)
}

function beendet(laufEintrag: Lauf): Lauf {
  const bahn = laufEintrag.bahnen[0]!
  return tapLane(
    tapLane(gestartet(laufEintrag), bahn.id, 30_000, 30_000),
    bahn.id,
    60_000,
    60_000,
  )
}

describe('neuesTraining', () => {
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

  it('begrenzt die Bahnenzahl', () => {
    expect(neuesTraining({ datum: '2026-10-29', bahnen: 99 }).bahnen).toBe(10)
    expect(neuesTraining({ datum: '2026-10-29', bahnen: 0 }).bahnen).toBe(1)
  })
})

describe('Satzbeschreibung', () => {
  it('zeigt Wiederholungen und Schwimmart', () => {
    const satz = neuerTrainingsSatz({ konfiguration: K100, wiederholungen: 5 })
    expect(beschreibeTrainingsSatz(satz)).toBe('5×100 m · Freistil')
    expect(trainingsSatzTitel(satz)).toBe('5×100 m · Freistil')
    expect(trainingsSatzTitel({ ...satz, bezeichnung: 'Einschwimmen' })).toBe('Einschwimmen')
  })

  it('nennt Takt und Versatz nur, wenn sie gelten', () => {
    const einfach = neuerTrainingsSatz({ konfiguration: K100 })
    expect(trainingsSatzMeta(einfach)).toBe('50 m-Becken')

    const serie = neuerTrainingsSatz({
      konfiguration: K100,
      wiederholungen: 4,
      taktSek: 120,
      startversatzMs: 10_000,
    })
    expect(trainingsSatzMeta(serie)).toBe('50 m-Becken · Takt 02:00 · 10 s Versatz')
  })
})

describe('pruefeTrainingsSatz', () => {
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

  it('prüft die Strecke gegen die Beckenlänge', () => {
    const satz = neuerTrainingsSatz({
      konfiguration: { beckenlaengeM: 50, streckeM: 75, schwimmart: 'brust' },
    })
    expect(pruefeTrainingsSatz(satz)).toContain('Vielfaches')
  })
})

describe('pruefeTraining', () => {
  it('akzeptiert ein vollständiges Training', () => {
    expect(pruefeTraining(basisTraining())).toBeNull()
  })

  it('verlangt eine Aktivenzuordnung je Bahn', () => {
    const training = { ...basisTraining(), aktive: ['s1'] }
    expect(pruefeTraining(training)).toContain('Bahn')
  })

  it('verlangt mindestens einen Satz', () => {
    expect(pruefeTraining({ ...basisTraining(), saetze: [] })).toContain('mindestens einen Satz')
  })
})

describe('Sätze bearbeiten', () => {
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

  it('lässt die Reihenfolge am Rand unverändert', () => {
    const training = basisTraining()
    expect(verschiebeTrainingsSatz(training, 'ts1', -1)).toBe(training)
    expect(verschiebeTrainingsSatz(training, 'ts2', 1)).toBe(training)
  })
})

describe('trainingsFortschritt', () => {
  it('meldet nicht angelegte Sätze als offen', () => {
    const fortschritt = trainingsFortschritt(basisTraining(), [], [])
    expect(fortschritt.map((eintrag) => eintrag.status)).toEqual(['offen', 'offen'])
    expect(trainingZusammenfassung(fortschritt)).toEqual({ fertig: 0, gesamt: 2 })
  })

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

  it('behandelt eine verwaiste Zuordnung wieder als offen', () => {
    const training = basisTraining()
    training.gestartet = { ts1: 'gibt-es-nicht' }
    const fortschritt = trainingsFortschritt(training, [], [])
    expect(fortschritt[0]?.status).toBe('offen')
    expect(fortschritt[0]?.satz).toBeNull()
  })
})

describe('naechsterSatz', () => {
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
