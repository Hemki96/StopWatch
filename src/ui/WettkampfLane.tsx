/**
 * Bahnkachel im Wettkampfmodus.
 *
 * Der Tap nach dem Start ist sofort das Ziel; Längen-Splits gibt es hier
 * bewusst nicht. Langes Drücken nimmt den letzten Anschlag zurück, der Stift
 * öffnet ein Sheet für eine manuelle oder korrigierte Zielzeit. Die Anzeige
 * rechnet mit `laneStatusAt`, `elapsedMs` und `finishMs` aus domain/lauf;
 * Platz und Rückstand liefert der Screen aus domain/wettkampf.
 */
import { useRef, useState } from 'react'
import { haptic } from '../app/haptics'
import { useReducedMotion } from '../app/useReducedMotion'
import { elapsedMs, finishMs, laneStatusAt } from '../domain/lauf'
import { formatDelta, formatTime } from '../domain/format'
import type { Bahn } from '../domain/types'
import { PencilIcon } from './icons'

// Haltezeit für das Zurücknehmen; kurz genug, um nicht wie ein normaler Tap zu
// wirken, lang genug gegen versehentliches Auslösen beim Wischen.
const LANGDRUCK_MS = 450

// Statuswerte aus domain/lauf in Anzeigetexten.
const STATUS_LABEL = {
  bereit: 'bereit',
  geplant: 'wartet',
  laeuft: 'läuft',
  beendet: 'im Ziel',
} as const

interface WettkampfLaneProps {
  bahn: Bahn
  /** Anzeigename; `null` heißt „Ohne Namen“. */
  name: string | null
  /** Monotone Zeit für die laufende Anzeige. */
  now: number
  /** Platz im Heat, sobald eine Zielzeit vorliegt. */
  platz: number | null
  /** Rückstand auf den Sieger in ms; `null` bei offener Bahn. */
  rueckstandMs: number | null
  /** Zielzeit wurde von Hand eingetragen oder korrigiert. */
  manuell: boolean
  /** Tap: Zielanschlag mit monotoner und Wandzeit. */
  onTap: (bahnId: string, now: number, wallNow: number) => void
  /** Langes Drücken: letzten Anschlag zurücknehmen. */
  onUndo: (bahnId: string) => void
  /** Stift: Zeit-Sheet für diese Bahn öffnen. */
  onZeit: (bahn: Bahn) => void
}

/**
 * Eine Bahn im Wettkampf. Anders als im Training ist der Tap nach dem Start
 * sofort das Ziel; es gibt keine Längen-Fortschrittslinie. Die Zielzeit lässt
 * sich zusätzlich per Stift von Hand eintragen oder korrigieren.
 *
 * Der Tap wird über Pointer-Ereignisse verarbeitet, damit die Zeit beim
 * Drücken und nicht erst beim Loslassen entsteht. Ein reiner Klick ohne
 * Pointer-/Tastaturereignis kommt von Screenreadern und wird ebenfalls als
 * Ziel gewertet.
 */
