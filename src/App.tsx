import { useState } from 'react'
import { useApp } from './app/AppProvider'
import { HistoryScreen } from './ui/HistoryScreen'
import { SchwimmerScreen } from './ui/SchwimmerScreen'
import { SettingsScreen } from './ui/SettingsScreen'
import { TimerScreen } from './ui/TimerScreen'
import { GearIcon, HistoryIcon, PeopleIcon, TimerIcon } from './ui/icons'

type Tab = 'timer' | 'verlauf' | 'schwimmer' | 'einstellungen'

const TABS = [
  { id: 'timer' as const, label: 'Timer', Icon: TimerIcon },
  { id: 'verlauf' as const, label: 'Verlauf', Icon: HistoryIcon },
  { id: 'schwimmer' as const, label: 'Schwimmer', Icon: PeopleIcon },
  { id: 'einstellungen' as const, label: 'Mehr', Icon: GearIcon },
]

export default function App() {
  const { geladen, toast } = useApp()
  const [tab, setTab] = useState<Tab>('timer')

  if (!geladen) {
    return (
      <div className="grid h-dvh place-items-center bg-bg text-sm text-muted">
        Wird geladen …
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <main className="min-h-0 flex-1">
        {tab === 'timer' && <TimerScreen />}
        {tab === 'verlauf' && <HistoryScreen />}
        {tab === 'schwimmer' && <SchwimmerScreen />}
        {tab === 'einstellungen' && <SettingsScreen />}
      </main>

      <nav className="border-t border-line bg-surface">
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

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div className="rounded-full bg-fg px-4 py-2 text-sm font-medium text-bg shadow-xl">
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  )
}
