/**
 * JSON-Backup: Format, Version und vollständige Prüfung vor dem Import.
 *
 * Sichert ab, dass ein Backup erst geschrieben wird, wenn `pruefeBackup` es
 * akzeptiert, und dass die Meldung immer das erste konkrete Problem mit Pfad
 * nennt („Lauf 1, Bahn 1, Anschlag 1“) statt einer Sammelmeldung. Wichtige
 * Fälle sind ältere Versionen ohne `trainings` und ohne die späteren Lauf- und
 * Satzfelder, ungültige Wertebereiche sowie ein
 * Export-Import-Roundtrip, der den Inhalt unverändert lassen muss.
 *
 * Die Fixture ist ein minimaler, aber vollständiger Bestand mit festen IDs und
 * Zeitstempeln. `kopie()` erzeugt für jeden Test eine tiefe Kopie, damit
 * gezielte Mutationen (Feld löschen, Typ ändern) nicht in andere Fälle
 * durchschlagen.
 */
import { describe, expect, it } from 'vitest'
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  ermittleBackupKonflikte,
  konfliktText,
  loeseBackupKonflikte,
  pruefeBackup,
  zusammenfassungText,
  type BackupBestand,
} from './backup'
import type { Lauf, Satz, Schwimmer, Training } from '../domain/types'

// 100 m im 50-m-Becken; die Konfiguration kommt in Schwimmer-unabhängigen
// Sätzen, Trainingssätzen und Läufen vor und wird überall gleich geprüft.
const konfiguration = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

const schwimmer: Schwimmer = {
  id: 's1',
  name: 'Mia',
  jahrgang: 2010,
  notiz: '',
  erstelltAm: 1,
}

const satz: Satz = {
  id: 't1',
  datum: '2026-10-29',
  bezeichnung: '8×100',
  konfiguration,
  plan: null,
  erstelltAm: 1,
}

// Ein Lauf mit zwei Anschlägen: 30 s als Zwischenzeit und 60 s als Finish; die
// Erfassungszeitpunkte 2 und 3 sind nur Platzhalter der Wanduhr.
const lauf: Lauf = {
  id: 'l1',
  satzId: 't1',
  konfiguration,
  startWallMs: 1,
  startversatzMs: 0,
  wiederholung: null,
  bahnen: [
    {
      id: 'b1',
      nummer: 1,
      reihe: 1,
      schwimmerId: 's1',
      startMs: 1,
      anschlaege: [
        { laengeNr: 1, splitMs: 30_000, erfasstAt: 2, istFinish: false },
        { laengeNr: 2, splitMs: 60_000, erfasstAt: 3, istFinish: true },
      ],
    },
  ],
}

// Ein Trainingsplan mit einem gültigen Satz (4 Wiederholungen, 2:00-Takt) und
// zwei Bahnen, von denen eine belegt ist.
const training: Training = {
  id: 'tr1',
  datum: '2026-10-29',
  bezeichnung: 'Kader A',
  bahnen: 2,
  reihen: 1,
  aktive: ['s1', null],
  saetze: [
    {
      id: 'ts1',
      bezeichnung: 'Einschwimmen',
      konfiguration,
      wiederholungen: 4,
      taktSek: 120,
      startversatzMs: 0,
    },
  ],
  gestartet: {},
  erstelltAm: 1,
}

// Vollständiges Backup der aktuellen Version. `exportiertAm` ist ein gültiger
// ISO-Zeitstempel; die Prüfung verlangt ihn, weil die Vorschau das Datum zeigt.
const backup = {
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportiertAm: '2026-10-29T10:00:00.000Z',
  schwimmer: [schwimmer],
  satze: [satz],
  laeufe: [lauf],
  trainings: [],
}

// Tiefe Kopie über JSON: Der Weg entspricht dem echten Import, bei dem die
// Datei geparst wird.
function kopie(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(backup)) as Record<string, unknown>
}

