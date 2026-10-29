import { describe, expect, it } from 'vitest'
import {
  createLauf,
  finishLane,
  hasStarted,
  isComplete,
  isFinished,
  laneStatusAt,
  planeLauf,
  pruefeAnschlagKorrektur,
  setSchwimmart,
  setSchwimmer,
  setzeZielzeit,
  startAll,
  startLane,
  tapLane,
  undoLane,
  updateStrecke,
  validateKonfiguration,
} from './lauf'
import {
  aktuelleRunde,
  bahnZeile,
  istSerie,
  letzterAnschlag,
  naechsteWiederholung,
  pruefeSeriePlan,
  runden,
  warnungSeriePlan,
  zeilenZeit,
} from './serie'
import { berechnePbs, pacePro100, pbDelta, schnellsteZeit } from './analyse'
import {
  formatDelta,
  formatTakt,
  formatTimeInput,
  lokalesDatum,
  parseTime,
  truncateToHundredths,
} from './format'
import {
  beschreibeTrainingsSatz,
  neuerTrainingsSatz,
  neuesTraining,
  pruefeTraining,
  pruefeTrainingsSatz,
  trainingsSatzMeta,
  verschiebeTrainingsSatz,
} from './training'
import {
  createWettkampf,
  createWettkampfLauf,
  createWettkampfSatz,
  disziplinBezeichnung,
  istWettkampfSatz,
  wettkampfErgebnis,
  wettkampfFortschritt,
} from './wettkampf'
import { istSchwimmart, meldelisteVorlage, parseMeldeliste } from './meldeliste'
import { csvDateiname, laeufeAlsCsv } from '../export/csv'
import type { Lauf, LaufKonfiguration, Satz, Schwimmart, Training } from './types'

const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const
const OFFEN = { beckenlaengeM: 50, streckeM: null, schwimmart: 'freistil' } as const

function laufMit(konfiguration: LaufKonfiguration, bahnen = 2): Lauf {
  return createLauf(
    konfiguration,
    Array.from({ length: bahnen }, (_, index) => ({ nummer: index + 1 })),
  )
}

