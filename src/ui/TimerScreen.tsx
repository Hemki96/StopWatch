import { useState } from 'react'
import { useApp } from '../app/AppProvider'
import { useNow } from '../app/useNow'
import { useWakeLock } from '../app/useWakeLock'
import { formatStrecke } from '../domain/format'
import { hasStarted, isFinished, laneStatus, lengthCount } from '../domain/lauf'
import { SCHWIMMARTEN } from '../domain/types'
import { Bestaetigung } from './Bestaetigung'
import { KonfigurationSheet } from './KonfigurationSheet'
import { LaneTile } from './LaneTile'
import { TrashIcon } from './icons'

function beschriftung(
  konfiguration: { beckenlaengeM: number; streckeM: number | null; schwimmart: string },
  bahnen: number,
): string {
  const art = SCHWIMMARTEN.find((s) => s.wert === konfiguration.schwimmart)?.label ?? ''
  return `${konfiguration.beckenlaengeM} m · ${formatStrecke(konfiguration.streckeM)} · ${art} · ${bahnen} Bahnen`
}

export function TimerScreen() {
  const app = useApp()
  const lauf = app.aktiverLauf
  const [sheet, setSheet] = useState(false)
  const [frageVerwerfen, setFrageVerwerfen] = useState(false)

  const laeuft = lauf?.bahnen.some((bahn) => laneStatus(bahn) === 'laeuft') ?? false
  const now = useNow(laeuft)
  const wach = useWakeLock(laeuft)

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

  const starte = () => {
    const perf = performance.now()
    const wall = Date.now()
    app.neuerLauf(
      app.einstellungen.konfiguration,
      app.einstellungen.bahnen,
      app.einstellungen.schwimmerProBahn,
    )
    app.startAlle(perf, wall)
  }

  if (!lauf) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-6">
          <h1 className="sr-only">Timer</h1>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Nächster Lauf</p>
          <button
            type="button"
            onClick={() => setSheet(true)}
            className="mt-2 w-full rounded-2xl border border-line bg-surface p-4 text-left"
          >
            <span className="text-lg font-semibold">
              {beschriftung(app.einstellungen.konfiguration, app.einstellungen.bahnen)}
            </span>
            <span className="mt-1 block text-sm text-accent">Ändern</span>
          </button>

          <div className="mt-10 space-y-3 text-sm leading-relaxed text-muted">
            <p>Ein Tap startet alle Bahnen mit demselben Zeitstempel.</p>
            <p>Danach tippst du jede Bahn bei jedem Anschlag an. Der letzte Anschlag ist das Ziel.</p>
            <p>Langes Drücken macht die letzte Aktion einer Bahn rückgängig.</p>
          </div>
        </div>

        <div className="border-t border-line p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <button
            type="button"
            onClick={starte}
            className="h-20 w-full rounded-2xl bg-accent text-2xl font-bold text-accent-fg shadow-lg active:scale-[0.99]"
          >
            Start
          </button>
        </div>

        <KonfigurationSheet open={sheet} onClose={() => setSheet(false)} modus="einstellungen" />
      </div>
    )
  }

  const gestartet = hasStarted(lauf)
  const alleBeendet = lauf.bahnen.every(isFinished)
  const imZiel = lauf.bahnen.filter(isFinished).length
  const offeneStrecke = lengthCount(lauf.konfiguration) === null

  const alleBeenden = () => {
    const perf = performance.now()
    const wall = Date.now()
    for (const bahn of lauf.bahnen) {
      if (laneStatus(bahn) === 'laeuft') app.beende(bahn.id, perf, wall)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <h1 className="sr-only">Timer</h1>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <button
          type="button"
          onClick={() => setSheet(true)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block text-[10px] font-bold uppercase tracking-wider text-muted">
            {gestartet ? 'Lauf' : 'Bereit'}
          </span>
          <span className="block truncate text-sm font-medium">
            {beschriftung(lauf.konfiguration, lauf.bahnen.length)}
          </span>
        </button>
        {gestartet ? (
          <button
            type="button"
            onClick={() => setFrageVerwerfen(true)}
            aria-label="Lauf verwerfen"
            className="grid h-10 w-10 place-items-center rounded-xl text-muted"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <div
        className="grid min-h-0 flex-1 auto-rows-fr gap-2 p-2"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(9rem, 100%), 1fr))' }}
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

      <div className="border-t border-line p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        {!gestartet ? (
          <button
            type="button"
            onClick={() => {
              const perf = performance.now()
              app.startAlle(perf, Date.now())
            }}
            className="h-16 w-full rounded-2xl bg-accent text-xl font-bold text-accent-fg shadow-lg active:scale-[0.99]"
          >
            Start alle
          </button>
        ) : alleBeendet ? (
          <div className="space-y-2">
            <p className="text-center text-xs font-semibold text-ok">
              Alle {lauf.bahnen.length} Bahnen im Ziel
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
            <div className={laeuft && !wach ? 'text-warn' : ''}>
              <p className="tabular text-sm font-semibold">
                {imZiel} von {lauf.bahnen.length} im Ziel
              </p>
              <p className={`text-xs ${laeuft && !wach ? 'text-warn' : 'text-muted'}`}>
                {laeuft && !wach
                  ? 'Display-Sperre nicht aktiv — Bildschirm kann sich ausschalten.'
                  : offeneStrecke
                    ? '„Ziel“ auf der Kachel beendet eine Bahn.'
                    : 'Weiter tippen, bis alle im Ziel sind.'}
              </p>
            </div>
            {offeneStrecke ? (
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

      <KonfigurationSheet open={sheet} onClose={() => setSheet(false)} modus="lauf" />

      <Bestaetigung
        open={frageVerwerfen}
        titel="Lauf verwerfen?"
        text="Alle Zeiten dieses Laufs werden gelöscht. Das lässt sich nicht rückgängig machen."
        bestaetigenLabel="Verwerfen"
        onBestaetigen={() => {
          setFrageVerwerfen(false)
          app.verwerfeAktivenLauf()
        }}
        onAbbrechen={() => setFrageVerwerfen(false)}
      />
    </div>
  )
}
