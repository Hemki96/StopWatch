/**
 * Timer-Tab: Start, Messung und Abschluss von Läufen und Serien.
 *
 * Ohne aktiven Lauf zeigt der Screen die Vorschau des nächsten Laufs samt
 * Startknopf. Mit aktivem Lauf erscheinen die Leiste aller offenen Läufe,
 * darunter entweder die Bahnkacheln (`LaneTile`) oder die Serienzeilen
 * (`SerieAnsicht`) und unten der Fortschritt mit „Weiter“, „Alle beenden“ oder
 * „Neuer Lauf“. Gezählt wird in domain/lauf und domain/serie; die Aktionen und
 * der aktive Zustand kommen aus app/AppProvider. `useNow` liefert die monotone
 * Zeit, `useWakeLock` hält den Bildschirm an, solange etwas läuft.
 */
import { useState } from 'react'
import { useApp, type AktiverEintrag, type Einstellungen } from '../app/AppProvider'
import { useNow } from '../app/useNow'
import { useWakeLock } from '../app/useWakeLock'
import { formatCountdown, formatStrecke, formatTakt, formatTime } from '../domain/format'
import { einheitVon, formatBeckenlaenge } from '../domain/einheit'
import {
  bahnenNachReihen,
  hasStarted,
  isComplete,
  isFinished,
  laneStatusAt,
  laufzeitMs,
  lengthCount,
  reihenVon,
} from '../domain/lauf'
import {
  istSerie,
  aktuelleRunde,
  letzterAnschlag,
  runden as rundenVon,
  serieFortschritt,
} from '../domain/serie'
import { SCHWIMMARTEN, type Bahn, type Lauf, type Satz, type SatzPlan } from '../domain/types'
import { Bestaetigung } from './Bestaetigung'
import { KonfigurationSheet } from './KonfigurationSheet'
import { LaneTile } from './LaneTile'
import { LaufErgebnis } from './LaufErgebnis'
import { Ruecknahme, type RuecknahmeZiel } from './Ruecknahme'
import { SerieAnsicht } from './SerieAnsicht'
import { Startuebersicht, StartuebersichtLauf } from './Startuebersicht'
import { TrashIcon, XIcon } from './icons'

/** Deutsches Label zur Schwimmart; unbekannte Werte bleiben leer. */
function artLabel(schwimmart: string): string {
  return SCHWIMMARTEN.find((s) => s.wert === schwimmart)?.label ?? ''
}

/**
 * Einzeilige Beschreibung eines Laufs für Kopfzeile und Vorschau:
 * Beckenlänge, Strecke (bei Serien mit Wiederholungszahl), Schwimmart,
 * Personenzahl samt Reihen und – falls gesetzt – Reihenversatz und Takt.
 */
function beschriftung(
  konfiguration: {
    beckenlaengeM: number
    streckeM: number | null
    schwimmart: string
    einheit?: 'm' | 'yd'
  },
  personen: number,
  reihen: number,
  startversatzMs: number,
  plan: SatzPlan | null,
): string {
  const einheit = einheitVon(konfiguration)
  const strecke = formatStrecke(konfiguration.streckeM, einheit)
  const teile = [
    formatBeckenlaenge(konfiguration.beckenlaengeM as 25 | 50 | 22.86, einheit),
    plan && plan.wiederholungen > 1 ? `${plan.wiederholungen}×${strecke}` : strecke,
    artLabel(konfiguration.schwimmart),
    reihen > 1
      ? `${personen} Personen in ${reihen} Reihen`
      : `${personen} ${personen === 1 ? 'Bahn' : 'Bahnen'}`,
  ]
  if (reihen > 1 && startversatzMs > 0) {
    teile.push(`${startversatzMs / 1000} s Reihenversatz`)
  }
  if (plan && plan.wiederholungen > 1) {
    teile.push(`Takt ${formatTakt(plan.taktSek)}`)
  }
  return teile.join(' · ')
}

/** Kurztitel für die Laufleiste; Serien nennen die Wiederholungszahl mit. */
function kurzTitel(lauf: Lauf, satz: Satz | null): string {
  const strecke = formatStrecke(lauf.konfiguration.streckeM, einheitVon(lauf.konfiguration))
  const art = artLabel(lauf.konfiguration.schwimmart)
  if (istSerie(satz) && satz?.plan) {
    return `${satz.plan.wiederholungen}×${strecke} · ${art}`
  }
  return `${strecke} · ${art}`
}

/**
 * Plan, den die Einstellungen für den nächsten Lauf vorbereiten. Eine einzelne
 * Wiederholung ist ein normaler Lauf und braucht keinen Plan.
 */
function planAusEinstellungen(einstellungen: Einstellungen): SatzPlan | null {
  return einstellungen.wiederholungen > 1
    ? {
        wiederholungen: einstellungen.wiederholungen,
        taktSek: einstellungen.taktSek,
        startversatzMs: einstellungen.startversatzMs,
      }
    : null
}

/**
 * Zustand eines Eintrags in der Laufleiste, unabhängig von der gewählten
 * Ansicht: Eine Serie ist erst fertig, wenn alle ihre Runden vollständig sind.
 */
