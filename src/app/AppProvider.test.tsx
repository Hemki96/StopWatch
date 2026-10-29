// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Training } from '../domain/types'
import { isComplete } from '../domain/lauf'
import { clearAll, loadAll } from '../storage/repository'
import { render, warteAuf } from '../test/render'
import { AppProvider, leseEinstellungen, useApp, type AppContextValue } from './AppProvider'

const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

const offeneApps: Array<{ unmount: () => void }> = []

function starteApp() {
  let aktuell: AppContextValue | null = null

  function Probe() {
    aktuell = useApp()
    return null
  }

  const ergebnis = render(
    <AppProvider>
      <Probe />
    </AppProvider>,
  )
  offeneApps.push(ergebnis)

  return {
    ...ergebnis,
    wert(): AppContextValue {
      if (!aktuell) throw new Error('AppProvider ist noch nicht bereit.')
      return aktuell
    },
  }
}

async function geladeneApp() {
  const app = starteApp()
  await warteAuf(() => app.wert().geladen)
  return app
}

beforeEach(async () => {
  vi.stubGlobal('BroadcastChannel', undefined)
  localStorage.clear()
  await clearAll()
})

afterEach(() => {
  for (const app of offeneApps.splice(0)) app.unmount()
  vi.unstubAllGlobals()
})