describe('Lauf: Grenzen und Fehlerpfade', () => {
  it('begrenzt negative Startversätze', () => {
    const lauf = createLauf(K100, [{ nummer: 1 }], null, { startversatzMs: -500 })
    expect(lauf.startversatzMs).toBe(0)
    expect(planeLauf(lauf, 100, 100, -2000).bahnen[0]?.startMs).toBe(100)
  })

  it('startet eine Bahn nur einmal und behält den ersten Wandanker', () => {
    const basis = laufMit(K100)
    const [erste, zweite] = basis.bahnen
    const eins = startLane(basis, erste!.id, 100, 1_000)
    const zwei = startLane(eins, zweite!.id, 200, 2_000)
    const nochmal = startLane(zwei, erste!.id, 900, 9_000)

    expect(zwei.startWallMs).toBe(1_000)
    expect(nochmal).toBe(zwei)
    expect(nochmal.bahnen[0]?.startMs).toBe(100)
    expect(nochmal.bahnen[1]?.startMs).toBe(200)
  })

  it('ignoriert unbekannte Bahnen in allen Bedienschritten', () => {
    const lauf = laufMit(K100)
    expect(tapLane(lauf, 'fehlt', 0, 0)).toBe(lauf)
    expect(finishLane(lauf, 'fehlt', 0, 0)).toBe(lauf)
    expect(undoLane(lauf, 'fehlt')).toBe(lauf)
    expect(setSchwimmer(lauf, 'fehlt', 's1')).toBe(lauf)
    expect(setSchwimmart(lauf, 'brust').konfiguration.schwimmart).toBe('brust')
    expect(pruefeAnschlagKorrektur(lauf, 'fehlt', 1, 1000)).toContain('Bahn')
  })

  it('setzt Schwimmer und Schwimmart nur bei echter Änderung', () => {
    const lauf = laufMit(K100)
    const bahnId = lauf.bahnen[0]!.id
    const mitSchwimmer = setSchwimmer(lauf, bahnId, 's1')
    expect(mitSchwimmer.bahnen[0]?.schwimmerId).toBe('s1')
    expect(setSchwimmer(mitSchwimmer, bahnId, 's1')).toBe(mitSchwimmer)
    expect(setSchwimmart(mitSchwimmer, 'freistil')).toBe(mitSchwimmer)
  })

  it('beendet nur gestartete, offene Bahnen und nicht vor dem Start', () => {
    const lauf = laufMit(OFFEN, 1)
    const bahnId = lauf.bahnen[0]!.id
    expect(finishLane(lauf, bahnId, 100, 100)).toBe(lauf)

    const gestartet = startLane(lauf, bahnId, 1_000, 1_000)
    expect(finishLane(gestartet, bahnId, 500, 500)).toBe(gestartet)
    const beendet = finishLane(gestartet, bahnId, 60_000, 60_000)
    expect(isFinished(beendet.bahnen[0]!)).toBe(true)
    expect(finishLane(beendet, bahnId, 70_000, 70_000)).toBe(beendet)
    expect(laneStatusAt(beendet.bahnen[0]!, 80_000)).toBe('beendet')
  })

  it('trägt Zielzeiten nur im Wettkampf und nur gültig ein', () => {
    const training = laufMit(K100, 1)
    const bahnId = training.bahnen[0]!.id
    expect(setzeZielzeit(training, bahnId, 60_000)).toBe(training)

    const wettkampf = createLauf(K100, [{ nummer: 1 }], null, { modus: 'wettkampf' })
    expect(setzeZielzeit(wettkampf, bahnId, -1)).toBe(wettkampf)
    expect(setzeZielzeit(wettkampf, 'fehlt', 60_000)).toBe(wettkampf)

    const mitZeit = setzeZielzeit(wettkampf, wettkampf.bahnen[0]!.id, 59_999.9)
    expect(mitZeit.bahnen[0]?.anschlaege[0]).toMatchObject({
      splitMs: 59_999,
      laengeNr: 1,
      istFinish: true,
      manuell: true,
    })

    // Ein vorhandener Zwischenanschlag bestimmt die nächste Längennummer.
    const mitSplit = {
      ...wettkampf,
      bahnen: [
        {
          ...wettkampf.bahnen[0]!,
          anschlaege: [
            { laengeNr: 1, splitMs: 30_000, erfasstAt: 1, istFinish: false },
          ],
        },
      ],
    }
    const danach = setzeZielzeit(mitSplit, mitSplit.bahnen[0]!.id, 60_000)
    expect(danach.bahnen[0]?.anschlaege[1]?.laengeNr).toBe(2)
  })

  it('prüft Korrekturen auf Reihenfolge und Vorzeichen', () => {
    const basis = laufMit(K100, 1)
    const bahnId = basis.bahnen[0]!.id
    const lauf = tapLane(tapLane(basis, bahnId, 0, 0), bahnId, 30_000, 30_000)

    expect(pruefeAnschlagKorrektur(lauf, bahnId, 1, -1)).toContain('positive')
    expect(pruefeAnschlagKorrektur(lauf, bahnId, 9, 1000)).toContain('nicht gefunden')
    expect(pruefeAnschlagKorrektur(lauf, bahnId, 1, 30_000)).toBeNull()
  })

  it('erkennt Start und Vollständigkeit', () => {
    const lauf = laufMit(K100, 1)
    expect(hasStarted(lauf)).toBe(false)
    expect(isComplete(lauf)).toBe(false)

    const gestartet = startAll(lauf, 0, 0)
    expect(hasStarted(gestartet)).toBe(true)
    expect(isComplete(gestartet)).toBe(false)

    const bahnId = gestartet.bahnen[0]!.id
    const fertig = tapLane(tapLane(gestartet, bahnId, 30_000, 30_000), bahnId, 60_000, 60_000)
    expect(isComplete(fertig)).toBe(true)
    expect(hatLaufendeBahn(fertig)).toBe(false)
  })

  it('lehnt ungültige Strecken ab und lässt gesperrte Läufe unverändert', () => {
    expect(validateKonfiguration({ ...K100, streckeM: Number.NaN })).not.toBeNull()

    const lauf = laufMit(K100, 1)
    expect(updateStrecke(lauf, { ...K100, streckeM: 75 })).toBe(lauf)
    expect(updateStrecke(lauf, { ...K100, streckeM: 200 }).konfiguration.streckeM).toBe(200)
  })
})

