import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, BACKUP_VERSION, pruefeBackup, zusammenfassungText } from './backup'
import type { Lauf, Satz, Schwimmer } from '../domain/types'

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
      schwimmerId: 's1',
      startMs: 1,
      anschlaege: [
        { laengeNr: 1, splitMs: 30_000, erfasstAt: 2, istFinish: false },
        { laengeNr: 2, splitMs: 60_000, erfasstAt: 3, istFinish: true },
      ],
    },
  ],
}

const backup = {
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportiertAm: '2026-10-29T10:00:00.000Z',
  schwimmer: [schwimmer],
  satze: [satz],
  laeufe: [lauf],
}

function kopie(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(backup)) as Record<string, unknown>
}

describe('pruefeBackup', () => {
  it('akzeptiert ein gültiges Backup und zählt die Inhalte', () => {
    const ergebnis = pruefeBackup(kopie())
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.zusammenfassung).toEqual({ schwimmer: 1, satze: 1, laeufe: 1 })
  })

  it('übersteht einen Export-Import-Roundtrip unverändert', () => {
    const ergebnis = pruefeBackup(JSON.parse(JSON.stringify(backup)))
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.backup).toEqual(backup)
  })

  it('lehnt eine Datei ohne Formatkennung ab', () => {
    const roh = kopie()
    delete roh.format
    expect(pruefeBackup(roh)).toEqual({
      ok: false,
      fehler: expect.stringContaining(BACKUP_FORMAT),
    })
  })

  it('nennt bei unbekannter Version die erwartete Version', () => {
    const ergebnis = pruefeBackup({ ...kopie(), version: 99 })
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('Version 99')
    expect(ergebnis.fehler).toContain(`Version ${BACKUP_VERSION}`)
  })

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

  it('erkennt ein ungültiges Satzdatum', () => {
    const roh = kopie()
    ;(roh.satze as Record<string, unknown>[])[0]!.datum = '29.10.2026'
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('datum')
  })
})

describe('zusammenfassungText', () => {
  it('formatiert Singular und Plural', () => {
    expect(zusammenfassungText({ schwimmer: 1, satze: 1, laeufe: 1 })).toBe(
      '1 Schwimmer, 1 Satz, 1 Lauf',
    )
    expect(zusammenfassungText({ schwimmer: 2, satze: 3, laeufe: 5 })).toBe(
      '2 Schwimmer, 3 Sätze, 5 Läufe',
    )
  })
})
