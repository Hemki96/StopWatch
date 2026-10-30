/**
 * Repository gegen eine echte IndexedDB (fake-indexeddb).
 *
 * Prüft das Schema in Version 3, die Sortierung von `loadAll`, die
 * kaskadierenden Löschungen und den Backup-Roundtrip über die tatsächlichen
 * Transaktionen. Der Fokus liegt auf den Invarianten, die sich nur mit einer
 * Datenbank prüfen lassen: keine verwaisten Läufe nach dem Löschen eines Satzes,
 * eine gemeinsame Verbindung pro Tab und ein Import, der bei ungültiger Datei
 * nichts schreibt.
 *
 * `fake-indexeddb/auto` ersetzt die globale IndexedDB-Implementierung, sodass
 * `getDb` unverändert läuft. `beforeEach` leert alle vier Stores, damit die
 * Fälle unabhängig bleiben. Die Fixtures tragen feste IDs und das Datum
 * 2026-10-29; `lauf` hat einen festen Wanduhr-Anker, weil die Sortierung der
 * Läufe nicht davon abhängt.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Lauf, Satz, Schwimmer, Training } from '../domain/types'
import { getDb } from './db'
import { DATENBANK_NAME } from './namensraum'
import {
  clearAll,
  deleteLauf,
  deleteSatzUndLaeufe,
  deleteSchwimmer,
  deleteTraining,
  exportBackup,
  importBackup,
  loadAll,
  saveLauf,
  saveMehrere,
  saveSatz,
  saveSchwimmer,
  saveTraining,
} from './repository'

// 100 m im 50-m-Becken für alle Fixtures; die Konfiguration wird pro Datensatz
// kopiert, damit ein Test sie nicht versehentlich teilt.
const KONFIGURATION = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

// Kleine Erzeuger statt vollständiger Domänenobjekte: Für Speicher- und
// Löschtests zählen nur IDs, Verweise und Sortierfelder.
function schwimmer(id: string, name: string): Schwimmer {
  return { id, name, jahrgang: 2010, notiz: '', erstelltAm: 1 }
}

// Ein Satz ist entweder ein freier Trainingssatz oder eine Serie.
function satz(id: string, datum = '2026-10-29'): Satz {
  return {
    id,
    datum,
    bezeichnung: '',
    konfiguration: { ...KONFIGURATION },
    plan: null,
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

// Erzeugt einen Lauf mit `anzahl` gültigen Anschlägen; der letzte trägt das
// Finish. Mehr Anschläge bedeuten in den Konflikttests einen neueren Stand.
function laufMitAnschlaegen(id: string, anzahl: number, erfasstAb = 1): Lauf {
  const ergebnis = lauf(id)
  ergebnis.bahnen[0]!.anschlaege = Array.from({ length: anzahl }, (_, index) => ({
    laengeNr: index + 1,
    splitMs: (index + 1) * 30_000,
    erfasstAt: erfasstAb + index,
    istFinish: index === anzahl - 1,
  }))
  return ergebnis
}

/** Hülle für einen Import im Test; die Bestände bleiben steuerbar. */
function backupMit(laeufe: Lauf[]) {
  return {
    format: 'beckenrand-backup',
    version: 3,
    exportiertAm: '2026-10-29T10:00:00.000Z',
    schwimmer: [],
    satze: [],
    laeufe,
    trainings: [],
  }
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

// Spies auf IndexedDB-Prototypen gelten nur im jeweiligen Test; ein Fehlschlag
// darf die folgenden Fälle nicht mit einem veränderten Prototyp belasten.
afterEach(() => {
  vi.restoreAllMocks()
})

// Schema und Verbindung: Version 3 mit vier Stores und den Indizes für
// Abfragen.
describe('getDb', () => {
  // `getDb` hält das Promise fest; zwei Aufrufe liefern dieselbe Verbindung,
  // statt die Datenbank mehrfach zu öffnen.
  it('öffnet das Schema in Version 3 und teilt die Verbindung', async () => {
    const db = await getDb()
    expect(db.name).toBe(DATENBANK_NAME)
    expect(db.version).toBe(3)
    expect([...db.objectStoreNames].sort()).toEqual([
      'lauf',
      'satz',
      'schwimmer',
      'training',
    ])
    expect(getDb()).toBe(getDb())
    await expect(db.count('lauf')).resolves.toBe(0)
  })

  // Die Indizes tragen die Abfragen: Sätze nach Datum, Läufe nach Satz (für das
  // kaskadierte Löschen), Trainings nach Datum, Schwimmer nach Name.
  it('kennt die Indizes für Abfragen', async () => {
    const db = await getDb()
    const tx = db.transaction(['satz', 'lauf', 'training', 'schwimmer'])
    expect([...tx.objectStore('satz').indexNames]).toEqual(['by-datum'])
    expect([...tx.objectStore('lauf').indexNames]).toEqual(['by-satz'])
    expect([...tx.objectStore('training').indexNames]).toEqual(['by-datum'])
    expect([...tx.objectStore('schwimmer').indexNames]).toEqual(['by-name'])
    await tx.done
  })
})

// `loadAll` liest alle vier Stores und sortiert sie für die Anzeige.
describe('loadAll', () => {
  // Die Einfügereihenfolge ist absichtlich unsortiert: Schwimmer alphabetisch
  // (Anna vor Zoe), Sätze und Trainings nach Datum absteigend.
  it('liest alle Speicher und sortiert sie für die Anzeige', async () => {
    await saveSchwimmer(schwimmer('sw2', 'Zoe'))
    await saveSchwimmer(schwimmer('sw1', 'Anna'))
    await saveSatz(satz('s1', '2026-10-27'))
    await saveSatz(satz('s2', '2026-10-29'))
    await saveTraining(training('t1', '2026-10-01'))
    await saveTraining(training('t2', '2026-10-29'))
    await saveLauf(lauf('l1', 's1'))

    const daten = await loadAll()

    expect(daten.schwimmer.map((eintrag) => eintrag.name)).toEqual(['Anna', 'Zoe'])
    expect(daten.satze.map((eintrag) => eintrag.id)).toEqual(['s2', 's1'])
    expect(daten.trainings.map((eintrag) => eintrag.id)).toEqual(['t2', 't1'])
    expect(daten.laeufe).toHaveLength(1)
  })

  // Der gespeicherte Datensatz ist absichtlich alt: ohne Startversatz und
  // Wiederholung, dafür mit laufender Bahn und einem Anschlag. Beim Laden muss
  // der Start verschwinden, der Anschlag bleiben und die Felder ergänzt werden.
  it('normalisiert alte und unterbrochene Datensätze beim Laden', async () => {
    const alt = lauf('l1')
    alt.bahnen[0]!.startMs = 1000
    alt.bahnen[0]!.anschlaege = [
      { laengeNr: 1, splitMs: 30_000, erfasstAt: 1, istFinish: false },
    ]
    const ohneFelder = { ...alt, id: 'l2' } as Record<string, unknown>
    delete ohneFelder.startversatzMs
    delete ohneFelder.wiederholung
    await saveLauf(ohneFelder as unknown as Lauf)

    const [geladen] = (await loadAll()).laeufe

    expect(geladen?.bahnen[0]?.startMs).toBeNull()
    expect(geladen?.bahnen[0]?.anschlaege).toHaveLength(1)
    expect(geladen?.startversatzMs).toBe(0)
    expect(geladen?.wiederholung).toBeNull()
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

  // Akzeptanzkriterium: Alle vier Stores stammen aus genau einer gemeinsamen
  // Read-Transaktion. Geprüft wird auf der rohen Verbindung, damit der Test
  // nicht von der idb-Hülle abhängt.
  it('liest alle vier Stores in genau einer Read-Transaktion', async () => {
    const transaktion = vi.spyOn(IDBDatabase.prototype, 'transaction')

    await loadAll()

    expect(transaktion).toHaveBeenCalledTimes(1)
    const aufruf = transaktion.mock.calls[0]
    expect(aufruf?.[0]).toEqual(['schwimmer', 'satz', 'lauf', 'training'])
    expect(aufruf?.[1]).toBe('readonly')
  })

  // Ein Schreibvorgang, der während des Lesens angestoßen wird, darf nicht
  // zwischen zwei Stores sichtbar werden. Die gemeinsame Transaktion blockiert
  // ihn, bis alle vier Bestände gelesen sind; danach ist er vollständig da.
  it('sieht keinen halben Stand, wenn während des Lesens geschrieben wird', async () => {
    await saveMehrere({ satze: [satz('s1')], laeufe: [lauf('l1', 's1')] })

    const original = IDBObjectStore.prototype.getAll
    let schreibvorgang: Promise<void> | undefined
    vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (
      this: IDBObjectStore,
      query?: IDBValidKey | IDBKeyRange | null,
      count?: number,
    ) {
      // Beim ersten Read den Schreibvorgang anstoßen, sodass er mitten in die
      // laufende Read-Transaktion fällt. Beide Datensätze entstehen gemeinsam,
      // damit ein halber Stand eindeutig erkennbar wäre.
      schreibvorgang ??= saveMehrere({ satze: [satz('s2')], laeufe: [lauf('l2', 's2')] })
      return original.call(this, query, count)
    })

    const daten = await loadAll()

    // Der Snapshot vor dem Commit enthält nur den alten, vollständigen Stand.
    expect(daten.satze.map((eintrag) => eintrag.id)).toEqual(['s1'])
    expect(daten.laeufe.map((eintrag) => eintrag.id)).toEqual(['l1'])
    const satzIds = new Set(daten.satze.map((eintrag) => eintrag.id))
    const alleLaeufeHabenSatz = daten.laeufe.every(
      (eintrag) => eintrag.satzId === null || satzIds.has(eintrag.satzId),
    )
    expect(alleLaeufeHabenSatz).toBe(true)

    await schreibvorgang
    const danach = await loadAll()
    expect(danach.satze.map((eintrag) => eintrag.id).sort()).toEqual(['s1', 's2'])
    expect(danach.laeufe.map((eintrag) => eintrag.id).sort()).toEqual(['l1', 'l2'])
  })

  // Ein Fehler beim Lesen bricht die gemeinsame Transaktion ab und wird
  // unverändert weitergereicht; die Verbindung bleibt danach benutzbar.
  it('meldet einen Lesefehler und lässt die Datenbank benutzbar', async () => {
    await saveSatz(satz('s1'))

    const original = IDBObjectStore.prototype.getAll
    let fehlerGeworfen = false
    vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (
      this: IDBObjectStore,
      query?: IDBValidKey | IDBKeyRange | null,
      count?: number,
    ) {
      // Nur der erste Leseversuch scheitert; danach muss die Datenbank wieder
      // normal nutzbar sein.
      if (this.name === 'satz' && !fehlerGeworfen) {
        fehlerGeworfen = true
        throw new DOMException('Lesen fehlgeschlagen', 'UnknownError')
      }
      return original.call(this, query, count)
    })

    await expect(loadAll()).rejects.toThrow('Lesen fehlgeschlagen')

    const daten = await loadAll()
    expect(daten.satze.map((eintrag) => eintrag.id)).toEqual(['s1'])
  })

  // Schon das Öffnen der Transaktion kann scheitern (etwa weil die Verbindung
  // geschlossen wurde); der Fehler wird nicht verschluckt.
  it('reicht einen Fehler beim Öffnen der Read-Transaktion weiter', async () => {
    const db = await getDb()
    vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
      throw new DOMException('Datenbank nicht verfügbar', 'InvalidStateError')
    })

    await expect(loadAll()).rejects.toThrow('Datenbank nicht verfügbar')

    // Der nächste Aufruf nutzt wieder die echte Transaktion.
    await expect(loadAll()).resolves.toEqual({
      schwimmer: [],
      satze: [],
      laeufe: [],
      trainings: [],
    })
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
    await saveTraining(training('t1'))

    const backup = await exportBackup()

    expect(backup.format).toBe('beckenrand-backup')
    expect(backup.version).toBe(3)
    expect(backup.exportiertAm).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(backup.schwimmer).toHaveLength(1)
    expect(backup.satze).toHaveLength(1)
    expect(backup.laeufe).toHaveLength(1)
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
      trainings: [training('t1')],
    }

    await importBackup(roh)

    const daten = await loadAll()
    expect(daten.schwimmer).toHaveLength(1)
    expect(daten.satze).toHaveLength(1)
    expect(daten.laeufe).toHaveLength(1)
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
  // normalisiert: Plan und Serienfelder werden ergänzt, alte Wettkampf-Felder
  // verworfen.
  it('normalisiert unvollständige Datensätze beim Import', async () => {
    const alt = lauf('l1')
    const ohneFelder = { ...alt } as Record<string, unknown>
    delete ohneFelder.startversatzMs
    delete ohneFelder.wiederholung

    await importBackup({
      format: 'beckenrand-backup',
      version: 3,
      exportiertAm: '2026-10-29T10:00:00.000Z',
      schwimmer: [],
      satze: [{ ...satz('s1'), plan: undefined }],
      laeufe: [ohneFelder],
      trainings: [],
    })

    const [geladenerSatz] = (await loadAll()).satze
    expect(geladenerSatz?.plan).toBeNull()

    const [geladenerLauf] = (await loadAll()).laeufe
    expect(geladenerLauf?.startversatzMs).toBe(0)
    expect(geladenerLauf?.wiederholung).toBeNull()
  })

  // Nach `clearAll` liefert `loadAll` vier leere Listen; der Zustand ist exakt
  // vergleichbar, weil die Rückgabe keine zusätzlichen Felder enthält.
  it('leert alle Speicher', async () => {
    await saveSchwimmer(schwimmer('sw1', 'Anna'))
    await saveSatz(satz('s1'))
    await saveLauf(lauf('l1'))
    await saveTraining(training('t1'))

    await clearAll()

    await expect(loadAll()).resolves.toEqual({
      schwimmer: [],
      satze: [],
      laeufe: [],
      trainings: [],
    })
  })
})