function hatLaufendeBahn(lauf: Lauf): boolean {
  return lauf.bahnen.some((bahn) => bahn.startMs !== null && !isFinished(bahn))
}

describe('Serie: Grenzen und leere Zeilen', () => {
  it('beschreibt eine leere Serie als bereit', () => {
    const zeile = bahnZeile([], 0, 0)
    expect(zeile.status).toBe('bereit')
    expect(zeile.anzeigeRunde).toBeNull()
    expect(zeile.offen).toBeNull()
    expect(zeilenZeit(zeile, 0)).toBe(0)
  })

  it('überspringt Runden ohne passende Bahn', () => {
    const lauf = laufMit(K100, 1)
    expect(bahnZeile([lauf], 4, 0).status).toBe('bereit')
  })

  it('ignoriert Wiederholungen ohne Nummer und noch nicht gestartete Runden', () => {
    const ohneNummer = planeLauf(laufMit(K100, 1), 0, 0)
    expect(ohneNummer.wiederholung).toBeNull()
    expect(aktuelleRunde([ohneNummer], 0)).toBe(0)

    const spaeter = planeLauf(
      createLauf(K100, [{ nummer: 1 }], null, { wiederholung: 2 }),
      10_000,
      10_000,
    )
    expect(aktuelleRunde([spaeter], 5_000)).toBe(0)
    expect(aktuelleRunde([spaeter], 10_000)).toBe(2)
  })

  it('liefert ohne Anschlag kein Undo-Ziel', () => {
    expect(letzterAnschlag([laufMit(K100, 1)], 0)).toBeNull()
  })

  it('sortiert Runden ohne Nummer nach vorn', () => {
    const ohne = laufMit(K100, 1)
    const mit = createLauf(K100, [{ nummer: 1 }], 's1', { wiederholung: 2 })
    const sortiert = runden([mit, { ...ohne, satzId: 's1' }], 's1')
    expect(sortiert.map((eintrag) => eintrag.wiederholung)).toEqual([null, 2])
  })

  it('kennt die nächste Wiederholung auch ohne Läufe', () => {
    expect(naechsteWiederholung([])).toBe(1)
  })

  it('prüft alle Grenzen des Serienplans', () => {
    const gueltig = { wiederholungen: 5, taktSek: 120, startversatzMs: 0 }
    expect(pruefeSeriePlan({ ...gueltig, wiederholungen: 21 }, 2)).toContain('20')
    expect(pruefeSeriePlan({ ...gueltig, wiederholungen: 2.5 }, 2)).not.toBeNull()
    expect(pruefeSeriePlan({ ...gueltig, taktSek: 3601 }, 2)).toContain('60 Minuten')
    expect(pruefeSeriePlan({ ...gueltig, taktSek: Number.NaN }, 2)).not.toBeNull()
    expect(pruefeSeriePlan({ ...gueltig, startversatzMs: -1 }, 2)).toContain('negativ')
    expect(pruefeSeriePlan({ ...gueltig, startversatzMs: 120_001 }, 2)).toContain('120')
    expect(pruefeSeriePlan(gueltig, 0)).toContain('Bahn')
    expect(warnungSeriePlan({ ...gueltig, wiederholungen: 1 }, 2)).toBeNull()
    expect(istSerie({ plan: { ...gueltig, wiederholungen: 1 } } as Satz)).toBe(false)
  })
})

