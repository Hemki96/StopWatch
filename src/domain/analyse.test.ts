import { describe, expect, it } from 'vitest'
import { berechnePbs, pacePro100, pbDelta, pbKey } from './analyse'
import { createLauf, startAll, tapLane } from './lauf'
import type { Lauf, LaufKonfiguration } from './types'

const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

function baueLauf(
  konfiguration: LaufKonfiguration,
  bahnZeiten: number[][],
  schwimmerIds: (string | null)[] = [],
): Lauf {
  let lauf = createLauf(
    konfiguration,
    bahnZeiten.map((_, i) => ({ nummer: i + 1, schwimmerId: schwimmerIds[i] ?? null })),
  )
  lauf = startAll(lauf, 0, 1_000)
  bahnZeiten.forEach((zeiten, index) => {
    const bahn = lauf.bahnen[index]!
    for (const zeit of zeiten) {
      lauf = tapLane(lauf, bahn.id, zeit, 1_000 + zeit)
    }
  })
  return lauf
}

describe('pbKey', () => {
  it('trennt Kurzbahn und Langbahn', () => {
    const kurz = pbKey({ ...K100, beckenlaengeM: 25 }, 's1')
    const lang = pbKey({ ...K100, beckenlaengeM: 50 }, 's1')
    expect(kurz).not.toBe(lang)
  })

  it('trennt Strecke und Schwimmart', () => {
    expect(pbKey(K100, 's1')).not.toBe(pbKey({ ...K100, streckeM: 200 }, 's1'))
    expect(pbKey(K100, 's1')).not.toBe(pbKey({ ...K100, schwimmart: 'brust' }, 's1'))
  })
})

describe('berechnePbs', () => {
  it('nimmt die schnellste vollständige Zeit je Kombination', () => {
    const langsam = baueLauf(K100, [[30_000, 65_000]], ['s1'])
    const schnell = baueLauf(K100, [[29_000, 62_000]], ['s1'])
    const pbs = berechnePbs([langsam, schnell])

    const eintrag = pbs.get(pbKey(K100, 's1'))
    expect(eintrag?.ms).toBe(62_000)
    expect(eintrag?.laufId).toBe(schnell.id)
  })

  it('ignoriert Bahnen ohne Finish und ohne Schwimmer', () => {
    const unvollstaendig = baueLauf(K100, [[30_000]], ['s1'])
    const ohneSchwimmer = baueLauf(K100, [[30_000, 60_000]], [null])
    expect(berechnePbs([unvollstaendig, ohneSchwimmer]).size).toBe(0)
  })

  it('ignoriert offene Strecken', () => {
    const offen = baueLauf({ ...K100, streckeM: null }, [[30_000, 60_000]], ['s1'])
    expect(berechnePbs([offen]).size).toBe(0)
  })
})

describe('pbDelta', () => {
  it('erkennt eine neue Bestzeit', () => {
    const alt = baueLauf(K100, [[30_000, 65_000]], ['s1'])
    const neu = baueLauf(K100, [[29_000, 62_000]], ['s1'])
    const pbs = berechnePbs([alt, neu])

    const delta = pbDelta(pbs, neu, neu.bahnen[0]!)
    expect(delta).toEqual({ deltaMs: 0, istPb: true })

    const altDelta = pbDelta(pbs, alt, alt.bahnen[0]!)
    expect(altDelta).toEqual({ deltaMs: 3_000, istPb: false })
  })
})

describe('pacePro100', () => {
  it('rechnet auf 100 m um', () => {
    expect(pacePro100(60_000, 100)).toBe(60_000)
    expect(pacePro100(120_000, 200)).toBe(60_000)
  })
})
