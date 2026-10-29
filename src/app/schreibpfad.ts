/**
 * Schreibpfad der App: Tab-Tor, Warteschlange, Wiederholung und Fehlerbanner.
 *
 * Nur der Tab, der die Messung hält, darf schreiben. Aktionen fragen deshalb
 * vor jedem Schreibvorgang `istAktiv()` ab. Gestartete Vorgänge werden
 * verfolgt, damit eine Tab-Übergabe auf sie warten kann, ohne den nächsten Tab
 * lesend zurückzulassen.
 *
 * Ein Schreibvorgang wird als Thunk übergeben, nicht als bereits gestartetes
 * Promise. Nur so lässt er sich nach einem vorübergehenden IndexedDB-Fehler
 * erneut ausführen; ein abgelehntes Promise lässt sich nicht wiederholen.
 *
 * Fehler werden gesammelt gemeldet: Ein Banner pro Sitzung statt einer Meldung
 * pro Tap. Vorübergehende Fehler werden mit kurzem Backoff wiederholt; erst
 * nach dem letzten Versuch oder bei einem dauerhaften Fehler bleibt das Banner
 * stehen. Ein späterer erfolgreicher Schreibvorgang nimmt es zurück.
 */
import { useCallback, useMemo, useRef, useState } from 'react'

/** Versuche inklusive Erstversuch. */
const STANDARD_VERSUCHE = 3
/** Wartezeit vor dem zweiten Versuch; sie verdoppelt sich je weiterem Versuch. */
const STANDARD_BACKOFF_MS = 50

/**
 * Fehler, bei denen eine Wiederholung nichts verbessern kann: Der Speicher ist
 * voll (`QuotaExceededError`), die Daten sind ungeeignet (`DataError`,
 * `DataCloneError`) oder die Datenbank passt nicht zur App (`VersionError`,
 * `NotFoundError`, `SecurityError`).
 */
const DAUERHAFTE_FEHLER = new Set([
  'QuotaExceededError',
  'DataError',
  'DataCloneError',
  'VersionError',
  'NotFoundError',
  'SecurityError',
])

export interface SchreibpfadOptionen {
  /** Gesamtzahl der Versuche, mindestens 1. Standard: 3. */
  versuche?: number
  /** Start-Backoff in Millisekunden. Standard: 50. */
  backoffMs?: number
}

export interface Schreibpfad {
  /** Wahr, solange dieser Tab die Messung hält und schreiben darf. */
  istAktiv: () => boolean
  /** Öffnet oder schließt das Tor; die Wahrheit hält der Tab-Koordinator. */
  setzeAktiv: (aktiv: boolean) => void
  /**
   * Führt einen Schreibvorgang aus und verfolgt ihn bis zum Abschluss.
   * Vorübergehende Fehler werden erneut versucht; das zurückgegebene Promise
   * lehnt erst nach dem letzten Versuch ab. Ein Erfolg nimmt das Banner zurück.
   */
  verfolge: <T>(vorgang: () => Promise<T>) => Promise<T>
  /**
   * Schließt das Tor und wartet, bis alle offenen Vorgänge abgeschlossen sind —
   * auch laufende Wiederholungen. Scheiternde Vorgänge blockieren nicht.
   */
  warteAufOffene: () => Promise<void>
  /** Wahr, sobald Laden oder Schreiben im lokalen Speicher gescheitert ist. */
  speicherFehler: boolean
  /** Meldet einen Speicherfehler; wiederholte Aufrufe ändern das Banner nicht. */
  meldeFehler: () => void
}

/**
 * Ein Fehler gilt als dauerhaft, wenn er kein IndexedDB-Fehler ist oder zu den
 * bekannten Endzuständen zählt. Validierungsfehler aus dem Repository sind
 * gewöhnliche `Error` und werden deshalb nicht wiederholt.
 */
function istDauerhafterFehler(fehler: unknown): boolean {
  if (!(fehler instanceof DOMException)) return true
  return DAUERHAFTE_FEHLER.has(fehler.name)
}

function warte(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Führt den Vorgang bis zu `versuche`-mal aus. Zwischen den Versuchen wächst
 * die Wartezeit exponentiell; dauerhafte Fehler brechen sofort ab.
 */
async function wiederhole<T>(
  vorgang: () => Promise<T>,
  versuche: number,
  backoffMs: number,
): Promise<T> {
  let letzterFehler: unknown
  for (let versuch = 1; versuch <= versuche; versuch += 1) {
    try {
      return await vorgang()
    } catch (fehler) {
      letzterFehler = fehler
      if (versuch >= versuche || istDauerhafterFehler(fehler)) break
      const pause = backoffMs * 2 ** (versuch - 1)
      if (pause > 0) await warte(pause)
    }
  }
  throw letzterFehler
}

export function useSchreibpfad(optionen: SchreibpfadOptionen = {}): Schreibpfad {
  const versuche = Math.max(1, Math.floor(optionen.versuche ?? STANDARD_VERSUCHE))
  const backoffMs = Math.max(0, optionen.backoffMs ?? STANDARD_BACKOFF_MS)
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

  /** Ein erfolgreicher Schreibvorgang beweist, dass der Speicher wieder geht. */
  const meldeErfolg = useCallback(() => {
    if (!fehlerRef.current) return
    fehlerRef.current = false
    setSpeicherFehler(false)
  }, [])

  /**
   * Der Eintrag wird in jedem Fall entfernt, damit die Menge nicht wächst.
   * Verfolgt wird die ganze Wiederholungskette, nicht nur der Erstversuch:
   * `warteAufOffene` muss auch eine noch laufende Wiederholung abwarten.
   * Die Handler verhindern ein unbehandeltes Promise; `.finally` läuft auch
   * nach einer Ablehnung.
   */
  const verfolge = useCallback(
    <T,>(vorgang: () => Promise<T>): Promise<T> => {
      const kette = wiederhole(vorgang, versuche, backoffMs)
      offeneRef.current.add(kette)
      kette
        .then(
          () => meldeErfolg(),
          () => meldeFehler(),
        )
        .finally(() => offeneRef.current.delete(kette))
      return kette
    },
    [backoffMs, meldeErfolg, meldeFehler, versuche],
  )

  /**
   * Erst das Tor schließen, dann leeren: Sonst könnte ein Tap während des
   * Wartens noch einen Vorgang starten, der nicht mehr im Snapshot liegt und
   * beim Wechsel verloren ginge. Durch das geschlossene Tor ist die Schleife
   * endlich.
   *
   * `allSettled` ist bewusst gewählt: Ein fehlgeschlagener Schreibvorgang darf
   * eine Tab-Übergabe nicht blockieren, sonst bliebe der neue Tab lesend. Die
   * Wiederholungskette selbst ist ein einzelner Eintrag und wird deshalb
   * vollständig abgewartet, bevor die Übergabe fortfährt.
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