// Grundprüfung: gültige Datei, Zählung je Bestand und unveränderte Rückgabe.
describe('pruefeBackup', () => {
  // Die Zählung ist die Grundlage der Import-Vorschau; sie zählt Datensätze,
  // nicht Bahnen oder Anschläge.
  it('akzeptiert ein gültiges Backup und zählt die Inhalte', () => {
    const ergebnis = pruefeBackup(kopie())
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.zusammenfassung).toEqual({
      schwimmer: 1,
      satze: 1,
      laeufe: 1,
      trainings: 0,
    })
  })

  // Export → JSON → Import darf nichts verlieren oder umsortieren; sonst wäre
  // ein Backup kein verlässlicher Stand.
  it('übersteht einen Export-Import-Roundtrip unverändert', () => {
    const ergebnis = pruefeBackup(JSON.parse(JSON.stringify(backup)))
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.backup).toEqual(backup)
  })

  // Ein Yard-Backup trägt die Einheit und die kanonische 25-Yard-Beckenlänge;
  // ein Backup ohne Einheit bleibt ein Meter-Backup (Rückwärtskompatibilität).
  it('liest Yard-Konfigurationen und lässt fehlende Einheiten als Meter', () => {
    const roh = kopie()
    const laufRoh = (roh.laeufe as Record<string, unknown>[])[0]!
    laufRoh.konfiguration = {
      beckenlaengeM: 22.86,
      streckeM: 91.44,
      schwimmart: 'freistil',
      einheit: 'yd',
    }
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.backup.laeufe[0]?.konfiguration).toMatchObject({
      beckenlaengeM: 22.86,
      streckeM: 91.44,
      einheit: 'yd',
    })

    // Das unveränderte Fixture hat kein Feld `einheit`; das bleibt gültig.
    expect(pruefeBackup(kopie()).ok).toBe(true)
  })

  it('lehnt eine unbekannte Einheit ab', () => {
    const roh = kopie()
    ;((roh.laeufe as Record<string, unknown>[])[0]!.konfiguration as Record<string, unknown>).einheit =
      'meter'
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('einheit')
  })

  it('prüft die gespeicherten Zwischenzeiten', () => {
    const roh = kopie()
    const konfigurationRoh = (roh.laeufe as Record<string, unknown>[])[0]!
      .konfiguration as Record<string, unknown>
    konfigurationRoh.zwischenzeiten = 3
    expect(pruefeBackup(roh).ok).toBe(true)

    konfigurationRoh.zwischenzeiten = 100
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('zwischenzeiten')
  })

  // Alte Wettkampf-Felder in einem Backup werden beim Einlesen still ignoriert.
  it('ignoriert frühere Wettkampf-Felder', () => {
    const roh = kopie()
    roh.wettkampfe = [{ id: 'w1', name: 'Herbstpokal' }]
    ;(roh.laeufe as Record<string, unknown>[])[0]!.modus = 'wettkampf'
    ;(roh.satze as Record<string, unknown>[])[0]!.wettkampfId = 'w1'
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect('wettkampfe' in ergebnis.backup).toBe(false)
  })

  // Ohne Formatkennung könnte jede beliebige JSON-Datei als Backup gelten; die
  // Meldung nennt deshalb die erwartete Kennung.
  it('lehnt eine Datei ohne Formatkennung ab', () => {
    const roh = kopie()
    delete roh.format
    expect(pruefeBackup(roh)).toEqual({
      ok: false,
      fehler: expect.stringContaining(BACKUP_FORMAT),
    })
  })

  // Version 99 ist auch neuer als die aktuelle; sie wird abgelehnt, weil ein
  // älterer Stand keine unbekannten Felder ignorieren darf.
  it('nennt bei unbekannter Version die erwartete Version', () => {
    const ergebnis = pruefeBackup({ ...kopie(), version: 99 })
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('Version 99')
    expect(ergebnis.fehler).toContain(`Version ${BACKUP_VERSION}`)
  })

  // Das fehlende Feld `notiz` ist der erste Fehler; die Meldung nennt Datensatz
  // und Feld, damit die Datei korrigiert werden kann.
  it('nennt das erste konkrete Feldproblem statt einer Sammelmeldung', () => {
    const roh = kopie()
    const ersterSchwimmer = (roh.schwimmer as Record<string, unknown>[])[0]!
    delete ersterSchwimmer.notiz
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('Schwimmer 1')
    expect(ergebnis.fehler).toContain('notiz')
  })

  // Ein Text statt einer Zahl im Split verrät einen falschen Export; der Pfad
  // führt bis zum einzelnen Anschlag.
  it('erkennt falsche Typen in Anschlägen', () => {
    const roh = kopie()
    const ersterLauf = (roh.laeufe as Record<string, unknown>[])[0]!
    const ersteBahn = (ersterLauf.bahnen as Record<string, unknown>[])[0]!
    const ersterAnschlag = (ersteBahn.anschlaege as Record<string, unknown>[])[0]!
    ersterAnschlag.splitMs = '30 Sekunden'
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('Lauf 1, Bahn 1, Anschlag 1')
    expect(ergebnis.fehler).toContain('splitMs')
  })

  // Das deutsche Datumsformat ist kein gültiges `JJJJ-MM-TT`; Sätze würden
  // sonst unsortierbar im Verlauf landen.
  it('erkennt ein ungültiges Satzdatum', () => {
    const roh = kopie()
    ;(roh.satze as Record<string, unknown>[])[0]!.datum = '29.10.2026'
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('datum')
  })

  // Die Tagesbezeichnung ist optional; vorhanden muss sie ein Text sein und
  // unverändert durch die Prüfung gehen.
  it('akzeptiert eine Tagesbezeichnung und behält sie', () => {
    const roh = kopie()
    ;(roh.satze as Record<string, unknown>[])[0]!.tagesbezeichnung = 'Kader A'
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.backup.satze[0]?.tagesbezeichnung).toBe('Kader A')
  })

  it('lehnt eine nicht-textuelle Tagesbezeichnung ab', () => {
    const roh = kopie()
    ;(roh.satze as Record<string, unknown>[])[0]!.tagesbezeichnung = 42
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('tagesbezeichnung')
  })
})

