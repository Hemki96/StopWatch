/**
 * Kachel einer einzelnen Bahn im Timer.
 *
 * Zeigt Status, Zeit und Längenfortschritt genau einer Bahn. Ein kurzer Tap
 * setzt den Anschlag, langes Drücken nimmt die letzte Aktion zurück, der
 * eingebettete „Ziel“-Knopf beendet eine Bahn auf offener Strecke. Die Kachel
 * rechnet nicht selbst: Status und Zeiten kommen aus domain/lauf, die Aktionen
 * reicht TimerScreen aus app/AppProvider herein. Die Reihe steht im Vorlesetext;
 * sichtbar wird sie durch den Abschnitt im Timer.
 */
import { useRef, useState } from 'react'
import { haptic } from '../app/haptics'
import { useReducedMotion } from '../app/useReducedMotion'
import { elapsedMs, finishMs, laneStatusAt, lastSplit, lengthCount } from '../domain/lauf'
import { formatCountdown, formatTime } from '../domain/format'
import type { Bahn, LaufKonfiguration } from '../domain/types'

/** Haltedauer in Millisekunden, ab der ein Druck als „zurücknehmen“ gilt. */
const LANGDRUCK_MS = 450

/**
 * Statuswörter für die Screenreader-Beschriftung. Die Farbe der Kachel allein
 * wäre für sehbeeinträchtigte Nutzer nicht lesbar.
 */
const STATUS_LABEL = {
  bereit: 'bereit',
  geplant: 'geplant',
  laeuft: 'läuft',
  beendet: 'im Ziel',
} as const

/** Eine Bahn mit ihrer Konfiguration sowie den Aktionen aus dem App-Kontext. */
interface LaneTileProps {
  bahn: Bahn
  konfiguration: LaufKonfiguration
  /** Monotone Zeit aus `useNow`; treibt Countdown und laufende Zeit. */
  now: number
  schwimmerName: string | null
  /** Kurzer Tap: Anschlag erfassen beziehungsweise Bahn starten. */
  onTap: (bahnId: string, now: number, wallNow: number) => void
  /** Langes Drücken: letzten Anschlag oder Start zurücknehmen. */
  onUndo: (bahnId: string) => void
  /** „Ziel“-Knopf für offene Strecken; bei fester Strecke nicht nötig. */
  onFinish: (bahnId: string, now: number, wallNow: number) => void
}

