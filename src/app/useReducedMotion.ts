/**
 * Verfolgt `prefers-reduced-motion`.
 *
 * Die Einstellung gehört dem Betriebssystem und kann während einer Sitzung
 * wechseln (etwa über die Bedienungshilfen); deshalb wird sie nicht nur beim
 * Start gelesen, sondern über einen `change`-Listener aktuell gehalten.
 */
import { useEffect, useState } from 'react'

const ABFRAGE = '(prefers-reduced-motion: reduce)'

/**
 * True, wenn das System Bewegung reduzieren soll. Wird live verfolgt, weil die
 * Einstellung auch während einer laufenden Sitzung wechseln kann.
 *
 * Startwert synchron aus `matchMedia`, damit der erste Render nicht kurz
 * animiert. Ohne `matchMedia` bleibt es bei `false`; der Effekt hängt dann
 * keinen Listener und räumt nichts ab.
 */
export function useReducedMotion(): boolean {
  const [reduziert, setReduziert] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(ABFRAGE).matches === true,
  )

  useEffect(() => {
    const abfrage = window.matchMedia?.(ABFRAGE)
    if (!abfrage) return
    const reagiere = (event: MediaQueryListEvent) => setReduziert(event.matches)
    // Erneut lesen: Zwischen Initialisierung und Effekt kann sich der Wert
    // geändert haben, und der `change`-Listener sieht nur spätere Wechsel.
    setReduziert(abfrage.matches)
    abfrage.addEventListener('change', reagiere)
    return () => abfrage.removeEventListener('change', reagiere)
  }, [])

  return reduziert
}
