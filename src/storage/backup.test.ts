import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, BACKUP_VERSION, pruefeBackup, zusammenfassungText } from './backup'
import type { Lauf, Satz, Schwimmer, Training } from '../domain/types'

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

const training: Training = {
  id: 'tr1',
  datum: '2026-10-29',
  bezeichnung: 'Kader A',
  bahnen: 2,
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

const backup = {
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportiertAm: '2026-10-29T10:00:00.000Z',
  schwimmer: [schwimmer],
  satze: [satz],
  laeufe: [lauf],
  wettkampfe: [],
  trainings: [],
}

function kopie(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(backup)) as Record<string, unknown>
}

describe('pruefeBackup', () => {
  it('akzeptiert ein gültiges Backup und zählt die Inhalte', () => {
    const ergebnis = pruefeBackup(kopie())
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.zusammenfassung).toEqual({
      schwimmer: 1,
      satze: 1,
      laeufe: 1,
      wettkampfe: 0,
      trainings: 0,
    })
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

describe('Serienfelder im Backup', () => {
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

  it('akzeptiert ältere Backups ohne die neuen Felder', () => {
    const roh = kopie()
    delete (roh.satze as Record<string, unknown>[])[0]!.plan
    delete (roh.laeufe as Record<string, unknown>[])[0]!.startversatzMs
    delete (roh.laeufe as Record<string, unknown>[])[0]!.wiederholung
    expect(pruefeBackup(roh).ok).toBe(true)
  })

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

  it('lehnt einen negativen Startversatz ab', () => {
    const roh = mitSerie()
    ;(roh.laeufe as Record<string, unknown>[])[0]!.startversatzMs = -1
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('startversatzMs')
  })

  it('lehnt eine Wiederholungsnummer unter 1 ab', () => {
    const roh = mitSerie()
    ;(roh.laeufe as Record<string, unknown>[])[0]!.wiederholung = 0
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('wiederholung')
  })
})

describe('Wettkämpfe im Backup', () => {
  const wettkampf = {
    id: 'w1',
    name: 'Herbstpokal',
    datum: '2026-10-29',
    beckenlaengeM: 50,
    erstelltAm: 1,
  }

  it('akzeptiert Wettkämpfe und zählt sie', () => {
    const ergebnis = pruefeBackup({ ...kopie(), wettkampfe: [wettkampf] })
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.zusammenfassung.wettkampfe).toBe(1)
  })

  it('liest ein älteres Backup ohne Wettkämpfe als leere Liste', () => {
    const roh = kopie()
    delete roh.wettkampfe
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.backup.wettkampfe).toEqual([])
  })

  it('lehnt eine ungültige Beckenlänge ab', () => {
    const ergebnis = pruefeBackup({
      ...kopie(),
      wettkampfe: [{ ...wettkampf, beckenlaengeM: 33 }],
    })
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('beckenlaengeM')
  })

  it('akzeptiert Wettkampf- und Modusfelder an Satz und Lauf', () => {
    const roh = kopie()
    ;(roh.satze as Record<string, unknown>[])[0]!.wettkampfId = 'w1'
    ;(roh.laeufe as Record<string, unknown>[])[0]!.modus = 'wettkampf'
    expect(pruefeBackup(roh).ok).toBe(true)
  })

  it('lehnt einen unbekannten Laufmodus ab', () => {
    const roh = kopie()
    ;(roh.laeufe as Record<string, unknown>[])[0]!.modus = 'staffel'
    const ergebnis = pruefeBackup(roh)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('modus')
  })
})

describe('Trainings im Backup', () => {
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

  it('lehnt eine Aktivenliste mit falscher Länge ab', () => {
    const ergebnis = pruefeBackup({
      ...kopie(),
      trainings: [{ ...training, aktive: ['s1'] }],
    })
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.fehler).toContain('aktive')
  })

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

  it('lehnt einen Lauf mit zu vielen Bahnen ab', () => {
    const roh = kopie()
    const laufRoh = (roh.laeufe as Record<string, unknown>[])[0]!
    laufRoh.bahnen = Array.from({ length: 11 }, (_, index) => ({
      id: `b${index}`,
      nummer: index + 1,
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

describe('zusammenfassungText', () => {
  it('formatiert Singular und Plural', () => {
    expect(
      zusammenfassungText({ schwimmer: 1, wettkampfe: 0, trainings: 0, satze: 1, laeufe: 1 }),
    ).toBe('1 Schwimmer, 0 Wettkämpfe, 0 Trainings, 1 Satz, 1 Lauf')
    expect(
      zusammenfassungText({ schwimmer: 2, wettkampfe: 1, trainings: 2, satze: 3, laeufe: 5 }),
    ).toBe('2 Schwimmer, 1 Wettkampf, 2 Trainings, 3 Sätze, 5 Läufe')
  })
})
