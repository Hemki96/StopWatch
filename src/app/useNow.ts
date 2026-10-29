import { useEffect, useState } from 'react'

/** Liefert eine laufend aktualisierte monotone Zeit, aber nur solange `aktiv` gilt. */
export function useNow(aktiv: boolean): number {
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    if (!aktiv) return
    let frame = 0
    const tick = () => {
      setNow(performance.now())
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [aktiv])

  return now
}