function eintragStatus(eintrag: AktiverEintrag, laeufe: Lauf[]): 'bereit' | 'laeuft' | 'fertig' {
  if (eintrag.serie && eintrag.satz) {
    const runden = rundenVon(laeufe, eintrag.satz.id)
    // `every` auf einer leeren Liste wäre true; deshalb die Längenprüfung.
    if (runden.length > 0 && runden.every(isComplete)) return 'fertig'
    if (runden.some(hasStarted)) return 'laeuft'
    return 'bereit'
  }
  if (isComplete(eintrag.lauf)) return 'fertig'
  if (hasStarted(eintrag.lauf)) return 'laeuft'
  return 'bereit'
}

/**
 * Etwas ist an einer Bahn zurückzunehmen, wenn ein Status, ein Anschlag oder
 * ein Start gesetzt ist. `undoLane` nimmt in genau dieser Reihenfolge zurück.
 */
function kannBahnZuruecknehmen(bahn: Bahn): boolean {
  return bahn.status !== undefined || bahn.anschlaege.length > 0 || bahn.startMs !== null
}

/**
 * Bahn mit der jüngsten Änderung: Der letzte Anschlag gewinnt, sonst die erste
 * gestartete Bahn. Ohne Start und Anschlag gibt es nichts zurückzunehmen.
 */
function letzteGeaenderteBahn(bahnen: Bahn[]): Bahn | null {
  let treffer: Bahn | null = null
  let juengster = Number.NEGATIVE_INFINITY
  for (const bahn of bahnen) {
    if (!kannBahnZuruecknehmen(bahn)) continue
    const anschlag = bahn.anschlaege.at(-1)
    const zeit = anschlag ? anschlag.erfasstAt : Number.NEGATIVE_INFINITY
    // `treffer === null` lässt die erste Bahn gewinnen, auch wenn zwei Bahnen
    // ohne Anschlag denselben Rang teilen; sonst entscheidet der Zeitstempel.
    if (treffer === null || zeit > juengster) {
      juengster = zeit
      treffer = bahn
    }
  }
  return treffer
}

/**
 * Bahn-Index mit dem jüngsten Anschlag über alle Runden einer Serie. Nur
 * Anschläge zählt `rueckgaengigSerie`; ein reiner Start bleibt außen vor.
 */
function letzteSerieBahn(runden: Lauf[]): number | null {
  let treffer: number | null = null
  let juengster = Number.NEGATIVE_INFINITY
  for (const [index] of (runden[0]?.bahnen ?? []).entries()) {
    const anschlag = letzterAnschlag(runden, index)?.bahn.anschlaege.at(-1)
    if (!anschlag) continue
    if (anschlag.erfasstAt >= juengster) {
      juengster = anschlag.erfasstAt
      treffer = index
    }
  }
  return treffer
}

/** Sichtbare Bezeichnung einer Bahn; bei mehreren Reihen gehört die Reihe dazu. */
function bahnBezeichnung(bahn: Bahn, mehrereReihen: boolean): string {
  return mehrereReihen ? `Reihe ${bahn.reihe}, Bahn ${bahn.nummer}` : `Bahn ${bahn.nummer}`
}

/**
 * Zieltext der sichtbaren Rücknahme. `runde` ist nur bei Serien gesetzt und
 * macht klar, welche Wiederholung der Knopf zurücknimmt.
 */
function ruecknahmeZielFuer(
  bahn: Bahn | null,
  mehrereReihen: boolean,
  name: string | null,
  runde: number | null,
): RuecknahmeZiel | null {
  if (!bahn) return null
  const kurz = bahnBezeichnung(bahn, mehrereReihen)
  return {
    kurz: runde !== null ? `${kurz} · R${runde}` : kurz,
    lang: `${kurz}${name ? `, ${name}` : ''}${runde !== null ? `, Runde ${runde}` : ''}`,
  }
}

/**
 * Kurztext rechts an der Reihen-Überschrift. Vor dem Start zeigt er den
 * geplanten Abstand, danach den echten Zustand: Countdown bis zum Start,
 * „läuft“ oder „Ziel“. So bleibt die Reihe auch dann erkennbar, wenn die
 * einzelnen Kacheln weiter unten aus dem Bild gescrollt sind.
 */
function reihenAnzeige(
  bahnen: Bahn[],
  reihe: number,
  versatzMs: number,
  now: number,
): string {
  const starts = bahnen
    .map((bahn) => bahn.startMs)
    .filter((start): start is number => start !== null)
  if (starts.length === 0) {
    if (versatzMs === 0) return reihe === 1 ? 'Start' : 'gemeinsam'
    return reihe === 1 ? 'Start' : `+${((reihe - 1) * versatzMs) / 1000} s`
  }
  const beginn = Math.min(...starts)
  if (now < beginn) return `Start in ${formatCountdown(beginn - now)}`
  if (bahnen.every(isFinished)) return 'Ziel'
  return 'läuft'
}

/**
 * Waagerechte Leiste aller gleichzeitig aktiven Läufe und Serien.
 *
 * Ein Tipp wechselt den aktiven Lauf; die anderen laufen im Hintergrund weiter.
 * Der Punkt links zeigt den Zustand, Serien zusätzlich die aktuelle Runde. Das
 * Plus legt einen weiteren Lauf an. Die Leiste erscheint ab dem ersten offenen
 * Lauf und bleibt auch bei nur einem Eintrag stehen, weil daneben das Plus
 * sitzt.
 */
