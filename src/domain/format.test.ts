import { describe, expect, it } from 'vitest'
import { formatDelta, formatStrecke, formatTime, truncateToHundredths } from './format'

describe('truncateToHundredths', () => {
  it('schneidet ab statt zu runden', () => {
    expect(truncateToHundredths(59_999)).toBe(59_990)
    expect(truncateToHundredths(59_990)).toBe(59_990)
    expect(truncateToHundredths(9)).toBe(0)
  })
})

describe('formatTime', () => {
  it('formatiert als mm:ss,hh', () => {
    expect(formatTime(0)).toBe('00:00,00')
    expect(formatTime(12_345)).toBe('00:12,34')
    expect(formatTime(60_000)).toBe('01:00,00')
    expect(formatTime(3_661_999)).toBe('61:01,99')
  })

  it('schneidet die Hundertstel ab', () => {
    expect(formatTime(59_999)).toBe('00:59,99')
    expect(formatTime(1_234)).toBe('00:01,23')
  })

  it('behandelt negative Werte als null', () => {
    expect(formatTime(-500)).toBe('00:00,00')
  })
})

describe('formatDelta', () => {
  it('zeigt Vorzeichen und Sekunden ohne führende Minuten', () => {
    expect(formatDelta(-1_230)).toBe('-01,23')
    expect(formatDelta(450)).toBe('+00,45')
    expect(formatDelta(-61_000)).toBe('-01:01,00')
  })
})

describe('formatStrecke', () => {
  it('formatiert Distanzen deutsch', () => {
    expect(formatStrecke(100)).toBe('100 m')
    expect(formatStrecke(1500)).toBe('1.500 m')
    expect(formatStrecke(null)).toBe('offene Strecke')
  })
})
