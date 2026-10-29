/**
 * Rahmen der App: Ladephase, Onboarding, Hinweisbanner und die sechs Bereiche.
 *
 * `App` entscheidet anhand von `geladen` und dem Onboarding-Merkmal, was
 * gerendert wird, und hält den aktiven Tab als lokalen State. Alle Daten kommen
 * aus `useApp()`; PWA-Themen (Update, Offline, Tab-Rolle) werden hier nur
 * angezeigt, nicht verwaltet.
 *
 * Wichtig: Der aktive Tab wird nicht gespeichert und steht nicht in der URL.
 * Nach einem Neustart beginnt die App im Timer. Screens werden beim Tab-Wechsel
 * ausgehängt — laufende Messungen dürfen deshalb nicht in den Screens liegen,
 * sondern im Provider. Der Timer ist der einzige statisch geladene Screen; alle
 * übrigen Bereiche kommen per `React.lazy` nach.
 */
import { lazy, Suspense, useEffect, useState } from 'react'
import { useApp } from './app/AppProvider'
import { leseTextMitRueckfall, schreibeText } from './app/lokalSpeicher'
import { useOnlineStatus, useServiceWorkerUpdate } from './app/pwa'
import { BereichLadezustand } from './ui/Ladezustand'
import { Onboarding } from './ui/Onboarding'
import { SpeicherBanner } from './ui/SpeicherBanner'
import { TimerScreen } from './ui/TimerScreen'
import {
  GearIcon,
  HistoryIcon,
  PeopleIcon,
  TimerIcon,
  TrainingIcon,
  TrophyIcon,
  XIcon,
} from './ui/icons'

/** Die sechs Bereiche. Die IDs sind zugleich die Schlüssel in `TABS`. */
type Tab = 'timer' | 'training' | 'wettkampf' | 'verlauf' | 'schwimmer' | 'einstellungen'

/**
 * Navigationsreihenfolge der unteren Leiste. Die Reihenfolge ist bewusst fest
 * (Messung zuerst) und muss zum `grid-cols-6` der Navigation passen.
 */
const TABS = [
  { id: 'timer' as const, label: 'Timer', Icon: TimerIcon },
  { id: 'training' as const, label: 'Training', Icon: TrainingIcon },
  { id: 'wettkampf' as const, label: 'Wettkampf', Icon: TrophyIcon },
  { id: 'verlauf' as const, label: 'Verlauf', Icon: HistoryIcon },
  { id: 'schwimmer' as const, label: 'Schwimmer', Icon: PeopleIcon },
  { id: 'einstellungen' as const, label: 'Mehr', Icon: GearIcon },
]

/**
 * Alle Bereiche außer dem Timer werden erst beim ersten Aufruf geladen.
 *
 * Der Timer bleibt der sofortige Einstieg, weil die Messung ohne Nachladen
 * beginnen muss. Jeder `import()` wird zu einem eigenen Chunk; der Service
 * Worker precacht wegen `globPatterns` in `vite.config.ts` trotzdem alle.
 * `Onboarding` bleibt statisch, weil es beim allerersten Start sofort
 * erscheinen muss.
 */
const TrainingScreen = lazy(() =>
  import('./ui/TrainingScreen').then((modul) => ({ default: modul.TrainingScreen })),
)
const WettkampfScreen = lazy(() =>
  import('./ui/WettkampfScreen').then((modul) => ({ default: modul.WettkampfScreen })),
)
const HistoryScreen = lazy(() =>
  import('./ui/HistoryScreen').then((modul) => ({ default: modul.HistoryScreen })),
)
const SchwimmerScreen = lazy(() =>
  import('./ui/SchwimmerScreen').then((modul) => ({ default: modul.SchwimmerScreen })),
)
const SettingsScreen = lazy(() =>
  import('./ui/SettingsScreen').then((modul) => ({ default: modul.SettingsScreen })),
)

/**
 * Merker für das Onboarding. Bewusst nur ein Wert (`fertig`) statt eines
 * Zeitstempels: Es gibt keine Versionierung der Einführung, und ein fehlender
 * Wert genügt als „noch nicht gesehen“.
 */
const ONBOARDING_KEY = 'onboarding'

/**
 * Liest das Onboarding-Merkmal einmalig beim Start.
 *
 * Ohne lesbaren `localStorage` gilt das Onboarding als erledigt: Sonst würde es
 * bei jedem Start erneut erscheinen, weil es sich nicht dauerhaft merken lässt.
 * `leseTextMitRueckfall` unterscheidet genau diese beiden Fälle: fehlender Wert
 * (null) zeigt das Onboarding, ein Speicherfehler liefert `fertig`.
 */