// Serienfelder: Plan am Satz, Wiederholung und Startversatz am Lauf.
describe('Serienfelder im Backup', () => {
  // Erweitert die Basisfixture um einen gültigen Plan und Runde 3 mit 10 s
  // Versatz.
  function mitSerie(): Record<string, unknown> {
    const roh = kopie()
    ;(roh.satze as Record<string, unknown>[])[0]!.plan = {
      wiederholungen: 5,
      taktSek: 120,
      startversatzMs: 10_000,
    }
    const laufRoh = (roh.laeufe as Record<string, unknown>[])[0]!
    laufRoh.wiederholung = 3
    laufRoh.startversatzMs = 10_000
    return roh
  }

  it('akzeptiert Plan und Wiederholungsdaten', () => {
    expect(pruefeBackup(mitSerie()).ok).toBe(true)
  })

  // Ältere Backups kennen die Serienfelder nicht; ihr Fehlen ist kein Fehler,
  // `normalize…OnLoad` ergänzt sie später.
  it('akzeptiert ältere Backups ohne die neuen Felder', () => {
    const roh = kopie()
    delete (roh.satze as Record<string, unknown>[])[0]!.plan
    delete (roh.laeufe as Record<string, unknown>[])[0]!.startversatzMs
    delete (roh.laeufe as Record<string, unknown>[])[0]!.wiederholung
    expect(pruefeBackup(roh).ok).toBe(true)
  })

  // Anders als ein Trainingssatz (dort ist eine Wiederholung erlaubt) braucht
  // ein Serienplan mindestens zwei Wiederholungen.
  it('lehnt einen Plan mit nur einer Wiederholung ab', () => {
    const roh = mitSerie()
    ;(roh.satze as Record<string, unknown>[])[0]!.plan = {
      wiederholungen: 1,
      taktSek: 120,
      startversatzMs: 0,
    }
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('wiederholungen')
  })

  // Der Startversatz am Lauf darf nicht negativ sein, weil sonst Bahnen vor dem
  // Laufstart lägen.
  it('lehnt einen negativen Startversatz ab', () => {
    const roh = mitSerie()
    ;(roh.laeufe as Record<string, unknown>[])[0]!.startversatzMs = -1
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('startversatzMs')
  })

  // Runde 0 gehört zu keiner Serie; die Nummer muss ab 1 zählen.
  it('lehnt eine Wiederholungsnummer unter 1 ab', () => {
    const roh = mitSerie()
    ;(roh.laeufe as Record<string, unknown>[])[0]!.wiederholung = 0
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('wiederholung')
  })
})

