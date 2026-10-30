/**
 * Ergebnisübersicht nach dem letzten Ziel.
 *
 * Geprüft wird die reine Ableitung (`ergebnisZeilen`) und die Darstellung:
 * Sortierung nach Zeit, Bestzeit-Marke für die schnellste Zeit, Rückstand für
 * langsamere Bahnen, kein Vergleich für Bahnen ohne Schwimmer oder mit offener
 * Strecke sowie die Kennzeichnung korrigierter Zeiten.
 */
// @vitest-environment jsdom
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from '../test/render'
import { createLauf, finishLane, korrigiereAnschlag, startAll, tapLane } from '../domain/lauf'
import type { Lauf } from '../domain/types'
import { LaufErgebnis, ergebnisZeilen } from './LaufErgebnis'

const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const
const OFFEN = { beckenlaengeM: 50, streckeM: null, schwimmart: 'freistil' } as const

/** Ein Lauf mit zwei benannten Bahnen; Bahn 1 schwimmt schneller als Bahn 2. */
function zweiBahnen(): Lauf {
  const start = createLauf(K100, [
    { nummer: 1, schwimmerId: 'a' },
    { nummer: 2, schwimmerId: 'b' },
  ])
  const [eins, zwei] = start.bahnen.map((bahn) => bahn.id) as [string, string]
  let lauf = startAll(start, 0, 1)
  lauf = tapLane(tapLane(lauf, eins, 30_000, 2), eins, 60_000, 3)
  lauf = tapLane(tapLane(lauf, zwei, 35_000, 2), zwei, 70_000, 3)
  return lauf
}

const namen = (id: string | null) => (id === 'a' ? 'Anna' : id === 'b' ? 'Ben' : null)

/** Ein früherer Lauf nur für Ben, damit sein aktueller Lauf kein PB ist. */
function vorlauf(schwimmerId: string, zeitMs: number): Lauf {
  const start = createLauf(K100, [{ nummer: 1, schwimmerId }])
  const id = start.bahnen[0]!.id
  return tapLane(tapLane(startAll(start, 0, 1), id, zeitMs / 2, 2), id, zeitMs, 3)
}

describe('ergebnisZeilen', () => {
  it('sortiert nach Zeit und vergleicht mit dem eigenen PB', () => {
    const lauf = zweiBahnen()
    const zeilen = ergebnisZeilen(lauf, [lauf])
    expect(zeilen.map((zeile) => zeile.nummer)).toEqual([1, 2])
    // Bestzeiten gelten je Schwimmer: Beide sind zunächst ihre eigene Bestzeit.
    expect(zeilen[0]).toMatchObject({ ms: 60_000, istPb: true, deltaMs: 0 })
    expect(zeilen[1]).toMatchObject({ ms: 70_000, istPb: true, deltaMs: 0 })

    // Mit einem früheren, schnelleren Lauf für Ben entsteht ein Rückstand.
    const frueher = vorlauf('b', 64_000)
    const mitVergleich = ergebnisZeilen(lauf, [frueher, lauf])
    expect(mitVergleich[1]).toMatchObject({ ms: 70_000, istPb: false, deltaMs: 6000 })
  })

  it('lässt offene Bahnen am Ende und ohne Bestzeit', () => {
    const lauf = zweiBahnen()
    const offen = {
      ...lauf,
      bahnen: [
        ...lauf.bahnen,
        { ...lauf.bahnen[0]!, id: 'offen', nummer: 3, schwimmerId: null, anschlaege: [] },
      ],
    }
    const zeilen = ergebnisZeilen(offen, [lauf])
    expect(zeilen.at(-1)).toMatchObject({ nummer: 3, ms: null, istPb: false, deltaMs: null })
  })

  it('gibt ohne Schwimmer und bei offener Strecke keinen Vergleich aus', () => {
    const ohneNamen = createLauf(K100, [{ nummer: 1 }])
    const id = ohneNamen.bahnen[0]!.id
    let lauf = startAll(ohneNamen, 0, 1)
    lauf = tapLane(tapLane(lauf, id, 30_000, 2), id, 60_000, 3)
    expect(ergebnisZeilen(lauf, [lauf])[0]).toMatchObject({ istPb: false, deltaMs: null })

    const offen = createLauf(OFFEN, [{ nummer: 1, schwimmerId: 'a' }])
    const offenId = offen.bahnen[0]!.id
    const gestartet = stempleOffen(startAll(offen, 0, 1), offenId)
    expect(ergebnisZeilen(gestartet, [gestartet])[0]).toMatchObject({
      istPb: false,
      deltaMs: null,
    })
  })

  it('kennzeichnet eine korrigierte Zielzeit', () => {
    const lauf = zweiBahnen()
    const bahn = lauf.bahnen[1]!
    // Die zweite Zeit auf 65 s korrigieren; sie bleibt langsamer als die
    // Bestzeit, trägt aber die Manuell-Markierung.
    const korrigiert = korrigiereAnschlag(lauf, bahn.id, 2, 65_000)
    const frueher = vorlauf('b', 64_000)
    const zeile = ergebnisZeilen(korrigiert, [frueher, korrigiert]).find(
      (eintrag) => eintrag.nummer === 2,
    )
    expect(zeile).toMatchObject({ ms: 65_000, korrigiert: true, deltaMs: 1000, istPb: false })
  })
})

