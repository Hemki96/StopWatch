/**
 * Zeilenansicht einer laufenden Serie.
 *
 * Statt einer Kachel pro Bahn und Runde zeigt die Ansicht eine Zeile pro
 * Schwimmer und verdichtet alle Wiederholungen darauf. Ein Tap schließt die
 * älteste offene Runde, langes Drücken nimmt den letzten Anschlag zurück; liegt
 * bereits die nächste Runde im Becken, markiert die Zeile das als überfällig.
 * Die Verdichtung liefert `bahnZeile` aus domain/serie, die Aktionen kommen aus
 * app/AppProvider über TimerScreen.
 */
import { useRef, useState } from 'react'
import { haptic } from '../app/haptics'
import { useReducedMotion } from '../app/useReducedMotion'
import { finishMs, lengthCount } from '../domain/lauf'
import { formatCountdown, formatTakt, formatTime } from '../domain/format'
import { bahnZeile, zeilenZeit, type BahnZeile, type ZeilenStatus } from '../domain/serie'
import type { Lauf, SatzPlan } from '../domain/types'

/** Haltedauer in Millisekunden, ab der ein Druck als „zurücknehmen“ gilt. */
const LANGDRUCK_MS = 450

/** Statuswörter für die Screenreader-Beschriftung der Zeile. */
const STATUS_LABEL: Record<ZeilenStatus, string> = {
  bereit: 'bereit',
  geplant: 'wartet auf Start',
  laeuft: 'läuft',
  ueberfaellig: 'überfällig',
  fertig: 'im Ziel',
}

/** Alle Wiederholungen eines Satzes sowie die Aktionen des App-Kontexts. */
interface SerieAnsichtProps {
  /** Alle Runden der Serie, nach Wiederholung sortiert. */
  runden: Lauf[]
  plan: SatzPlan
  /** Monotone Zeit aus `useNow`; treibt Countdown und laufende Zeit. */
  now: number
  schwimmerName: (id: string | null) => string | null
  /** Kurzer Tap: älteste offene Runde des Bahn-Index schließen. */
  onTap: (bahnIndex: number, now: number, wallNow: number) => void
  /** Langes Drücken: letzten Anschlag dieser Bahn zurücknehmen. */
  onUndo: (bahnIndex: number) => void
  /** „Ziel“-Knopf für offene Strecken. */
  onFinish: (bahnIndex: number, now: number, wallNow: number) => void
}

/**
 * Eine Zeile pro Bahn: Zeit, Rundenfortschritt und Status eines Schwimmers.
 * Bedienung wie auf der Kachel, aber ein Tap bezieht sich immer auf die älteste
 * offene Runde, nicht auf die zuletzt gestartete.
 */