describe('AppProvider', () => {
  it('lädt den Bestand und ist danach bedienbar', async () => {
    const app = await geladeneApp()
    const wert = app.wert()

    expect(wert.tabAktiv).toBe(true)
    expect(wert.tabGesperrt).toBe(false)
    expect(wert.laeufe).toEqual([])
    expect(wert.schwimmer).toEqual([])
    expect(wert.einstellungen).toMatchObject({
      bahnen: 6,
      konfiguration: { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' },
      startversatzMs: 0,
      wiederholungen: 1,
      taktSek: 120,
    })
  })

  it('begrenzt Einstellungen und liest sie beim Neustart wieder ein', async () => {
    const app = await geladeneApp()
    const basis = app.wert().einstellungen

    act(() => {
      app.wert().setzeEinstellungen({
        ...basis,
        bahnen: 99,
        startversatzMs: 5_432,
        wiederholungen: 0,
        taktSek: 5,
        schwimmerProBahn: ['a', '', 'b'],
      })
    })

    expect(app.wert().einstellungen.startversatzMs).toBe(5_000)
    expect(app.wert().einstellungen.wiederholungen).toBe(1)
    expect(app.wert().einstellungen.taktSek).toBe(10)
    expect(app.wert().einstellungen.schwimmerProBahn.slice(0, 4)).toEqual(['a', null, 'b', null])

    const gespeichert = JSON.parse(localStorage.getItem('beckenrand.einstellungen') ?? '{}')
    expect(gespeichert.startversatzMs).toBe(5_000)

    const neu = await geladeneApp()
    expect(neu.wert().einstellungen.bahnen).toBe(10)
    expect(neu.wert().einstellungen.schwimmerProBahn).toHaveLength(10)
  })

  it('verwirft fehlerhafte gespeicherte Einstellungen und nimmt Standardwerte', () => {
    localStorage.setItem('beckenrand.einstellungen', '{kaputt')
    expect(leseEinstellungen().bahnen).toBe(6)

    localStorage.setItem('beckenrand.einstellungen', JSON.stringify({ bahnen: 0 }))
    expect(leseEinstellungen().bahnen).toBe(1)

    localStorage.setItem(
      'beckenrand.einstellungen',
      JSON.stringify({
        konfiguration: { beckenlaengeM: 25, streckeM: 30, schwimmart: 'brust' },
      }),
    )
    const gelesen = leseEinstellungen()
    expect(gelesen.konfiguration.beckenlaengeM).toBe(25)
    expect(gelesen.konfiguration.streckeM).toBe(100)
    expect(gelesen.konfiguration.schwimmart).toBe('brust')
  })

  it('legt einen Lauf an, startet und beendet beide Bahnen', async () => {
    const app = await geladeneApp()

    let laufId: string | null = null
    act(() => {
      laufId = app.wert().neuerLauf(K100, 2)
    })
    const lauf = app.wert().laeufe.find((eintrag) => eintrag.id === laufId)!
    expect(lauf.bahnen).toHaveLength(2)
    expect(app.wert().aktiverLauf?.id).toBe(lauf.id)
    expect(app.wert().aktiveEintraege).toHaveLength(1)
    expect(app.wert().satze).toHaveLength(1)

    act(() => app.wert().startAlle(1_000, 1_700_000_000_000))
    expect(app.wert().aktiverLauf?.bahnen.map((bahn) => bahn.startMs)).toEqual([1_000, 1_000])
    expect(app.wert().brauchtTakt).toBe(true)

    const [bahn1, bahn2] = app.wert().aktiverLauf!.bahnen
    act(() => app.wert().tippe(bahn1!.id, 31_000, 1_700_000_030_000))
    expect(app.wert().aktiverLauf?.bahnen[0]?.anschlaege).toHaveLength(1)

    act(() => {
      app.wert().tippe(bahn1!.id, 61_000, 1_700_000_060_000)
      app.wert().tippe(bahn2!.id, 62_000, 1_700_000_061_000)
      app.wert().tippe(bahn2!.id, 63_000, 1_700_000_062_000)
    })
    expect(isComplete(app.wert().aktiverLauf!)).toBe(true)
    expect(app.wert().brauchtTakt).toBe(false)

    act(() => app.wert().rueckgaengig(bahn2!.id))
    expect(app.wert().aktiverLauf?.bahnen[1]?.anschlaege).toHaveLength(1)
  })

  it('lehnt ungültige Läufe ab und begrenzt die Bahnenzahl', async () => {
    const app = await geladeneApp()

    let ungueltig: string | null = 'nicht-null'
    act(() => {
      ungueltig = app.wert().neuerLauf({ ...K100, streckeM: 75 }, 2)
    })
    expect(ungueltig).toBeNull()
    expect(app.wert().laeufe).toEqual([])

    act(() => {
      app.wert().neuerLauf(K100, 0)
    })
    expect(app.wert().laeufe[0]?.bahnen).toHaveLength(1)

    act(() => {
      app.wert().neuerLauf(K100, 99)
    })
    expect(app.wert().laeufe[0]?.bahnen).toHaveLength(10)
  })

  it('plant eine Serie mit Takt und bedient sie zeilenweise', async () => {
    const app = await geladeneApp()
    act(() => {
      app.wert().neuerLauf(K100, 1, [], {
        wiederholungen: 3,
        taktSek: 60,
        startversatzMs: 10_000,
      })
    })

    expect(app.wert().laeufe).toHaveLength(3)
    expect(app.wert().aktiveRunden).toHaveLength(3)
    expect(app.wert().aktiverSatz?.plan).toMatchObject({ wiederholungen: 3, taktSek: 60 })

    act(() => app.wert().startAlle(0, 1_000_000))
    expect(
      app
        .wert()
        .laeufe.map((lauf) => lauf.bahnen[0]?.startMs ?? 0)
        .sort((a, b) => a - b),
    ).toEqual([0, 60_000, 120_000])

    // Eine Runde braucht zwei Anschläge: 100 m in 50-m-Becken.
    act(() => app.wert().tippeSerie(0, 30_000, 1_030_000))
    expect(app.wert().aktiveRunden[0]?.bahnen[0]?.anschlaege).toHaveLength(1)
    act(() => app.wert().tippeSerie(0, 61_000, 1_061_000))
    expect(isComplete(app.wert().aktiveRunden[0]!)).toBe(true)

    act(() => app.wert().rueckgaengigSerie(0))
    expect(isComplete(app.wert().aktiveRunden[0]!)).toBe(false)

    act(() => {
      app.wert().tippeSerie(0, 61_000, 1_061_000)
      app.wert().tippeSerie(0, 90_000, 1_090_000)
      app.wert().tippeSerie(0, 121_000, 1_121_000)
      app.wert().tippeSerie(0, 150_000, 1_150_000)
      app.wert().tippeSerie(0, 181_000, 1_181_000)
      app.wert().tippeSerie(0, 210_000, 1_210_000)
    })
    expect(app.wert().aktiveRunden.every(isComplete)).toBe(true)
    expect(app.wert().brauchtTakt).toBe(false)
  })

  it('nimmt eine fehlende Bahn einer angefangenen Runde wieder auf', async () => {
    const app = await geladeneApp()
    act(() => {
      app.wert().neuerLauf(K100, 2, [], { wiederholungen: 2, taktSek: 60 })
      app.wert().startAlle(0, 1_700_000_000_000)
    })

    const runde1 = app.wert().aktiveRunden[0]!
    const bahn2 = runde1.bahnen[1]!
    act(() => {
      app.wert().tippeSerie(0, 30_000, 1_700_000_030_000)
      app.wert().tippeSerie(0, 60_000, 1_700_000_060_000)
    })
    expect(app.wert().aktiveRunden[0]?.bahnen[0]?.anschlaege).toHaveLength(2)

    // Simuliert den Reload: Bahn 2 verliert ihre Startzeit, Runde 1 bleibt
    // teilweise gefüllt.
    act(() => app.wert().rueckgaengig(bahn2.id))
    expect(app.wert().aktiveRunden[0]?.bahnen[1]?.startMs).toBeNull()

    act(() => app.wert().startAlle(10_000, 1_700_000_010_000))
    expect(app.wert().aktiveRunden[0]?.bahnen[1]?.startMs).toBe(10_000)
    expect(app.wert().aktiveRunden[0]?.bahnen[1]?.anschlaege).toHaveLength(0)
  })

  it('verwirft eine Serie samt allen Runden', async () => {
    const app = await geladeneApp()
    act(() => {
      app.wert().neuerLauf(K100, 2, [], { wiederholungen: 3, taktSek: 60 })
    })
    expect(app.wert().laeufe).toHaveLength(3)

    act(() => app.wert().verwerfeAktivenLauf())

    expect(app.wert().laeufe).toEqual([])
    expect(app.wert().satze).toEqual([])
    expect(app.wert().aktiverLauf).toBeNull()
    expect(app.wert().toast).toBe('Serie abgebrochen.')
  })

  it('schließt und verwirft einzelne Läufe', async () => {
    const app = await geladeneApp()
    let erster: string | null = null
    let zweiter: string | null = null
    act(() => {
      erster = app.wert().neuerLauf(K100, 1)
      zweiter = app.wert().neuerLauf(K100, 2)
    })

    expect(app.wert().aktiveEintraege).toHaveLength(2)
    act(() => app.wert().waehleLauf(erster!))
    expect(app.wert().aktiverLauf?.id).toBe(erster)

    act(() => app.wert().waehleLauf('gibt-es-nicht'))
    expect(app.wert().aktiverLauf?.id).toBe(erster)

    act(() => app.wert().schliesseAktivenLauf())
    expect(app.wert().aktiveEintraege.map((eintrag) => eintrag.id)).toEqual([zweiter])
    expect(app.wert().aktiverLauf?.id).toBe(zweiter)
    expect(app.wert().toast).toBe('Lauf geschlossen.')

    act(() => app.wert().verwerfeAktivenLauf())
    expect(app.wert().laeufe.map((eintrag) => eintrag.id)).toEqual([erster])
    expect(app.wert().aktiverLauf).toBeNull()
    expect(app.wert().toast).toBe('Lauf verworfen.')
  })

  it('legt Schwimmer an, ordnet sie zu und entfernt sie überall', async () => {
    const app = await geladeneApp()
    act(() => {
      app.wert().setzeEinstellungen({
        ...app.wert().einstellungen,
        bahnen: 2,
        schwimmerProBahn: [],
      })
    })
    act(() => app.wert().anlegeTraining())
    const trainingId = app.wert().trainings[0]!.id

    let mia: ReturnType<AppContextValue['speichereSchwimmer']> = null
    act(() => {
      mia = app.wert().speichereSchwimmer({ name: '  Mia  ', jahrgang: 2010, notiz: ' Kader ' })
    })
    expect(mia).toMatchObject({ name: 'Mia', jahrgang: 2010, notiz: 'Kader' })

    act(() => app.wert().neuerLauf(K100, 2))
    const lauf = app.wert().aktiverLauf!
    act(() => app.wert().setzeSchwimmer(lauf.bahnen[0]!.id, mia!.id))
    expect(app.wert().aktiverLauf?.bahnen[0]?.schwimmerId).toBe(mia!.id)

    act(() => {
      app.wert().setzeEinstellungen({
        ...app.wert().einstellungen,
        schwimmerProBahn: [mia!.id, null],
      })
    })
    expect(app.wert().einstellungen.schwimmerProBahn[0]).toBe(mia!.id)

    act(() => app.wert().loescheSchwimmer(mia!.id))
    expect(app.wert().schwimmer).toEqual([])
    expect(app.wert().aktiverLauf?.bahnen[0]?.schwimmerId).toBeNull()
    expect(app.wert().einstellungen.schwimmerProBahn[0]).toBeNull()
    expect(app.wert().trainings.find((eintrag) => eintrag.id === trainingId)?.aktive).toEqual([
      null,
      null,
    ])
  })

  it('ignoriert leere Schwimmernamen', async () => {
    const app = await geladeneApp()
    let ergebnis: unknown = 'x'
    act(() => {
      ergebnis = app.wert().speichereSchwimmer({ name: '   ', jahrgang: null, notiz: '' })
    })
    expect(ergebnis).toBeNull()
    expect(app.wert().schwimmer).toEqual([])
  })

  it('korrigiert einen Anschlag nur bei gültiger Reihenfolge', async () => {
    const app = await geladeneApp()
    act(() => app.wert().neuerLauf(K100, 1))
    const lauf = app.wert().aktiverLauf!
    const bahnId = lauf.bahnen[0]!.id
    act(() => {
      app.wert().startAlle(0, 0)
      app.wert().tippe(bahnId, 31_000, 31_000)
      app.wert().tippe(bahnId, 64_000, 64_000)
    })

    act(() => app.wert().korrigiereAnschlag(lauf.id, bahnId, 1, 30_000))
    expect(app.wert().aktiverLauf?.bahnen[0]?.anschlaege[0]).toMatchObject({
      splitMs: 30_000,
      manuell: true,
    })

    const vorher = app.wert().aktiverLauf
    act(() => app.wert().korrigiereAnschlag(lauf.id, bahnId, 1, 70_000))
    expect(app.wert().aktiverLauf).toBe(vorher)
  })

  it('legt einen Wettkampf mit Disziplin an und wertet Zielzeiten', async () => {
    const app = await geladeneApp()

    let wettkampfId: string | null = null
    act(() => {
      wettkampfId = app.wert().erstelleWettkampf({
        name: '  Herbstpokal  ',
        datum: '2026-10-29',
        beckenlaengeM: 50,
      })
    })
    expect(app.wert().wettkampfe[0]).toMatchObject({
      id: wettkampfId,
      name: 'Herbstpokal',
      datum: '2026-10-29',
    })

    let ungueltig: string | null = 'x'
    act(() => {
      ungueltig = app.wert().erstelleWettkampf({
        name: 'Test',
        datum: '29.10.2026',
        beckenlaengeM: 50,
      })
    })
    expect(ungueltig).toBeNull()

    let satzId: string | null = null
    act(() => {
      satzId = app.wert().erstelleWettkampfDisziplin(wettkampfId!, {
        bezeichnung: '',
        streckeM: 100,
        schwimmart: 'freistil',
        laeufe: 2,
        bahnen: 3,
      })
    })
    expect(satzId).not.toBeNull()
    expect(app.wert().satze.find((satz) => satz.id === satzId)?.bezeichnung).toBe(
      '100 m Freistil',
    )
    expect(app.wert().laeufe).toHaveLength(2)
    expect(app.wert().laeufe.every((lauf) => lauf.modus === 'wettkampf')).toBe(true)

    const lauf = app.wert().laeufe.find((eintrag) => eintrag.wiederholung === 1)!
    act(() => app.wert().setzeWettkampfNamen(lauf.id, ['Anna', 'Ben', '']))
    expect(app.wert().schwimmer.map((eintrag) => eintrag.name)).toEqual(['Anna', 'Ben'])
    expect(app.wert().laeufe.find((eintrag) => eintrag.id === lauf.id)?.bahnen).toMatchObject([
      { nummer: 1, schwimmerId: expect.any(String) },
      { nummer: 2, schwimmerId: expect.any(String) },
      { nummer: 3, schwimmerId: null },
    ])

    act(() => app.wert().starteWettkampfLauf(lauf.id, 0, 0))
    const gestartet = app.wert().laeufe.find((eintrag) => eintrag.id === lauf.id)!
    act(() => app.wert().tippeWettkampf(lauf.id, gestartet.bahnen[0]!.id, 60_000, 60_000))
    expect(app.wert().laeufe.find((eintrag) => eintrag.id === lauf.id)?.bahnen[0]?.anschlaege).toHaveLength(1)

    act(() => app.wert().setzeWettkampfZeit(lauf.id, gestartet.bahnen[1]!.id, 59_900))
    expect(
      app.wert().laeufe.find((eintrag) => eintrag.id === lauf.id)?.bahnen[1]?.anschlaege[0],
    ).toMatchObject({ splitMs: 59_900, istFinish: true, manuell: true })

    act(() => app.wert().rueckgaengigWettkampf(lauf.id, gestartet.bahnen[0]!.id))
    expect(
      app.wert().laeufe.find((eintrag) => eintrag.id === lauf.id)?.bahnen[0]?.anschlaege,
    ).toHaveLength(0)

    act(() => app.wert().benenneWettkampf(wettkampfId!, '  Winterpokal '))
    expect(app.wert().wettkampfe[0]?.name).toBe('Winterpokal')

    act(() => app.wert().loescheWettkampf(wettkampfId!))
    expect(app.wert().wettkampfe).toEqual([])
    expect(app.wert().satze).toEqual([])
    expect(app.wert().laeufe).toEqual([])
  })

  it('lehnt eine Disziplin ab, deren Strecke nicht ins Becken passt', async () => {
    const app = await geladeneApp()
    let wettkampfId: string | null = null
    act(() => {
      wettkampfId = app.wert().erstelleWettkampf({
        name: 'Test',
        datum: '2026-10-29',
        beckenlaengeM: 50,
      })
    })

    let ergebnis: string | null = 'x'
    act(() => {
      ergebnis = app.wert().erstelleWettkampfDisziplin(wettkampfId!, {
        bezeichnung: 'Schief',
        streckeM: 75,
        schwimmart: 'freistil',
        laeufe: 1,
        bahnen: 2,
      })
    })
    expect(ergebnis).toBeNull()
    expect(app.wert().laeufe).toEqual([])
  })

  it('bereitet ein Training vor und startet den ersten Satz', async () => {
    const app = await geladeneApp()
    act(() => {
      app.wert().setzeEinstellungen({ ...app.wert().einstellungen, bahnen: 2 })
    })
    act(() => app.wert().anlegeTraining())

    const training = app.wert().trainings[0]!
    expect(training.bahnen).toBe(2)
    expect(training.saetze).toHaveLength(1)
    expect(app.wert().laeufe).toEqual([])

    let anker: string | null = null
    act(() => {
      anker = app.wert().starteTrainingsSatz(
        training.id,
        training.saetze[0]!.id,
        1_000,
        1_700_000_000_000,
      )
    })
    expect(anker).not.toBeNull()
    expect(app.wert().laeufe).toHaveLength(1)
    expect(app.wert().aktiverLauf?.bahnen.map((bahn) => bahn.startMs)).toEqual([1_000, 1_000])
    expect(app.wert().trainings[0]?.gestartet[training.saetze[0]!.id]).toBeDefined()

    // Ein zweiter Aufruf wählt denselben Satz erneut, statt ihn zu verdoppeln.
    let wieder: string | null = null
    act(() => {
      wieder = app.wert().starteTrainingsSatz(
        training.id,
        training.saetze[0]!.id,
        5_000,
        5_000,
      )
    })
    expect(wieder).toBe(anker)
    expect(app.wert().laeufe).toHaveLength(1)
  })

  it('speichert nur gültige Trainings und löscht nur den Plan', async () => {
    const app = await geladeneApp()
    act(() => app.wert().anlegeTraining())
    const training = app.wert().trainings[0]!

    const ungueltig: Training = { ...training, saetze: [] }
    act(() => app.wert().speichereTraining(ungueltig))
    expect(app.wert().trainings[0]?.saetze).toHaveLength(1)

    const gueltig: Training = { ...training, bezeichnung: 'Montag' }
    act(() => app.wert().speichereTraining(gueltig))
    expect(app.wert().trainings[0]?.bezeichnung).toBe('Montag')

    act(() => {
      app.wert().starteTrainingsSatz(training.id, training.saetze[0]!.id, 0, 0)
    })
    expect(app.wert().laeufe).toHaveLength(1)

    act(() => app.wert().loescheTraining(training.id))
    expect(app.wert().trainings).toEqual([])
    expect(app.wert().laeufe).toHaveLength(1)
  })

  it('speichert den Verlauf und lädt ihn nach einem Neustart', async () => {
    const app = await geladeneApp()
    act(() => app.wert().neuerLauf(K100, 1))
    const lauf = app.wert().aktiverLauf!
    act(() => {
      app.wert().startAlle(1_000, 1_700_000_000_000)
      app.wert().tippe(lauf.bahnen[0]!.id, 31_250, 1_700_000_031_250)
    })

    await warteAuf(async () => {
      const daten = await loadAll()
      return daten.laeufe.some((eintrag) => eintrag.bahnen[0]?.anschlaege.length === 1)
    })

    const neu = await geladeneApp()
    expect(neu.wert().laeufe).toHaveLength(1)
    expect(neu.wert().laeufe[0]?.bahnen[0]?.anschlaege).toHaveLength(1)
    expect(neu.wert().laeufe[0]?.bahnen[0]?.startMs).toBeNull()
    expect(neu.wert().toast).toBe(
      'Der letzte Lauf wurde unterbrochen. Erfasste Zeiten bleiben erhalten.',
    )
  })

  it('räumt vollständig beendete Läufe beim Neustart aus der Leiste', async () => {
    const app = await geladeneApp()
    act(() => app.wert().neuerLauf(K100, 1))
    const lauf = app.wert().aktiverLauf!
    act(() => {
      app.wert().startAlle(0, 1_700_000_000_000)
      app.wert().tippe(lauf.bahnen[0]!.id, 30_000, 30_000)
      app.wert().tippe(lauf.bahnen[0]!.id, 60_000, 60_000)
    })
    await warteAuf(async () => {
      const daten = await loadAll()
      return daten.laeufe.some((eintrag) => isComplete(eintrag))
    })

    const neu = await geladeneApp()
    expect(neu.wert().laeufe).toHaveLength(1)
    expect(neu.wert().aktiveEintraege).toEqual([])
    expect(neu.wert().aktiverLauf).toBeNull()
  })

  it('speichert und löst das Design auf', async () => {
    const app = await geladeneApp()
    expect(app.wert().themeEinstellung).toBe('system')
    expect(app.wert().theme).toBe('dark')

    act(() => app.wert().setzeTheme('light'))
    expect(app.wert().theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('beckenrand.theme')).toBe('light')

    act(() => app.wert().setzeTheme('dark'))
    expect(app.wert().theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('meldet einen fehlenden Kontext verständlich', () => {
    function OhneProvider() {
      useApp()
      return null
    }
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(<OhneProvider />)).toThrow('AppProvider')
  })
})
