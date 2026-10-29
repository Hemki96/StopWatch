import { useEffect, useState } from 'react'

/** Hält den Bildschirm an, solange `aktiv` gilt. Gibt zurück, ob die Sperre greift. */
export function useWakeLock(aktiv: boolean): boolean {
  const [aktiviert, setAktiviert] = useState(false)

  useEffect(() => {
    if (!aktiv) {
      setAktiviert(false)
      return
    }
    let abgebrochen = false
    let sentinel: WakeLockSentinel | null = null

    const anfordern = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen')
        sentinel.addEventListener('release', () => setAktiviert(false))
        if (!abgebrochen) setAktiviert(true)
      } catch {
        if (!abgebrochen) setAktiviert(false)
      }
    }

    void anfordern()

    const beiSichtbarkeit = () => {
      if (document.visibilityState === 'visible') void anfordern()
    }
    document.addEventListener('visibilitychange', beiSichtbarkeit)

    return () => {
      abgebrochen = true
      document.removeEventListener('visibilitychange', beiSichtbarkeit)
      sentinel?.release().catch(() => undefined)
    }
  }, [aktiv])

  return aktiviert
}
