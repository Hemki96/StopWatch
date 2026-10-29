import { describe, expect, it } from 'vitest'
import { createLauf, planeLauf, tapLane } from '../domain/lauf'
import {
  normalizeOnLoad,
  normalizeSatzOnLoad,
  normalizeTrainingOnLoad,
} from './repository'
import type { Lauf, Satz, Training } from '../domain/types'

const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

describe('normalizeOnLoad', () => {
  it('ergänzt Startversatz und Wiederholung aus älteren Datensätzen', () => {
    const alt = { ...createLauf(K100, [{ nummer: 1 }]) } as Record<string, unknown>
    delete alt.startversatzMs
    delete alt.wiederholung

    const normalisiert = normalizeOnLoad(alt as unknown as Lauf)
    expect(normalisiert.startversatzMs).toBe(0)
    expect(normalisiert.wiederholung).toBeNull()
  })

  it('setzt laufende und geplante Bahnen auf nicht gestartet zurück', () => {
    const lauf = planeLauf(
      createLauf(K100, [{ nummer: 1 }, { nummer: 2 }], null, { startversatzMs: 10_000 }),
      1000,
      1000,
      10_000,
    )
    const normalisiert = normalizeOnLoad(lauf)
    expect(normalisiert.bahnen.map((bahn) => bahn.startMs)).toEqual([null, null])
  })

  it('ergänzt den Modus aus älteren Datensätzen als Training', () => {
    const alt = { ...createLauf(K100, [{ nummer: 1 }]) } as Record<string, unknown>
    delete alt.modus
    expect(normalizeOnLoad(alt as unknown as Lauf).modus).toBe('training')
  })

  it('behält den Wettkampfmodus', () => {
    const lauf = createLauf(K100, [{ nummer: 1 }], null, { modus: 'wettkampf' })
    expect(normalizeOnLoad(lauf).modus).toBe('wettkampf')
  })

  it('lässt beendete Bahnen unangetastet', () => {
    const basis = createLauf(K100, [{ nummer: 1 }])
    const bahnId = basis.bahnen[0]!.id
    const gestartet = planeLauf(basis, 0, 0, 0)
    const fertig = tapLane(tapLane(gestartet, bahnId, 30_000, 30_000), bahnId, 60_000, 60_000)

    const normalisiert = normalizeOnLoad(fertig)
    expect(normalisiert.bahnen[0]?.startMs).toBe(0)
    expect(normalisiert.bahnen[0]?.anschlaege).toHaveLength(2)
  })
})

describe('normalizeSatzOnLoad', () => {
  it('ergänzt den fehlenden Plan als freien Satz', () => {
    const alt = {
      id: 's1',
      datum: '2026-10-29',
      bezeichnung: '',
      konfiguration: K100,
      erstelltAm: 0,
    } as unknown as Satz
    expect(normalizeSatzOnLoad(alt).plan).toBeNull()
    expect(normalizeSatzOnLoad(alt).wettkampfId).toBeNull()
  })

  it('behält die Wettkampfzuordnung', () => {
    const satz: Satz = {
      id: 's1',
      datum: '2026-10-29',
      bezeichnung: '100 m Freistil',
      konfiguration: K100,
      plan: null,
      wettkampfId: 'w1',
      erstelltAm: 0,
    }
    expect(normalizeSatzOnLoad(satz).wettkampfId).toBe('w1')
  })
})

describe('normalizeTrainingOnLoad', () => {
  it('ergänzt fehlende Listen und kürzt oder verlängert die Aktiven', () => {
    const alt = {
      id: 'tr1',
      datum: '2026-10-29',
      bezeichnung: undefined,
      bahnen: 3,
      aktive: ['s1'],
      saetze: undefined,
      gestartet: undefined,
      erstelltAm: 1,
    } as unknown as Training
    const normalisiert = normalizeTrainingOnLoad(alt)
    expect(normalisiert.aktive).toEqual(['s1', null, null])
    expect(normalisiert.saetze).toEqual([])
    expect(normalisiert.gestartet).toEqual({})
    expect(normalisiert.bezeichnung).toBe('')
  })

  it('begrenzt eine fehlerhafte Bahnenzahl auf einen gültigen Wert', () => {
    const normalisiert = normalizeTrainingOnLoad({
      id: 'tr1',
      datum: '2026-10-29',
      bezeichnung: '',
      bahnen: 42,
      aktive: [],
      saetze: [],
      gestartet: {},
      erstelltAm: 1,
    })
    expect(normalisiert.bahnen).toBe(10)
    expect(normalisiert.aktive).toHaveLength(10)
  })
})
