/**
 * Repository gegen eine echte IndexedDB (fake-indexeddb).
 *
 * Prüft das Schema in Version 3, die Sortierung von `loadAll`, die
 * kaskadierenden Löschungen und den Backup-Roundtrip über die tatsächlichen
 * Transaktionen. Der Fokus liegt auf den Invarianten, die sich nur mit einer
 * Datenbank prüfen lassen: keine verwaisten Läufe nach dem Löschen eines Satzes
 * oder Wettkampfs, eine gemeinsame Verbindung pro Tab und ein Import, der bei
 * ungültiger Datei nichts schreibt.
 *
 * `fake-indexeddb/auto` ersetzt die globale IndexedDB-Implementierung, sodass
 * `getDb` unverändert läuft. `beforeEach` leert alle fünf Stores, damit die
 * Fälle unabhängig bleiben. Die Fixtures tragen feste IDs und das Datum
 * 2026-10-29; `lauf` hat einen festen Wanduhr-Anker, weil die Sortierung der
 * Läufe nicht davon abhängt.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Lauf, Satz, Schwimmer, Training, Wettkampf } from '../domain/types'
import { getDb } from './db'
import {
  clearAll,
  deleteLauf,
  deleteSatzUndLaeufe,
  deleteSchwimmer,
  deleteTraining,
  deleteWettkampfUndDaten,
  exportBackup,
  importBackup,
  loadAll,
  saveLauf,
  saveMehrere,
  saveSatz,
  saveSchwimmer,
  saveTraining,
  saveWettkampf,
} from './repository'

// 100 m im 50-m-Becken für alle Fixtures; die Konfiguration wird pro Datensatz
// kopiert, damit ein Test sie nicht versehentlich teilt.
const KONFIGURATION = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

// Kleine Erzeuger statt vollständiger Domänenobjekte: Für Speicher- und
// Löschtests zählen nur IDs, Verweise und Sortierfelder.
function schwimmer(id: string, name: string): Schwimmer {
  return { id, name, jahrgang: 2010, notiz: '', erstelltAm: 1 }
}

// Ein Satz gehört optional zu einem Wettkampf; ohne Angabe bleibt die
// Zuordnung null, wie bei einem Trainings- oder freien Satz.
function satz(id: string, datum = '2026-10-29', wettkampfId?: string): Satz {
  return {
    id,
    datum,
    bezeichnung: '',
    konfiguration: { ...KONFIGURATION },
    plan: null,
    wettkampfId: wettkampfId ?? null,
    erstelltAm: 1,
  }
}

// Lauf mit einer Bahn und festem Wanduhr-Anker. `startMs` bleibt null, damit
// beim Laden nichts zurückgesetzt werden muss; `satzId` darf auf einen nicht
// gespeicherten Satz zeigen, weil IndexedDB keine Fremdschlüssel kennt.
function lauf(id: string, satzId: string | null = 's1', nummer = 1): Lauf {
  return {
    id,
    satzId,
    konfiguration: { ...KONFIGURATION },
    startWallMs: 1_700_000_000_000,
    startversatzMs: 0,
    wiederholung: null,
    modus: 'training',
    bahnen: [
      {
        id: `${id}-bahn-1`,
        nummer,
        reihe: 1,
        schwimmerId: 'sw1',
        startMs: null,
        anschlaege: [],
      },
    ],
  }
}

// Wettkampf mit festem Datum; die Beckenlänge 50 m ist die einzige gültige
// neben 25 m.
function wettkampf(id: string, name: string, datum = '2026-10-29'): Wettkampf {
  return { id, name, datum, beckenlaengeM: 50, erstelltAm: 1 }
}

// Zwei Bahnen ohne Zuordnung und ein einzelner Satz; damit ist ein Training
// gültig, ohne dass Schwimmer gespeichert sein müssen.
function training(id: string, datum = '2026-10-29'): Training {
  return {
    id,
    datum,
    bezeichnung: '',
    bahnen: 2,
    reihen: 1,
    aktive: [null, null],
    saetze: [
      {
        id: `${id}-satz-1`,
        bezeichnung: '',
        konfiguration: { ...KONFIGURATION },
        wiederholungen: 1,
        taktSek: 120,
        startversatzMs: 0,
      },
    ],
    gestartet: {},
    erstelltAm: 1,
  }
}

// Jeder Test startet mit leeren Stores; `clearAll` läuft in einer eigenen
// Transaktion und wartet auf den Commit.
beforeEach(async () => {
  await clearAll()
})

// Schema und Verbindung: Version 3 mit fünf Stores und den Indizes für
// Abfragen.
describe('getDb', () => {
  // `getDb` hält das Promise fest; zwei Aufrufe liefern dieselbe Verbindung,
  // statt die Datenbank mehrfach zu öffnen.
  it('öffnet das Schema in Version 3 und teilt die Verbindung', async () => {
    const db = await getDb()
    expect(db.name).toBe('beckenrand')
    expect(db.version).toBe(3)
    expect([...db.objectStoreNames].sort()).toEqual([
      'lauf',
      'satz',
      'schwimmer',
      'training',
      'wettkampf',
    ])
    expect(getDb()).toBe(getDb())
    await expect(db.count('lauf')).resolves.toBe(0)
  })

  // Die Indizes tragen die Abfragen: Sätze nach Datum und Wettkampf, Läufe nach
  // Satz (für das kaskadierte Löschen), Wettkämpfe und Trainings nach Datum,
  // Schwimmer nach Name.
  it('kennt die Indizes für Abfragen', async () => {
    const db = await getDb()
    const tx = db.transaction(['satz', 'lauf', 'wettkampf', 'training', 'schwimmer'])
    expect([...tx.objectStore('satz').indexNames].sort()).toEqual(['by-datum', 'by-wettkampf'])
    expect([...tx.objectStore('lauf').indexNames]).toEqual(['by-satz'])
    expect([...tx.objectStore('wettkampf').indexNames]).toEqual(['by-datum'])
    expect([...tx.objectStore('training').indexNames]).toEqual(['by-datum'])
    expect([...tx.objectStore('schwimmer').indexNames]).toEqual(['by-name'])
    await tx.done
  })
})

// `loadAll` liest alle fünf Stores und sortiert sie für die Anzeige.
describe('loadAll', () => {
  // Die Einfügereihenfolge ist absichtlich unsortiert: Schwimmer alphabetisch
  // (Anna vor Zoe), Sätze, Wettkämpfe und Trainings nach Datum absteigend.
  it('liest alle Speicher und sortiert sie für die Anzeige', async () => {
    await saveSchwimmer(schwimmer('sw2', 'Zoe'))
    await saveSchwimmer(schwimmer('sw1', 'Anna'))
    await saveSatz(satz('s1', '2026-10-27'))
    await saveSatz(satz('s2', '2026-10-29'))
    await saveWettkampf(wettkampf('w1', 'Alt', '2026-10-01'))
    await saveWettkampf(wettkampf('w2', 'Neu', '2026-10-29'))
    await saveTraining(training('t1', '2026-10-01'))
    await saveTraining(training('t2', '2026-10-29'))
    await saveLauf(lauf('l1', 's1'))

    const daten = await loadAll()

    expect(daten.schwimmer.map((eintrag) => eintrag.name)).toEqual(['Anna', 'Zoe'])
    expect(daten.satze.map((eintrag) => eintrag.id)).toEqual(['s2', 's1'])
    expect(daten.wettkampfe.map((eintrag) => eintrag.name)).toEqual(['Neu', 'Alt'])
    expect(daten.trainings.map((eintrag) => eintrag.id)).toEqual(['t2', 't1'])
    expect(daten.laeufe).toHaveLength(1)
  })

  // Der gespeicherte Datensatz ist absichtlich alt: ohne Startversatz,
  // Wiederholung und Modus, dafür mit laufender Bahn und einem Anschlag. Beim
  // Laden muss der Start verschwinden, der Anschlag bleiben und die Felder
  // ergänzt werden.
  it('normalisiert alte und unterbrochene Datensätze beim Laden', async () => {
    const alt = lauf('l1')
    alt.bahnen[0]!.startMs = 1000
    alt.bahnen[0]!.anschlaege = [
      { laengeNr: 1, splitMs: 30_000, erfasstAt: 1, istFinish: false },
    ]
    const ohneFelder = { ...alt, id: 'l2' } as Record<string, unknown>
    delete ohneFelder.startversatzMs
    delete ohneFelder.wiederholung
    delete ohneFelder.modus
    await saveLauf(ohneFelder as unknown as Lauf)

    const [geladen] = (await loadAll()).laeufe

    expect(geladen?.bahnen[0]?.startMs).toBeNull()
    expect(geladen?.bahnen[0]?.anschlaege).toHaveLength(1)
    expect(geladen?.startversatzMs).toBe(0)
    expect(geladen?.wiederholung).toBeNull()
    expect(geladen?.modus).toBe('training')
  })

  // Bei einer Tab-Übergabe lebt die Messung weiter: Der Start darf nicht wie
  // nach einem Reload verschwinden. `rebaseLauf` verschiebt ihn anschließend
  // auf die Uhr des neuen Dokuments.
  it('behält laufende Startzeiten für eine Tab-Übergabe', async () => {
    const laufend = lauf('l1')
    laufend.startWallMs = 1_000
    laufend.bahnen[0]!.startMs = 100
    await saveLauf(laufend)

    const [nachReload] = (await loadAll()).laeufe
    expect(nachReload?.bahnen[0]?.startMs).toBeNull()

    const [nachUebergabe] = (await loadAll({ behalteLaufende: true })).laeufe
    expect(nachUebergabe?.bahnen[0]?.startMs).toBe(100)
  })
})

// Mehrere fachlich zusammengehörige Datensätze in einer Transaktion.
describe('saveMehrere', () => {
  it('schreibt Bezugsobjekte und abhängige Datensätze gemeinsam', async () => {
    await saveMehrere({
      schwimmer: [schwimmer('sw1', 'Anna')],
      satze: [satz('s1')],
      laeufe: [lauf('l1', 's1')],
    })

    const daten = await loadAll()
    expect(daten.schwimmer.map((eintrag) => eintrag.id)).toEqual(['sw1'])
    expect(daten.satze.map((eintrag) => eintrag.id)).toEqual(['s1'])
    expect(daten.laeufe.map((eintrag) => eintrag.id)).toEqual(['l1'])
  })

  it('schreibt bei einem Fehler nichts aus dem Batch', async () => {
    await saveSchwimmer(schwimmer('sw1', 'Anna'))
    // Eine Funktion ist nicht strukturklonbar; IndexedDB wirft beim `put`.
    const ungueltig = {
      ...lauf('l1', 's1'),
      konfiguration: { ...KONFIGURATION, schwimmart: (() => undefined) as unknown as string },
    } as Lauf

    await expect(
      saveMehrere({
        satze: [satz('s1')],
        laeufe: [ungueltig],
      }),
    ).rejects.toBeDefined()

    const daten = await loadAll()
    expect(daten.satze).toEqual([])
    expect(daten.laeufe).toEqual([])
    // Der vorherige Bestand bleibt erhalten.
    expect(daten.schwimmer.map((eintrag) => eintrag.id)).toEqual(['sw1'])
  })
})

// Kaskadierendes Löschen: Abhängige Datensätze verschwinden mit, fremde
// bleiben unangetastet.
describe('Löschen', () => {
  // s1 hat zwei Läufe, s2 einen; nach dem Löschen von s1 bleibt s2 samt l3.
  it('entfernt einen Satz samt seiner Läufe, aber keine fremden', async () => {
    await saveSatz(satz('s1'))
    await saveSatz(satz('s2'))
    await saveLauf(lauf('l1', 's1'))
    await saveLauf(lauf('l2', 's1'))
    await saveLauf(lauf('l3', 's2'))

    await deleteSatzUndLaeufe('s1')

    const daten = await loadAll()
    expect(daten.satze.map((eintrag) => eintrag.id)).toEqual(['s2'])
    expect(daten.laeufe.map((eintrag) => eintrag.id)).toEqual(['l3'])
  })

  // Disziplinen sind Sätze mit `wettkampfId`; s3 gehört zu keinem Wettkampf und
  // bleibt deshalb mit l3 erhalten.
  it('entfernt einen Wettkampf samt Disziplinen und Läufen', async () => {
    await saveWettkampf(wettkampf('w1', 'Wettkampf'))
    await saveSatz(satz('s1', '2026-10-29', 'w1'))
    await saveSatz(satz('s2', '2026-10-29', 'w1'))
    await saveSatz(satz('s3'))
    await saveLauf(lauf('l1', 's1'))
    await saveLauf(lauf('l2', 's2'))
    await saveLauf(lauf('l3', 's3'))

    await deleteWettkampfUndDaten('w1')

    const daten = await loadAll()
    expect(daten.wettkampfe).toEqual([])
    expect(daten.satze.map((eintrag) => eintrag.id)).toEqual(['s3'])
    expect(daten.laeufe.map((eintrag) => eintrag.id)).toEqual(['l3'])
  })

  // Ein Training ist nur der Plan; gemessene Sätze und Läufe bleiben im
  // Verlauf, auch wenn der Plan gelöscht wird.
  it('löscht ein Training nur als Plan und behält gemessene Läufe', async () => {
    await saveTraining(training('t1'))
    await saveSatz(satz('s1'))
    await saveLauf(lauf('l1', 's1'))

    await deleteTraining('t1')

    const daten = await loadAll()
    expect(daten.trainings).toEqual([])
    expect(daten.satze).toHaveLength(1)
    expect(daten.laeufe).toHaveLength(1)
  })

  // Einzelne Löschungen betreffen genau einen Datensatz; Verweise auf den
  // gelöschten Schwimmer werden nicht mitentfernt.
  it('löscht einzelne Läufe und Schwimmer', async () => {
    await saveSchwimmer(schwimmer('sw1', 'Anna'))
    await saveLauf(lauf('l1'))

    await deleteSchwimmer('sw1')
    await deleteLauf('l1')

    const daten = await loadAll()
    expect(daten.schwimmer).toEqual([])
    expect(daten.laeufe).toEqual([])
  })
})

// Backup über das Repository: Export aller Bestände, geprüfter Import und
// vollständiges Leeren.
describe('Backup', () => {
  // Format und Version kommen aus `backup.ts`; `exportiertAm` ist ein
  // ISO-Zeitstempel in UTC.
  it('exportiert alle Bestände mit Format und Version', async () => {
    await saveSchwimmer(schwimmer('sw1', 'Anna'))
    await saveSatz(satz('s1'))
    await saveLauf(lauf('l1'))
    await saveWettkampf(wettkampf('w1', 'Herbstpokal'))
    await saveTraining(training('t1'))

    const backup = await exportBackup()

    expect(backup.format).toBe('beckenrand-backup')
    expect(backup.version).toBe(3)
    expect(backup.exportiertAm).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(backup.schwimmer).toHaveLength(1)
    expect(backup.satze).toHaveLength(1)
    expect(backup.laeufe).toHaveLength(1)
    expect(backup.wettkampfe).toHaveLength(1)
    expect(backup.trainings).toHaveLength(1)
  })

  // Ein gültiges Backup wird vollständig geschrieben; die Reihenfolge im Import
  // sorgt dafür, dass Bezugsobjekte vor abhängigen Daten existieren.
  it('schreibt ein geprüftes Backup vollständig', async () => {
    const roh = {
      format: 'beckenrand-backup',
      version: 3,
      exportiertAm: '2026-10-29T10:00:00.000Z',
      schwimmer: [schwimmer('sw1', 'Anna')],
      satze: [satz('s1')],
      laeufe: [lauf('l1')],
      wettkampfe: [wettkampf('w1', 'Herbstpokal')],
      trainings: [training('t1')],
    }

    await importBackup(roh)

    const daten = await loadAll()
    expect(daten.schwimmer).toHaveLength(1)
    expect(daten.satze).toHaveLength(1)
    expect(daten.laeufe).toHaveLength(1)
    expect(daten.wettkampfe).toHaveLength(1)
    expect(daten.trainings).toHaveLength(1)
  })

  // Version 99 wird vor dem Öffnen der Transaktion abgelehnt; der vorhandene
  // Bestand bleibt unverändert.
  it('lehnt ein ungültiges Backup ab, ohne den Bestand zu verändern', async () => {
    await saveSchwimmer(schwimmer('sw1', 'Anna'))

    await expect(
      importBackup({
        format: 'beckenrand-backup',
        version: 99,
        exportiertAm: '2026-10-29T10:00:00.000Z',
        schwimmer: [],
        satze: [],
        laeufe: [],
      }),
    ).rejects.toThrow(/Version/)

    await expect(loadAll()).resolves.toMatchObject({
      schwimmer: [expect.objectContaining({ name: 'Anna' })],
    })
  })

  // `undefined`-Felder aus einem älteren Export werden beim Schreiben
  // normalisiert: Plan und Wettkampfzuordnung werden null, der Lauf bekommt
  // Modus und Serienfelder.
  it('normalisiert unvollständige Datensätze beim Import', async () => {
    const alt = lauf('l1')
    const ohneFelder = { ...alt } as Record<string, unknown>
    delete ohneFelder.startversatzMs
    delete ohneFelder.wiederholung
    delete ohneFelder.modus

    await importBackup({
      format: 'beckenrand-backup',
      version: 3,
      exportiertAm: '2026-10-29T10:00:00.000Z',
      schwimmer: [],
      satze: [{ ...satz('s1'), plan: undefined, wettkampfId: undefined }],
      laeufe: [ohneFelder],
      wettkampfe: [],
      trainings: [],
    })

    const [geladenerSatz] = (await loadAll()).satze
    expect(geladenerSatz?.plan).toBeNull()
    expect(geladenerSatz?.wettkampfId).toBeNull()

    const [geladenerLauf] = (await loadAll()).laeufe
    expect(geladenerLauf?.startversatzMs).toBe(0)
    expect(geladenerLauf?.wiederholung).toBeNull()
    expect(geladenerLauf?.modus).toBe('training')
  })

  // Nach `clearAll` liefert `loadAll` fünf leere Listen; der Zustand ist exakt
  // vergleichbar, weil die Rückgabe keine zusätzlichen Felder enthält.
  it('leert alle Speicher', async () => {
    await saveSchwimmer(schwimmer('sw1', 'Anna'))
    await saveSatz(satz('s1'))
    await saveLauf(lauf('l1'))
    await saveWettkampf(wettkampf('w1', 'Herbstpokal'))
    await saveTraining(training('t1'))

    await clearAll()

    await expect(loadAll()).resolves.toEqual({
      schwimmer: [],
      satze: [],
      laeufe: [],
      wettkampfe: [],
      trainings: [],
    })
  })
})