/**
 * Bedienfläche einer Bahn: Ein Tap ist der Anschlag, langes Drücken nimmt ihn
 * zurück. Enter und Leertaste lösen dieselbe Aktion aus, damit die Kachel auch
 * mit Tastatur und Screenreader bedienbar bleibt.
 */
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
  /** Beginn des laufenden Drucks samt Zeitstempeln und Undo-Timer. */
  const pressRef = useRef<{ perf: number; wall: number; timer: number } | null>(null)
  // Klicks, die aus Pointer- oder Tastaturbedienung entstehen, sind bereits
  // verarbeitet. Ein Klick ohne vorherige Eingabe kommt von VoiceOver/TalkBack.
  const klickRef = useRef(false)

  const merkeKlick = () => {
    klickRef.current = true
    window.setTimeout(() => {
      klickRef.current = false
    }, 0)
  }

  // Der Status hängt von `now` ab: Eine Bahn mit Startzeit in der Zukunft ist
  // „geplant“ und nimmt noch keine Anschläge an.
  const status = laneStatusAt(bahn, now)
  // Anzahl der Längen der Strecke; `null` bedeutet offene Strecke.
  const gesamt = lengthCount(konfiguration)
  // Große Zahl der Kachel: Zielzeit, Countdown bis zum Start oder laufende
  // Zeit. Der Countdown wird bei 0 gekappt, damit er nicht negativ läuft.
  const zeit =
    status === 'beendet'
      ? (finishMs(bahn) ?? 0)
      : status === 'geplant'
        ? Math.max(0, (bahn.startMs ?? now) - now)
        : elapsedMs(bahn, now)
  // Letzter Anschlag für die kleine Zeile unten rechts.
  const letzter = lastSplit(bahn)
  // Auf einer unberührten Bahn gibt es nichts zurückzunehmen; dort bleibt auch
  // der Undo-Timer aus (siehe startPress).
  const kannRueckgaengig = status !== 'bereit'
  // Bei reduzierter Bewegung entfällt nur die Animation des Haltebalkens.
  const reduzierteBewegung = useReducedMotion()

  const startPress = (event: React.PointerEvent<HTMLDivElement>) => {
    // Rechts- und Mittelklick sind keine Bedienhandlung am Beckenrand.
    if (event.pointerType === 'mouse' && event.button !== 0) return
    klickRef.current = false
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
    // Der gleich folgende Klick gehört zu diesem Druck und darf nicht ein
    // zweites Mal als Anschlag zählen.
    merkeKlick()
    const press = pressRef.current
    if (!press) return
    window.clearTimeout(press.timer)
    pressRef.current = null
    setGedrueckt(false)
    // Eine geplante Bahn startet zu ihrem festen Zeitpunkt; ein kurzer Tap
    // darf den Countdown nicht vorziehen.
    if (status === 'geplant') return
    haptic(8)
    onTap(bahn.id, press.perf, press.wall)
  }

  const cancelPress = () => {
    // Ein abgebrochener Druck erzeugt unter Umständen trotzdem einen Klick.
    merkeKlick()
    const press = pressRef.current
    if (!press) return
    window.clearTimeout(press.timer)
    pressRef.current = null
    setGedrueckt(false)
  }

  // Farbe und Rahmen spiegeln den Status, damit Fläche und Zeit dieselbe
  // Semantik tragen: Akzent = läuft, grün = im Ziel, gelb = geplanter Start,
  // neutral = bereit.
  const rand =
    status === 'laeuft'
      ? 'border-accent/70 bg-accent/10'
      : status === 'beendet'
        ? 'border-ok/50 bg-ok/10'
        : status === 'geplant'
          ? 'border-warn/60 bg-warn/10'
          : 'border-line bg-surface'

  const zeitFarbe =
    status === 'laeuft'
      ? 'text-accent'
      : status === 'beendet'
        ? 'text-ok'
        : status === 'geplant'
          ? 'text-warn'
          : 'text-muted'

  // Gefüllte Segmente der Fortschrittsleiste: eines pro erfasstem Anschlag.
  const abgeschlosseneLaengen = bahn.anschlaege.length

  // Die Kachel ist ein Knopf, weil Tap, Enter und Leertaste dieselbe Aktion
  // auslösen. Das `aria-label` nennt Bahn, Namen und Status, weil Farbe und
  // Zahl allein den Zustand nicht vermitteln.
  return (
    <div
      role="button"
      tabIndex={0}
      data-anschlaege={bahn.anschlaege.length}
      data-status={status}
      aria-label={`Reihe ${bahn.reihe}, Bahn ${bahn.nummer}${schwimmerName ? `, ${schwimmerName}` : ''}, ${STATUS_LABEL[status]}`}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerCancel={cancelPress}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        // Ein Klick auf den eingebetteten "Ziel"-Knopf gehört nicht der Kachel.
        if (e.target !== e.currentTarget) return
        if (klickRef.current) return
        if (status === 'geplant') return
        haptic(8)
        onTap(bahn.id, performance.now(), Date.now())
      }}
      onKeyDown={(e) => {
        // Der "Ziel"-Knopf liegt in dieser Kachel. Ohne die Prüfung würde
        // Enter dort zusätzlich einen Anschlag auslösen.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (status === 'geplant') return
          merkeKlick()
          haptic(8)
          onTap(bahn.id, performance.now(), Date.now())
        }
      }}
      className={`relative flex min-h-[7.5rem] select-none flex-col justify-between overflow-hidden rounded-2xl border-2 p-3 transition-[background-color,border-color,opacity] duration-75 rail:rounded-3xl rail:p-4 ${
        gedrueckt ? 'brightness-105 opacity-80' : ''
      } ${rand}`}
      // `pan-y` lässt die Seite scrollen, verhindert aber Doppeltipp-Zoom.
      // `none` würde auf kleinen Displays auch das Scrollen blockieren.
      // Die Container-Abfrage lässt die Zeit mit der Kachel statt mit dem
      // Viewport wachsen; so bleibt sie bei zehn Bahnen auf dem Tablet lesbar.
      style={{
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'pan-y',
        containerType: 'inline-size',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-md bg-surface2 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-muted">
          {bahn.nummer}
        </span>
        <span className="truncate text-[11px] font-medium text-muted">{schwimmerName ?? ''}</span>
      </div>

      {/* `clamp` hält die Zeit groß genug für den Blick aus einigen Metern,
          ohne die Kachel auf schmalen Displays zu sprengen. */}
      <div
        className={`tabular whitespace-nowrap text-center font-semibold leading-none ${zeitFarbe}`}
        style={{ fontSize: 'clamp(1.35rem, 15cqw, 3.25rem)' }}
      >
        {status === 'geplant' ? formatCountdown(zeit) : formatTime(zeit)}
      </div>

      {/* Untere Zeile: links der Fortschritt, rechts entweder der Zielknopf
          (nur offene Strecke) oder die letzte Zwischenzeit. */}
      <div className="flex items-end justify-between gap-2 text-[11px] text-muted">
        <span className="tabular">
          {status === 'beendet'
            ? 'Ziel'
            : status === 'geplant'
              ? 'Start in'
              : status === 'laeuft'
                ? gesamt
                  ? `Länge ${Math.min(bahn.anschlaege.length + 1, gesamt)}/${gesamt}`
                  : `Länge ${bahn.anschlaege.length + 1}`
                : 'Bereit'}
        </span>

        {/* Nur bei offener Strecke braucht es einen eigenen Zielknopf; bei
            fester Strecke ist der letzte Anschlag automatisch das Ziel. Der
            Knopf stoppt Pointer- und Klickweitergabe, sonst würde das Ziel
            zusätzlich als Anschlag auf der Kachel landen. */}
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
          <span className="tabular">
            {status === 'geplant' ? 'wartet' : letzter ? formatTime(letzter.splitMs) : ''}
          </span>
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

      {/* Das Overlay erscheint erst ab dem Drücken und nennt die Wirkung,
          damit langes Drücken nicht als einfacher Anschlag missverstanden wird. */}
      {kannRueckgaengig && gedrueckt ? (
        <span
          data-haltend="true"
          className="pointer-events-none absolute inset-x-2 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1 rounded-lg bg-warn px-2 py-1.5 text-center text-[10px] font-bold text-black"
        >
          {status === 'geplant' ? 'Halten: Start abbrechen' : 'Halten: Anschlag zurücknehmen'}
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
