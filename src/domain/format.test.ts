/**
 * Zeitformatierung, Countdown und Zeiteingabe.
 *
 * Sichert die Darstellungsregeln aus `format.ts` ab: Messzeiten werden auf
 * Hundertstel abgeschnitten (nie gerundet), Minuten laufen ohne Stundenteil
 * über 60 hinaus, Deltas tragen immer ein Vorzeichen, Countdowns sind gröber
 * auf Zehntel und der Takt wird als `mm:ss` gerundet. Für die Eingabe muss
 * `parseTime` das deutsche Format inklusive Stunden und halber Hundertstel
 * zurücklesen und ungültige Einheiten ablehnen.
 *
 * Die Werte sind an den Grenzen gewählt (59_999 ms, 3_661_999 ms, 01:75,00),
 * weil dort Abschneiden, Minutenüberlauf und Validierung gleichzeitig sichtbar
 * werden. Die Datei ist rein und braucht weder Browser noch Uhr.
 */
import { describe, expect, it } from 'vitest'
import {
  formatCountdown,
  formatDelta,
  formatStrecke,
  formatTakt,
  formatTime,
  formatZwischenzeiten,
  parseTime,
  truncateToHundredths,
} from './format'

// Abschneiden statt Runden: 59_999 ms werden zu 59_990, damit die Anzeige nie
// schneller wirkt als die gemessene Zeit.
describe('truncateToHundredths', () => {
  it('schneidet ab statt zu runden', () => {
    expect(truncateToHundredths(59_999)).toBe(59_990)
    expect(truncateToHundredths(59_990)).toBe(59_990)
    expect(truncateToHundredths(9)).toBe(0)
  })
})

// Messzeit als `mm:ss,hh`; 3_661_999 ms ergeben „61:01,99“, weil Minuten ohne
// Stundenteil über 60 hinauslaufen.
describe('formatTime', () => {
  it('formatiert als mm:ss,hh', () => {
    expect(formatTime(0)).toBe('00:00,00')
    expect(formatTime(12_345)).toBe('00:12,34')
    expect(formatTime(60_000)).toBe('01:00,00')
    expect(formatTime(3_661_999)).toBe('61:01,99')
  })

  // Auch hier gilt Abschneiden: 59_999 ms dürfen nicht als 01:00,00 erscheinen.
  it('schneidet die Hundertstel ab', () => {
    expect(formatTime(59_999)).toBe('00:59,99')
    expect(formatTime(1_234)).toBe('00:01,23')
  })

  // Vor dem Start gibt es keine negative Anzeige.
  it('behandelt negative Werte als null', () => {
    expect(formatTime(-500)).toBe('00:00,00')
  })
})

// Delta mit immer gesetztem Vorzeichen; die führenden Minuten entfallen nur
// unter einer Minute, ab 01:01,00 bleiben sie stehen.
describe('formatDelta', () => {
  it('zeigt Vorzeichen und Sekunden ohne führende Minuten', () => {
    expect(formatDelta(-1_230)).toBe('-01,23')
    expect(formatDelta(450)).toBe('+00,45')
    expect(formatDelta(-61_000)).toBe('-01:01,00')
  })
})

// Zwischenzeiten: mit fester Strecke als Bruchteil der möglichen Splits, ohne
// Gesamtzahl bei offener Strecke. Die Einzahl gilt nur ohne Bruch.
describe('formatZwischenzeiten', () => {
  it('formatiert feste und offene Strecken', () => {
    expect(formatZwischenzeiten(2, 3)).toBe('2/3 Zwischenzeiten')
    expect(formatZwischenzeiten(0, 0)).toBe('0/0 Zwischenzeiten')
    expect(formatZwischenzeiten(1, null)).toBe('1 Zwischenzeit')
    expect(formatZwischenzeiten(2, null)).toBe('2 Zwischenzeiten')
  })
})

// Streckenangabe im deutschen Format mit Tausenderpunkt; `null` steht für die
// offene Strecke.
describe('formatStrecke', () => {
  it('formatiert Distanzen deutsch', () => {
    expect(formatStrecke(100)).toBe('100 m')
    expect(formatStrecke(1500)).toBe('1.500 m')
    expect(formatStrecke(null)).toBe('offene Strecke')
  })
})

// Countdown gröber als eine Messzeit: Zehntel, ohne führende Null bei fehlenden
// Minuten („7,4“), mit Minuten als „1:07,4“. Negative Restzeit wird zu 0.
describe('formatCountdown', () => {
  it('zeigt Zehntel und Minuten', () => {
    expect(formatCountdown(7_400)).toBe('7,4')
    expect(formatCountdown(0)).toBe('0,0')
    expect(formatCountdown(67_400)).toBe('1:07,4')
    expect(formatCountdown(-500)).toBe('0,0')
  })
})

// Der Takt kommt aus einer Sekundeneingabe und wird deshalb gerundet, nicht
// abgeschnitten.
describe('formatTakt', () => {
  it('formatiert Sekunden als mm:ss', () => {
    expect(formatTakt(120)).toBe('02:00')
    expect(formatTakt(90)).toBe('01:30')
    expect(formatTakt(5)).toBe('00:05')
  })
})

// Eingabeformat: `mm:ss,hh`, einfache Sekunden und Leerraum um den Wert.
// `1:23,4` gilt als 83,40 s, die fehlende Stelle wird aufgefüllt.
describe('parseTime', () => {
  it('liest mm:ss,hh und einfache Sekunden', () => {
    expect(parseTime('01:23,45')).toBe(83_450)
    expect(parseTime('1:23,4')).toBe(83_400)
    expect(parseTime('83,45')).toBe(83_450)
    expect(parseTime(' 01:00,00 ')).toBe(60_000)
  })

  // Abgelehnt werden leere oder nicht numerische Eingaben, Sekunden ab 60
  // (01:75,00), mehr als zwei Nachkommastellen und negative Werte.
  it('lehnt ungültige Eingaben ab', () => {
    expect(parseTime('')).toBeNull()
    expect(parseTime('abc')).toBeNull()
    expect(parseTime('01:75,00')).toBeNull()
    expect(parseTime('01:23,456')).toBeNull()
    expect(parseTime('-1,00')).toBeNull()
  })
})
