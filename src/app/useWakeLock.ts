/**
 * Bildschirm anhalten, solange eine Messung läuft.
 *
 * Die Screen Wake Lock API ist optional und verlangt eine sichtbare Seite; im
 * Hintergrund löst der Browser die Sperre selbst. Der Hook fordert sie deshalb
 * bei jedem Zurückkehren in den Vordergrund neu an und gibt sie beim Unmount
 * frei. Der Rückgabewert ist eine Anzeige („Bildschirm bleibt an“), keine
 * Garantie — ohne API oder bei verweigerter Erlaubnis bleibt er `false`.
 */
import { useEffect, useState } from 'react'

/**
 * Hält den Bildschirm an, solange `aktiv` gilt. Gibt zurück, ob die Sperre greift.
 *
 * Lifecycle: Der Effekt läuft bei jeder Änderung von `aktiv`. Bei `false` wird
 * nichts angefordert und der Zustand zurückgesetzt. Beim Cleanup wird der Lauf
 * als abgebrochen markiert und eine vorhandene Sperre freigegeben; ein noch
 * laufender `request` gibt sein Ergebnis nach der Auflösung selbst frei.
 *
 * Randfälle: Fehlt `navigator.wakeLock`, wirft der Zugriff — das wird gefangen.
 * Der Browser kann die Sperre jederzeit selbst lösen (Tab im Hintergrund,
 * Energiesparmodus); das `release`-Ereignis setzt den Zustand dann auf `false`.
 */
export function useWakeLock(aktiv: boolean): boolean {
  const [aktiviert, setAktiviert] = useState(false)

  useEffect(() => {
    if (!aktiv) {
      setAktiviert(false)
      return
    }
    let abgebrochen = false
    // Verhindert parallele Anfragen: `wakeLock.request` ist asynchron, und
    // mehrere Sichtbarkeitswechsel kurz hintereinander würden sonst mehrere
    // Sentinels erzeugen, von denen nur der letzte freigegeben würde.
    let ausstehend = false
    let sentinel: WakeLockSentinel | null = null

    // `ersetzen` erzwingt eine neue Anfrage, obwohl bereits ein Sentinel
    // existiert (nach Rückkehr in den Vordergrund).
    const anfordern = async (ersetzen = false) => {
      // Mehrfache Sichtbarkeitswechsel dürfen keine zweite Sperre anfordern;
      // sonst ginge die erste Referenz verloren und würde nie freigegeben.
      if (abgebrochen || ausstehend) return
      if (sentinel && !ersetzen) return
      ausstehend = true
      try {
        if (sentinel) {
          // Nach dem Zurückkehren kann der Browser die alte Sperre bereits
          // gelöst haben; defensiv freigeben und neu anfordern.
          const alt = sentinel
          sentinel = null
          await alt.release().catch(() => undefined)
        }
        const neu = await navigator.wakeLock.request('screen')
        if (abgebrochen) {
          // Der Effekt wurde während der Anfrage abgebaut: Sperre nicht behalten.
          await neu.release().catch(() => undefined)
          return
        }
        sentinel = neu
        // Der Browser kann die Sperre selbst lösen; dann ist sie nicht mehr aktiv.
        neu.addEventListener('release', () => setAktiviert(false))
        setAktiviert(true)
      } catch {
        if (!abgebrochen) setAktiviert(false)
      } finally {
        ausstehend = false
      }
    }

    void anfordern()

    const beiSichtbarkeit = () => {
      // Nur beim Sichtbarwerden: im Hintergrund lehnt der Browser die Anfrage ab.
      if (document.visibilityState === 'visible') void anfordern(true)
    }
    document.addEventListener('visibilitychange', beiSichtbarkeit)

    return () => {
      // Reihenfolge: erst abbrechen, dann freigeben. So kann eine noch laufende
      // Anfrage nicht nachträglich einen Sentinel hinterlassen.
      abgebrochen = true
      document.removeEventListener('visibilitychange', beiSichtbarkeit)
      const zuLoesen = sentinel
      sentinel = null
      zuLoesen?.release().catch(() => undefined)
    }
  }, [aktiv])

  return aktiviert
}
