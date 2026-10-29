import { useRef, useState } from 'react'
import { haptic } from '../app/haptics'
import { useReducedMotion } from '../app/useReducedMotion'
import { elapsedMs, finishMs, laneStatus, lastSplit, lengthCount } from '../domain/lauf'
import { formatTime } from '../domain/format'
import type { Bahn, LaufKonfiguration } from '../domain/types'

const LANGDRUCK_MS = 450

const STATUS_LABEL = {
  bereit: 'bereit',
  geplant: 'geplant',
  laeuft: 'läuft',
  beendet: 'im Ziel',
} as const

interface LaneTileProps {
  bahn: Bahn
  konfiguration: LaufKonfiguration
  now: number
  schwimmerName: string | null
  onTap: (bahnId: string, now: number, wallNow: number) => void
  onUndo: (bahnId: string) => void
  onFinish: (bahnId: string, now: number, wallNow: number) => void
}

export function LaneTile({
  bahn,
  konfiguration,
  now,
  schwimmerName,
  onTap,
  onUndo,
  onFinish,
}: LaneTileProps) {
  const [gedrueckt, setGedrueckt] = useState(false)
  const pressRef = useRef<{ perf: number; wall: number; timer: number } | null>(null)

  const status = laneStatus(bahn)
  const gesamt = lengthCount(konfiguration)
  const zeit = status === 'beendet' ? (finishMs(bahn) ?? 0) : elapsedMs(bahn, now)
  const letzter = lastSplit(bahn)
  const kannRueckgaengig = status !== 'bereit'
  const reduzierteBewegung = useReducedMotion()

  const startPress = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Safari kann bei synthetischen oder bereits beendeten Zeigern werfen.
    }
    const perf = performance.now()
    const wall = Date.now()
    setGedrueckt(true)

    // Auf einer unberührten Bahn gibt es nichts rückgängig zu machen. Der
    // Timer bleibt aus, damit ein langer Druck dort keinen Leerlauf auslöst.
    const timer =
      status === 'bereit'
        ? 0
        : window.setTimeout(() => {
            pressRef.current = null
            setGedrueckt(false)
            haptic([16, 40, 16])
            onUndo(bahn.id)
          }, LANGDRUCK_MS)

    pressRef.current = { perf, wall, timer }
  }

  const endPress = () => {
    const press = pressRef.current
    if (!press) return
    window.clearTimeout(press.timer)
    pressRef.current = null
    setGedrueckt(false)
    haptic(8)
    onTap(bahn.id, press.perf, press.wall)
  }

  const cancelPress = () => {
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

  const abgeschlosseneLaengen = bahn.anschlaege.length

  return (
    <div
      role="button"
      tabIndex={0}
      data-anschlaege={bahn.anschlaege.length}
      data-status={status}
      aria-label={`Bahn ${bahn.nummer}${schwimmerName ? `, ${schwimmerName}` : ''}, ${STATUS_LABEL[status]}`}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerCancel={cancelPress}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        // Der "Ziel"-Knopf liegt in dieser Kachel. Ohne die Prüfung würde
        // Enter dort zusätzlich einen Anschlag auslösen.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          haptic(8)
          onTap(bahn.id, performance.now(), Date.now())
        }
      }}
      className={`relative flex select-none flex-col justify-between overflow-hidden rounded-2xl border-2 p-3 transition-[background-color,border-color,opacity] duration-75 ${
        gedrueckt ? 'brightness-105 opacity-80' : ''
      } ${rand}`}
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'none' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-md bg-surface2 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-muted">
          {bahn.nummer}
        </span>
        <span className="truncate text-[11px] font-medium text-muted">{schwimmerName ?? ''}</span>
      </div>

      <div
        className={`tabular text-center font-semibold leading-none ${zeitFarbe}`}
        style={{ fontSize: 'clamp(1.5rem, 7.6vw, 3.25rem)' }}
      >
        {formatTime(zeit)}
      </div>

      <div className="flex items-end justify-between gap-2 text-[11px] text-muted">
        <span className="tabular">
          {status === 'beendet'
            ? 'Ziel'
            : status === 'laeuft'
              ? gesamt
                ? `Länge ${Math.min(bahn.anschlaege.length + 1, gesamt)}/${gesamt}`
                : `Länge ${bahn.anschlaege.length + 1}`
              : 'Bereit'}
        </span>

        {status === 'laeuft' && gesamt === null ? (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={() => {
              haptic(8)
              onFinish(bahn.id, performance.now(), Date.now())
            }}
            className="-mb-1 rounded-lg bg-ok px-2.5 py-1 text-[10px] font-bold text-black"
          >
            Ziel
          </button>
        ) : (
          <span className="tabular">{letzter ? formatTime(letzter.splitMs) : ''}</span>
        )}
      </div>

      {/*
        Die Unterkante trägt genau eine Semantik: den Fortschritt über die
        Längen. Die Haltedauer liegt als eigener Statustext in der Fläche.
        Siehe #23 und #16.
      */}
      {gesamt !== null ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 flex h-1.5 gap-px px-1 pb-0.5"
        >
          {Array.from({ length: gesamt }, (_, index) => {
            const gefuellt = index < abgeschlosseneLaengen
            return (
              <span
                key={index}
                data-gefuellt={gefuellt ? 'true' : undefined}
                className={`flex-1 rounded-sm ${
                  gefuellt ? 'h-full bg-fg/70' : 'h-[2px] self-end bg-line'
                }`}
              />
            )
          })}
        </span>
      ) : null}

      {kannRueckgaengig && gedrueckt ? (
        <span
          data-haltend="true"
          className="pointer-events-none absolute inset-x-2 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1 rounded-lg bg-warn px-2 py-1.5 text-center text-[10px] font-bold text-black"
        >
          Halten: Anschlag zurücknehmen
          {reduzierteBewegung ? null : (
            <span aria-hidden="true" className="h-[3px] w-full overflow-hidden rounded-full bg-black/25">
              <span
                className="block h-full w-full origin-left bg-black"
                style={{
                  animation: `langdruck ${LANGDRUCK_MS}ms linear forwards`,
                }}
              />
            </span>
          )}
        </span>
      ) : null}
    </div>
  )
}
