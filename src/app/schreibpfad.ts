/**
 * Schreibpfad der App: Tab-Tor, Warteschlange und Fehlerbanner.
 *
 * Nur der Tab, der die Messung hält, darf schreiben. Aktionen fragen deshalb
 * vor jedem Schreibvorgang `istAktiv()` ab. Gestartete Vorgänge werden
 * verfolgt, damit eine Tab-Übergabe auf sie warten kann, ohne den nächsten Tab
 * lesend zurückzulassen.
 *
 * Fehler werden gesammelt gemeldet: Ein Banner pro Sitzung statt einer Meldung
 * pro Tap. Das Banner bleibt stehen; es ist ein Hinweis auf einen dauerhaften
 * Speicherfehler, keine Quittung.
 */
import { useCallback, useMemo, useRef, useState } from 'react'

export interface Schreibpfad {
  /** Wahr, solange dieser Tab die Messung hält und schreiben darf. */
  istAktiv: () => boolean
  /** Öffnet oder schließt das Tor; die Wahrheit hält der Tab-Koordinator. */
  setzeAktiv: (aktiv: boolean) => void
  /**
   * Verfolgt einen Schreibvorgang bis zum Abschluss. Fehler landen im Banner;
   * der Aufrufer sieht die Ablehnung des zurückgegebenen Promises weiterhin.
   */
  verfolge: <T>(vorgang: Promise<T>) => Promise<T>
  /**
   * Schließt das Tor und wartet, bis alle offenen Vorgänge abgeschlossen sind.
   * Scheiternde Vorgänge blockieren nicht.
   */
  warteAufOffene: () => Promise<void>
  /** Wahr, sobald Laden oder Schreiben im lokalen Speicher gescheitert ist. */
  speicherFehler: boolean
  /** Meldet einen Speicherfehler; wiederholte Aufrufe ändern das Banner nicht. */
  meldeFehler: () => void
}

export function useSchreibpfad(): Schreibpfad {
  const [speicherFehler, setSpeicherFehler] = useState(false)
  // Spiegelt das Banner für Aktionen, die zwischen zwei Renders laufen.
  const fehlerRef = useRef(false)
  // Spiegelt die Tab-Rolle für Aktionen. Die Wahrheit hält der Koordinator.
  const aktivRef = useRef(false)
  // Offene Schreibvorgänge, damit eine Tab-Übergabe auf sie warten kann.
  const offeneRef = useRef(new Set<Promise<unknown>>())

  const meldeFehler = useCallback(() => {
    console.error('Speichern im lokalen Speicher fehlgeschlagen.')
    if (fehlerRef.current) return
    fehlerRef.current = true
    setSpeicherFehler(true)
  }, [])

  /**
   * Der Eintrag wird in jedem Fall entfernt, damit die Menge nicht wächst.
   * Das `.catch` verhindert ein unbehandeltes Promise; `.finally` läuft auch
   * nach einer Ablehnung.
   */
  const verfolge = useCallback(
    <T,>(vorgang: Promise<T>): Promise<T> => {
      offeneRef.current.add(vorgang)
      vorgang
        .catch(() => meldeFehler())
        .finally(() => offeneRef.current.delete(vorgang))
      return vorgang
    },
    [meldeFehler],
  )

  /**
   * Erst das Tor schließen, dann leeren: Sonst könnte ein Tap während des
   * Wartens noch einen Vorgang starten, der nicht mehr im Snapshot liegt und
   * beim Wechsel verloren ginge. Durch das geschlossene Tor ist die Schleife
   * endlich.
   *
   * `allSettled` ist bewusst gewählt: Ein fehlgeschlagener Schreibvorgang darf
   * eine Tab-Übergabe nicht blockieren, sonst bliebe der neue Tab lesend.
   */
  const warteAufOffene = useCallback(async () => {
    aktivRef.current = false
    while (offeneRef.current.size > 0) {
      await Promise.allSettled([...offeneRef.current])
    }
  }, [])

  const istAktiv = useCallback(() => aktivRef.current, [])

  const setzeAktiv = useCallback((aktiv: boolean) => {
    aktivRef.current = aktiv
  }, [])

  return useMemo(
    () => ({
      istAktiv,
      setzeAktiv,
      verfolge,
      warteAufOffene,
      speicherFehler,
      meldeFehler,
    }),
    [istAktiv, setzeAktiv, verfolge, warteAufOffene, speicherFehler, meldeFehler],
  )
}