function LaufLeiste({
  eintraege,
  aktivId,
  laeufe,
  now,
  onWaehlen,
  onAnlegen,
}: {
  eintraege: AktiverEintrag[]
  aktivId: string | null
  laeufe: Lauf[]
  now: number
  onWaehlen: (id: string) => void
  onAnlegen: () => void
}) {
  // Ohne offene Läufe gibt es nichts zu wechseln; die Leiste verschwindet.
  if (eintraege.length === 0) return null
  return (
    <div className="flex items-center gap-1.5 border-b border-line px-2 py-2 rail:px-4">
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
        {eintraege.map((eintrag) => {
          const status = eintragStatus(eintrag, laeufe)
          const aktiv = eintrag.id === aktivId
          // Serien zeigen statt „läuft/bereit“ die aktuelle Runde; `max(1, …)`
          // hält die Anzeige auch vor dem ersten Start bei R1.
          const fortschritt =
            eintrag.serie && eintrag.satz && eintrag.satz.plan
              ? `R${Math.max(1, aktuelleRunde(rundenVon(laeufe, eintrag.satz.id), now))}/${eintrag.satz.plan.wiederholungen}`
              : null
          return (
            <button
              key={eintrag.id}
              type="button"
              onClick={() => onWaehlen(eintrag.id)}
              // `aria-current` markiert den sichtbaren Lauf für Screenreader;
              // die Farbe allein wäre nicht wahrnehmbar.
              aria-current={aktiv ? 'true' : undefined}
              className={`flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-left text-xs font-medium transition-colors ${
                aktiv
                  ? 'border-accent bg-accent/15 text-fg'
                  : 'border-line bg-surface text-muted'
              }`}
            >
              <span
                aria-hidden="true"
                // Der Punkt ist die kompakte Statusanzeige; die Bedeutung
                // tragen die Textspalten daneben, nicht die Farbe allein.
                className={`h-2 w-2 shrink-0 rounded-full ${
                  status === 'fertig' ? 'bg-ok' : status === 'laeuft' ? 'bg-accent' : 'bg-muted'
                }`}
              />
              <span className="max-w-[9.5rem] truncate">
                {kurzTitel(eintrag.lauf, eintrag.satz)}
              </span>
              {!eintrag.serie ? (
                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted">
                  {status === 'fertig' ? 'Ziel' : status === 'laeuft' ? 'läuft' : 'bereit'}
                </span>
              ) : null}
              {fortschritt ? (
                <span className="tabular shrink-0 text-[10px] text-muted">{fortschritt}</span>
              ) : null}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        onClick={onAnlegen}
        // `aria-label`, weil das Plus allein nichts Vorlesbares ist.
        aria-label="Weiteren Lauf anlegen"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface text-lg font-bold text-muted"
      >
        +
      </button>
    </div>
  )
}

/**
 * Timer-Tab. Zeigt entweder die Vorschau des nächsten Laufs oder die laufende
 * Messung und führt Start, Anschlag, Ziel und Verwerfen aus.
 */
export function TimerScreen() {
  const app = useApp()
  const lauf = app.aktiverLauf
  const satz = app.aktiverSatz
  // Serienansicht nur, wenn der Satz mehrere Wiederholungen plant und die
  // Runden bereits geladen sind; sonst bleibt es bei den Bahnkacheln.
  const serie = istSerie(satz) && !!satz?.plan && app.aktiveRunden.length > 0
  const runden = app.aktiveRunden
  const [sheet, setSheet] = useState(false)
  const [frageVerwerfen, setFrageVerwerfen] = useState(false)
  // Startübersicht: `'neu'` prüft die Vorgaben für einen neuen Lauf, `'aktiv'`
  // den bereits angelegten Lauf, dessen Uhr noch nicht läuft. `null` = zu.
  const [startPruefen, setStartPruefen] = useState<'neu' | 'aktiv' | null>(null)
  // Zuletzt bediente Bahn beziehungsweise Serienzeile im aktiven Lauf. Sie ist
  // das Ziel der sichtbaren Rücknahme in der Fußzeile; die Lauf-ID verhindert,
  // dass ein Wechsel des aktiven Laufs ein altes Ziel weiterführt.
  const [zuletztBahn, setZuletztBahn] = useState<{ laufId: string; bahnId: string } | null>(null)
  const [zuletztSerie, setZuletztSerie] = useState<{ laufId: string; index: number } | null>(null)

  // Die Zeit läuft nur, solange irgendwo etwas plant oder läuft; sonst bliebe
  // ein Render-Loop ohne sichtbaren Nutzen. Der Wake-Lock hält den Bildschirm
  // in derselben Phase an.
  const now = useNow(app.brauchtTakt)
  const wach = useWakeLock(app.brauchtTakt)

  const schwimmerName = (id: string | null) =>
    id ? (app.schwimmer.find((s) => s.id === id)?.name ?? null) : null

  // Ein zweiter Tab darf nichts messen: die Bahnen wären sonst eine Einladung,
  // Anschläge zu erfassen, die der aktive Tab nie sieht.
  if (app.tabGesperrt) {
    return (
      <div className="flex h-full flex-col">
        <h1 className="sr-only">Timer</h1>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-sm font-semibold">Messung läuft in einem anderen Tab</p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
            Hier kannst du den Verlauf und die Schwimmer ansehen. Starten, Tippen und Ändern sind
            gesperrt, solange der andere Tab die Messung hält.
          </p>
        </div>
      </div>
    )
  }

  /**
   * Legt aus den Einstellungen einen neuen Lauf an und startet ihn sofort.
   * `performance.now()` und `Date.now()` werden getrennt übergeben: die erste
   * Zeit misst, die zweite ordnet den Lauf im Verlauf ein.
   */
  const starte = () => {
    const perf = performance.now()
    const wall = Date.now()
    const laufId = app.neuerLauf(
      app.einstellungen.konfiguration,
      app.einstellungen.bahnen,
      app.einstellungen.schwimmerProBahn,
      {
        startversatzMs: app.einstellungen.startversatzMs,
        wiederholungen: app.einstellungen.wiederholungen,
        taktSek: app.einstellungen.taktSek,
        reihen: app.einstellungen.reihen,
      },
    )
    // Ohne Lauf (etwa bei ungültiger Konfiguration) bleibt der Start aus.
    if (!laufId) return
    app.startAlle(perf, wall)
  }

  /**
   * Setzt die fehlenden Starts eines bereits angelegten Laufs. `startAlle`
   * ergänzt nur Bahnen ohne Startzeit; nach einem Reload bleiben so gemessene
   * Zeiten unangetastet.
   */
  const weiter = () => {
    app.startAlle(performance.now(), Date.now())
  }

  // Daten der Startübersicht: Die Vorgaben gelten für einen neuen Lauf, der
  // aktive Lauf für „Start alle“ nach dem Plus in der Leiste.
  const einstellungen = app.einstellungen
  const planVorgaben = planAusEinstellungen(einstellungen)
  const namenVorgaben = Array.from(
    { length: einstellungen.bahnen * einstellungen.reihen },
    (_, index) => schwimmerName(einstellungen.schwimmerProBahn[index] ?? null),
  )
  const reihenAktiv = lauf ? reihenVon(lauf) : 1
  const bahnenAktiv = lauf
    ? Math.max(1, ...bahnenNachReihen(lauf.bahnen).map((gruppe) => gruppe.bahnen.length))
    : 1
  const namenAktiv = lauf
    ? bahnenNachReihen(lauf.bahnen).flatMap((gruppe) =>
        gruppe.bahnen.map((bahn) => schwimmerName(bahn.schwimmerId)),
      )
    : []

  /**
   * Übersicht vor dem Start. Sie zeigt nur Werte; erst „Jetzt starten“ setzt
   * den ersten Startzeitstempel. „Ändern“ führt zurück in die Einstellungen,
   * damit ein falsch gewählter Wert nicht erst nach dem Start auffällt.
   */
  const startUebersicht = (
    <Startuebersicht
      open={startPruefen !== null}
      titel="Start prüfen"
      text="Prüfe Becken, Strecke, Bahnen und Schwimmer. Erst mit „Jetzt starten“ beginnt die Uhr."
      startLabel="Jetzt starten"
      onClose={() => setStartPruefen(null)}
      onStart={() => {
        const herkunft = startPruefen
        setStartPruefen(null)
        // Ein bereits angelegter Lauf braucht nur die fehlenden Starts; ein
        // neuer Lauf entsteht erst mit `starte`.
        if (herkunft === 'aktiv') weiter()
        else starte()
      }}
      onAendern={() => {
        setStartPruefen(null)
        setSheet(true)
      }}
      aendernLabel="Einstellungen ändern"
    >
      {startPruefen === 'aktiv' && lauf ? (
        <StartuebersichtLauf
          konfiguration={lauf.konfiguration}
          bahnen={bahnenAktiv}
          reihen={reihenAktiv}
          namen={namenAktiv}
          startversatzMs={lauf.startversatzMs}
          plan={satz?.plan ?? null}
        />
      ) : (
        <StartuebersichtLauf
          konfiguration={einstellungen.konfiguration}
          bahnen={einstellungen.bahnen}
          reihen={einstellungen.reihen}
          namen={namenVorgaben}
          startversatzMs={einstellungen.startversatzMs}
          plan={planVorgaben}
        />
      )}
    </Startuebersicht>
  )

  // Kein aktiver Lauf: Vorschau der Einstellungen mit Startknopf.
  if (!lauf) {
    return (
      <div className="flex h-full flex-col">
        <LaufLeiste
          eintraege={app.aktiveEintraege}
          aktivId={null}
          laeufe={app.laeufe}
          now={now}
          onWaehlen={app.waehleLauf}
          onAnlegen={app.anlegenLauf}
        />
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-6 rail:px-6">
          <div className="mx-auto w-full max-w-2xl">
            <h1 className="sr-only">Timer</h1>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Nächster Lauf
            </p>
            {/* Die ganze Karte öffnet das Konfigurations-Sheet; „Ändern“ ist
                der sichtbare Hinweis darauf. */}
            <button
              type="button"
              onClick={() => setSheet(true)}
              className="mt-2 w-full rounded-2xl border border-line bg-surface p-4 text-left rail:p-5"
            >
              <span className="text-lg font-semibold">
                {beschriftung(
                  einstellungen.konfiguration,
                  einstellungen.bahnen * einstellungen.reihen,
                  einstellungen.reihen,
                  einstellungen.startversatzMs,
                  planVorgaben,
                )}
              </span>
              <span className="mt-1 block text-sm text-accent">Ändern</span>
            </button>

            <div className="mt-10 space-y-3 text-sm leading-relaxed text-muted">
              <p>
                „Start“ zeigt zuerst eine Übersicht. Erst dort startet „Jetzt starten“ alle Bahnen.
                Mit Reihen startet die nächste Gruppe nach dem eingestellten Versatz.
              </p>
              <p>
                Danach tippst du jede Bahn bei jedem Anschlag an. Der letzte Anschlag ist das Ziel.
              </p>
              <p>Langes Drücken nimmt die letzte Aktion einer Bahn zurück.</p>
            </div>
          </div>
        </div>

        <div className="border-t border-line p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <div className="mx-auto w-full max-w-2xl">
            <button
              type="button"
              onClick={() => setStartPruefen('neu')}
              className="h-20 w-full rounded-2xl bg-accent text-2xl font-bold text-accent-fg shadow-lg active:scale-[0.99]"
            >
              Start
            </button>
          </div>
        </div>

        <KonfigurationSheet open={sheet} onClose={() => setSheet(false)} modus="einstellungen" />
        {startUebersicht}
      </div>
    )
  }

  // Anzeigezustände für Kacheln und Serienzeilen: „gestartet“ heißt, mindestens
  // eine Bahn beziehungsweise Runde hat eine Startzeit; „beendet“ heißt, alle
  // sind im Ziel.
  const gestartet = serie ? runden.some(hasStarted) : hasStarted(lauf)
  const alleBeendet = serie ? runden.every(isComplete) : lauf.bahnen.every(isFinished)
  const imZiel = lauf.bahnen.filter(isFinished).length
  // Eine offene Strecke braucht den Zielknopf; bei fester Strecke ist der
  // letzte Anschlag automatisch das Ziel.
  const offeneStrecke = lengthCount(lauf.konfiguration) === null
  // Fortschritt einer Serie zählt vollständige Runden, nicht einzelne Bahnen.
  const fortschritt = serie ? serieFortschritt(runden) : null
  // Laufzeit eines einzelnen Laufs ab dem ersten Start; bei einer Serie
  // übernimmt die Serien-Ansicht ihre Rundenanzeige, dort bleibt die Zeile
  // unverändert. Nach dem letzten Ziel friert der Wert ein.
  const laufzeit = serie ? null : laufzeitMs(lauf, now)
  const plan = satz?.plan ?? null
  // Runde, die laut Uhr gerade im Becken ist; mindestens 1, damit die Anzeige
  // schon vor dem ersten Start „Runde 1“ zeigt.
  const rundeJetzt = serie ? Math.max(1, aktuelleRunde(runden, now)) : 0
  // Bei Serien gilt der Versatz des Plans, sonst der des Laufs.
  const startversatzMs = serie && plan ? plan.startversatzMs : lauf.startversatzMs
  // Reihen als Startgruppen: Jede Reihe startet gemeinsam, die nächste nach dem
  // Versatz. Bei einer Reihe bleibt die Ansicht eine einzige Kachelfläche.
  const reihenGruppen = bahnenNachReihen(lauf.bahnen)
  const mehrereReihen = reihenGruppen.length > 1 || reihenVon(lauf) > 1
  const bahnProReihe = Math.max(1, ...reihenGruppen.map((gruppe) => gruppe.bahnen.length))
  // Spaltenzahl passend zur Bahnzahl je Reihe: Eine einzelne Bahn bleibt groß,
  // vier Bahnen bilden kein 3+1, sechs kein 4+2. So sind die Reihen auf dem
  // Tablet ausgeglichen, ohne dass die Kacheln zu Streifen werden.
  const bahnSpalten =
    bahnProReihe === 1
      ? 'grid-cols-1'
      : bahnProReihe === 2
        ? 'grid-cols-2'
        : bahnProReihe === 3
          ? 'grid-cols-2 min-[560px]:grid-cols-3'
          : bahnProReihe === 4
            ? 'grid-cols-2 short:grid-cols-4 lg:grid-cols-4'
            : bahnProReihe <= 6
              ? 'grid-cols-2 min-[560px]:grid-cols-3'
              : bahnProReihe <= 8
                ? 'grid-cols-2 min-[560px]:grid-cols-3 lg:grid-cols-4'
                : 'grid-cols-2 min-[560px]:grid-cols-3 lg:grid-cols-5'

  /**
   * Die sichtbare Rücknahme merkt sich die zuletzt bediente Bahn, bevor sie
   * dieselbe Aktion ausführt wie die Kachel. Nach einem Wechsel des aktiven
   * Laufs oder wenn dort nichts mehr offen ist, greift der Fallback unten.
   */
  const tippeBahn = (bahnId: string, tapNow: number, wallNow: number) => {
    setZuletztBahn({ laufId: lauf.id, bahnId })
    app.tippe(bahnId, tapNow, wallNow)
  }
  const beendeBahn = (bahnId: string, tapNow: number, wallNow: number) => {
    setZuletztBahn({ laufId: lauf.id, bahnId })
    app.beende(bahnId, tapNow, wallNow)
  }
  const undoBahn = (bahnId: string) => {
    setZuletztBahn({ laufId: lauf.id, bahnId })
    app.rueckgaengig(bahnId)
  }
  const tippeSerie = (index: number, tapNow: number, wallNow: number) => {
    setZuletztSerie({ laufId: lauf.id, index })
    app.tippeSerie(index, tapNow, wallNow)
  }
  const beendeSerie = (index: number, tapNow: number, wallNow: number) => {
    setZuletztSerie({ laufId: lauf.id, index })
    app.beendeSerie(index, tapNow, wallNow)
  }
  const undoSerie = (index: number) => {
    setZuletztSerie({ laufId: lauf.id, index })
    app.rueckgaengigSerie(index)
  }

  // Ziel der sichtbaren Rücknahme: die zuletzt bediente Bahn, solange dort
  // noch etwas offen ist; sonst die Bahn mit dem jüngsten Anschlag. Serien
  // nehmen nur Anschläge zurück, deshalb bleibt der Knopf ohne Anschlag inaktiv.
  const gemerkteBahn =
    zuletztBahn && zuletztBahn.laufId === lauf.id
      ? (lauf.bahnen.find((bahn) => bahn.id === zuletztBahn.bahnId) ?? null)
      : null
  const ruecknahmeBahn =
    gemerkteBahn && kannBahnZuruecknehmen(gemerkteBahn)
      ? gemerkteBahn
      : letzteGeaenderteBahn(lauf.bahnen)
  const gemerkterIndex =
    zuletztSerie && zuletztSerie.laufId === lauf.id ? zuletztSerie.index : null
  const ruecknahmeIndex =
    gemerkterIndex !== null && letzterAnschlag(runden, gemerkterIndex) !== null
      ? gemerkterIndex
      : letzteSerieBahn(runden)
  const ruecknahmeZiel = serie
    ? ruecknahmeZielFuer(
        ruecknahmeIndex !== null ? (runden[0]?.bahnen[ruecknahmeIndex] ?? null) : null,
        mehrereReihen,
        ruecknahmeIndex !== null
          ? schwimmerName(runden[0]?.bahnen[ruecknahmeIndex]?.schwimmerId ?? null)
          : null,
        ruecknahmeIndex !== null
          ? (letzterAnschlag(runden, ruecknahmeIndex)?.lauf.wiederholung ?? null)
          : null,
      )
    : ruecknahmeZielFuer(
        ruecknahmeBahn,
        mehrereReihen,
        ruecknahmeBahn ? schwimmerName(ruecknahmeBahn.schwimmerId) : null,
        null,
      )
  /** Fußzeilenknopf: nimmt genau das angezeigte Ziel zurück. */
  const ruecknahme = () => {
    if (serie) {
      if (ruecknahmeIndex !== null) undoSerie(ruecknahmeIndex)
      return
    }
    if (ruecknahmeBahn) undoBahn(ruecknahmeBahn.id)
  }

  /**
   * „Alle beenden“ für offene Strecken: beendet bei einer Serie je Bahn-Index
   * über alle Runden, sonst jede noch laufende Bahn. Geplante und bereits
   * beendete Bahnen bleiben unberührt.
   */
  const alleBeenden = () => {
    const perf = performance.now()
    const wall = Date.now()
    if (serie) {
      // Die Bahnzahl steckt in der ersten Runde; beendeSerie arbeitet mit dem
      // Bahn-Index und trifft damit dieselbe Bahn in allen Runden.
      for (const [index] of (runden[0]?.bahnen ?? []).entries()) {
        app.beendeSerie(index, perf, wall)
      }
      return
    }
    for (const bahn of lauf.bahnen) {
      if (laneStatusAt(bahn, perf) === 'laeuft') app.beende(bahn.id, perf, wall)
    }
  }

  // Nach einem Reload können ganze Runden oder einzelne Bahnen einer
  // begonnenen Runde ohne Startzeit zurückbleiben. „Weiter“ plant nur die
  // fehlenden Starts neu und tastet gemessene Zeiten nicht an.
  // Auch ein einzelner Lauf kann nach einem Reload einzelne Bahnen ohne Start
  // zurücklassen. „Weiter“ macht das sichtbar und startet sie gebündelt, statt
  // jeden Tap einzeln als neuen Start zu deuten. Unterbrochene Bahnen mit
  // Anschlägen gehören nicht dazu: Für sie fehlt der monotone Bezugspunkt.
  const hatFehlendeStarts =
    gestartet &&
    (serie
      ? runden.some((runde) =>
          runde.bahnen.some(
            (bahn) =>
              bahn.startMs === null && !isFinished(bahn) && bahn.anschlaege.length === 0,
          ),
        )
      : lauf.bahnen.some(
          (bahn) => bahn.startMs === null && !isFinished(bahn) && bahn.anschlaege.length === 0,
        ))
  // Nach einem Reload bleiben Splits ohne Startzeit zurück. Sie lassen sich
  // nur über langes Drücken schrittweise zurücksetzen; der Hinweis macht das
  // sichtbar, statt einen wirkungslosen Tap zu erwarten.
  const hatUnterbrochene = (serie ? runden.flatMap((runde) => runde.bahnen) : lauf.bahnen).some(
    (bahn) =>
      bahn.startMs === null &&
      bahn.anschlaege.length > 0 &&
      !isFinished(bahn) &&
      !bahn.status,
  )

  return (
    <div className="flex h-full flex-col">
      <h1 className="sr-only">Timer</h1>

      <LaufLeiste
        eintraege={app.aktiveEintraege}
        aktivId={lauf.id}
        laeufe={app.laeufe}
        now={now}
        onWaehlen={app.waehleLauf}
        onAnlegen={app.anlegenLauf}
      />

      <div className="flex items-center gap-2 border-b border-line px-3 py-2 rail:px-4">
        {/* Kopfzeile der Messung: Zustand (Serie/Lauf/Bereit) und
            Kurzbeschreibung öffnen das Konfigurations-Sheet. */}
        <button
          type="button"
          onClick={() => setSheet(true)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block text-[10px] font-bold uppercase tracking-wider text-muted">
            {serie
              ? `Serie · Runde ${rundeJetzt}/${plan?.wiederholungen ?? runden.length}`
              : gestartet
                ? 'Lauf'
                : 'Bereit'}
          </span>
          <span className="line-clamp-2 text-sm font-medium">
            {beschriftung(
              lauf.konfiguration,
              lauf.bahnen.length,
              reihenVon(lauf),
              startversatzMs,
              plan,
            )}
          </span>
        </button>
        {/* Fertige Läufe werden geschlossen (X), laufende verworfen (Papierkorb
            mit Rückfrage). Zwei getrennte Wege, weil Schließen nichts löscht. */}
        {alleBeendet ? (
          <button
            type="button"
            onClick={app.schliesseAktivenLauf}
            aria-label={serie ? 'Serie schließen' : 'Lauf schließen'}
            className="grid h-10 w-10 place-items-center rounded-xl text-muted"
          >
            <XIcon className="h-5 w-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setFrageVerwerfen(true)}
            aria-label={serie ? 'Serie abbrechen' : 'Lauf verwerfen'}
            className="grid h-10 w-10 place-items-center rounded-xl text-muted"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {serie && plan ? (
        // Serien zeigen eine Zeile pro Schwimmer. Fehlt der Plan (etwa nach
        // einem Reload), bleibt die Kachelansicht als Rückfallebene.
        <SerieAnsicht
          runden={runden}
          plan={plan}
          now={now}
          schwimmerName={schwimmerName}
          onTap={tippeSerie}
          onUndo={undoSerie}
          onFinish={beendeSerie}
        />
      ) : !serie && alleBeendet && gestartet ? (
        // Ein einzelner, vollständig beendeter Lauf zeigt die Ergebnisübersicht
        // statt der Kacheln. „Neuer Lauf“ bleibt darunter der nächste Schritt.
        <LaufErgebnis
          lauf={lauf}
          laeufe={app.laeufe}
          schwimmerName={schwimmerName}
          onUndo={app.rueckgaengig}
        />
      ) : (
        <div
          // Ab drei Bahnen wächst die Spaltenzahl mit dem Gerät; die Kacheln
          // behalten eine Mindesthöhe und scrollen, statt auf schmalen Displays
          // zusammenzuschrumpfen. Jede Reihe ist ein eigener Block, damit zwei
          // Startgruppen nicht als eine lange Kachelwand erscheinen.
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 rail:gap-3 rail:p-4"
        >
          {reihenGruppen.map((gruppe) => (
            <section key={gruppe.reihe} className="flex flex-col gap-1.5">
              {mehrereReihen ? (
                <h2 className="sticky top-0 z-10 flex items-baseline justify-between gap-2 rounded-md bg-bg px-1 py-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    Reihe {gruppe.reihe}
                  </span>
                  <span className="tabular text-[10px] text-muted">
                    {reihenAnzeige(gruppe.bahnen, gruppe.reihe, startversatzMs, now)}
                  </span>
                </h2>
              ) : null}
              <div className={`grid auto-rows-[minmax(7.5rem,1fr)] gap-2 rail:gap-3 ${bahnSpalten}`}>
                {gruppe.bahnen.map((bahn) => (
                  <LaneTile
                    key={bahn.id}
                    bahn={bahn}
                    konfiguration={lauf.konfiguration}
                    now={now}
                    schwimmerName={schwimmerName(bahn.schwimmerId)}
                    onTap={tippeBahn}
                    onUndo={undoBahn}
                    onFinish={beendeBahn}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Fußzeile mit der jeweils nächsten sinnvollen Aktion: starten,
          abschließen oder den Fortschritt bestätigen. */}
      <div className="border-t border-line p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] rail:px-4">
        <div className="mx-auto w-full max-w-3xl">
        {/* Während der Messung steht die Rücknahme sichtbar in der Fußzeile,
            außerhalb der Messflächen. Nach dem letzten Ziel übernimmt
            `LaufErgebnis` die Rücknahme. */}
        {gestartet && !alleBeendet ? (
          <Ruecknahme ziel={ruecknahmeZiel} onUndo={ruecknahme} />
        ) : null}
        {!gestartet ? (
          // Erst die Übersicht, dann `startAlle` im Bestätigen-Knopf: Auch ein
          // per Plus angelegter Lauf startet nicht ohne letzte Prüfung.
          <button
            type="button"
            onClick={() => setStartPruefen('aktiv')}
            className="h-16 w-full rounded-2xl bg-accent text-xl font-bold text-accent-fg shadow-lg active:scale-[0.99]"
          >
            Start alle
          </button>
        ) : alleBeendet ? (
          <div className="space-y-2">
            <p className="tabular text-center text-xs font-semibold text-ok">
              {serie && fortschritt
                ? `Serie beendet · ${fortschritt.gesamt} Runden`
                : `Alle ${lauf.bahnen.length} im Ziel`}
              {!serie && laufzeit !== null ? (
                <span data-laufzeit={Math.round(laufzeit)}>
                  {' · Laufzeit '}
                  {formatTime(laufzeit)}
                </span>
              ) : null}
            </p>
            <button
              type="button"
              onClick={() => setStartPruefen('neu')}
              className="h-16 w-full rounded-2xl bg-accent text-xl font-bold text-accent-fg shadow-lg active:scale-[0.99]"
            >
              Neuer Lauf
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            {/* Fehlt der Wake-Lock, wird der Fortschritt gelb gewarnt: Der
                Bildschirm kann mitten in der Messung ausgehen. */}
            <div className={app.brauchtTakt && !wach ? 'text-warn' : ''}>
              <p className="tabular text-sm font-semibold">
                {serie && fortschritt
                  ? `${fortschritt.fertig} von ${fortschritt.gesamt} Runden vollständig`
                  : `${imZiel} von ${lauf.bahnen.length} im Ziel`}
                {/* Zusätzlich zur Fortschrittsanzeige die verstrichene Laufzeit.
                    `data-laufzeit` macht sie für den e2e-Test prüfbar, ohne vom
                    formatierten Text abzuhängen. */}
                {laufzeit !== null ? (
                  <span data-laufzeit={Math.round(laufzeit)}>
                    {' · Laufzeit '}
                    {formatTime(laufzeit)}
                  </span>
                ) : null}
              </p>
              {/* Ein Hinweis zur Zeit: Wake-Lock, fehlende Starts, offene
                  Strecke oder der normale Ablauf. */}
              <p className={`text-xs ${app.brauchtTakt && !wach ? 'text-warn' : 'text-muted'}`}>
                {app.brauchtTakt && !wach
                  ? 'Display-Sperre nicht aktiv — Bildschirm kann sich ausschalten.'
                  : hatUnterbrochene
                    ? 'Unterbrochene Bahn: lange drücken, um Anschläge zurückzunehmen.'
                    : hatFehlendeStarts
                      ? 'Einzelne Runden oder Bahnen warten noch auf ihren Start.'
                      : offeneStrecke
                        ? '„Ziel“ auf der Zeile beendet eine Bahn.'
                        : 'Weiter tippen, bis alle im Ziel sind.'}
              </p>
            </div>
            {/* „Weiter“ und „Alle beenden“ schließen sich aus: erst fehlende
                Starts nachholen, sonst die offene Strecke abschließen. Bei
                fester Strecke gibt es keinen Zusatzknopf. */}
            {hatFehlendeStarts ? (
              <button
                type="button"
                onClick={weiter}
                className="h-12 shrink-0 rounded-xl border border-accent/60 bg-accent/15 px-4 text-sm font-bold text-accent"
              >
                Weiter
              </button>
            ) : offeneStrecke ? (
              <button
                type="button"
                onClick={alleBeenden}
                className="h-12 shrink-0 rounded-xl border border-ok/60 bg-ok/15 px-4 text-sm font-bold text-ok"
              >
                Alle beenden
              </button>
            ) : null}
          </div>
        )}
        </div>
      </div>

      {/* Im Lauf entscheidet das Sheet selbst, was noch änderbar ist: Strecke
          ist nach dem ersten Anschlag gesperrt, bei Serien der ganze Plan. */}
      <KonfigurationSheet open={sheet} onClose={() => setSheet(false)} modus="lauf" />

      {startUebersicht}

      {/* Verwerfen löscht die Messung samt Zeiten; deshalb Rückfrage und ein
          eigener Text für Serien. */}
      <Bestaetigung
        open={frageVerwerfen}
        titel={serie ? 'Serie abbrechen?' : 'Lauf verwerfen?'}
        text={
          serie
            ? 'Alle Wiederholungen und Zeiten dieser Serie werden gelöscht. Das lässt sich nicht rückgängig machen.'
            : 'Alle Zeiten dieses Laufs werden gelöscht. Das lässt sich nicht rückgängig machen.'
        }
        bestaetigenLabel={serie ? 'Serie verwerfen' : 'Verwerfen'}
        onBestaetigen={() => {
          setFrageVerwerfen(false)
          app.verwerfeAktivenLauf()
        }}
        onAbbrechen={() => setFrageVerwerfen(false)}
      />
    </div>
  )
}