describe('Analyse: Grenzen', () => {
  function laufMitZeiten(zeiten: (number | null)[], schwimmer: (string | null)[] = []) {
    const basis = createLauf(
      K100,
      zeiten.map((_, index) => ({ nummer: index + 1, schwimmerId: schwimmer[index] ?? null })),
    )
    let lauf = startAll(basis, 0, 0)
    zeiten.forEach((zeit, index) => {
      if (zeit === null) return
      const bahn = lauf.bahnen[index]!
      lauf = tapLane(lauf, bahn.id, zeit / 2, zeit / 2)
      lauf = tapLane(lauf, bahn.id, zeit, zeit)
    })
    return lauf
  }

  it('liefert die schnellste Zeit oder null', () => {
    expect(schnellsteZeit(laufMitZeiten([null, null]))).toBeNull()
    expect(schnellsteZeit(laufMitZeiten([null, 61_000, 59_000]))).toBe(59_000)
  })

  it('liefert ohne Vergleichsbasis kein Delta', () => {
    const ohneSchwimmer = laufMitZeiten([60_000], [null])
    expect(pbDelta(berechnePbs([ohneSchwimmer]), ohneSchwimmer, ohneSchwimmer.bahnen[0]!)).toBeNull()

    const offen = laufMitZeiten([60_000], ['s1'])
    const offenerLauf = { ...offen, konfiguration: { ...K100, streckeM: null } }
    expect(pbDelta(berechnePbs([offen]), offenerLauf, offen.bahnen[0]!)).toBeNull()

    const ohneFinish = laufMitZeiten([null], ['s1'])
    expect(pbDelta(berechnePbs([ohneFinish]), ohneFinish, ohneFinish.bahnen[0]!)).toBeNull()

    const andereStrecke = laufMitZeiten([60_000], ['s1'])
    const pbs = berechnePbs([andereStrecke])
    const zwei = { ...andereStrecke, konfiguration: { ...K100, streckeM: 200 } }
    expect(pbDelta(pbs, zwei, andereStrecke.bahnen[0]!)).toBeNull()
  })

  it('rechnet Pace proportional zur Strecke', () => {
    expect(pacePro100(30_000, 50)).toBe(60_000)
    expect(pacePro100(240_000, 400)).toBe(60_000)
  })
})

describe('Format: weitere Eingaben', () => {
  it('liest Stunden, führende Nullen und halbe Hundertstel', () => {
    expect(parseTime('1:02:03,45')).toBe(3_723_450)
    expect(parseTime('0:00,05')).toBe(50)
    expect(parseTime('1:2:3,45')).toBe(3_723_450)
    expect(parseTime('60:00,00')).toBeNull()
    expect(parseTime('1:60,00')).toBeNull()
    expect(parseTime('1:2:3:4')).toBeNull()
  })

  it('formatiert Eingaben, Takt und lokales Datum', () => {
    expect(formatTimeInput(83_456)).toBe('01:23,45')
    expect(formatTakt(59.6)).toBe('01:00')
    expect(formatTakt(-5)).toBe('00:00')
    expect(lokalesDatum(new Date(2026, 0, 5, 12).getTime())).toBe('2026-01-05')
    expect(formatDelta(61_000)).toBe('+01:01,00')
    expect(truncateToHundredths(10)).toBe(10)
  })
})

describe('Training: Validierung und Beschreibung', () => {
  it('beschreibt offene Strecken und einzelne Läufe', () => {
    const offen = neuerTrainingsSatz({
      konfiguration: { ...K100, streckeM: null },
      wiederholungen: 1,
    })
    expect(beschreibeTrainingsSatz(offen)).toBe('offene Strecke · Freistil')
    expect(trainingsSatzMeta(offen)).toBe('50 m-Becken')
  })

  it('prüft Takt, Wiederholungen und Startversatz', () => {
    const satz = neuerTrainingsSatz({ konfiguration: K100 })
    expect(pruefeTrainingsSatz({ ...satz, wiederholungen: 21 })).toContain('20')
    expect(pruefeTrainingsSatz({ ...satz, taktSek: 3601 })).toContain('60 Minuten')
    expect(pruefeTrainingsSatz({ ...satz, startversatzMs: -1 })).toContain('Startversatz')
    expect(pruefeTrainingsSatz({ ...satz, startversatzMs: 120_001 })).toContain('Startversatz')
    expect(pruefeTrainingsSatz({ ...satz, wiederholungen: 20, taktSek: 3600, startversatzMs: 120_000 })).toBeNull()
  })

  it('prüft das gesamte Training', () => {
    const training = neuesTraining({ datum: '2026-10-29', bahnen: 2 })
    expect(pruefeTraining({ ...training, id: '' })).toContain('ID')
    expect(pruefeTraining({ ...training, datum: '29.10.2026' })).toContain('Datum')
    expect(pruefeTraining({ ...training, bahnen: 0 })).toContain('Bahnen')
    expect(pruefeTraining({ ...training, bahnen: 11 })).toContain('Bahnen')
    expect(pruefeTraining({ ...training, aktive: ['s1'] })).toContain('Bahn')
    expect(
      pruefeTraining({
        ...training,
        aktive: [42 as unknown as string, null],
      }),
    ).toContain('Schwimmer-IDs')
    expect(pruefeTraining({ ...training, saetze: [] })).toContain('mindestens einen Satz')

    const viele: Training = {
      ...training,
      saetze: Array.from({ length: 21 }, () => neuerTrainingsSatz({ konfiguration: K100 })),
    }
    expect(pruefeTraining(viele)).toContain('20')
    expect(
      pruefeTraining({
        ...training,
        saetze: [{ ...neuerTrainingsSatz({ konfiguration: K100 }), taktSek: 0 }],
      }),
    ).toContain('Takt')
  })

  it('lässt unbekannte Sätze beim Verschieben unverändert', () => {
    const training = neuesTraining({ datum: '2026-10-29', bahnen: 2 })
    expect(verschiebeTrainingsSatz(training, 'fehlt', 1)).toBe(training)
  })

  it('schneidet die Bezeichnung und füllt fehlende Sätze auf', () => {
    const training = neuesTraining({
      datum: '2026-10-29',
      bezeichnung: '  Montag  ',
      bahnen: 2,
      saetze: [],
    })
    expect(training.bezeichnung).toBe('Montag')
    expect(training.saetze).toHaveLength(1)
  })
})

