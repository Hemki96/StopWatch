/**
 * Normalisierung beim Laden aus IndexedDB (ohne echte Datenbank).
 *
 * Sichert die Regeln aus `repository.ts` ab, die ältere oder unterbrochene
 * Datensätze auf den aktuellen Stand bringen: fehlende Felder werden ergänzt,
 * unbrauchbare Werte auf sichere Vorgaben begrenzt, und laufende Bahnen ohne
 * Ziel verlieren ihren Start, weil `performance.now()` einen Reload nicht
 * überlebt. Beendete Bahnen müssen dagegen vollständig erhalten bleiben, damit
 * der Verlauf stimmt.
 *
 * Die Tests arbeiten auf reinen Domänenobjekten; die IndexedDB-Anbindung prüft
 * `repository.integration.test.ts`. `planeLauf` erzeugt die laufenden bzw.
 * geplanten Bahnen mit festen Zeitstempeln (1000 ms, 10 s Versatz).
 */
import { describe, expect, it } from 'vitest'
import { createLauf, planeLauf, tapLane } from '../domain/lauf'
import {
  normalizeOnLoad,
  normalizeSatzOnLoad,
  normalizeTrainingOnLoad,
} from './repository'
import type { Lauf, Satz, Training } from '../domain/types'

// 100 m im 50-m-Becken; die Konfiguration bleibt beim Laden unverändert.
const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

// Lauf-Normalisierung: Felder älterer Stände und die Zeitstempel nach einem
// Neustart.
describe('normalizeOnLoad', () => {
  // Ältere Läufe kennen weder Startversatz noch Wiederholungsnummer; beide
  // werden auf 0 bzw. null gesetzt.
  it('ergänzt Startversatz und Wiederholung aus älteren Datensätzen', () => {
    const alt = { ...createLauf(K100, [{ nummer: 1 }]) } as Record<string, unknown>
    delete alt.startversatzMs
    delete alt.wiederholung

    const normalisiert = normalizeOnLoad(alt as unknown as Lauf)
    expect(normalisiert.startversatzMs).toBe(0)
    expect(normalisiert.wiederholung).toBeNull()
  })

  // Nach einem Reload ist `startMs` (aus `performance.now()`) wertlos: Laufende
  // und geplante Bahnen werden auf „nicht gestartet“ zurückgesetzt.
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

  // Alte Wettkampf-Felder werden beim Laden verworfen.
  it('entfernt den früheren Laufmodus und Bahnstatus', () => {
    const lauf = createLauf(K100, [{ nummer: 1 }]) as Lauf & {
      modus?: string
      bahnen: (Lauf['bahnen'][number] & { status?: string })[]
    }
    lauf.modus = 'wettkampf'
    lauf.bahnen[0]!.status = 'dns'
    lauf.bahnen[0]!.startMs = 1000

    const normalisiert = normalizeOnLoad(lauf)
    expect('modus' in normalisiert).toBe(false)
    expect('status' in (normalisiert.bahnen[0] ?? {})).toBe(false)
  })

  // Eine beendete Bahn ist ein abgeschlossener Messwert und behält Start (0)
  // und beide Anschläge, damit der Verlauf vollständig bleibt.
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

// Satz-Normalisierung: Der Plan ist später dazugekommen; ein früherer
// Wettkampfbezug wird verworfen.
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
    expect(normalizeSatzOnLoad(alt).tagesbezeichnung).toBe('')
  })

  it('behält eine vorhandene Tagesbezeichnung', () => {
    const satz = {
      id: 's1',
      datum: '2026-10-29',
      bezeichnung: '100 m',
      tagesbezeichnung: 'Kader A',
      konfiguration: K100,
      plan: null,
      erstelltAm: 0,
    } as Satz
    expect(normalizeSatzOnLoad(satz).tagesbezeichnung).toBe('Kader A')
  })

  it('entfernt eine frühere Wettkampfzuordnung', () => {
    const satz = {
      id: 's1',
      datum: '2026-10-29',
      bezeichnung: '100 m Freistil',
      konfiguration: K100,
      plan: null,
      wettkampfId: 'w1',
      erstelltAm: 0,
    } as Satz & { wettkampfId?: string }
    const normalisiert = normalizeSatzOnLoad(satz)
    expect('wettkampfId' in normalisiert).toBe(false)
  })
})

// Trainings-Normalisierung: fehlende Container und eine Aktivenliste mit genau
// einem Platz je Bahn.
describe('normalizeTrainingOnLoad', () => {
  // Drei Bahnen, nur eine Zuordnung: Die Liste wird auf die Bahnenzahl
  // gebracht; fehlende Sätze und `gestartet` werden zu leeren Containern.
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
    // Ältere Trainings kannten keinen automatischen Wechsel.
    expect(normalisiert.autostart).toBe(false)
  })

  // 42 Bahnen werden auf `MAX_BAHNEN` (10) begrenzt; die Aktivenliste folgt der
  // begrenzten Zahl, sonst passten Liste und Bahnen nicht zusammen.
  it('begrenzt eine fehlerhafte Bahnenzahl auf einen gültigen Wert', () => {
    const normalisiert = normalizeTrainingOnLoad({
      id: 'tr1',
      datum: '2026-10-29',
      bezeichnung: '',
      bahnen: 42,
      reihen: 1,
      aktive: [],
      saetze: [],
      gestartet: {},
      erstelltAm: 1,
    })
    expect(normalisiert.bahnen).toBe(10)
    expect(normalisiert.aktive).toHaveLength(10)
  })

  it('behält einen ausdrücklich eingeschalteten automatischen Wechsel', () => {
    const geladen = normalizeTrainingOnLoad({
      id: 'tr1',
      datum: '2026-10-29',
      bezeichnung: '',
      bahnen: 1,
      reihen: 1,
      autostart: true,
      aktive: [],
      saetze: [],
      gestartet: {},
      erstelltAm: 1,
    })
    expect(geladen.autostart).toBe(true)
  })
})
