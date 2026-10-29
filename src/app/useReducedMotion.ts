import { useEffect, useState } from 'react'

const ABFRAGE = '(prefers-reduced-motion: reduce)'

/**
 * True, wenn das System Bewegung reduzieren soll. Wird live verfolgt, weil die
 * Einstellung auch während einer laufenden Sitzung wechseln kann.
 */
export function useReducedMotion(): boolean {
  const [reduziert, setReduziert] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(ABFRAGE).matches === true,
  )

  useEffect(() => {
    const abfrage = window.matchMedia?.(ABFRAGE)
    if (!abfrage) return
    const reagiere = (event: MediaQueryListEvent) => setReduziert(event.matches)
    setReduziert(abfrage.matches)
    abfrage.addEventListener('change', reagiere)
    return () => abfrage.removeEventListener('change', reagiere)
  }, [])

  return reduziert
}