// Konflikte beim Import: Ein vorhandener Lauf mit mehr Anschlägen darf ohne
// ausdrückliche Entscheidung nicht durch einen älteren Backup-Stand ersetzt
// werden. Nicht kollidierende Datensätze werden trotzdem übernommen.
describe('Backup-Konflikte', () => {
  it('behält einen neueren lokalen Lauf und importiert den Rest', async () => {
    await saveLauf(laufMitAnschlaegen('l1', 2))
    await saveLauf(laufMitAnschlaegen('l3', 1))

    const ergebnis = await importBackup(
      backupMit([laufMitAnschlaegen('l1', 1), laufMitAnschlaegen('l2', 1)]),
    )

    expect(ergebnis.gesamt).toBe(1)
    expect(ergebnis.neuereLokale).toBe(1)
    expect(ergebnis.eintraege).toEqual([{ bestand: 'laeufe', id: 'l1', art: 'lokalNeuer' }])

    const daten = await loadAll()
    expect(daten.laeufe.find((eintrag) => eintrag.id === 'l1')?.bahnen[0]?.anschlaege).toHaveLength(
      2,
    )
    // Der neue Lauf aus dem Backup ist ergänzt, der vorhandene l3 unverändert.
    expect(daten.laeufe.map((eintrag) => eintrag.id).sort()).toEqual(['l1', 'l2', 'l3'])
  })

  it('ersetzt den lokalen Lauf nur bei ausdrücklicher Entscheidung', async () => {
    await saveLauf(laufMitAnschlaegen('l1', 2))

    const ergebnis = await importBackup(backupMit([laufMitAnschlaegen('l1', 1)]), {
      konflikte: 'backupErsetzen',
    })

    expect(ergebnis.gesamt).toBe(1)

    const daten = await loadAll()
    expect(daten.laeufe[0]?.bahnen[0]?.anschlaege).toHaveLength(1)
  })

  // Gleicher Inhalt ist kein Konflikt und wird ohne Meldung übernommen.
  it('meldet bei gleichem Inhalt keinen Konflikt', async () => {
    await saveLauf(laufMitAnschlaegen('l1', 2))

    const ergebnis = await importBackup(backupMit([laufMitAnschlaegen('l1', 2)]))

    expect(ergebnis).toEqual({ eintraege: [], gesamt: 0, neuereLokale: 0 })
    const daten = await loadAll()
    expect(daten.laeufe[0]?.bahnen[0]?.anschlaege).toHaveLength(2)
  })

  // Die Prüfung läuft innerhalb der Schreibtransaktion. Ein abweichender
  // Datensatz wird auch dann nicht geschrieben, wenn die Vorschau ihn noch
  // nicht kannte, weil der Bestand erst danach entstanden ist.
  it('erkennt Konflikte erst beim Schreiben gegen den aktuellen Stand', async () => {
    const backup = backupMit([laufMitAnschlaegen('l1', 1)])
    await saveLauf(laufMitAnschlaegen('l1', 3))

    const ergebnis = await importBackup(backup)

    expect(ergebnis.gesamt).toBe(1)
    const daten = await loadAll()
    expect(daten.laeufe[0]?.bahnen[0]?.anschlaege).toHaveLength(3)
  })
})
