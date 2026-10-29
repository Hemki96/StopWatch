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
import { useApp, type AktiverEintrag } from '../app/AppProvider'
import { useNow } from '../app/useNow'
import { useWakeLock } from '../app/useWakeLock'
import { formatStrecke, formatTakt } from '../domain/format'
import { hasStarted, isComplete, isFinished, laneStatusAt, lengthCount } from '../domain/lauf'
import { istSerie, aktuelleRunde, runden as rundenVon, serieFortschritt } from '../domain/serie'
import { SCHWIMMARTEN, type Lauf, type Satz, type SatzPlan } from '../domain/types'
import { Bestaetigung } from './Bestaetigung'
import { KonfigurationSheet } from './KonfigurationSheet'
import { LaneTile } from './LaneTile'
import { SerieAnsicht } from './SerieAnsicht'
import { TrashIcon, XIcon } from './icons'

/** Deutsches Label zur Schwimmart; unbekannte Werte bleiben leer. */
function artLabel(schwimmart: string): string {
  return SCHWIMMARTEN.find((s) => s.wert === schwimmart)?.label ?? ''
}

/**
 * Einzeilige Beschreibung eines Laufs für Kopfzeile und Vorschau:
 * Beckenlänge, Strecke (bei Serien mit Wiederholungszahl), Schwimmart,
 * Bahnzahl und – falls gesetzt – Startversatz und Takt.
 */
function beschriftung(
  konfiguration: { beckenlaengeM: number; streckeM: number | null; schwimmart: string },
  bahnen: number,
  startversatzMs: number,
  plan: SatzPlan | null,
): string {
  const strecke = formatStrecke(konfiguration.streckeM)
  const teile = [
    `${konfiguration.beckenlaengeM} m`,
    plan && plan.wiederholungen > 1 ? `${plan.wiederholungen}×${strecke}` : strecke,
    artLabel(konfiguration.schwimmart),
    `${bahnen} Bahnen`,
  ]
  if (startversatzMs > 0) teile.push(`${startversatzMs / 1000} s Versatz`)
  if (plan && plan.wiederholungen > 1) {
    teile.push(`Takt ${formatTakt(plan.taktSek)}`)
  }
  return teile.join(' · ')
}

