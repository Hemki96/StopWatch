/**
 * Monotone Zeit für die Anzeige.
 *
 * Liefert den zuletzt abgetasteten `performance.now()`-Wert und aktualisiert ihn
 * pro Animationsframe, aber nur solange `aktiv` gilt. `performance.now()` ist
 * monoton und unabhängig von der Systemuhr; dafür ist der Wert nach einem
 * Reload wertlos — deshalb werden laufende Bahnen beim Laden zurückgesetzt.
 *
 * `requestAnimationFrame` statt `setInterval`: Der Browser drosselt oder
 * pausiert es im Hintergrund, was hier richtig ist (nichts zu sehen). Beim
 * Zurückkehren wird sofort neu abgetastet, sodass die aus Zeitstempeln
 * rekonstruierte Zeit trotz Pause stimmt.
 */
import { useEffect, useState } from 'react'

/**
 * Anzeigeabstand in Millisekunden. 30 fps reichen für eine gut lesbare
 * Hundertstel-Anzeige und halbieren die Renderarbeit gegenüber 60 fps. Die
 * Messung selbst ist davon nicht betroffen: Ein Tap liest `performance.now()`
 * direkt, nicht den zuletzt gerenderten Wert.
 */
const ANZEIGE_ABSTAND_MS = 1000 / 30

/**
 * Laufend aktualisierte monotone Zeit, aber nur solange `aktiv` gilt.
 *
 * Bei `aktiv === false` wird kein Frame angefordert und der letzte Wert
 * eingefroren. Der Cleanup bricht den laufenden Frame ab; der Tick plant immer
 * genau einen nächsten Frame, damit nie mehrere Schleifen parallel laufen.
 */
export function useNow(aktiv: boolean): number {
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    if (!aktiv) return
    let frame = 0
    let letzterTick = Number.NEGATIVE_INFINITY
    const tick = (zeit: number) => {
      if (zeit - letzterTick >= ANZEIGE_ABSTAND_MS) {
        letzterTick = zeit
        setNow(performance.now())
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [aktiv])

  return now
}
