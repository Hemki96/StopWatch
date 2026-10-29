/**
 * Einstellungen aus localStorage lesen und bereinigen.
 *
 * Sichert `leseEinstellungen` als Grenze zwischen gespeichertem Zustand und
 * App-Start ab: Manipulierte, veraltete oder unlesbare Werte dürfen nie zu
 * einem unbrauchbaren Zustand führen. Der Fokus liegt auf der Invariante, dass
 * jedes Feld einzeln auf seinen Standard zurückfällt, statt den ganzen
 * Datensatz zu verwerfen. Getestet wird in jsdom mit echtem `localStorage`;
 * render-Helfer oder Timer-Mocks sind hier nicht nötig.
 */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { leseEinstellungen } from './AppProvider'

/** Muss dem Schlüssel in `AppProvider.tsx` entsprechen; wird dort nicht exportiert. */
const KEY = 'beckenrand.einstellungen'

// Jeder Fall startet ohne gespeicherte Auswahl und ohne Spies aus dem Vorfall.
beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

// Prüft die Normalisierung der Vorbelegung: Standardwerte, Grenzen und
// Fehlerfälle beim Lesen.
describe('leseEinstellungen', () => {
  it('liefert ohne gespeicherte Werte die Standardkonfiguration', () => {
    expect(leseEinstellungen()).toEqual({
      konfiguration: { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' },
      bahnen: 6,
      schwimmerProBahn: [null, null, null, null, null, null],
      startversatzMs: 0,
      wiederholungen: 1,
      taktSek: 120,
    })
  })

  // Ein einzelner kaputter Wert darf nicht die ganze Vorbelegung kosten:
  // Beckenlänge/Schwimmart werden übernommen, nur die unpassende Strecke und
  // die außerhalb der Grenzen liegenden Zahlen werden geklemmt.
  it('bereinigt manipulierte oder veraltete Werte', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        konfiguration: { beckenlaengeM: 33, streckeM: 125, schwimmart: 'kraul' },
        bahnen: 99,
        schwimmerProBahn: ['s1', 7, null],
        startversatzMs: -5000,
        wiederholungen: 999,
        taktSek: 0,
      }),
    )

    const werte = leseEinstellungen()
    expect(werte.konfiguration).toEqual({
      beckenlaengeM: 50,
      streckeM: 100,
      schwimmart: 'freistil',
    })
    expect(werte.bahnen).toBe(10)
    expect(werte.schwimmerProBahn).toEqual(['s1', null, null, null, null, null, null, null, null, null])
    expect(werte.startversatzMs).toBe(0)
    expect(werte.wiederholungen).toBe(20)
    expect(werte.taktSek).toBe(10)
  })

  // Abgebrochener Schreibvorgang: unlesbares JSON darf den Start nicht
  // verhindern, die App beginnt dann mit den Standardwerten.
  it('fällt bei kaputtem JSON auf die Standards zurück', () => {
    localStorage.setItem(KEY, '{kaputt')
    expect(leseEinstellungen().bahnen).toBe(6)
  })

  // Safari im privaten Modus und blockierte Cookies lassen `localStorage`
  // schon beim Lesen werfen. Der Aufruf darf nicht durchschlagen.
  it('fällt zurück, wenn localStorage schon beim Lesen wirft', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blockiert', 'SecurityError')
    })
    expect(leseEinstellungen().konfiguration.streckeM).toBe(100)
  })
})