function onboardingGemerkt(): boolean {
  return leseTextMitRueckfall(ONBOARDING_KEY, 'fertig') === 'fertig'
}

/**
 * Wurzelkomponente der Oberfläche.
 *
 * Drei Ausgabezustände in fester Reihenfolge: Ladeansicht (bis IndexedDB
 * gelesen ist), Onboarding (nur beim ersten Start) und der eigentliche Rahmen
 * mit Kopfzeilen-Bannern, aktivem Screen und Tab-Leiste. Der Toast liegt
 * außerhalb der Screens und bleibt dauerhaft im DOM.
 *
 * Aktionen sind nur in dem Tab wirksam, der die Messung hält; die passende
 * Sperre setzt der Provider. Diese Komponente verlässt sich darauf und zeigt
 * bei `tabGesperrt` nur den Hinweis mit „Hier weiterarbeiten“.
 */
export default function App() {
  const {
    geladen,
    toast,
    speicherFehler,
    laeufe,
    schwimmer,
    tabGesperrt,
    tabAktiv,
    uebernehmen,
    brauchtTakt,
  } = useApp()
  const [tab, setTab] = useState<Tab>('timer')
  const [onboardingFertig, setOnboardingFertig] = useState(onboardingGemerkt)
  const [ladeHinweis, setLadeHinweis] = useState(false)
  const update = useServiceWorkerUpdate()
  const online = useOnlineStatus()

  // Ein blockiertes IndexedDB-Upgrade (älterer Tab noch offen) würde sonst
  // dauerhaft bei „Wird geladen …“ stehen.
  useEffect(() => {
    if (geladen) return
    const timer = window.setTimeout(() => setLadeHinweis(true), 5000)
    return () => window.clearTimeout(timer)
  }, [geladen])

  // Merkt den Abschluss für künftige Starts. Der State ist die Wahrheit für
  // diese Sitzung, der Speicher nur die Erinnerung darüber hinaus.
  const merkeOnboarding = () => {
    // Ohne localStorage erscheint das Onboarding beim nächsten Start erneut.
    schreibeText(ONBOARDING_KEY, 'fertig')
    setOnboardingFertig(true)
  }

  // Bestehende Installationen haben schon Daten und brauchen kein Onboarding.
  useEffect(() => {
    if (geladen && !onboardingFertig && (laeufe.length > 0 || schwimmer.length > 0)) {
      schreibeText(ONBOARDING_KEY, 'fertig')
      setOnboardingFertig(true)
    }
  }, [geladen, onboardingFertig, laeufe.length, schwimmer.length])

  // Jede laufende oder geplante Bahn hält ein Update zurück. Ein angelegter
  // oder vollständig beendeter Lauf kostet beim Neuladen nichts.
  const laufLaeuft = brauchtTakt

  if (!geladen) {
    return (
      <div className="safe-x grid h-dvh place-items-center bg-bg px-8 text-center text-sm text-muted">
        <div className="max-w-xs">
          <p>Wird geladen …</p>
          {ladeHinweis ? (
            <div role="status" className="mt-4 space-y-3">
              <p className="leading-relaxed">
                Das dauert länger als erwartet. Ist Beckenrand noch in einem anderen Tab geöffnet?
                Schließe ihn und lade die Seite neu.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="h-11 w-full rounded-xl bg-accent text-sm font-semibold text-accent-fg"
              >
                Neu laden
              </button>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  if (!onboardingFertig) {
    return (
      <div className="safe-x flex h-dvh flex-col bg-bg text-fg">
        {speicherFehler ? <SpeicherBanner sichtbar /> : null}
        <main className="mx-auto min-h-0 w-full max-w-lg flex-1 rail:max-w-xl">
          <Onboarding onFertig={merkeOnboarding} />
        </main>
      </div>
    )
  }

  return (
    // `data-tab-status` ist die Bereitschaftsanzeige für die E2E-Tests: Aktionen
    // sind erst wirksam, wenn dieser Tab die Messung hält.
    <div
      className="safe-x flex h-dvh flex-col bg-bg text-fg"
      data-tab-status={tabAktiv ? 'aktiv' : tabGesperrt ? 'gesperrt' : 'startet'}
    >
      {update.verfuegbar ? (
        <div
          role="status"
          className="flex items-center gap-2 border-b border-line bg-surface2 px-3 py-2 text-xs"
        >
          <span className="min-w-0 flex-1 text-muted">
            {laufLaeuft
              ? 'Neue Version verfügbar — erst nach dem Lauf neu laden.'
              : 'Neue Version verfügbar.'}
          </span>
          <button
            type="button"
            onClick={update.neuLaden}
            // Ein Reload mitten in der Messung würde laufende Bahnen auf
            // „bereit“ zurücksetzen; deshalb erst nach dem Lauf erlaubt.
            disabled={laufLaeuft}
            className="rounded-full bg-accent px-3 py-1 font-medium text-accent-fg disabled:opacity-40"
          >
            Neu laden
          </button>
          <button
            type="button"
            onClick={update.spaeter}
            aria-label="Hinweis ausblenden"
            className="grid h-7 w-7 place-items-center rounded-full text-muted"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {speicherFehler ? <SpeicherBanner sichtbar /> : null}

      {tabGesperrt ? (
        <div
          role="status"
          className="flex items-center gap-2 border-b border-warn/40 bg-warn/10 px-3 py-2 text-[11px] text-warn"
        >
          <span className="min-w-0 flex-1 font-medium">
            Beckenrand ist bereits in einem anderen Tab offen. Dieser Tab ist nur lesend.
          </span>
          <button
            type="button"
            onClick={uebernehmen}
            className="shrink-0 rounded-full bg-warn px-3 py-1 font-bold text-black"
          >
            Hier weiterarbeiten
          </button>
        </div>
      ) : null}

      {!online ? (
        <p
          role="status"
          className="border-b border-line bg-surface2 px-3 py-1.5 text-center text-[11px] text-muted"
        >
          Offline — Zeiten werden weiterhin lokal gespeichert.
        </p>
      ) : null}

      {/* Nur der gewählte Screen ist montiert. Alles, was einen Tab-Wechsel
          überleben muss, liegt im Provider; lokale Formularstände gehen
          bewusst verloren. */}
      <div className="flex min-h-0 flex-1 flex-col rail:flex-row">
        <main className="order-first min-h-0 flex-1 overflow-hidden rail:order-none">
          {/* Auf dem Tablet wächst der Inhalt nicht über eine lesbare Breite
              hinaus; auf dem Handy bleibt die volle Breite. */}
          <div className="mx-auto h-full w-full max-w-5xl">
            {/* Der Fallback füllt dieselbe Fläche wie der Screen; der aktive
                Tab bleibt in `App` und die Navigation montiert, damit ein
                Wechsel während des Ladens weder Zustand noch Fokus verliert. */}
            <Suspense fallback={<BereichLadezustand />}>
              {tab === 'timer' && <TimerScreen />}
              {tab === 'training' && <TrainingScreen onZumTimer={() => setTab('timer')} />}
              {tab === 'wettkampf' && <WettkampfScreen />}
              {tab === 'verlauf' && <HistoryScreen />}
              {tab === 'schwimmer' && <SchwimmerScreen />}
              {tab === 'einstellungen' && <SettingsScreen />}
            </Suspense>
          </div>
        </main>

        {/* Handy: untere Leiste. Tablet: schmale Leiste links, damit die
            Messfläche die volle Höhe behält. Die DOM-Reihenfolge bleibt für
            Tastatur und Screenreader in beiden Fällen gleich. */}
        <nav
          aria-label="Bereiche"
          className="order-last border-t border-line bg-surface rail:order-first rail:w-24 rail:shrink-0 rail:border-r rail:border-t-0"
        >
          <div className="mx-auto grid w-full max-w-lg grid-cols-6 rail:max-w-none rail:grid-cols-1 rail:gap-1 rail:px-2 rail:py-4">
            {TABS.map(({ id, label, Icon }) => {
              const aktiv = tab === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={aktiv ? 'page' : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 px-0.5 pb-[max(env(safe-area-inset-bottom),0.35rem)] pt-2 text-[10px] font-medium leading-tight transition-colors min-[360px]:text-[11px] short:min-h-12 short:flex-row short:gap-1.5 short:pt-1 short:text-xs rail:min-h-16 rail:flex-col rail:gap-1.5 rail:rounded-xl rail:pb-2 rail:pt-2 rail:text-xs ${
                    aktiv
                      ? 'text-accent rail:bg-accent/10'
                      : 'text-muted rail:hover:bg-surface2'
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  {label}
                </button>
              )
            })}
          </div>
        </nav>
      </div>

      {/* Bleibt dauerhaft im DOM, sonst kündigen Screenreader den Toast nicht an.
          Der Abstand hält ihn über der unteren Aktionsleiste — auch auf dem
          Tablet, wo es keine Tab-Leiste, aber weiterhin den festen Aktionsknopf
          gibt. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 rail:bottom-32"
      >
        {toast ? (
          <div className="rounded-full bg-fg px-4 py-2 text-sm font-medium text-bg shadow-xl">
            {toast}
          </div>
        ) : null}
      </div>
    </div>
  )
}
