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
import { useEffect, useRef, useState } from 'react'
import { haptic } from '../app/haptics'
import { useReducedMotion } from '../app/useReducedMotion'
import { finishMs, lengthCount, bahnenNachReihen, zwischenzeiten } from '../domain/lauf'
import { abweichungZurVorrunde } from '../domain/analyse'
import {
  formatCountdown,
  formatDelta,
  formatTakt,
  formatTime,
  formatZwischenzeiten,
} from '../domain/format'
import { bahnZeile, zeilenZeit, type BahnZeile, type ZeilenStatus } from '../domain/serie'
import type { Bahn, Lauf, SatzPlan } from '../domain/types'

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
  runden,
  basis,
  gesamt,
  name,
  now,
  offeneStrecke,
  onTap,
  onUndo,
  onFinish,
}: {
  zeile: BahnZeile
  /** Alle Runden der Serie; für die Abweichung zur Vorrunde. */
  runden: Lauf[]
  /** Bahn aus der ersten Runde: liefert Nummer und Reihe für die Anzeige. */
  basis: Bahn
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

  // Ein laufender Langdruck darf nach dem Unmount keinen Anschlag mehr
  // zurücknehmen (Tab-Wechsel während des Haltens).
  useEffect(
    () => () => {
      const press = pressRef.current
      if (press) window.clearTimeout(press.timer)
    },
    [],
  )
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
  // Zwischenzeiten der ältesten offenen Runde — genau die Runde, die der
  // nächste Tap abschließt. Bei einer Strecke über eine Länge bleibt die Zeile
  // weg, weil es keine Zwischenzeit gibt.
  const zwischenzeit = zeile.offen
    ? zwischenzeiten(zeile.offen.bahn, zeile.offen.lauf.konfiguration)
    : null
  const zeigtZwischenzeiten =
    zwischenzeit !== null && (zwischenzeit.gesamt === null || zwischenzeit.gesamt > 0)
  const zwischenzeitId = `zwischenzeiten-${basis.id}`
  // Abweichung zur Vorrunde desselben Schwimmers, sobald die Serie fertig ist
  // und die vorige Runde im Ziel liegt. In Runde 1 bleibt sie aus.
  const abweichung =
    zeile.status === 'fertig' && zeile.letzte && zeile.letzte.lauf.wiederholung !== null
      ? abweichungZurVorrunde(runden, zeile.index, zeile.letzte.lauf.wiederholung)
      : null
  // Mehr als eine offene Runde heißt: Die nächste ist gestartet, während der
  // Schwimmer noch in der vorigen ist. Die Zeile verschweigt das nicht.
  const hatUeberholung = zeile.offene.length > 1
  const neuesteOffene = zeile.offene.at(-1)

  // Die Messfläche ist ein Knopf, weil Tap, Enter und Leertaste dieselbe
  // Aktion auslösen; das `aria-label` nennt Name, Runde und Status, weil Farbe
  // und Zahl allein den Zustand nicht vermitteln. Der Zielknopf steht als
  // Geschwister daneben (#60): kein Knopf in einem `role="button"`, und ein Tap
  // auf der Zeile löst nie das Ziel aus.
  return (
    <div
      data-reihe={basis.reihe}
      data-bahn={basis.nummer}
      className={`flex select-none items-stretch overflow-hidden rounded-2xl border-2 transition-[background-color,border-color,opacity] duration-75 rail:rounded-3xl ${
        gedrueckt ? 'brightness-105 opacity-80' : ''
      } ${rand}`}
    >
      <div
        role="button"
        tabIndex={0}
        data-status={zeile.status}
        aria-keyshortcuts={kannRueckgaengig ? 'Backspace Delete' : undefined}
        aria-label={`Reihe ${basis.reihe}, Bahn ${basis.nummer}${name ? `, ${name}` : ''}, Runde ${angezeigteRunde} von ${gesamt}, ${STATUS_LABEL[zeile.status]}`}
        // Die Zahl der Zwischenzeiten ergänzt den Vorlesetext als Beschreibung,
        // ohne den Namen der Zeile zu verändern.
        aria-describedby={zeigtZwischenzeiten ? zwischenzeitId : undefined}
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerCancel={cancelPress}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          // Nur ein Klick direkt auf der Messfläche zählt; der Zielknopf liegt
          // außerhalb und erreicht diesen Handler nicht.
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
          // Tastatur-Äquivalent zum langen Drücken (siehe LaneTile).
          if ((e.key === 'Backspace' || e.key === 'Delete') && kannRueckgaengig) {
            e.preventDefault()
            onUndo(zeile.index)
          }
        }}
        className="relative flex min-w-0 flex-1 items-center gap-3 p-3 rail:p-4"
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
              {basis.nummer}
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
          {abweichung !== null ? (
            <span
              className={`tabular mt-0.5 block text-[11px] ${
                abweichung < 0 ? 'text-ok' : abweichung > 0 ? 'text-danger' : 'text-muted'
              }`}
              aria-label={`Abweichung ${formatDelta(abweichung)} zur Vorrunde`}
            >
              {formatDelta(abweichung)} zur Vorrunde
            </span>
          ) : null}

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted">
            {letzteZeit !== null && zeile.status !== 'fertig' ? (
              <span className="tabular">zuletzt {formatTime(letzteZeit)}</span>
            ) : null}
            {zeigtZwischenzeiten && zwischenzeit ? (
              <span id={zwischenzeitId} className="tabular">
                {formatZwischenzeiten(zwischenzeit.erfasst, zwischenzeit.gesamt)}
              </span>
            ) : null}
            {hatUeberholung && neuesteOffene?.lauf.wiederholung ? (
              <span className="rounded bg-warn/15 px-1.5 py-0.5 font-bold text-warn">
                R{neuesteOffene.lauf.wiederholung} läuft schon
              </span>
            ) : null}
            {zeile.status === 'bereit' ? <span>Startet mit dem Startknopf</span> : null}
          </div>
        </div>

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

      {/* Ziel als eigene Fläche rechts neben der Messung: nur bei offener
          Strecke nötig, weil bei fester Strecke der letzte Anschlag die Runde
          beendet. Als Geschwister der Messfläche löst ein Tap auf der Zeile ihn
          nicht aus. */}
      {offeneStrecke && kannTippen ? (
        <button
          type="button"
          onClick={() => {
            haptic(8)
            onFinish(zeile.index, performance.now(), Date.now())
          }}
          className="mr-3 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center self-center rounded-lg bg-ok px-2.5 py-2 text-[10px] font-bold text-black rail:mr-4"
        >
          Ziel
        </button>
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
  // Zeilen werden nach Reihe gruppiert; der Index bleibt der der Bahn in der
  // Runde, weil `bahnZeile` und die Aktionen damit arbeiten.
  const gruppen = bahnenNachReihen(erste?.bahnen ?? []).map((gruppe) => ({
    reihe: gruppe.reihe,
    eintraege: gruppe.bahnen.map((bahn) => ({
      bahn,
      index: erste ? erste.bahnen.indexOf(bahn) : -1,
    })),
  }))
  const mehrereReihen = gruppen.length > 1

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 rail:gap-3 rail:p-4">
      <div className="flex shrink-0 items-center justify-between gap-2 px-1 text-[11px] text-muted">
        <span>
          {plan.wiederholungen}× · Takt {formatTakt(plan.taktSek)}
        </span>
        <span>
          {plan.startversatzMs > 0 && mehrereReihen
            ? `${plan.startversatzMs / 1000} s Reihenversatz`
            : 'gemeinsamer Start'}
        </span>
      </div>
      {gruppen.map((gruppe) => (
        <section key={gruppe.reihe} className="flex flex-col gap-1.5">
          {mehrereReihen ? (
            <h2 className="sticky top-0 z-10 flex items-baseline justify-between gap-2 rounded-md bg-bg px-1 py-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                Reihe {gruppe.reihe}
              </span>
              <span className="tabular text-[10px] text-muted">
                {gruppe.reihe === 1
                  ? 'Start'
                  : plan.startversatzMs > 0
                    ? `+${((gruppe.reihe - 1) * plan.startversatzMs) / 1000} s`
                    : 'gemeinsam'}
              </span>
            </h2>
          ) : null}
          <div className="grid grid-cols-1 gap-2 rail:grid-cols-2 rail:gap-3">
            {gruppe.eintraege.map(({ bahn, index }) => (
              // Eine Zeile pro Bahn der ersten Runde; alle weiteren Runden
              // stecken in derselben Zeile, verdichtet durch `bahnZeile`.
              <Zeile
                key={bahn.id}
                zeile={bahnZeile(runden, index, now)}
                runden={runden}
                basis={bahn}
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
        </section>
      ))}
    </div>
  )
}