// Trainings kamen mit Version 3 hinzu; die Prüfung spiegelt die Grenzen aus
// `training.ts`, damit ein Backup nichts enthält, was die App nicht anlegen kann.
describe('Trainings im Backup', () => {
  // Das Training wird unverändert übernommen; die Vorschau zählt es mit.
  it('akzeptiert Trainings und zählt sie', () => {
    const ergebnis = pruefeBackup({ ...kopie(), trainings: [training] })
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.zusammenfassung.trainings).toBe(1)
    expect(ergebnis.backup.trainings).toEqual([training])
  })

  it('liest ein älteres Backup ohne Trainings als leere Liste', () => {
    const roh = kopie()
    delete roh.trainings
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.backup.trainings).toEqual([])
  })

  // Ein Trainingssatz braucht mindestens eine Wiederholung; 0 wäre ein Satz
  // ohne Lauf und damit kein Plan.
  it('lehnt einen Satz ohne Wiederholung ab', () => {
    const ergebnis = pruefeBackup({
      ...kopie(),
      trainings: [
        {
          ...training,
          saetze: [{ ...training.saetze[0]!, wiederholungen: 0 }],
        },
      ],
    })
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('Training 1, Satz 1')
    expect(ergebnis.fehler).toContain('wiederholungen')
  })

  // `aktive` muss genau einen Platz je Bahn haben; eine zu kurze Liste würde
  // die Bahnzuordnung verschieben.
  it('lehnt eine Aktivenliste mit falscher Länge ab', () => {
    const ergebnis = pruefeBackup({
      ...kopie(),
      trainings: [{ ...training, aktive: ['s1'] }],
    })
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('aktive')
  })

  // `autostart` ist optional, muss aber ein Wahrheitswert sein.
  it('lehnt einen ungültigen automatischen Satzwechsel ab', () => {
    const ergebnis = pruefeBackup({
      ...kopie(),
      trainings: [{ ...training, autostart: 'ja' }],
    })
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('autostart')
  })

  // 21 überschreitet `MAX_WIEDERHOLUNGEN` von 20; die App könnte den Plan nicht
  // mehr starten.
  it('lehnt mehr Wiederholungen ab, als die App anlegen kann', () => {
    const ergebnis = pruefeBackup({
      ...kopie(),
      trainings: [
        {
          ...training,
          saetze: [{ ...training.saetze[0]!, wiederholungen: 21 }],
        },
      ],
    })
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('wiederholungen')
  })

  // 21 Sätze überschreiten `MAX_TRAININGS_SAETZE` von 20; die IDs sind nur
  // Platzhalter, weil der Fehler vor der inhaltlichen Prüfung greift.
  it('lehnt mehr Sätze ab, als die App anlegen kann', () => {
    const ergebnis = pruefeBackup({
      ...kopie(),
      trainings: [
        {
          ...training,
          saetze: Array.from({ length: 21 }, (_, index) => ({
            ...training.saetze[0]!,
            id: `ts${index}`,
          })),
        },
      ],
    })
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('saetze')
  })

  // 51 Bahnen überschreiten die Obergrenze aus 10 Bahnen × 5 Reihen; der Lauf
  // wäre in der App nicht darstellbar.
  it('lehnt einen Lauf mit zu vielen Bahnen ab', () => {
    const roh = kopie()
    const laufRoh = (roh.laeufe as Record<string, unknown>[])[0]!
    laufRoh.bahnen = Array.from({ length: 51 }, (_, index) => ({
      id: `b${index}`,
      nummer: 1,
      reihe: 1,
      schwimmerId: null,
      startMs: null,
      anschlaege: [],
    }))
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('Bahnen')
  })
})

