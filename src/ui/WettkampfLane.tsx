import { useRef, useState } from 'react'
import { haptic } from '../app/haptics'
import { useReducedMotion } from '../app/useReducedMotion'
import { elapsedMs, finishMs, laneStatusAt } from '../domain/lauf'
import { formatDelta, formatTime } from '../domain/format'
import type { Bahn } from '../domain/types'
import { PencilIcon } from './icons'

const LANGDRUCK_MS = 450

const STATUS_LABEL = {
  bereit: 'bereit',
  geplant: 'wartet',
  laeuft: 'läuft',
  beendet: 'im Ziel',
} as const

interface WettkampfLaneProps {
  bahn: Bahn
  name: string | null
  now: number
  platz: number | null
  rueckstandMs: number | null
  manuell: boolean
  onTap: (bahnId: string, now: number, wallNow: number) => void
  onUndo: (bahnId: string) => void
  onZeit: (bahn: Bahn) => void
}

/**
 * Eine Bahn im Wettkampf. Anders als im Training ist der Tap nach dem Start
 * sofort das Ziel; es gibt keine Längen-Fortschrittslinie. Die Zielzeit lässt
 * sich zusätzlich per Stift von Hand eintragen oder korrigieren.
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
  const pressRef = useRef<{ perf: number; wall: number; timer: number } | null>(null)
  // Siehe LaneTile: ein reiner Klick ohne vorherige Eingabe kommt von
  // VoiceOver/TalkBack; Pointer- und Tastaturklicks sind bereits verarbeitet.
  const klickRef = useRef(false)
  const reduzierteBewegung = useReducedMotion()

  const merkeKlick = () => {
    klickRef.current = true
    window.setTimeout(() => {
      klickRef.current = false
    }, 0)
  }

  const status = laneStatusAt(bahn, now)
  const zeit =
    status === 'beendet'
      ? (finishMs(bahn) ?? 0)
      : status === 'laeuft'
        ? elapsedMs(bahn, now)
        : 0
  const kannRueckgaengig = status !== 'bereit'

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

  const cancelPress = () => {
    merkeKlick()
    const press = pressRef.current
    if (!press) return
    window.clearTimeout(press.timer)
    pressRef.current = null
    setGedrueckt(false)
  }

  const rand =
    status === 'laeuft'
      ? 'border-accent/70 bg-accent/10'
      : status === 'beendet'
        ? 'border-ok/50 bg-ok/10'
        : 'border-line bg-surface'
  const zeitFarbe =
    status === 'laeuft' ? 'text-accent' : status === 'beendet' ? 'text-ok' : 'text-muted'

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
        // Stift-Knopf und Halte-Overlay liegen in der Kachel.
        if (event.target !== event.currentTarget) return
        if (klickRef.current) return
        haptic(8)
        onTap(bahn.id, performance.now(), Date.now())
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
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
