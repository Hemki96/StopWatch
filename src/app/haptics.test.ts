import { afterEach, describe, expect, it, vi } from 'vitest'
import { haptic } from './haptics'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('haptic', () => {
  it('reicht das Muster an die Vibrations-API weiter', () => {
    const vibrate = vi.fn(() => true)
    vi.stubGlobal('navigator', { vibrate })

    haptic()
    haptic(25)
    haptic([10, 40, 10])

    expect(vibrate).toHaveBeenNthCalledWith(1, 8)
    expect(vibrate).toHaveBeenNthCalledWith(2, 25)
    expect(vibrate).toHaveBeenNthCalledWith(3, [10, 40, 10])
  })

  it('bleibt ohne Vibrations-API still', () => {
    vi.stubGlobal('navigator', {})

    expect(() => haptic()).not.toThrow()
  })
})