/** Startet eine offene Strecke und setzt ein ausdrückliches Ziel. */
function stempleOffen(lauf: Lauf, bahnId: string): Lauf {
  return finishLane(lauf, bahnId, 45_000, 2)
}

describe('LaufErgebnis', () => {
  it('zeigt Zeit, Bestzeit-Marke und Rückstand', () => {
    const lauf = zweiBahnen()
    const frueher = vorlauf('b', 64_000)
    const ergebnis = render(
      <LaufErgebnis
        lauf={lauf}
        laeufe={[frueher, lauf]}
        schwimmerName={namen}
        onUndo={() => undefined}
      />,
    )
    // Die Zeilen stehen in Zeitreihenfolge; jede nennt Bahn, Name und Zeit.
    expect(ergebnis.container.querySelectorAll('li')).toHaveLength(2)
    expect(ergebnis.container.textContent).toContain('Anna')
    expect(ergebnis.container.textContent).toContain('01:00,00')
    expect(ergebnis.container.textContent).toContain('Bestzeit')
    expect(ergebnis.container.textContent).toContain('Ben')
    expect(ergebnis.container.textContent).toContain('+06,00 zum PB')
    ergebnis.unmount()
  })

  it('nennt ohne Schwimmer Lauf und Bahn statt „Ohne Namen“', () => {
    const start = createLauf(K100, [{ nummer: 2 }])
    const id = start.bahnen[0]!.id
    const lauf = tapLane(tapLane(startAll(start, 0, 1), id, 30_000, 2), id, 60_000, 3)
    const ergebnis = render(
      <LaufErgebnis lauf={lauf} laeufe={[lauf]} schwimmerName={namen} onUndo={() => undefined} />,
    )

    expect(ergebnis.container.textContent).toContain('Lauf 1, Bahn 2')
    expect(ergebnis.container.textContent).not.toContain('Ohne Namen')
    ergebnis.unmount()
  })

  it('meldet das Zurücknehmen einer Bahn', () => {
    const lauf = zweiBahnen()
    const zurueck = vi.fn()
    const ergebnis = render(
      <LaufErgebnis lauf={lauf} laeufe={[lauf]} schwimmerName={namen} onUndo={zurueck} />,
    )
    act(() =>
      ergebnis.container
        .querySelector<HTMLButtonElement>('button[aria-label="Ziel von Bahn 2 zurücknehmen"]')!
        .click(),
    )
    expect(zurueck).toHaveBeenCalledWith(lauf.bahnen[1]!.id)
    ergebnis.unmount()
  })
})