export function WettkampfLane({
  bahn,
  name,
  now,
  platz,
  rueckstandMs,
  manuell,
  onTap,
  onUndo,
  onZeit,
}: WettkampfLaneProps) {
  const [gedrueckt, setGedrueckt] = useState(false)
  // Zeitpunkt und Timer des laufenden Drucks; `perf` ist die Messzeit, `wall`
  // die Wanduhr für die spätere Datumszuordnung.
  const pressRef = useRef<{ perf: number; wall: number; timer: number } | null>(null)
  // Siehe LaneTile: ein reiner Klick ohne vorherige Eingabe kommt von
  // VoiceOver/TalkBack; Pointer- und Tastaturklicks sind bereits verarbeitet.
  const klickRef = useRef(false)
  const reduzierteBewegung = useReducedMotion()

  /** Markiert den Klick für den laufenden Task, damit `onClick` ihn ignoriert. */
  const merkeKlick = () => {
    klickRef.current = true
    window.setTimeout(() => {
      klickRef.current = false
    }, 0)
  }

  const status = laneStatusAt(bahn, now)
  // Fertige Bahnen zeigen die Zielzeit, laufende die verstrichene Zeit; vor
  // dem Start bleibt die Anzeige leer („—“).
  const zeit =
    status === 'beendet'
      ? (finishMs(bahn) ?? 0)
      : status === 'laeuft'
        ? elapsedMs(bahn, now)
        : 0
  // Nur eine gestartete oder beendete Bahn hat etwas zum Zurücknehmen.
  const kannRueckgaengig = status !== 'bereit'

  /**
   * Beginn des Drucks: Zeitpunkt sofort festhalten und bei rücknehmbarer Bahn
   * einen Timer für den Langdruck stellen. `setPointerCapture` sorgt dafür,
   * dass das Loslassen auch außerhalb der Kachel ankommt.
   */
  const startPress = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    klickRef.current = false
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Safari kann bei synthetischen oder bereits beendeten Zeigern werfen.
    }
    setGedrueckt(true)
    const timer = kannRueckgaengig
      ? window.setTimeout(() => {
          pressRef.current = null
          setGedrueckt(false)
          haptic([16, 40, 16])
          onUndo(bahn.id)
        }, LANGDRUCK_MS)
      : 0
    pressRef.current = { perf: performance.now(), wall: Date.now(), timer }
  }

  /** Loslassen vor Ablauf des Langdrucks: normaler Zielanschlag. */
  const endPress = () => {
    merkeKlick()
    const press = pressRef.current
    if (!press) return
    window.clearTimeout(press.timer)
    pressRef.current = null
    setGedrueckt(false)
    haptic(8)
    onTap(bahn.id, press.perf, press.wall)
  }

  /** Abbruch (Wischen, Zeiger verloren): weder Ziel noch Rücknahme. */
  const cancelPress = () => {
    merkeKlick()
    const press = pressRef.current
    if (!press) return
    window.clearTimeout(press.timer)
    pressRef.current = null
    setGedrueckt(false)
  }

  // Farbe und Rand spiegeln nur den Zustand; die Bedeutung steht zusätzlich
  // als Text in der Kachel, damit Farbe nicht allein trägt.
  const rand =
    status === 'laeuft'
      ? 'border-accent/70 bg-accent/10'
      : status === 'beendet'
        ? 'border-ok/50 bg-ok/10'
        : 'border-line bg-surface'
  const zeitFarbe =
    status === 'laeuft' ? 'text-accent' : status === 'beendet' ? 'text-ok' : 'text-muted'

  // Vorlesetext: Bahn, Name, Status und ggf. Platz in einem Satz.
  const aria = [
    `Bahn ${bahn.nummer}`,
    name ?? 'ohne Namen',
    STATUS_LABEL[status],
    platz !== null ? `${platz}. Platz` : null,
  ]
    .filter((teil): teil is string => teil !== null)
    .join(', ')

  return (
    <div
      role="button"
      tabIndex={0}
      data-status={status}
      data-platz={platz ?? undefined}
      aria-label={aria}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerCancel={cancelPress}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => {
        // Stift-Knopf und Halte-Overlay liegen in der Kachel. Nur ein Klick
        // direkt auf die Fläche zählt; Pointer-Klicks wurden schon oben
        // verarbeitet und werden über `klickRef` übersprungen.
        if (event.target !== event.currentTarget) return
        if (klickRef.current) return
        haptic(8)
        onTap(bahn.id, performance.now(), Date.now())
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        // Tastatur löst denselben Zielanschlag aus; die Zeit entsteht hier,
        // nicht beim vorherigen Fokus.
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          merkeKlick()
          haptic(8)
          onTap(bahn.id, performance.now(), Date.now())
        }
      }}
      className={`relative flex select-none items-center gap-3 overflow-hidden rounded-2xl border-2 p-3 transition-[background-color,border-color,opacity] duration-75 ${
        gedrueckt ? 'brightness-105 opacity-80' : ''
      } ${rand}`}
      // Die Liste ist scrollbar; `pan-y` erlaubt Wischen, ohne den Tap zu verlieren.
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'pan-y' }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface2 text-sm font-bold text-muted">
          {bahn.nummer}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name ?? 'Ohne Namen'}</p>
          <p className="text-[11px] text-muted">
            {/* Statuszeile: offene Bahnen zeigen „Bereit“, laufende „läuft“,
                beendete Platz und Rückstand. „manuell“ markiert korrigierte
                Zielzeiten. */}
            {status === 'bereit'
              ? 'Bereit'
              : status === 'laeuft'
                ? 'läuft'
                : platz !== null
                  ? `${platz}. Platz${rueckstandMs && rueckstandMs > 0 ? ` · ${formatDelta(rueckstandMs)}` : ''}`
                  : 'im Ziel'}
            {manuell ? ' · manuell' : ''}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <span
          className={`tabular min-w-[5.2rem] text-right text-2xl font-semibold leading-none ${zeitFarbe}`}
        >
          {status === 'bereit' ? '—' : formatTime(zeit)}
        </span>
        <button
          type="button"
          // Die Kachel behandelt Pointer selbst; der Stift darf keinen
          // zusätzlichen Zielanschlag auslösen.
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onZeit(bahn)
          }}
          aria-label={`Zeit für ${name ?? `Bahn ${bahn.nummer}`} eingeben`}
          className="grid h-9 w-9 place-items-center rounded-lg text-muted"
        >
          <PencilIcon className="h-4 w-4" />
        </button>
      </div>

      {kannRueckgaengig && gedrueckt ? (
        // Overlay während des Haltens; der Fortschrittsbalken läuft genau so
        // lange wie der Langdruck-Timer. Bei reduzierter Bewegung entfällt er.
        <span
          data-haltend="true"
          className="pointer-events-none absolute inset-x-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1 rounded-lg bg-warn px-2 py-1.5 text-center text-[10px] font-bold text-black"
        >
          Halten: letzte Aktion zurücknehmen
          {reduzierteBewegung ? null : (
            <span aria-hidden="true" className="h-[3px] w-full overflow-hidden rounded-full bg-black/25">
              <span
                className="block h-full w-full origin-left bg-black"
                style={{ animation: `langdruck ${LANGDRUCK_MS}ms linear forwards` }}
              />
            </span>
          )}
        </span>
      ) : null}
    </div>
  )
}
