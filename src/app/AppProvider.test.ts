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
import { speicherSchluessel } from '../storage/namensraum'

/** Aktueller Schlüssel; der frühere wird in `lokalSpeicher.test.ts` geprüft. */
const KEY = speicherSchluessel('einstellungen')

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
      reihen: 1,
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

  // Alte Yard-Einstellungen bleiben lesbar, werden aber beim Laden auf Meter
  // gebracht. Die angezeigten Zahlen bleiben erhalten: 25 yd werden 25 m,
  // 100 yd werden 100 m.
  it('übernimmt alte Yard-Einstellungen als Meter', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        konfiguration: {
          beckenlaengeM: 22.86,
          streckeM: 91.44,
          schwimmart: 'freistil',
          einheit: 'yd',
        },
      }),
    )
    const werte = leseEinstellungen()
    expect(werte.konfiguration).toEqual({
      beckenlaengeM: 25,
      streckeM: 100,
      schwimmart: 'freistil',
    })
  })

  it('führt eine widersprüchliche Yard-Einstellung auf Meter zurück', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        konfiguration: { beckenlaengeM: 50, streckeM: 100, schwimmart: 'brust', einheit: 'yd' },
      }),
    )
    expect(leseEinstellungen().konfiguration).toMatchObject({
      beckenlaengeM: 25,
      streckeM: 100,
    })
  })

  // Abgebrochener Schreibvorgang: unlesbares JSON darf den Start nicht
  // verhindern, die App beginnt dann mit den Standardwerten.
  it('fällt bei kaputtem JSON auf die Standards zurück', () => {
    localStorage.setItem(KEY, '{kaputt')
    expect(leseEinstellungen().bahnen).toBe(6)
  })

  // Die Reihen kommen mit derselben Grenze wie in der Domäne; die
  // Schwimmerliste wächst auf Bahnen × Reihen.
  it('begrenzt die Reihen und füllt die Schwimmerliste entsprechend', () => {
    localStorage.setItem(KEY, JSON.stringify({ bahnen: 2, reihen: 99 }))
    const werte = leseEinstellungen()
    expect(werte.reihen).toBe(5)
    expect(werte.schwimmerProBahn).toHaveLength(10)
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
