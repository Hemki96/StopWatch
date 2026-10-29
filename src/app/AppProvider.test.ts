// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { leseEinstellungen } from './AppProvider'

const KEY = 'beckenrand.einstellungen'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

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

  it('fällt bei kaputtem JSON auf die Standards zurück', () => {
    localStorage.setItem(KEY, '{kaputt')
    expect(leseEinstellungen().bahnen).toBe(6)
  })

  it('fällt zurück, wenn localStorage schon beim Lesen wirft', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blockiert', 'SecurityError')
    })
    expect(leseEinstellungen().konfiguration.streckeM).toBe(100)
  })
})
