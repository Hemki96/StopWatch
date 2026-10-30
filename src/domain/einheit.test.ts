/**
 * Einheiten: Umrechnung Meter ↔ Yards, Anzeige und Pace.
 *
 * Sichert die kanonischen Werte aus ADR 0009: 25 yd sind 22,86 m, 100 yd sind
 * 91,44 m. Fehlt die Einheit, gilt Meter. Die Pace pro 100 wird in der
 * Anzeige-Einheit gerechnet, damit „1:00 auf 100 yd“ nicht als 100-m-Pace
 * erscheint.
 */
import { describe, expect, it } from 'vitest'
import {
  BECKENLAENGE_25_YD_M,
  STRECKE_100_YD_M,
  alsMeterKonfiguration,
  anzeigeZuMeter,
  beckenlaengenFuer,
  einheitVon,
  formatBeckenlaenge,
  formatStreckeEinheit,
  istBeckenlaenge,
  meterZuAnzeige,
  pacePro100Einheit,
  standardBeckenlaenge,
} from './einheit'

describe('Umrechnung', () => {
  it('bildet 25 yd und 100 yd kanonisch in Metern ab', () => {
    expect(anzeigeZuMeter(25, 'yd')).toBe(BECKENLAENGE_25_YD_M)
    expect(anzeigeZuMeter(100, 'yd')).toBe(STRECKE_100_YD_M)
    expect(BECKENLAENGE_25_YD_M).toBe(22.86)
    expect(STRECKE_100_YD_M).toBe(91.44)
  })

  it('zeigt kanonische Meter wieder als ganze Yards', () => {
    expect(meterZuAnzeige(22.86, 'yd')).toBe(25)
    expect(meterZuAnzeige(91.44, 'yd')).toBe(100)
    expect(meterZuAnzeige(1500, 'm')).toBe(1500)
  })

  it('lässt Meter unverändert und ergänzt keine Rundungsfehler', () => {
    expect(anzeigeZuMeter(100, 'm')).toBe(100)
    expect(meterZuAnzeige(91.44, 'm')).toBe(91.44)
  })
})

describe('Einheit und Beckenlänge', () => {
  it('wertet ein fehlendes Feld als Meter', () => {
    expect(einheitVon({})).toBe('m')
    expect(einheitVon({ einheit: 'yd' })).toBe('yd')
    expect(einheitVon(null)).toBe('m')
  })

  it('kennt nur 25 yd als Yard-Becken', () => {
    expect(beckenlaengenFuer('m')).toEqual([25, 50])
    expect(beckenlaengenFuer('yd')).toEqual([22.86])
    expect(standardBeckenlaenge('yd')).toBe(22.86)
    expect(istBeckenlaenge(22.86)).toBe(true)
    expect(istBeckenlaenge(33)).toBe(false)
  })

  it('überführt alte Yard-Konfigurationen in Meter', () => {
    expect(
      alsMeterKonfiguration({
        beckenlaengeM: 22.86,
        streckeM: 91.44,
        schwimmart: 'freistil',
        einheit: 'yd',
      }),
    ).toEqual({
      beckenlaengeM: 25,
      streckeM: 100,
      schwimmart: 'freistil',
    })
    // Eine Meter-Konfiguration ohne Einheitenfeld bleibt unverändert; ein
    // ausdrückliches `einheit: 'm'` wird entfernt.
    const meter = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'brust' } as const
    expect(alsMeterKonfiguration(meter)).toBe(meter)
    expect(alsMeterKonfiguration({ ...meter, einheit: 'm' })).toEqual(meter)
  })
})

describe('Anzeige', () => {
  it('beschriftet Strecke und Becken in der Einheit', () => {
    expect(formatStreckeEinheit(100, 'm')).toBe('100 m')
    expect(formatStreckeEinheit(91.44, 'yd')).toBe('100 yd')
    expect(formatStreckeEinheit(null, 'yd')).toBe('offene Strecke')
    expect(formatBeckenlaenge(22.86, 'yd')).toBe('25 yd')
    expect(formatBeckenlaenge(50, 'm')).toBe('50 m')
  })
})

describe('pacePro100Einheit', () => {
  it('rechnet pro 100 der Anzeige-Einheit', () => {
    // Eine Minute auf 100 yd ist eine Minute pro 100 yd, nicht pro 91,44 m.
    expect(pacePro100Einheit(60_000, 91.44, 'yd')).toBeCloseTo(60_000, 6)
    expect(pacePro100Einheit(120_000, 182.88, 'yd')).toBeCloseTo(60_000, 6)
    expect(pacePro100Einheit(60_000, 100, 'm')).toBe(60_000)
  })
})
