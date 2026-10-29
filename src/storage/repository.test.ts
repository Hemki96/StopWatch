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

// Lauf-Normalisierung: Felder älterer Stände, Modus und die Zeitstempel nach
// einem Neustart.
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

  // Fehlt der Modus, gilt der Lauf als Trainingslauf; nur `wettkampf` wird
  // ausdrücklich übernommen.
  it('ergänzt den Modus aus älteren Datensätzen als Training', () => {
    const alt = { ...createLauf(K100, [{ nummer: 1 }]) } as Record<string, unknown>
    delete alt.modus
    expect(normalizeOnLoad(alt as unknown as Lauf).modus).toBe('training')
  })

  it('behält den Wettkampfmodus', () => {
    const lauf = createLauf(K100, [{ nummer: 1 }], null, { modus: 'wettkampf' })
    expect(normalizeOnLoad(lauf).modus).toBe('wettkampf')
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

// Satz-Normalisierung: Plan und Wettkampfzuordnung sind erst später dazugekommen.
describe('normalizeSatzOnLoad', () => {
  // Ein Satz ohne Plan bleibt ein frei gewachsener Satz; ohne Wettkampfbezug
  // ist `wettkampfId` ausdrücklich null.
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
  })

  // 42 Bahnen werden auf `MAX_BAHNEN` (10) begrenzt; die Aktivenliste folgt der
  // begrenzten Zahl, sonst passten Liste und Bahnen nicht zusammen.
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
