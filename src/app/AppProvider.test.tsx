/**
 * Zentraler App-Zustand: Laden, Aktionen, Persistenz und Neustart.
 *
 * Diese Datei sichert die Invarianten von `AppProvider` ab, nicht die
 * Domänenlogik selbst: Jede Aktion schreibt sofort, ein Neustart rekonstruiert
 * den Bestand, laufende Bahnen verlieren ihre monotone Startzeit, und ohne
 * `BroadcastChannel` ist der Tab sofort aktiv. Besonderes Augenmerk liegt auf
 * Grenzfällen, die nur im Zusammenspiel entstehen: Tab-Rolle, Reload,
 * Cascade-Löschungen und idempotente Starts.
 *
 * Testhilfen: `fake-indexeddb` liefert eine echte IndexedDB im Speicher,
 * `render`/`warteAuf` aus `src/test/render` treiben React und asynchrone
 * Effekte, und `BroadcastChannel` wird global entfernt, damit jeder Test
 * deterministisch genau einen aktiven Tab sieht.
 */
// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Training } from '../domain/types'
import { isComplete } from '../domain/lauf'
import { clearAll, loadAll } from '../storage/repository'
import { speicherSchluessel } from '../storage/namensraum'
import { render, warteAuf } from '../test/render'
import { AppProvider, leseEinstellungen, useApp, type AppContextValue } from './AppProvider'

/** Konfiguration mit zwei Längen: 100 m in einem 50-m-Becken. */
const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

const EINSTELLUNGEN_KEY = speicherSchluessel('einstellungen')
const THEME_KEY = speicherSchluessel('theme')

// Gemountete Provider werden gesammelt und im `afterEach` abgebaut. Ohne das
// würden Effekte, Timer und IndexedDB-Zugriffe in den nächsten Test lecken.
const offeneApps: Array<{ unmount: () => void }> = []

/**
 * Baut den Provider mit einer leeren Sonde auf und gibt den Kontextwert heraus.
 *
 * Die Sonde ist nötig, weil der Kontext nur innerhalb des Providers lesbar ist;
 * `wert()` wirft vor dem ersten Rendern, damit ein zu früher Zugriff auffällt,
 * statt `null` weiterzureichen.
 */
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

/** Wie `starteApp`, wartet aber auf den Abschluss des ersten IndexedDB-Ladevorgangs. */
async function geladeneApp() {
  const app = starteApp()
  await warteAuf(() => app.wert().geladen)
  return app
}

// Ohne BroadcastChannel wird jeder Tab sofort aktiv; das macht die Tests
// unabhängig von Claim-Timern. `clearAll` leert die fake-indexeddb, damit kein
// Bestand aus dem vorherigen Test sichtbar bleibt.
beforeEach(async () => {
  vi.stubGlobal('BroadcastChannel', undefined)
  localStorage.clear()
  await clearAll()
})

// Erst abbauen, dann die globalen Stubs zurücknehmen: Der Provider entfernt
// beim Unmount seine `pagehide`-Listener und den Koordinator.
afterEach(() => {
  for (const app of offeneApps.splice(0)) app.unmount()
  vi.unstubAllGlobals()
})

