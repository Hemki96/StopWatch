import { useState } from 'react'
import { useApp } from '../app/AppProvider'
import type { Schwimmer } from '../domain/types'
import { Bestaetigung } from './Bestaetigung'
import { Sheet } from './Sheet'
import { ChevronRightIcon, PlusIcon } from './icons'

type Bearbeitung = { modus: 'neu' } | { modus: 'bearbeiten'; schwimmer: Schwimmer } | null

function SchwimmerFormular({
  eintrag,
  onClose,
}: {
  eintrag: Bearbeitung
  onClose: () => void
}) {
  const app = useApp()
  const vorhanden = eintrag?.modus === 'bearbeiten' ? eintrag.schwimmer : null
  const [name, setName] = useState(vorhanden?.name ?? '')
  const [jahrgang, setJahrgang] = useState(vorhanden?.jahrgang ? String(vorhanden.jahrgang) : '')
  const [notiz, setNotiz] = useState(vorhanden?.notiz ?? '')
  const [frageLoeschen, setFrageLoeschen] = useState(false)

  const speichern = () => {
    if (!name.trim()) return
    const jahr = Number.parseInt(jahrgang, 10)
    app.speichereSchwimmer({
      id: vorhanden?.id,
      name,
      jahrgang: Number.isFinite(jahr) ? jahr : null,
      notiz,
    })
    onClose()
  }

  return (
    <Sheet open={eintrag !== null} onClose={onClose} titel={vorhanden ? 'Schwimmer' : 'Neuer Schwimmer'}>
      <label className="mb-4 block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted">
          Name
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          placeholder="Vor- und Nachname"
          className="h-12 w-full rounded-xl border border-line bg-surface2 px-3 text-base"
        />
      </label>

      <label className="mb-4 block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted">
          Jahrgang
        </span>
        <input
          value={jahrgang}
          onChange={(e) => setJahrgang(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          placeholder="z. B. 2010"
          className="tabular h-12 w-full rounded-xl border border-line bg-surface2 px-3 text-base"
        />
      </label>

      <label className="mb-5 block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted">
          Notiz
        </span>
        <input
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
          placeholder="optional"
          className="h-12 w-full rounded-xl border border-line bg-surface2 px-3 text-base"
        />
      </label>

      <button
        type="button"
        onClick={speichern}
        disabled={!name.trim()}
        className="h-14 w-full rounded-xl bg-accent text-base font-bold text-accent-fg disabled:opacity-40"
      >
        Speichern
      </button>

      {vorhanden ? (
        <button
          type="button"
          onClick={() => setFrageLoeschen(true)}
          className="mt-3 h-12 w-full rounded-xl text-sm font-semibold text-danger"
        >
          Schwimmer löschen
        </button>
      ) : null}

      <Bestaetigung
        open={frageLoeschen}
        titel="Schwimmer löschen?"
        text="Bereits gemessene Zeiten bleiben erhalten, verlieren aber die Zuordnung."
        bestaetigenLabel="Löschen"
        onBestaetigen={() => {
          if (vorhanden) app.loescheSchwimmer(vorhanden.id)
          setFrageLoeschen(false)
          onClose()
        }}
        onAbbrechen={() => setFrageLoeschen(false)}
      />
    </Sheet>
  )
}

export function SchwimmerScreen() {
  const app = useApp()
  const [bearbeitung, setBearbeitung] = useState<Bearbeitung>(null)

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">Schwimmer</h1>
          <p className="text-xs text-muted">{app.schwimmer.length} Einträge</p>
        </div>
        <button
          type="button"
          onClick={() => setBearbeitung({ modus: 'neu' })}
          aria-label="Schwimmer hinzufügen"
          className="grid h-11 w-11 place-items-center rounded-full bg-accent text-accent-fg"
        >
          <PlusIcon className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-8 pt-3">
        {app.schwimmer.length === 0 ? (
          <p className="mt-16 text-center text-sm text-muted">
            Noch keine Schwimmer. Lege Namen an, um Bahnen zuzuordnen.
          </p>
        ) : null}

        <ul className="space-y-2">
          {app.schwimmer.map((schwimmer) => (
            <li key={schwimmer.id}>
              <button
                type="button"
                onClick={() => setBearbeitung({ modus: 'bearbeiten', schwimmer })}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{schwimmer.name}</p>
                  <p className="text-xs text-muted">
                    {schwimmer.jahrgang ? `Jahrgang ${schwimmer.jahrgang}` : 'ohne Jahrgang'}
                    {schwimmer.notiz ? ` · ${schwimmer.notiz}` : ''}
                  </p>
                </div>
                <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {bearbeitung ? (
        <SchwimmerFormular eintrag={bearbeitung} onClose={() => setBearbeitung(null)} />
      ) : null}
    </div>
  )
}