function Zeile({
  zeile,
  gesamt,
  name,
  now,
  offeneStrecke,
  onTap,
  onUndo,
  onFinish,
}: {
  zeile: BahnZeile
  gesamt: number
  name: string | null
  now: number
  offeneStrecke: boolean
  onTap: SerieAnsichtProps['onTap']
  onUndo: SerieAnsichtProps['onUndo']
  onFinish: SerieAnsichtProps['onFinish']
}) {
  const [gedrueckt, setGedrueckt] = useState(false)
  /** Beginn des laufenden Drucks samt Zeitstempeln und Undo-Timer. */
  const pressRef = useRef<{ perf: number; wall: number; timer: number } | null>(null)
  // Siehe LaneTile: echter Pointer/Klick ist bereits verarbeitet, ein reiner
  // Klick ohne vorherige Eingabe kommt von VoiceOver/TalkBack.
  const klickRef = useRef(false)
  // Bei reduzierter Bewegung entfällt nur die Animation des Haltebalkens.
  const reduzierteBewegung = useReducedMotion()

  const merkeKlick = () => {
    klickRef.current = true
    window.setTimeout(() => {
      klickRef.current = false
    }, 0)
  }

  // Große Zeit der Zeile: laufende Runde, Countdown bis zum nächsten Start
  // oder die Zielzeit der letzten Runde.
  const zeit = zeilenZeit(zeile, now)
  // Abgeschlossene Wiederholungen für die Fortschrittsleiste.
  const geschafft = zeile.letzte?.lauf.wiederholung ?? 0
  // Nur eine laufende oder überfällige Runde nimmt einen Tap an; „bereit“ und
  // „geplant“ warten auf den Startknopf.
  const kannTippen = zeile.status === 'laeuft' || zeile.status === 'ueberfaellig'
  // Zurücknehmen lohnt nur, wenn in der offenen oder letzten Runde schon ein
  // Anschlag steht; ein reiner Start wird nicht über diesen Weg zurückgenommen.
  const kannRueckgaengig =
    (zeile.offen?.bahn.anschlaege.length ?? 0) > 0 || (zeile.letzte?.bahn.anschlaege.length ?? 0) > 0
  // Ohne laufende, geplante oder beendete Runde beschreibt die Zeile Runde 1.
  const angezeigteRunde = zeile.anzeigeRunde ?? 1

  const startPress = (event: React.PointerEvent<HTMLDivElement>) => {
    // Rechts- und Mittelklick sind keine Bedienhandlung am Beckenrand.
    if (event.pointerType === 'mouse' && event.button !== 0) return
    klickRef.current = false
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Safari kann bei synthetischen oder bereits beendeten Zeigern werfen.
    }
    setGedrueckt(true)
    // Der Undo-Timer läuft nur, wenn es tatsächlich etwas zurückzunehmen gibt.
    const timer = kannRueckgaengig
      ? window.setTimeout(() => {
          pressRef.current = null
          setGedrueckt(false)
          haptic([16, 40, 16])
          onUndo(zeile.index)
        }, LANGDRUCK_MS)
      : 0
    pressRef.current = { perf: performance.now(), wall: Date.now(), timer }
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
    if (!kannTippen) return
    haptic(8)
    onTap(zeile.index, press.perf, press.wall)
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

  // Farbe und Rahmen spiegeln den Zeilenstatus: Akzent = läuft, gelb =
  // überfällig oder geplanter Start, grün = im Ziel, neutral = bereit.
  const rand =
    zeile.status === 'laeuft'
      ? 'border-accent/70 bg-accent/10'
      : zeile.status === 'ueberfaellig'
        ? 'border-warn/70 bg-warn/10'
        : zeile.status === 'geplant'
          ? 'border-warn/40 bg-warn/5'
          : zeile.status === 'fertig'
            ? 'border-ok/50 bg-ok/10'
            : 'border-line bg-surface'

  const zeitFarbe =
    zeile.status === 'laeuft'
      ? 'text-accent'
      : zeile.status === 'ueberfaellig'
        ? 'text-warn'
        : zeile.status === 'geplant'
          ? 'text-warn'
          : zeile.status === 'fertig'
            ? 'text-ok'
            : 'text-muted'

  // Kleiner Statustext unter der Zeit; dieselbe Zustandslogik wie im
  // `aria-label`, damit Anzeige und Vorlesetext übereinstimmen.
  const zielText =
    zeile.status === 'fertig'
      ? 'Ziel'
      : zeile.status === 'bereit'
        ? 'Bereit'
        : zeile.status === 'geplant'
          ? 'Start in'
          : zeile.status === 'ueberfaellig'
            ? 'Runde überfällig'
            : 'läuft'

  // Zielzeit der zuletzt beendeten Runde, solange die aktuelle Runde offen ist.
  const letzteZeit = zeile.letzte ? finishMs(zeile.letzte.bahn) : null
  // Mehr als eine offene Runde heißt: Die nächste ist gestartet, während der
  // Schwimmer noch in der vorigen ist. Die Zeile verschweigt das nicht.
  const hatUeberholung = zeile.offene.length > 1
  const neuesteOffene = zeile.offene.at(-1)

  // Die Zeile ist ein Knopf, weil Tap, Enter und Leertaste dieselbe Aktion
  // auslösen; das `aria-label` nennt Name, Runde und Status, weil Farbe und
  // Zahl allein den Zustand nicht vermitteln.
  return (
    <div
      role="button"
      tabIndex={0}
      data-status={zeile.status}
      aria-label={`${name ?? `Bahn ${zeile.index + 1}`}, Runde ${angezeigteRunde} von ${gesamt}, ${STATUS_LABEL[zeile.status]}`}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerCancel={cancelPress}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        // Der "Ziel"-Knopf ist eingebettet und bedient sich selbst.
        if (e.target !== e.currentTarget) return
        if (klickRef.current || !kannTippen) return
        haptic(8)
        onTap(zeile.index, performance.now(), Date.now())
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (!kannTippen) return
          merkeKlick()
          haptic(8)
          onTap(zeile.index, performance.now(), Date.now())
        }
      }}
      className={`relative flex select-none items-center gap-3 overflow-hidden rounded-2xl border-2 p-3 transition-[background-color,border-color,opacity] duration-75 rail:rounded-3xl rail:p-4 ${
        gedrueckt ? 'brightness-105 opacity-80' : ''
      } ${rand}`}
      // Die Liste ist scrollbar; `pan-y` erlaubt Wischen, ohne den Tap zu verlieren.
      // Die Zeit skaliert mit der Zeilenbreite, nicht mit dem Viewport.
      style={{
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'pan-y',
        containerType: 'inline-size',
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-surface2 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-muted">
            {zeile.index + 1}
          </span>
          <span className="truncate text-sm font-semibold">{name ?? 'Ohne Namen'}</span>
          <span className="ml-auto shrink-0 rounded-md bg-surface2 px-1.5 py-0.5 text-[10px] font-bold text-muted">
            R{angezeigteRunde}/{gesamt}
          </span>
        </div>

        <div className="mt-1 flex items-baseline gap-2">
          <span
            className={`tabular whitespace-nowrap font-semibold leading-none ${zeitFarbe}`}
            style={{ fontSize: 'clamp(1.75rem, 7cqw, 2.75rem)' }}
          >
            {zeile.status === 'bereit'
              ? '—'
              : zeile.status === 'geplant'
                ? formatCountdown(zeit)
                : formatTime(zeit)}
          </span>
          <span className="truncate text-[11px] text-muted">{zielText}</span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted">
          {letzteZeit !== null && zeile.status !== 'fertig' ? (
            <span className="tabular">zuletzt {formatTime(letzteZeit)}</span>
          ) : null}
          {hatUeberholung && neuesteOffene?.lauf.wiederholung ? (
            <span className="rounded bg-warn/15 px-1.5 py-0.5 font-bold text-warn">
              R{neuesteOffene.lauf.wiederholung} läuft schon
            </span>
          ) : null}
          {zeile.status === 'bereit' ? <span>Startet mit dem Startknopf</span> : null}
        </div>
      </div>

      {/* Nur bei offener Strecke braucht es einen eigenen Zielknopf; bei fester
          Strecke beendet der letzte Anschlag die Runde. Der Knopf stoppt die
          Weitergabe, sonst würde das Ziel zusätzlich als Anschlag zählen. */}
      {offeneStrecke && kannTippen ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={() => {
            haptic(8)
            onFinish(zeile.index, performance.now(), Date.now())
          }}
          className="shrink-0 rounded-lg bg-ok px-2.5 py-2 text-[10px] font-bold text-black"
        >
          Ziel
        </button>
      ) : null}

      {/* Ein Segment pro geplanter Wiederholung; gefüllt bis zur zuletzt
          beendeten Runde. Rein dekorativ, der Stand steht als Text daneben. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-3 bottom-1 flex h-1 gap-px"
      >
        {Array.from({ length: gesamt }, (_, index) => (
          <span
            key={index}
            className={`flex-1 rounded-sm ${index < geschafft ? 'bg-fg/70' : 'bg-line'}`}
          />
        ))}
      </span>

      {/* Haltedauer als Text, damit langes Drücken nicht als Anschlag
          missverstanden wird; der Balken zeigt die verbleibende Zeit. */}
      {kannRueckgaengig && gedrueckt ? (
        <span
          data-haltend="true"
          className="pointer-events-none absolute inset-x-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1 rounded-lg bg-warn px-2 py-1.5 text-center text-[10px] font-bold text-black"
        >
          Halten: Anschlag zurücknehmen
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

/**
 * Liste aller Bahnen einer Serie: eine Zeile pro Schwimmer, darüber Takt und
 * Startversatz des Plans. Tippen schließt die älteste offene Runde der Zeile;
 * der Zielknopf erscheint nur bei offener Strecke.
 */
export function SerieAnsicht({
  runden,
  plan,
  now,
  schwimmerName,
  onTap,
  onUndo,
  onFinish,
}: SerieAnsichtProps) {
  const erste = runden[0]
  // Die Streckenart ist für alle Runden gleich; sie entscheidet, ob die Zeile
  // einen Zielknopf braucht.
  const offeneStrecke = erste ? lengthCount(erste.konfiguration) === null : false
  // Fortschrittsleiste und „R x/y“ richten sich nach dem Plan. Fehlen Runden
  // (etwa nach einem Reload), bleibt die geplante Gesamtzahl maßgeblich.
  const gesamt = Math.max(runden.length, plan.wiederholungen)

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-2 overflow-y-auto p-2 rail:grid-cols-2 rail:gap-3 rail:p-4">
      <div className="col-span-full flex shrink-0 items-center justify-between gap-2 px-1 text-[11px] text-muted">
        <span>
          {plan.wiederholungen}× · Takt {formatTakt(plan.taktSek)}
        </span>
        <span>
          {plan.startversatzMs > 0
            ? `${plan.startversatzMs / 1000} s Versatz`
            : 'gemeinsamer Start'}
        </span>
      </div>
      {erste?.bahnen.map((bahn, index) => (
        // Eine Zeile pro Bahn der ersten Runde; alle weiteren Runden stecken in
        // derselben Zeile, verdichtet durch `bahnZeile`.
        <Zeile
          key={bahn.id}
          zeile={bahnZeile(runden, index, now)}
          gesamt={gesamt}
          name={schwimmerName(bahn.schwimmerId)}
          now={now}
          offeneStrecke={offeneStrecke}
          onTap={onTap}
          onUndo={onUndo}
          onFinish={onFinish}
        />
      ))}
    </div>
  )
}
