/**
 * Datenzugriff für die Oberfläche: Backup und dauerhafter Speicher.
 *
 * Sichert die Naht zwischen `ui/` und `storage/` ab: Die Einstellungen bekommen
 * eine fertige Import-Vorschau (typisiertes Backup plus Zähltext) und dürfen
 * sich auf die Fehlermeldung der Storage-Prüfung verlassen. Zusätzlich wird der
 * Export-Roundtrip über das leere Repository geprüft.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAll, saveLauf } from '../storage/repository'
import { BACKUP_FORMAT, BACKUP_VERSION } from '../storage/backup'
import type { Lauf } from '../domain/types'
import {
  erzeugeBackup,
  ermittleImportKonflikte,
  fordereSchutzAn,
  leseSchutz,
  pruefeBackupFuerImport,
} from './daten'

/** Minimales, gültiges Backup ohne Datensätze. */
const leeresBackup = {
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportiertAm: '2026-10-29T10:00:00.000Z',
  schwimmer: [],
  satze: [],
  laeufe: [],
  wettkampfe: [],
  trainings: [],
}

beforeEach(async () => {
  await clearAll()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pruefeBackupFuerImport', () => {
  // Die Vorschau braucht keine Storage-Kenntnis: Bei Erfolg stehen Backup und
  // Zähltext bereit, in derselben Reihenfolge wie im Import-Sheet.
  it('liefert Backup und Zähltext für ein gültiges Backup', () => {
    const ergebnis = pruefeBackupFuerImport(leeresBackup)

    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.backup.format).toBe(BACKUP_FORMAT)
    expect(ergebnis.text).toBe('0 Schwimmer, 0 Wettkämpfe, 0 Trainings, 0 Sätze, 0 Läufe')
  })

  // Fehler werden unverändert durchgereicht, damit die Meldung den Pfad des
  // ersten Problems nennt und nichts geschrieben wird.
  it('reicht die Fehlermeldung der Prüfung durch', () => {
    expect(pruefeBackupFuerImport(null)).toEqual({
      ok: false,
      fehler: 'Die Datei enthält kein JSON-Objekt.',
    })
    expect(pruefeBackupFuerImport({})).toEqual({
      ok: false,
      fehler: `Die Datei ist kein Beckenrand-Backup (Formatkennung "${BACKUP_FORMAT}" fehlt).`,
    })
  })
})

// Der Export liest nur; das Ergebnis trägt Format, Version und alle Bestände.
describe('erzeugeBackup', () => {
  it('liest den Bestand als Backup-Objekt', async () => {
    const backup = await erzeugeBackup()

    expect(backup).toMatchObject({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      schwimmer: [],
      satze: [],
      laeufe: [],
      wettkampfe: [],
      trainings: [],
    })
    expect(Number.isNaN(Date.parse(backup.exportiertAm))).toBe(false)
  })
})

// Ohne Storage Manager bleibt der Schutz unbekannt; die Anfrage liefert
// denselben Wert, statt eine Ausnahme nach außen zu geben.
describe('Speicherschutz-Fassade', () => {
  it('meldet ohne Storage Manager unbekannt', async () => {
    vi.stubGlobal('navigator', {})
    await expect(leseSchutz()).resolves.toBe('unbekannt')
    await expect(fordereSchutzAn()).resolves.toBe('unbekannt')
  })
})

// Die Fassade vergleicht das Backup mit dem geladenen Bestand und liefert den
// fertigen Text für die Vorschau; sie schreibt nichts.
describe('ermittleImportKonflikte', () => {
  const konfiguration = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

  function laufMitAnschlaegen(id: string, anzahl: number): Lauf {
    return {
      id,
      satzId: null,
      konfiguration: { ...konfiguration },
      startWallMs: 1_700_000_000_000,
      startversatzMs: 0,
      wiederholung: null,
      modus: 'training',
      bahnen: [
        {
          id: `${id}-bahn-1`,
          nummer: 1,
          reihe: 1,
          schwimmerId: null,
          startMs: null,
          anschlaege: Array.from({ length: anzahl }, (_, index) => ({
            laengeNr: index + 1,
            splitMs: (index + 1) * 30_000,
            erfasstAt: index + 1,
            istFinish: index === anzahl - 1,
          })),
        },
      ],
    }
  }

  it('nennt Zahl und Art der Konflikte samt Text', async () => {
    await saveLauf(laufMitAnschlaegen('l1', 2))

    const ergebnis = await ermittleImportKonflikte({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportiertAm: '2026-10-29T10:00:00.000Z',
      schwimmer: [],
      satze: [],
      laeufe: [laufMitAnschlaegen('l1', 1), laufMitAnschlaegen('l2', 1)],
      wettkampfe: [],
      trainings: [],
    })

    expect(ergebnis.gesamt).toBe(1)
    expect(ergebnis.neuereLokale).toBe(1)
    expect(ergebnis.text).toBe('1 Konflikt: 1 Lauf. 1 davon ist lokal neuer.')
    // Nur gelesen: Der lokale Lauf bleibt unverändert.
    expect((await erzeugeBackup()).laeufe[0]?.bahnen[0]?.anschlaege).toHaveLength(2)
  })

  it('liefert für einen leeren Bestand keine Konflikte', async () => {
    const ergebnis = await ermittleImportKonflikte({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportiertAm: '2026-10-29T10:00:00.000Z',
      schwimmer: [],
      satze: [],
      laeufe: [laufMitAnschlaegen('l1', 1)],
      wettkampfe: [],
      trainings: [],
    })

    expect(ergebnis).toEqual({ eintraege: [], gesamt: 0, neuereLokale: 0, text: '' })
  })
})