// Text der Import-Vorschau: feste Reihenfolge und deutsche Singular-/Plural-
// Formen; „Schwimmer“ bleibt im Plural unverändert.
// Die Prüfung ist die Grenze zwischen einer fremden Datei und dem Bestand.
// Reihenfolge, Finish-Position, Streckenvielfache und doppelte IDs müssen
// abgelehnt werden, bevor irgendetwas geschrieben wird.
describe('Grenzen und Konsistenz im Backup', () => {
  it('lehnt nicht aufsteigende Splits ab', () => {
    const roh = kopie()
    const anschlag = (roh.laeufe as Record<string, unknown>[])[0]!
      .bahnen as Array<{ anschlaege: Array<{ splitMs: number }> }>
    anschlag[0]!.anschlaege[1]!.splitMs = 20_000
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('größer als der vorherige Anschlag')
  })

  it('lehnt ein Finish vor dem letzten Anschlag ab', () => {
    const roh = kopie()
    const bahn = (roh.laeufe as Record<string, unknown>[])[0]!
      .bahnen as Array<{ anschlaege: Array<{ istFinish: boolean }> }>
    bahn[0]!.anschlaege[0]!.istFinish = true
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('Nur der letzte Anschlag')
  })

  it('lehnt eine Strecke ab, die kein Vielfaches der Beckenlänge ist', () => {
    const roh = kopie()
    ;((roh.laeufe as Record<string, unknown>[])[0]!.konfiguration as Record<string, unknown>)
      .streckeM = 30
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('Vielfaches der Beckenlänge')
  })

  it('lehnt doppelte IDs ab, statt sie beim Upsert zu verschmelzen', () => {
    const roh = kopie()
    roh.schwimmer = [schwimmer, { ...schwimmer }]
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('mehrfach')
  })

  it('begrenzt die Wiederholungsnummer eines Laufs', () => {
    const roh = kopie()
    ;(roh.laeufe as Record<string, unknown>[])[0]!.wiederholung = 999
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('1 bis 20')
  })

  it('begrenzt die Zahl der Anschläge je Bahn', () => {
    const roh = kopie()
    const bahn = (roh.laeufe as Record<string, unknown>[])[0]!
      .bahnen as Array<{ anschlaege: unknown[] }>
    bahn[0]!.anschlaege = Array.from({ length: 1001 }, (_, index) => ({
      laengeNr: index + 1,
      splitMs: (index + 1) * 1000,
      erfasstAt: index,
      istFinish: index === 1000,
    }))
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('höchstens 1000')
  })
})

describe('zusammenfassungText', () => {
  it('formatiert Singular und Plural', () => {
    expect(
      zusammenfassungText({ schwimmer: 1, trainings: 0, satze: 1, laeufe: 1 }),
    ).toBe('1 Schwimmer, 0 Trainings, 1 Satz, 1 Lauf')
    expect(
      zusammenfassungText({ schwimmer: 2, trainings: 2, satze: 3, laeufe: 5 }),
    ).toBe('2 Schwimmer, 2 Trainings, 3 Sätze, 5 Läufe')
  })
})