describe('Wettkampf: Aufbau und Randfälle', () => {
  const wettkampf = createWettkampf({ name: '  Herbstpokal  ', datum: '2026-10-29', beckenlaengeM: 50 })

  it('schneidet den Namen und leitet Disziplinbezeichnungen ab', () => {
    expect(wettkampf.name).toBe('Herbstpokal')
    expect(disziplinBezeichnung(100, 'brust')).toBe('100 m Brust')
    expect(disziplinBezeichnung(100, 'unbekannt' as Schwimmart)).toBe('100 m Freistil')
  })

  it('erzeugt Sätze und sortiert die Bahnen eines Laufs', () => {
    const satz = createWettkampfSatz(wettkampf, {
      bezeichnung: '',
      streckeM: 100,
      schwimmart: 'freistil',
      laeufe: [],
    })
    expect(satz.bezeichnung).toBe('100 m Freistil')
    expect(satz.plan).toBeNull()
    expect(satz.wettkampfId).toBe(wettkampf.id)
    expect(istWettkampfSatz(satz)).toBe(true)

    const lauf = createWettkampfLauf(
      satz,
      {
        nummer: 3,
        starts: [
          { name: 'Spät', bahn: 7 },
          { name: 'Früh', bahn: 2 },
        ],
      },
      (start) => start.name,
    )
    expect(lauf.bahnen.map((bahn) => bahn.nummer)).toEqual([2, 7])
    expect(lauf.wiederholung).toBe(3)
    expect(lauf.modus).toBe('wettkampf')
    expect(lauf.startversatzMs).toBe(0)
  })

  it('meldet leere Ergebnisse und unbekannte Sätze', () => {
    expect(wettkampfErgebnis(laufMit(K100, 1)).every((zeile) => zeile.platz === null)).toBe(true)
    expect(wettkampfFortschritt([])).toEqual({ fertig: 0, gesamt: 0 })
    expect(istWettkampfSatz(null)).toBe(false)
    expect(istWettkampfSatz({ wettkampfId: '' } as Satz)).toBe(false)
  })
})

