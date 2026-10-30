/**
 * Kachel einer einzelnen Bahn im Timer.
 *
 * Zeigt Status, Zeit und Längenfortschritt genau einer Bahn. Ein kurzer Tap
 * setzt den Anschlag, langes Drücken nimmt die letzte Aktion zurück. Auf
 * offener Strecke beendet der „Ziel“-Knopf die Bahn; er ist eine eigene Fläche
 * unter der Messfläche, damit ein Fehltipp auf der Kachel nicht das Ziel
 * auslöst (#60). Die Kachel rechnet nicht selbst: Status und Zeiten kommen aus
 * domain/lauf, die Aktionen reicht TimerScreen aus app/AppProvider herein. Die
 * Reihe steht im Vorlesetext; sichtbar wird sie durch den Abschnitt im Timer.
 */
import { useEffect, useRef, useState } from 'react'
import { haptic } from '../app/haptics'
import { useReducedMotion } from '../app/useReducedMotion'
import {
  elapsedMs,
  eingestellteZwischenzeiten,
  finishMs,
  laneStatusAt,
  lastSplit,
  zwischenzeiten,
  zwischenzeitenGesamt,
} from '../domain/lauf'
import { formatCountdown, formatTime, formatZwischenzeiten } from '../domain/format'
import type { Bahn, LaufKonfiguration } from '../domain/types'
import { useGedaempfteZeit } from './useGedaempfteZeit'

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
  /** Ersatzbezeichnung ohne Schwimmer, z. B. „Lauf 1, Bahn 2“. */
  ersatzName: string
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
  ersatzName,
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

  // Beim Unmount (Tab-Wechsel, Screen-Abbau) darf ein laufender Langdruck
  // keinen Anschlag mehr zurücknehmen. Ohne diesen Cleanup feuert der Timer
  // nach dem Verschwinden der Kachel weiter.
  useEffect(
    () => () => {
      const press = pressRef.current
      if (press) window.clearTimeout(press.timer)
    },
    [],
  )

  const merkeKlick = () => {
    klickRef.current = true
    window.setTimeout(() => {
      klickRef.current = false
    }, 0)
  }

  // Der Status hängt von `now` ab: Eine Bahn mit Startzeit in der Zukunft ist
  // „geplant“ und nimmt noch keine Anschläge an.
  const status = laneStatusAt(bahn, now)
  // Nach einem Reload bleiben Splits ohne Startzeit zurück. Die Bahn ist dann
  // unterbrochen: Sie lässt sich nicht neu starten, weil der monotone
  // Bezugspunkt fehlt, und muss erst über langes Drücken zurückgesetzt werden.
  const unterbrochen = status === 'bereit' && bahn.anschlaege.length > 0
  // Zahl der Anschläge bis einschließlich Ziel; `null` bedeutet offene
  // Strecke ohne eigene Vorgabe. Automatisch entspricht das den Längen,
  // mit eigener Zahl den eingestellten Zwischenzeiten plus Ziel.
  const zwischenzeitenBisZiel = zwischenzeitenGesamt(konfiguration)
  const gesamt =
    zwischenzeitenBisZiel === null ? null : zwischenzeitenBisZiel + 1
  const eigeneZahl = eingestellteZwischenzeiten(konfiguration) !== null
  // Der nächste Tap schließt ab, sobald alle Zwischenzeiten erfasst sind.
  const naechsterIstZiel =
    zwischenzeitenBisZiel !== null && bahn.anschlaege.length + 1 > zwischenzeitenBisZiel
  // Letzter Anschlag für die kleine Zeile unten rechts.
  const letzter = lastSplit(bahn)
  // Ohne Schwimmerzuordnung bleibt die Kachel sonst namenlos. Statt einer
  // leeren Zeile nennt sie dann die vom Aufrufer gebildete Ersatzbezeichnung
  // („Lauf 1, Bahn 2“), damit beim Messen ohne Namen klar bleibt, welche Bahn
  // gemeint ist.
  const anzeigeName =
    schwimmerName && schwimmerName.trim() !== '' ? schwimmerName : ersatzName
  // Große Zahl der Kachel: Zielzeit, Countdown bis zum Start oder laufende
  // Zeit. Der Countdown wird bei 0 gekappt, damit er nicht negativ läuft. Eine
  // unterbrochene Bahn zeigt ihren letzten erfassten Split eingefroren.
  const zeit = unterbrochen
    ? (letzter?.splitMs ?? 0)
    : status === 'beendet'
      ? (finishMs(bahn) ?? 0)
      : status === 'geplant'
        ? Math.max(0, (bahn.startMs ?? now) - now)
        : elapsedMs(bahn, now)
  // Auf einer unberührten Bahn gibt es nichts zurückzunehmen; dort bleibt auch
  // der Undo-Timer aus (siehe startPress). Unterbrochene Bahnen lassen sich
  // dagegen schrittweise zurücksetzen.
  const kannRueckgaengig = status !== 'bereit' || unterbrochen
  // Bei reduzierter Bewegung entfällt nur die Animation des Haltebalkens.
  const reduzierteBewegung = useReducedMotion()
  // Die laufende Zeit für `aria-describedby` zieht höchstens einmal pro
  // Sekunde nach. Der sichtbare Frame-Tick bleibt davon unberührt; ohne
  // Drosselung würde eine Vorlesehilfe bei jedem Render neu lesen.
  const ansageZeit = useGedaempfteZeit(zeit, status === 'laeuft' || status === 'geplant')

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
    const timer = kannRueckgaengig
      ? window.setTimeout(() => {
          pressRef.current = null
          setGedrueckt(false)
          haptic([16, 40, 16])
          onUndo(bahn.id)
        }, LANGDRUCK_MS)
      : 0

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
    // darf den Countdown nicht vorziehen. Eine unterbrochene Bahn nimmt keinen
    // neuen Anschlag an, solange ihre alten Splits nicht zurückgesetzt sind.
    if (status === 'geplant' || unterbrochen) return
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
  const rand = unterbrochen
    ? 'border-warn/60 bg-warn/10'
    : status === 'laeuft'
      ? 'border-accent/70 bg-accent/10'
      : status === 'beendet'
        ? 'border-ok/50 bg-ok/10'
        : status === 'geplant'
          ? 'border-warn/60 bg-warn/10'
          : 'border-line bg-surface'

  const zeitFarbe = unterbrochen
    ? 'text-warn'
    : status === 'laeuft'
      ? 'text-accent'
      : status === 'beendet'
        ? 'text-ok'
        : status === 'geplant'
          ? 'text-warn'
          : 'text-muted'

  // Gefüllte Segmente der Fortschrittsleiste: eines pro erfasstem Anschlag.
  const abgeschlosseneLaengen = bahn.anschlaege.length
  // Bereits erfasste Zwischenzeiten; das Ziel zählt dabei nicht mit. Bei einer
  // Strecke über genau eine Länge gibt es keine Zwischenzeit, dann bleibt die
  // Zeile weg.
  const zwischenzeit = zwischenzeiten(bahn, konfiguration)
  const zeigtZwischenzeiten =
    (status === 'laeuft' || status === 'beendet' || unterbrochen) &&
    (zwischenzeit.gesamt === null || zwischenzeit.gesamt > 0)
  const zwischenzeitId = `zwischenzeiten-${bahn.id}`
  // Vorlesetext der Kachel: Zeit, Länge und letzter Anschlag. Weil die Zeit
  // in einem `role="button"` steht, wäre sie sonst im Accessibility-Tree
  // abgeflacht und nicht abrufbar. Die Beschreibung wird nur vorgelesen, wenn
  // die Messfläche den Fokus hat — sie ist bewusst keine Live-Region.
  const beschreibungId = `zeitbeschreibung-${bahn.id}`
  const zeitbeschreibung = unterbrochen
    ? letzter
      ? `Letzter Anschlag ${formatTime(letzter.splitMs)}.`
      : null
    : status === 'laeuft'
      ? [
          `Zeit ${formatTime(ansageZeit)}.`,
          eigeneZahl
            ? naechsterIstZiel
              ? 'Nächster Anschlag ist das Ziel.'
              : `Zwischenzeit ${Math.min(bahn.anschlaege.length + 1, zwischenzeitenBisZiel ?? 0)} von ${zwischenzeitenBisZiel}.`
            : gesamt
              ? `Länge ${Math.min(bahn.anschlaege.length + 1, gesamt)} von ${gesamt}.`
              : `Länge ${bahn.anschlaege.length + 1}.`,
          letzter ? `Letzter Anschlag ${formatTime(letzter.splitMs)}.` : null,
        ]
          .filter((teil): teil is string => teil !== null)
          .join(' ')
      : status === 'beendet'
        ? `Zielzeit ${formatTime(zeit)}.`
        : status === 'geplant'
          ? `Start in ${formatCountdown(ansageZeit)}.`
          : null
  const beschriebenVon =
    [
      zeitbeschreibung ? beschreibungId : null,
      zeigtZwischenzeiten ? zwischenzeitId : null,
    ]
      .filter((id): id is string => id !== null)
      .join(' ') || undefined

  // Die Messfläche ist ein Knopf, weil Tap, Enter und Leertaste dieselbe
  // Aktion auslösen. Sie liegt in einer nicht-interaktiven Hülle, die den
  // Rahmen trägt; der Zielknopf steht als Geschwister daneben (#60), damit kein
  // Knopf in einem `role="button"` verschachtelt ist und ein Tap auf der
  // Messfläche nie das Ziel auslöst. Das `aria-label` nennt Bahn, Namen und
  // Status, weil Farbe und Zahl allein den Zustand nicht vermitteln.
  return (
    <div
      data-reihe={bahn.reihe}
      data-bahn={bahn.nummer}
      className={`flex flex-col overflow-hidden rounded-2xl border-2 transition-[background-color,border-color,opacity] duration-75 rail:rounded-3xl ${
        gedrueckt ? 'brightness-105 opacity-80' : ''
      } ${rand}`}
    >
      <div
        role="button"
        tabIndex={0}
        data-anschlaege={bahn.anschlaege.length}
        data-status={status}
        data-unterbrochen={unterbrochen ? 'true' : undefined}
        aria-keyshortcuts={kannRueckgaengig ? 'Backspace Delete' : undefined}
        aria-label={`Reihe ${bahn.reihe}, Bahn ${bahn.nummer}${schwimmerName ? `, ${schwimmerName}` : ''}, ${unterbrochen ? 'unterbrochen' : STATUS_LABEL[status]}`}
        // Der Vorlesetext nennt den Status; Zeit, Länge, letzter Anschlag und
        // die Zahl der Zwischenzeiten ergänzen ihn als Beschreibung, ohne den
        // Namen für Tests und Sprachbefehle zu verändern.
        aria-describedby={beschriebenVon}
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerCancel={cancelPress}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          // Nur ein Klick direkt auf der Messfläche zählt; eingebettete
          // Elemente gibt es nicht mehr, die Prüfung bleibt als Schutz.
          if (e.target !== e.currentTarget) return
          if (klickRef.current) return
          if (status === 'geplant' || unterbrochen) return
          haptic(8)
          onTap(bahn.id, performance.now(), Date.now())
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (status === 'geplant' || unterbrochen) return
            merkeKlick()
            haptic(8)
            onTap(bahn.id, performance.now(), Date.now())
          }
          // Tastatur-Äquivalent zum langen Drücken. Ohne ihn könnte eine
          // Tastatur- oder Screenreader-Nutzung einen Anschlag erfassen, aber
          // nicht zurücknehmen.
          if ((e.key === 'Backspace' || e.key === 'Delete') && kannRueckgaengig) {
            e.preventDefault()
            onUndo(bahn.id)
          }
        }}
        className="relative flex min-h-[7.5rem] flex-1 select-none flex-col justify-between p-3 rail:p-4"
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
          <span className="truncate text-[11px] font-medium text-muted">{anzeigeName}</span>
        </div>

        {/* `clamp` hält die Zeit groß genug für den Blick aus einigen Metern,
            ohne die Kachel auf schmalen Displays zu sprengen. */}
        <div
          className={`tabular whitespace-nowrap text-center font-semibold leading-none ${zeitFarbe}`}
          style={{ fontSize: 'clamp(1.35rem, 15cqw, 3.25rem)' }}
        >
          {status === 'geplant' ? formatCountdown(zeit) : formatTime(zeit)}
        </div>

        {/* Unterer Block: links der Längenschritt, rechts die letzte
            Zwischenzeit. Der Zielknopf sitzt nicht mehr hier, sondern als eigene
            Fläche unter der Messfläche (#60). Darunter steht der Stand der
            Zwischenzeiten über die volle Breite, damit er auf schmalen Kacheln
            nicht mit der Zeit kollidiert. */}
        <div className="flex flex-col gap-0.5 text-[11px] text-muted">
          <div className="flex items-end justify-between gap-2">
            <span className="tabular">
              {unterbrochen
                ? 'Unterbrochen'
                : status === 'beendet'
                  ? 'Ziel'
                  : status === 'geplant'
                    ? 'Start in'
                    : status === 'laeuft'
                      ? eigeneZahl
                        ? naechsterIstZiel
                          ? 'Ziel'
                          : `Zwischenzeit ${bahn.anschlaege.length + 1}/${zwischenzeitenBisZiel}`
                        : gesamt
                          ? `Länge ${Math.min(bahn.anschlaege.length + 1, gesamt)}/${gesamt}`
                          : `Länge ${bahn.anschlaege.length + 1}`
                      : 'Bereit'}
            </span>

            <span className="tabular">
              {status === 'geplant' ? 'wartet' : letzter ? formatTime(letzter.splitMs) : ''}
            </span>
          </div>

          {/* Die Zahl zeigt, wie viele Zwischenzeiten der Lauf bereits hat; das
              Ziel ist keine Zwischenzeit und zählt nicht mit. */}
          {zeigtZwischenzeiten ? (
            <span id={zwischenzeitId} className="tabular text-[10px] leading-none">
              {formatZwischenzeiten(zwischenzeit.erfasst, zwischenzeit.gesamt)}
            </span>
          ) : null}
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

      {/* Außerhalb der Messfläche: Ein sr-only-Text in einem `role="button"`
          wäre im Accessibility-Tree nicht erreichbar. Die Referenz aus
          `aria-describedby` funktioniert über die DOM-Grenze hinweg. */}
      {zeitbeschreibung ? (
        <span id={beschreibungId} className="sr-only">
          {zeitbeschreibung}
        </span>
      ) : null}

      {/* Ziel als eigene Fläche unter der Messung: nur bei offener Strecke
          nötig, weil bei fester Strecke der letzte Anschlag das Ziel ist. Der
          Knopf ist ein Geschwister der Messfläche, kein eingebettetes Element;
          ein Tap auf der Kachel kann ihn deshalb nicht auslösen. */}
      {status === 'laeuft' && gesamt === null ? (
        <button
          type="button"
          onClick={() => {
            haptic(8)
            onFinish(bahn.id, performance.now(), Date.now())
          }}
          className="min-h-11 shrink-0 border-t border-ok/40 bg-ok/15 px-3 text-[11px] font-bold text-ok"
        >
          Ziel
        </button>
      ) : null}
    </div>
  )
}
