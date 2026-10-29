/**
 * Gedrosselte Zeit für Screenreader-Texte.
 *
 * Der sichtbare Frame-Tick aus `useNow` läuft mit 30 fps. Für einen
 * `aria-describedby`-Text wäre das unnötig: Eine Vorlesehilfe liest die
 * Beschreibung zwar nur auf Anforderung, aber der Text soll trotzdem nicht bei
 * jedem Render neu aufgebaut werden. Dieser Hook zieht den Wert höchstens
 * einmal pro Intervall nach.
 */
import { useEffect, useRef, useState } from 'react'

/** Abstand, in dem die vorgelesene laufende Zeit frühestens nachzieht. */
export const ZEIT_ANSAGE_MS = 1000

/**
 * Aktuelle Zeit für den Vorlesetext, gedrosselt auf ein Update pro Intervall.
 *
 * Der Intervall-Timer liest den jeweils letzten Renderwert über eine Ref,
 * damit `now` nicht als Effect-Abhängigkeit 30-mal pro Sekunde einen neuen
 * Timer aufzieht. Beim Wechsel in einen laufenden Zustand wird sofort
 * übernommen, damit die erste Ansage nicht den alten Countdown zeigt.
 */
export function useGedaempfteZeit(
  now: number,
  aktiv: boolean,
  abstandMs = ZEIT_ANSAGE_MS,
): number {
  const [wert, setWert] = useState(now)
  const nowRef = useRef(now)
  nowRef.current = now

  useEffect(() => {
    setWert(nowRef.current)
    if (!aktiv) return
    const timer = window.setInterval(() => setWert(nowRef.current), abstandMs)
    return () => window.clearInterval(timer)
  }, [aktiv, abstandMs])

  return wert
}