// Deckt den Lebenszyklus des Providers ab: Startzustand, Einstellungen,
// Läufe und Serien, Schwimmer, Wettkampf, Training, Persistenz und Design.
describe('AppProvider', () => {
  // Startzustand nach dem Laden: Der Tab hält die Messung (kein
  // BroadcastChannel), der Bestand ist leer, die Einstellungen sind Standard.
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

  // Grenzen werden schon beim Setzen geklemmt (nicht erst beim Lesen), damit
  // die Oberfläche nie kurz einen unmöglichen Wert anzeigt. Der zweite Mount
  // prüft, dass die geklemmte Fassung tatsächlich in localStorage steht.
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

    const gespeichert = JSON.parse(localStorage.getItem(EINSTELLUNGEN_KEY) ?? '{}')
    expect(gespeichert.startversatzMs).toBe(5_000)

    const neu = await geladeneApp()
    expect(neu.wert().einstellungen.bahnen).toBe(10)
    expect(neu.wert().einstellungen.schwimmerProBahn).toHaveLength(10)
  })

  // Drei Abstufungen: unlesbares JSON ergibt Standard, ein unmöglicher
  // Einzelwert wird geklemmt, eine Strecke, die kein Vielfaches der
  // Beckenlänge ist, fällt auf den Standard zurück — Beckenlänge und
  // Schwimmart bleiben dabei erhalten.
  it('verwirft fehlerhafte gespeicherte Einstellungen und nimmt Standardwerte', () => {
    localStorage.setItem(EINSTELLUNGEN_KEY, '{kaputt')
    expect(leseEinstellungen().bahnen).toBe(6)

    localStorage.setItem(EINSTELLUNGEN_KEY, JSON.stringify({ bahnen: 0 }))
    expect(leseEinstellungen().bahnen).toBe(1)

    localStorage.setItem(
      EINSTELLUNGEN_KEY,
      JSON.stringify({
        konfiguration: { beckenlaengeM: 25, streckeM: 30, schwimmart: 'brust' },
      }),
    )
    const gelesen = leseEinstellungen()
    expect(gelesen.konfiguration.beckenlaengeM).toBe(25)
    expect(gelesen.konfiguration.streckeM).toBe(100)
    expect(gelesen.konfiguration.schwimmart).toBe('brust')
  })

  // Grundpfad einer Messung: Anlegen erzeugt Satz plus aktiven Lauf,
  // `startAlle` setzt für alle Bahnen denselben Startzeitstempel,
  // `brauchtTakt` bleibt wahr, solange eine Bahn offen ist. `rueckgaengig`
  // nimmt genau einen Anschlag zurück, nicht den ganzen Lauf.
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

  // `neuerLauf` ist die einzige Prüfstelle für eingehende Konfigurationen:
  // Eine Strecke, die nicht ins Becken passt, wird abgelehnt (`null`), und die
  // Bahnenzahl wird auf 1 … 10 begrenzt statt verworfen.
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

  // Reihen erzeugen mehrere Startgruppen: Alle Bahnen einer Reihe starten
  // gemeinsam, die nächste Reihe um den Startversatz später.
  it('legt Reihen an und startet sie gestaffelt', async () => {
    const app = await geladeneApp()
    act(() => {
      app.wert().neuerLauf(K100, 2, [], { reihen: 3, startversatzMs: 10_000 })
    })
    const lauf = app.wert().laeufe[0]!
    expect(lauf.bahnen).toHaveLength(6)
    expect(lauf.bahnen.map((bahn) => bahn.reihe)).toEqual([1, 1, 2, 2, 3, 3])
    expect(lauf.bahnen.map((bahn) => bahn.nummer)).toEqual([1, 2, 1, 2, 1, 2])

    act(() => app.wert().startAlle(1000, 5000))
    expect(app.wert().laeufe[0]?.bahnen.map((bahn) => bahn.startMs)).toEqual([
      1000, 1000, 11_000, 11_000, 21_000, 21_000,
    ])
  })

  // Eine Serie plant alle Runden beim Start voraus (kein Nachhol-Timer); der
  // Startversatz staffelt innerhalb einer Runde nur die Reihen.
  // `tippeSerie` adressiert die Zeile per Index, nicht per Bahn-ID, weil sich
  // die sichtbare Runde verschiebt.
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

  // Regressionsfall aus dem Reload: Eine Runde kann teilweise gefüllt sein
  // (hier eine Bahn ohne Startzeit). Ein erneutes `startAlle` darf die bereits
  // erfassten Anschläge nicht löschen und nur die fehlende Bahn nachziehen.
  // Der Test simuliert das über `rueckgaengig` auf der zweiten Bahn, weil
  // `startMs` sonst nicht auf `null` zurückgeht.
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

  // Verwerfen muss den ganzen Satz samt aller Wiederholungen entfernen; eine
  // übrig bleibende Runde würde in der Leiste als Geistereintrag hängen.
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

  // Die Leiste ist reine Auswahl: Schließen nimmt einen Lauf aus der Leiste,
  // ohne ihn zu löschen; Verwerfen löscht ihn. Eine unbekannte ID darf die
  // aktuelle Auswahl nicht auf `null` zurücksetzen.
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

  // Cascade-Löschung: Ein Schwimmer steckt an der Bahn, in der Vorbelegung und
  // in den Aktiven des Trainings. Nach dem Löschen muss überall `null` stehen,
  // sonst zeigt die Oberfläche eine tote Referenz. Die ID wird nur einmal
  // gespeichert; Namensraum-Trimmen passiert dabei ebenfalls.
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

  // Ein leerer Name ergibt keinen Datensatz; `null` ist die vereinbarte
  // Rückmeldung für „abgelehnt“ und unterscheidet sich von einem Treffer.
  it('ignoriert leere Schwimmernamen', async () => {
    const app = await geladeneApp()
    let ergebnis: unknown = 'x'
    act(() => {
      ergebnis = app.wert().speichereSchwimmer({ name: '   ', jahrgang: null, notiz: '' })
    })
    expect(ergebnis).toBeNull()
    expect(app.wert().schwimmer).toEqual([])
  })

  // Zwei Aktionen im selben Tick dürfen keine zweite Person mit derselben ID
  // anlegen. Der Ref-Spiegel ist die einzige aktuelle Sicht zwischen zwei
  // Renders; ohne ihn überschreibt die zweite Speicherung die erste.
  it('aktualisiert einen gerade angelegten Schwimmer im selben Tick', async () => {
    const app = await geladeneApp()
    let id: string | null = null
    act(() => {
      id =
        app
          .wert()
          .speichereSchwimmer({ name: 'Mia', jahrgang: 2010, notiz: '' })?.id ?? null
      if (!id) return
      app.wert().speichereSchwimmer({ id, name: 'Mia B.', jahrgang: 2010, notiz: '' })
    })

    expect(app.wert().schwimmer).toHaveLength(1)
    expect(app.wert().schwimmer[0]?.name).toBe('Mia B.')
  })

  // Korrekturen tragen `manuell`, damit eine von Hand erzeugte Bestzeit
  // erkennbar bleibt. Eine Korrektur, die die Reihenfolge der Anschläge
  // verletzen würde (hier 70 s vor dem zweiten Split bei 64 s), wird
  // verworfen; der Lauf bleibt dabei identisch (gleiche Referenz), es entsteht
  // also kein unnötiger Render.
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

  // Wettkampf, Disziplin, Meldeliste und Zielzeit in einem Durchlauf. Wichtig:
  // Name und Bezeichnung werden getrimmt bzw. aus Strecke und Schwimmart
  // abgeleitet, das Datum muss ISO sein, und ein Tap im Wettkampf erzeugt
  // sofort einen Finish-Anschlag (keine Längen-Splits).
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
    // Nur ISO-Daten sind gültig; das deutsche Format wird abgelehnt, statt
    // still falsch geparst zu werden.
    act(() => {
      ungueltig = app.wert().erstelleWettkampf({
        name: 'Test',
        datum: '29.10.2026',
        beckenlaengeM: 50,
      })
    })
    expect(ungueltig).toBeNull()

    // Eine leere Bezeichnung wird aus Strecke und Schwimmart gebildet; jede
    // Disziplin erzeugt ihre Heats als Läufe im Modus `wettkampf`.
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
    // Namen aus der Meldeliste werden zu Schwimmern; leere Bahnen bleiben
    // unbesetzt, statt einen Datensatz ohne Namen anzulegen.
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

    // Von Hand nachgetragene Zeit: ein Anschlag, sofort als Finish markiert
    // und als `manuell` gekennzeichnet.
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

    // Löschen des Wettkampfs räumt Disziplinen und deren Läufe mit ab.
    act(() => app.wert().loescheWettkampf(wettkampfId!))
    expect(app.wert().wettkampfe).toEqual([])
    expect(app.wert().satze).toEqual([])
    expect(app.wert().laeufe).toEqual([])
  })

  // Die Streckenprüfung gilt auch im Wettkampf: 75 m passen in kein 50-m-Becken,
  // die Disziplin wird abgelehnt und es entstehen keine Läufe.
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

  // Ein Trainingsplan erzeugt zunächst keine Läufe: Erst der Start eines
  // Trainingssatzes macht daraus Satz und Läufe. Der doppelte Start ist
  // idempotent und liefert denselben Anker, statt den Satz zu verdoppeln.
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

  // `speichereTraining` validiert vor dem Schreiben: Ein Plan ohne Sätze wird
  // verworfen. Löschen entfernt nur den Plan; bereits gestartete Sätze und
  // gemessene Läufe bleiben im Verlauf.
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

  // Persistenzpfad über einen echten Neustart: `warteAuf` pollt `loadAll`, bis
  // der Anschlag in IndexedDB steht (Schreiben ist asynchron). Nach dem neuen
  // Mount ist die Startzeit weg — `performance.now()` wäre nach einem Reload
  // wertlos —, der Anschlag bleibt und die App erklärt den Abbruch.
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

  // Die Leiste oben ist nur eine Auswahlhilfe: Ein vollständig beendeter Lauf
  // bleibt im Verlauf, wird beim Neustart aber nicht mehr als aktiv angeboten.
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

  // `system` bleibt die gespeicherte Wahl, `theme` ist der aufgelöste Wert. In
  // jsdom gibt es keine helle Systempräferenz, deshalb startet die App dunkel.
  // Das Design wird als Klasse am `html`-Element und in localStorage geführt.
  it('speichert und löst das Design auf', async () => {
    const app = await geladeneApp()
    expect(app.wert().themeEinstellung).toBe('system')
    expect(app.wert().theme).toBe('dark')

    act(() => app.wert().setzeTheme('light'))
    expect(app.wert().theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem(THEME_KEY)).toBe('light')

    act(() => app.wert().setzeTheme('dark'))
    expect(app.wert().theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  // `useApp` außerhalb des Providers ist ein Programmierfehler und muss laut
  // scheitern, nicht `undefined` liefern. React protokolliert den gefangenen
  // Fehler zusätzlich in der Konsole; das wird hier stillgelegt.
  it('meldet einen fehlenden Kontext verständlich', () => {
    function OhneProvider() {
      useApp()
      return null
    }
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(<OhneProvider />)).toThrow('AppProvider')
  })
})