/** Kurztitel für die Laufleiste; Serien nennen die Wiederholungszahl mit. */
function kurzTitel(lauf: Lauf, satz: Satz | null): string {
  const strecke = formatStrecke(lauf.konfiguration.streckeM)
  const art = artLabel(lauf.konfiguration.schwimmart)
  if (istSerie(satz) && satz?.plan) {
    return `${satz.plan.wiederholungen}×${strecke} · ${art}`
  }
  return `${strecke} · ${art}`
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
      },
    )
    // Ohne Lauf (etwa bei ungültiger Konfiguration) bleibt der Start aus.
    if (!laufId) return
    app.startAlle(perf, wall)
  }

  // Kein aktiver Lauf: Vorschau der Einstellungen mit Startknopf.
  if (!lauf) {
    const einstellungen = app.einstellungen
    // Erst ab zwei Wiederholungen ist der Satz eine Serie mit festem Takt;
    // eine einzelne Wiederholung braucht keinen Plan.
    const plan: SatzPlan | null =
      einstellungen.wiederholungen > 1
        ? {
            wiederholungen: einstellungen.wiederholungen,
            taktSek: einstellungen.taktSek,
            startversatzMs: einstellungen.startversatzMs,
          }
        : null
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
                  einstellungen.bahnen,
                  einstellungen.startversatzMs,
                  plan,
                )}
              </span>
              <span className="mt-1 block text-sm text-accent">Ändern</span>
            </button>

            <div className="mt-10 space-y-3 text-sm leading-relaxed text-muted">
              <p>
                Ein Tap startet alle Bahnen. Mit Startversatz läuft Bahn 2 zehn Sekunden später los.
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
              onClick={starte}
              className="h-20 w-full rounded-2xl bg-accent text-2xl font-bold text-accent-fg shadow-lg active:scale-[0.99]"
            >
              Start
            </button>
          </div>
        </div>

        <KonfigurationSheet open={sheet} onClose={() => setSheet(false)} modus="einstellungen" />
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
  const plan = satz?.plan ?? null
  // Runde, die laut Uhr gerade im Becken ist; mindestens 1, damit die Anzeige
  // schon vor dem ersten Start „Runde 1“ zeigt.
  const rundeJetzt = serie ? Math.max(1, aktuelleRunde(runden, now)) : 0
  // Bei Serien gilt der Versatz des Plans, sonst der des Laufs.
  const startversatzMs = serie && plan ? plan.startversatzMs : lauf.startversatzMs
  // Spaltenzahl passend zur Bahnzahl: Eine einzelne Bahn bleibt groß, vier
  // Bahnen bilden kein 3+1, sechs kein 4+2. So sind die Reihen auf dem Tablet
  // ausgeglichen, ohne dass die Kacheln zu Streifen werden.
  const bahnAnzahl = lauf.bahnen.length
  const bahnSpalten =
    bahnAnzahl === 1
      ? 'grid-cols-1'
      : bahnAnzahl === 2
        ? 'grid-cols-2'
        : bahnAnzahl === 3
          ? 'grid-cols-2 min-[560px]:grid-cols-3'
          : bahnAnzahl === 4
            ? 'grid-cols-2 short:grid-cols-4 lg:grid-cols-4'
            : bahnAnzahl <= 6
              ? 'grid-cols-2 min-[560px]:grid-cols-3'
              : bahnAnzahl <= 8
                ? 'grid-cols-2 min-[560px]:grid-cols-3 lg:grid-cols-4'
                : 'grid-cols-2 min-[560px]:grid-cols-3 lg:grid-cols-5'

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
  const hatFehlendeStarts =
    serie &&
    gestartet &&
    runden.some((runde) =>
      runde.bahnen.some((bahn) => bahn.startMs === null && !isFinished(bahn)),
    )
  const weiter = () => {
    const perf = performance.now()
    // startAlle ergänzt nur Bahnen ohne Startzeit; vorhandene bleiben stehen.
    app.startAlle(perf, Date.now())
  }

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
          <span className="block truncate text-sm font-medium">
            {beschriftung(lauf.konfiguration, lauf.bahnen.length, startversatzMs, plan)}
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
          onTap={app.tippeSerie}
          onUndo={app.rueckgaengigSerie}
          onFinish={app.beendeSerie}
        />
      ) : (
        <div
          // Ab drei Bahnen wächst die Spaltenzahl mit dem Gerät; die Kacheln
          // behalten eine Mindesthöhe und scrollen, statt auf schmalen Displays
          // zusammenzuschrumpfen.
          className={`grid min-h-0 flex-1 auto-rows-[minmax(7.5rem,1fr)] gap-2 overflow-y-auto p-2 rail:gap-3 rail:p-4 ${bahnSpalten}`}
        >
          {lauf.bahnen.map((bahn) => (
            <LaneTile
              key={bahn.id}
              bahn={bahn}
              konfiguration={lauf.konfiguration}
              now={now}
              schwimmerName={schwimmerName(bahn.schwimmerId)}
              onTap={app.tippe}
              onUndo={app.rueckgaengig}
              onFinish={app.beende}
            />
          ))}
        </div>
      )}

      {/* Fußzeile mit der jeweils nächsten sinnvollen Aktion: starten,
          abschließen oder den Fortschritt bestätigen. */}
      <div className="border-t border-line p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] rail:px-4">
        <div className="mx-auto w-full max-w-3xl">
        {!gestartet ? (
          // „Start alle“ und „Weiter“ teilen sich denselben Aufruf: startAll
          // ergänzt nur Bahnen, die noch keine Startzeit haben.
          <button
            type="button"
            onClick={weiter}
            className="h-16 w-full rounded-2xl bg-accent text-xl font-bold text-accent-fg shadow-lg active:scale-[0.99]"
          >
            Start alle
          </button>
        ) : alleBeendet ? (
          <div className="space-y-2">
            <p className="text-center text-xs font-semibold text-ok">
              {serie && fortschritt
                ? `Serie beendet · ${fortschritt.gesamt} Runden`
                : `Alle ${lauf.bahnen.length} Bahnen im Ziel`}
            </p>
            <button
              type="button"
              onClick={starte}
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
              </p>
              {/* Ein Hinweis zur Zeit: Wake-Lock, fehlende Starts, offene
                  Strecke oder der normale Ablauf. */}
              <p className={`text-xs ${app.brauchtTakt && !wach ? 'text-warn' : 'text-muted'}`}>
                {app.brauchtTakt && !wach
                  ? 'Display-Sperre nicht aktiv — Bildschirm kann sich ausschalten.'
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
        bestaetigenLabel={serie ? 'Abbrechen' : 'Verwerfen'}
        onBestaetigen={() => {
          setFrageVerwerfen(false)
          app.verwerfeAktivenLauf()
        }}
        onAbbrechen={() => setFrageVerwerfen(false)}
      />
    </div>
  )
}
