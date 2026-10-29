/**
 * Namensraum der persistenten Daten.
 *
 * Sichert die Namenskonvention ab, auf der IndexedDB, localStorage und der
 * Tab-Kanal beruhen: Alle drei teilen denselben Namensraum, der frühere Name
 * bleibt getrennt und ist nur als lesender Rückfall vorgesehen. Die Tests
 * prüfen bewusst die konkreten Zeichenketten, weil sie die gespeicherten Daten
 * bestehender Installationen adressieren.
 */
import { describe, expect, it } from 'vitest'
import {
  APP_ID,
  DATENBANK_NAME,
  KANAL_NAME,
  LEGACY_DATENBANK_NAME,
  LEGACY_SCHLUESSEL_PRAEFIX,
  NAMENSRAUM,
  legacySchluessel,
  speicherSchluessel,
} from './namensraum'

describe('Speicher-Namensraum', () => {
  it('leitet alle Namen aus einer stabilen App-Kennung ab', () => {
    expect(APP_ID).toBe('beckenrand')
    expect(NAMENSRAUM).toBe('beckenrand.v2')
    expect(DATENBANK_NAME).toBe(NAMENSRAUM)
    // Der Kanal bleibt bewusst beim alten Namen, damit alte und neue
    // App-Versionen während des Updates weiter koordinieren.
    expect(KANAL_NAME).toBe('beckenrand.tabs')
    expect(LEGACY_DATENBANK_NAME).toBe('beckenrand')
    expect(LEGACY_SCHLUESSEL_PRAEFIX).toBe('beckenrand.')
  })

  it('trennt aktuelle und frühere Datenbanknamen', () => {
    expect(DATENBANK_NAME).not.toBe(LEGACY_DATENBANK_NAME)
  })

  it('bildet logische Schlüssel auf den Namensraum ab', () => {
    expect(speicherSchluessel('theme')).toBe('beckenrand.v2.theme')
    expect(speicherSchluessel('einstellungen')).toBe('beckenrand.v2.einstellungen')
    expect(speicherSchluessel('a')).not.toBe(speicherSchluessel('b'))
  })

  it('kennt die früheren Schlüssel nur als Rückfall', () => {
    expect(legacySchluessel('theme')).toBe('beckenrand.theme')
    expect(legacySchluessel('theme')).not.toBe(speicherSchluessel('theme'))
  })
})
