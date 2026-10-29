/**
 * Haptisches Feedback über die Vibrations-API.
 *
 * `haptic` ist eine fehlertolerante Hülle um `navigator.vibrate`: Der Standard
 * ist ein kurzer Impuls von 8 ms, Muster werden unverändert durchgereicht, und
 * ohne API (iOS Safari, Desktop) passiert nichts. Genau das sichert die Datei
 * ab — am Beckenrand darf ein fehlendes Vibrationsfeature die Bedienung nicht
 * unterbrechen. Die Tests laufen in der Node-Umgebung und stubben `navigator`
 * global; DOM oder Timer brauchen sie nicht.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { haptic } from './haptics'

// Globale Stubs aus dem vorherigen Fall entfernen.
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// Prüft die Weitergabe von Dauer und Muster sowie das stille Verhalten ohne
// Vibrations-API.
describe('haptic', () => {
  it('reicht das Muster an die Vibrations-API weiter', () => {
    const vibrate = vi.fn(() => true)
    vi.stubGlobal('navigator', { vibrate })

    // Ohne Argument gilt der kurze Standardimpuls; Zahlen und Arrays werden
    // unverändert übergeben, nicht normalisiert.
    haptic()
    haptic(25)
    haptic([10, 40, 10])

    expect(vibrate).toHaveBeenNthCalledWith(1, 8)
    expect(vibrate).toHaveBeenNthCalledWith(2, 25)
    expect(vibrate).toHaveBeenNthCalledWith(3, [10, 40, 10])
  })

  // Der Fähigkeitscheck (`typeof navigator.vibrate === 'function'`) verhindert
  // einen TypeError auf Geräten ohne Vibration.
  it('bleibt ohne Vibrations-API still', () => {
    vi.stubGlobal('navigator', {})

    expect(() => haptic()).not.toThrow()
  })
})
