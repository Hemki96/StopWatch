import { useRef, useState } from 'react'
import { haptic } from '../app/haptics'
import { elapsedMs, finishMs, laneStatus, lastSplit, lengthCount } from '../domain/lauf'
import { formatTime } from '../domain/format'
import type { Bahn, LaufKonfiguration } from '../domain/types'

const LANGDRUCK_MS = 450

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
    const timer = window.setTimeout(() => {
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

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Bahn ${bahn.nummer}${schwimmerName ? `, ${schwimmerName}` : ''}, ${status}`}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerCancel={cancelPress}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          haptic(8)
          onTap(bahn.id, performance.now(), Date.now())
        }
      }}
      className={`relative flex select-none flex-col justify-between overflow-hidden rounded-2xl border-2 p-3 transition-[transform,background-color,border-color] duration-75 ${
        gedrueckt ? 'scale-[0.97] brightness-110' : ''
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
    </div>
  )
}