describe('Meldeliste: toleranter Import und klare Fehler', () => {
  const vorgabe = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

  it('lehnt leere Listen ab', () => {
    expect(parseMeldeliste('', vorgabe).ok).toBe(false)
    expect(parseMeldeliste('# nur Kommentar\n\n', vorgabe).ok).toBe(false)
  })

  it('lehnt zu lange Listen ab', () => {
    const zuLang = ['name', ...Array.from({ length: 2001 }, (_, i) => `Kind ${i}`)].join('\n')
    const ergebnis = parseMeldeliste(zuLang, vorgabe)
    expect(ergebnis.ok).toBe(false)
    if (!ergebnis.ok) expect(ergebnis.fehler).toContain('2000')
  })

  it('verlangt ohne Kopfzeile höchstens zwei Spalten', () => {
    const ergebnis = parseMeldeliste('1;Anna;2010', vorgabe)
    expect(ergebnis.ok).toBe(false)
    if (!ergebnis.ok) expect(ergebnis.fehler).toContain('Kopfzeile')
  })

  it('verlangt eine Namensspalte', () => {
    const ergebnis = parseMeldeliste('bahn;lauf\n1;1', vorgabe)
    expect(ergebnis.ok).toBe(false)
    if (!ergebnis.ok) expect(ergebnis.fehler).toContain('Name')
  })

  it('lehnt überlange Namen ab', () => {
    const ergebnis = parseMeldeliste(`name\n${'a'.repeat(81)}`, vorgabe)
    expect(ergebnis.ok).toBe(false)
    if (!ergebnis.ok) expect(ergebnis.fehler).toContain('80')
  })

  it('prüft Lauf- und Bahnnummern', () => {
    for (const zeile of ['name;lauf\nAnna;0', 'name;lauf\nAnna;100']) {
      const ergebnis = parseMeldeliste(zeile, vorgabe)
      expect(ergebnis.ok).toBe(false)
      if (!ergebnis.ok) expect(ergebnis.fehler).toContain('Laufnummer')
    }

    const bahn = parseMeldeliste('name;bahn\nAnna;11', vorgabe)
    expect(bahn.ok).toBe(false)
    if (!bahn.ok) expect(bahn.fehler).toContain('Bahn')
  })

  it('meldet volle Läufe statt still zu verwerfen', () => {
    const zeilen = ['name', ...Array.from({ length: 11 }, (_, i) => `Kind ${i}`)].join('\n')
    const ergebnis = parseMeldeliste(zeilen, vorgabe)
    expect(ergebnis.ok).toBe(false)
    if (!ergebnis.ok) expect(ergebnis.fehler).toContain('alle 10 Bahnen')
  })

  it('warnt bei unbekannter Schwimmart und Bahn', () => {
    const ergebnis = parseMeldeliste('name;schwimmart;bahn\nAnna;Unbekannt;x', vorgabe)
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.meldeliste.disziplinen[0]?.schwimmart).toBe('freistil')
    expect(ergebnis.meldeliste.disziplinen[0]?.laeufe[0]?.starts[0]?.bahn).toBe(1)
    expect(ergebnis.meldeliste.warnungen).toHaveLength(2)
  })

  it('verwirft ungültige Jahrgänge still', () => {
    const ergebnis = parseMeldeliste('name;jahrgang\nAnna;1800\nBen;2999\n', vorgabe)
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.meldeliste.disziplinen[0]?.laeufe[0]?.starts.map((start) => start.jahrgang)).toEqual([
      null,
      null,
    ])
  })

  it('versteht englische Spalten, Kommas, Tabs und Kommentare', () => {
    const komma = parseMeldeliste('\uFEFF# Startliste\nlane,name,heat\n3,Anna,2\n4,Ben,2\n', vorgabe)
    expect(komma.ok).toBe(true)
    if (!komma.ok) return
    expect(komma.meldeliste.disziplinen[0]?.laeufe[0]?.nummer).toBe(2)
    expect(komma.meldeliste.disziplinen[0]?.laeufe[0]?.starts.map((start) => start.name)).toEqual([
      'Anna',
      'Ben',
    ])

    const tab = parseMeldeliste('name\tdistance\tstroke\nAnna\t200\tbackstroke\n', {
      ...vorgabe,
      beckenlaengeM: 25,
    })
    expect(tab.ok).toBe(true)
    if (!tab.ok) return
    expect(tab.meldeliste.disziplinen[0]?.streckeM).toBe(200)
    expect(tab.meldeliste.disziplinen[0]?.schwimmart).toBe('ruecken')
  })

  it('nutzt eine freie Disziplinbezeichnung und die Vorgabelaufnummer', () => {
    const ergebnis = parseMeldeliste('disziplin;name\nStaffel Mixed;Anna\n', {
      ...vorgabe,
      lauf: 4,
    })
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.meldeliste.disziplinen[0]?.bezeichnung).toBe('Staffel Mixed')
    expect(ergebnis.meldeliste.disziplinen[0]?.laeufe[0]?.nummer).toBe(4)
  })

  it('stellt eine importierbare Vorlage bereit', () => {
    const ergebnis = parseMeldeliste(meldelisteVorlage(), vorgabe)
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.meldeliste.anzahlStarts).toBe(4)
  })

  it('erkennt gültige Schwimmarten', () => {
    expect(istSchwimmart('brust')).toBe(true)
    expect(istSchwimmart('kraul')).toBe(false)
  })

  it('lehnt Namen mit nur Leerzeichen in Vor- und Nachname ab', () => {
    const ergebnis = parseMeldeliste('vorname;nachname\n ; \n', vorgabe)
    expect(ergebnis.ok).toBe(false)
  })
})

