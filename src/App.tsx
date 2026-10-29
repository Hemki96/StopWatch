import { useEffect, useState } from 'react'
import { useApp } from './app/AppProvider'
import { useOnlineStatus, useServiceWorkerUpdate } from './app/pwa'
import { hatLaufendeBahn } from './domain/lauf'
import { HistoryScreen } from './ui/HistoryScreen'
import { Onboarding } from './ui/Onboarding'
import { SchwimmerScreen } from './ui/SchwimmerScreen'
import { SettingsScreen } from './ui/SettingsScreen'
import { SpeicherBanner } from './ui/SpeicherBanner'
import { TimerScreen } from './ui/TimerScreen'
import { GearIcon, HistoryIcon, PeopleIcon, TimerIcon, XIcon } from './ui/icons'

type Tab = 'timer' | 'verlauf' | 'schwimmer' | 'einstellungen'

const TABS = [
  { id: 'timer' as const, label: 'Timer', Icon: TimerIcon },
  { id: 'verlauf' as const, label: 'Verlauf', Icon: HistoryIcon },
  { id: 'schwimmer' as const, label: 'Schwimmer', Icon: PeopleIcon },
  { id: 'einstellungen' as const, label: 'Mehr', Icon: GearIcon },
]

const ONBOARDING_KEY = 'beckenrand.onboarding'

function onboardingGemerkt(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'fertig'
  } catch {
    return true
  }
}

export default function App() {
  const {
    geladen,
    toast,
    aktiverLauf,
    speicherFehler,
    laeufe,
    schwimmer,
    tabGesperrt,
    tabAktiv,
    uebernehmen,
  } = useApp()
  const [tab, setTab] = useState<Tab>('timer')
  const [onboardingFertig, setOnboardingFertig] = useState(onboardingGemerkt)
  const update = useServiceWorkerUpdate()
  const online = useOnlineStatus()

  const merkeOnboarding = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, 'fertig')
    } catch {
      // Ohne localStorage erscheint das Onboarding beim nächsten Start erneut.
    }
    setOnboardingFertig(true)
  }

  // Bestehende Installationen haben schon Daten und brauchen kein Onboarding.
  useEffect(() => {
    if (geladen && !onboardingFertig && (laeufe.length > 0 || schwimmer.length > 0)) {
      try {
        localStorage.setItem(ONBOARDING_KEY, 'fertig')
      } catch {
        // Siehe oben.
      }
      setOnboardingFertig(true)
    }
  }, [geladen, onboardingFertig, laeufe.length, schwimmer.length])

  // Nur eine tatsächlich laufende Bahn hält ein Update zurück. Ein angelegter
  // oder vollständig beendeter Lauf kostet beim Neuladen nichts.
  const laufLaeuft = hatLaufendeBahn(aktiverLauf)

  if (!geladen) {
    return (
      <div className="grid h-dvh place-items-center bg-bg text-sm text-muted">
        Wird geladen …
      </div>
    )
  }

  if (!onboardingFertig) {
    return (
      <div className="h-dvh bg-bg text-fg">
        <main className="mx-auto h-full max-w-lg">
          <Onboarding onFertig={merkeOnboarding} />
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg" data-tab-status={tabAktiv ? 'aktiv' : tabGesperrt ? 'gesperrt' : 'startet'}>
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

      <main className="min-h-0 flex-1">
        {tab === 'timer' && <TimerScreen />}
        {tab === 'verlauf' && <HistoryScreen />}
        {tab === 'schwimmer' && <SchwimmerScreen />}
        {tab === 'einstellungen' && <SettingsScreen />}
      </main>

      <nav aria-label="Bereiche" className="border-t border-line bg-surface">
        <div className="grid grid-cols-4">
          {TABS.map(({ id, label, Icon }) => {
            const aktiv = tab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-current={aktiv ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 pb-[max(env(safe-area-inset-bottom),0.35rem)] pt-2 text-[11px] font-medium transition-colors ${
                  aktiv ? 'text-accent' : 'text-muted'
                }`}
              >
                <Icon className="h-6 w-6" />
                {label}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Bleibt dauerhaft im DOM, sonst kündigen Screenreader den Toast nicht an. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4"
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