// Konflikterkennung vor dem Import: gleiche IDs mit abweichendem Inhalt dürfen
// nicht stillschweigend überschrieben werden. Der Vergleich arbeitet auf
// normalisierten Datensätzen; hier reichen die Fixtures, weil sie bereits alle
// aktuellen Felder tragen.
describe('Import-Konflikte', () => {
  function bestand(): BackupBestand {
    return {
      schwimmer: [{ ...schwimmer }],
      satze: [{ ...satz }],
      laeufe: [JSON.parse(JSON.stringify(lauf)) as Lauf],
      trainings: [],
    }
  }

  // Ein Lauf mit drei Anschlägen statt zwei; die Finish-Markierung wandert an
  // den letzten Anschlag, damit der Datensatz fachlich gültig bleibt.
  function laufMitDreiAnschlaegen(): Lauf {
    const ergebnis = JSON.parse(JSON.stringify(lauf)) as Lauf
    ergebnis.bahnen[0]!.anschlaege = [
      { laengeNr: 1, splitMs: 30_000, erfasstAt: 2, istFinish: false },
      { laengeNr: 2, splitMs: 60_000, erfasstAt: 3, istFinish: false },
      { laengeNr: 3, splitMs: 90_000, erfasstAt: 4, istFinish: true },
    ]
    return ergebnis
  }

  it('meldet keinen Konflikt bei fachlich gleichem Inhalt', () => {
    expect(ermittleBackupKonflikte(backup, bestand())).toEqual({
      eintraege: [],
      gesamt: 0,
      neuereLokale: 0,
    })
  })

  it('erkennt einen lokalen Lauf mit mehr Anschlägen als neuer', () => {
    const lokal = bestand()
    lokal.laeufe = [laufMitDreiAnschlaegen()]

    const konflikte = ermittleBackupKonflikte(backup, lokal)

    expect(konflikte.eintraege).toEqual([{ bestand: 'laeufe', id: 'l1', art: 'lokalNeuer' }])
    expect(konflikte.gesamt).toBe(1)
    expect(konflikte.neuereLokale).toBe(1)
    expect(konfliktText(konflikte)).toBe('1 Konflikt: 1 Lauf. 1 davon ist lokal neuer.')
  })

  it('erkennt einen späteren lokalen Start auch ohne mehr Anschläge', () => {
    const lokal = bestand()
    lokal.laeufe[0]!.startWallMs = 2

    const konflikte = ermittleBackupKonflikte(backup, lokal)

    expect(konflikte.eintraege).toEqual([{ bestand: 'laeufe', id: 'l1', art: 'lokalNeuer' }])
  })

  it('meldet abweichende Stammdaten ohne neueren Zeitstempel als abweichend', () => {
    const lokal = bestand()
    lokal.schwimmer = [{ ...schwimmer, name: 'Mia Neu', erstelltAm: 1 }]

    const konflikte = ermittleBackupKonflikte(backup, lokal)

    expect(konflikte.eintraege).toEqual([
      { bestand: 'schwimmer', id: 's1', art: 'abweichend' },
    ])
    expect(konflikte.neuereLokale).toBe(0)
    expect(konfliktText(konflikte)).toBe('1 Konflikt: 1 Schwimmer.')
  })

  it('nennt bei mehreren Beständen Zahl und Art der Konflikte', () => {
    const lokal = bestand()
    lokal.laeufe = [laufMitDreiAnschlaegen()]
    lokal.schwimmer = [{ ...schwimmer, name: 'Mia Neu' }]

    const konflikte = ermittleBackupKonflikte(backup, lokal)

    expect(konflikte.gesamt).toBe(2)
    expect(konfliktText(konflikte)).toBe(
      '2 Konflikte: 1 Schwimmer, 1 Lauf. 1 davon ist lokal neuer.',
    )
  })

  // Standardfall: Der lokale Stand bleibt, alle Konflikte fallen aus dem Import.
  it('behält beim Standard den lokalen Stand und importiert den Rest', () => {
    const lokal = bestand()
    lokal.laeufe = [laufMitDreiAnschlaegen()]
    const konflikte = ermittleBackupKonflikte(backup, lokal).eintraege

    const zuSchreiben = loeseBackupKonflikte(backup, konflikte, 'lokalBehalten')

    expect(zuSchreiben.laeufe).toEqual([])
    expect(zuSchreiben.schwimmer).toHaveLength(1)
    expect(zuSchreiben.satze).toHaveLength(1)
  })

  // Bewusstes Ersetzen schreibt alle Backup-Datensätze, auch die kollidierenden.
  it('übernimmt beim bewussten Ersetzen alle Backup-Datensätze', () => {
    const lokal = bestand()
    lokal.laeufe = [laufMitDreiAnschlaegen()]
    const konflikte = ermittleBackupKonflikte(backup, lokal).eintraege

    const zuSchreiben = loeseBackupKonflikte(backup, konflikte, 'backupErsetzen')

    expect(zuSchreiben.laeufe).toEqual(backup.laeufe)
  })
})