describe('CSV: leere und unvollständige Bestände', () => {
  it('schreibt nur die Kopfzeile ohne Läufe', () => {
    const csv = laeufeAlsCsv([], [], [])
    expect(csv.replace(/^\uFEFF/, '').trim().split('\r\n')).toHaveLength(1)
  })

  it('lässt Satz und Datum leer, wenn beides fehlt', () => {
    const lauf = createLauf(K100, [{ nummer: 1 }])
    const mitAnschlag: Lauf = {
      ...lauf,
      bahnen: [
        {
          ...lauf.bahnen[0]!,
          anschlaege: [{ laengeNr: 1, splitMs: 30_000, erfasstAt: 0, istFinish: false }],
        },
      ],
    }
    const zeilen = laeufeAlsCsv([mitAnschlag], [], []).replace(/^\uFEFF/, '').trim().split('\r\n')
    expect(zeilen[1]).toMatch(/^;;50;100;freistil;1;;1;30000;/)
  })

  it('schreibt Runde, Takt und Versatz einer Serie', () => {
    const satz: Satz = {
      id: 's1',
      datum: '2026-10-29',
      bezeichnung: 'Serie',
      konfiguration: K100,
      plan: { wiederholungen: 4, taktSek: 120, startversatzMs: 10_000 },
      erstelltAm: 1,
    }
    const lauf = createLauf(K100, [{ nummer: 1 }], 's1', {
      wiederholung: 2,
      startversatzMs: 10_000,
    })
    const mitAnschlag: Lauf = {
      ...lauf,
      bahnen: [
        {
          ...lauf.bahnen[0]!,
          anschlaege: [{ laengeNr: 1, splitMs: 30_000, erfasstAt: 0, istFinish: false }],
        },
      ],
    }
    const zeilen = laeufeAlsCsv([mitAnschlag], [satz], []).replace(/^\uFEFF/, '').trim().split('\r\n')
    expect(zeilen[1]).toContain('Serie;2026-10-29;50;100;freistil;1;;1;30000;00:30,00;0;0;2;4;120;10000')
  })

  it('maskiert Anführungszeichen und schützt Formeln', () => {
    const satz: Satz = {
      id: 's1',
      datum: '2026-10-29',
      bezeichnung: '@Formel',
      konfiguration: K100,
      plan: null,
      erstelltAm: 1,
    }
    const lauf = createLauf(K100, [{ nummer: 1, schwimmerId: 'q' }], 's1')
    const mitAnschlag: Lauf = {
      ...lauf,
      bahnen: [
        {
          ...lauf.bahnen[0]!,
          anschlaege: [{ laengeNr: 1, splitMs: 30_000, erfasstAt: 0, istFinish: false }],
        },
      ],
    }
    const csv = laeufeAlsCsv(
      [mitAnschlag],
      [satz],
      [{ id: 'q', name: 'Zitat " und\nZeile', jahrgang: null, notiz: '', erstelltAm: 0 }],
    )
    expect(csv).toContain("'@Formel")
    expect(csv).toContain('"Zitat "" und\nZeile"')
  })

  it('benennt die Trainingsdatei nach dem lokalen Datum', () => {
    expect(csvDateiname()).toMatch(/^beckenrand-\d{4}-\d{2}-\d{2}\.csv$/)
  })
})
