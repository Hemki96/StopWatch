/**
 * localStorage-Zugriff mit Namensraum und Rückfall.
 *
 * Prüft die Grenze zwischen neuer und früherer Namensgebung: Geschrieben wird
 * immer der namespaced Schlüssel, gelesen wird zuerst dort und nur bei einem
 * fehlenden Wert beim früheren Schlüssel. So behalten bestehende
 * Installationen ihre Auswahl, ohne dass Daten kopiert oder gelöscht werden.
 * Getestet in jsdom mit echtem `localStorage`.
 */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { leseText, leseTextMitRueckfall, schreibeText, entferneText } from './lokalSpeicher'
import { legacySchluessel, speicherSchluessel } from '../storage/namensraum'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('lokalSpeicher', () => {
  it('schreibt unter dem namespaced Schlüssel', () => {
    schreibeText('theme', 'light')
    expect(localStorage.getItem(speicherSchluessel('theme'))).toBe('light')
    expect(localStorage.getItem(legacySchluessel('theme'))).toBeNull()
  })

  it('liest den früheren Schlüssel als Rückfall', () => {
    localStorage.setItem(legacySchluessel('einstellungen'), '{"bahnen":2}')
    expect(leseText('einstellungen')).toBe('{"bahnen":2}')
  })

  it('bevorzugt den neuen Schlüssel, wenn beide belegt sind', () => {
    localStorage.setItem(legacySchluessel('theme'), 'dark')
    localStorage.setItem(speicherSchluessel('theme'), 'light')
    expect(leseText('theme')).toBe('light')
  })

  it('löscht beide Schreibstellen, damit der alte Wert nicht zurückkehrt', () => {
    localStorage.setItem(legacySchluessel('training'), 'alt')
    localStorage.setItem(speicherSchluessel('training'), 'neu')

    entferneText('training')

    expect(localStorage.getItem(speicherSchluessel('training'))).toBeNull()
    expect(localStorage.getItem(legacySchluessel('training'))).toBeNull()
    expect(leseText('training')).toBeNull()
  })

  it('liefert bei fehlendem Wert null, aber bei einem Speicherfehler den Rückfall', () => {
    expect(leseTextMitRueckfall('onboarding', 'fertig')).toBeNull()

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blockiert', 'SecurityError')
    })
    expect(leseTextMitRueckfall('onboarding', 'fertig')).toBe('fertig')
    expect(leseText('onboarding')).toBeNull()
  })

  it('schluckt Fehler beim Schreiben', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('voll', 'QuotaExceededError')
    })
    expect(() => schreibeText('theme', 'dark')).not.toThrow()
  })
})
