import { useState } from 'react'
import { useApp } from '../app/AppProvider'
import { formatStrecke } from '../domain/format'
import { SCHWIMMARTEN } from '../domain/types'
import { csvDateiname, laeufeAlsCsv } from '../export/csv'
import { speichereDatei, waehleDatei } from '../export/datei'
import { clearAll, exportBackup, importBackup } from '../storage/repository'
import { Bestaetigung } from './Bestaetigung'
import { KonfigurationSheet } from './KonfigurationSheet'
import { DownloadIcon, MoonIcon, SunIcon, UploadIcon } from './icons'

function Karte({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-2xl border border-line bg-surface">{children}</div>
}

function Zeile({
  label,
  wert,
  onClick,
  icon,
  gefahr,
}: {
  label: string
  wert?: string
  onClick: () => void
  icon?: React.ReactNode
  gefahr?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left last:border-b-0"
    >
      {icon ? <span className="text-muted">{icon}</span> : null}
      <span className="flex-1">
        <span className={`block text-sm font-medium ${gefahr ? 'text-danger' : ''}`}>{label}</span>
        {wert ? <span className="block text-xs text-muted">{wert}</span> : null}
      </span>
    </button>
  )
}

export function SettingsScreen() {
  const app = useApp()
  const [sheet, setSheet] = useState(false)
  const [frageLoeschen, setFrageLoeschen] = useState(false)

  const konfiguration = app.einstellungen.konfiguration
  const art = SCHWIMMARTEN.find((s) => s.wert === konfiguration.schwimmart)?.label ?? ''

  const exportiereCsv = () => {
    const csv = laeufeAlsCsv(app.laeufe, app.satze, app.schwimmer)
    void speichereDatei(csvDateiname(), csv, 'text/csv;charset=utf-8')
  }

  const exportiereBackup = async () => {
    const backup = await exportBackup()
    await speichereDatei(
      `beckenrand-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(backup, null, 2),
      'application/json',
    )
  }

  const importiereBackup = async () => {
    const datei = await waehleDatei('application/json')
    if (!datei) return
    try {
      const inhalt = JSON.parse(await datei.text())
      await importBackup(inhalt)
      await app.neuLaden()
      app.zeigeToast('Backup importiert.')
    } catch {
      app.zeigeToast('Datei konnte nicht gelesen werden.')
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line px-4 py-3">
        <h1 className="text-lg font-semibold">Einstellungen</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-4">
        <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted">
          Darstellung
        </h2>
        <Karte>
          <Zeile
            label={app.theme === 'dark' ? 'Dunkles Design' : 'Helles Design'}
            wert="Antippen zum Wechseln"
            onClick={app.toggleTheme}
            icon={app.theme === 'dark' ? <MoonIcon className="h-5 w-5" /> : <SunIcon className="h-5 w-5" />}
          />
        </Karte>

        <h2 className="mb-2 mt-6 px-1 text-[11px] font-bold uppercase tracking-wider text-muted">
          Nächster Lauf
        </h2>
        <Karte>
          <Zeile
            label={`${konfiguration.beckenlaengeM} m-Becken · ${app.einstellungen.bahnen} Bahnen`}
            wert={`${formatStrecke(konfiguration.streckeM)} · ${art}`}
            onClick={() => setSheet(true)}
          />
        </Karte>

        <h2 className="mb-2 mt-6 px-1 text-[11px] font-bold uppercase tracking-wider text-muted">
          Daten
        </h2>
        <Karte>
          <Zeile
            label="Ergebnisse als CSV"
            wert={`${app.laeufe.length} Läufe`}
            onClick={exportiereCsv}
            icon={<DownloadIcon className="h-5 w-5" />}
          />
          <Zeile
            label="Backup sichern"
            wert="Alle Daten als JSON"
            onClick={() => void exportiereBackup()}
            icon={<DownloadIcon className="h-5 w-5" />}
          />
          <Zeile
            label="Backup einlesen"
            onClick={() => void importiereBackup()}
            icon={<UploadIcon className="h-5 w-5" />}
          />
          <Zeile
            label="Alle Daten löschen"
            onClick={() => setFrageLoeschen(true)}
            gefahr
          />
        </Karte>

        <p className="mt-4 px-1 text-xs leading-relaxed text-muted">
          Die Daten liegen ausschließlich auf diesem Gerät. Sichere regelmäßig ein Backup — beim
          Löschen der Browserdaten sind sie sonst weg.
        </p>

        <h2 className="mb-2 mt-6 px-1 text-[11px] font-bold uppercase tracking-wider text-muted">
          Installation
        </h2>
        <p className="px-1 text-xs leading-relaxed text-muted">
          iPhone: Teilen-Symbol → „Zum Home-Bildschirm“. Android: Menü → „App installieren“. Danach
          startet die App ohne Browserleiste und funktioniert offline.
        </p>

        <p className="mt-8 text-center text-[11px] text-muted">Beckenrand 0.1.0</p>
      </div>

      <KonfigurationSheet open={sheet} onClose={() => setSheet(false)} modus="einstellungen" />

      <Bestaetigung
        open={frageLoeschen}
        titel="Alle Daten löschen?"
        text="Schwimmer, Läufe und Sätze werden dauerhaft von diesem Gerät entfernt."
        bestaetigenLabel="Alles löschen"
        onBestaetigen={() => {
          setFrageLoeschen(false)
          void clearAll()
            .then(() => app.neuLaden())
            .then(() => app.zeigeToast('Alle Daten gelöscht.'))
        }}
        onAbbrechen={() => setFrageLoeschen(false)}
      />
    </div>
  )
}
