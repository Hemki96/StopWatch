/**
 * Einstellungen: Darstellung, Vorgaben für den nächsten Lauf, Daten und Installation.
 *
 * Der Screen bündelt alles, was nicht zur laufenden Messung gehört: Theme,
 * Standardkonfiguration (öffnet `KonfigurationSheet` im Modus „einstellungen“),
 * CSV-Export, JSON-Backup mit Prüfvorschau, den dauerhaften Speicher und den
 * Installationshinweis. Datenändernde Aktionen (Import, Löschen) sind gesperrt,
 * solange dieser Tab nicht der aktive ist (`app.tabGesperrt`), damit nur ein Tab
 * den Bestand verändert. Gelesen und geschrieben wird über `app/AppProvider`;
 * Dateiformate kommen aus export/, Datenzugriffe und Prüfungen aus app/.
 */
import { useId, useState } from 'react'
import { useApp, type Backup, type ImportKonflikte } from '../app/AppProvider'
import { useInstallPrompt } from '../app/pwa'
import { formatStrecke, formatTakt, lokalesDatum } from '../domain/format'
import { einheitVon, formatBeckenlaenge } from '../domain/einheit'
import { csvDateiname, laeufeAlsCsv } from '../export/csv'
import { speichereDatei, waehleDatei } from '../export/datei'
import { Bestaetigung } from './Bestaetigung'
import { KonfigurationSheet } from './KonfigurationSheet'
import { Sheet } from './Sheet'
import { CheckIcon, DownloadIcon, MoonIcon, SunIcon, UploadIcon } from './icons'

/** Karte als optischer Rahmen für eine Gruppe von Einstellungszeilen. */
function Karte({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-2xl border border-line bg-surface">{children}</div>
}

/**
 * Eine Zeile innerhalb einer Karte: Label, optionaler Erklärtext und Icon.
 *
 * `gefahr` färbt den Text für nicht umkehrbare Aktionen, `disabled` sperrt die
 * Zeile etwa während der Tab gesperrt ist. Die Zeile ist immer ein Button,
 * damit die ganze Fläche als Ziel dient.
 */
function Zeile({
  label,
  wert,
  onClick,
  icon,
  gefahr,
  disabled,
}: {
  label: string
  wert?: string
  onClick: () => void
  icon?: React.ReactNode
  gefahr?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left last:border-b-0 disabled:opacity-40"
    >
      {icon ? <span className="text-muted">{icon}</span> : null}
      <span className="flex-1">
        <span className={`block text-sm font-medium ${gefahr ? 'text-danger' : ''}`}>{label}</span>
        {wert ? <span className="block text-xs text-muted">{wert}</span> : null}
      </span>
    </button>
  )
}

/**
 * Einstellungs-Tab mit Darstellung, Lauf-Vorgaben, Daten und Installation.
 *
 * Alle Aktionen laufen über `app`: Theme umschalten, Standardkonfiguration
 * ändern, CSV/Backup schreiben, Backup nach Prüfung einlesen oder alle Daten
 * löschen. Import und Löschen fragen vorher nach; Fehler landen als Meldung im
 * Sheet oder als Toast, damit der vorhandene Bestand unverändert bleibt.
 */
export function SettingsScreen() {
  const app = useApp()
  const install = useInstallPrompt()
  const [sheet, setSheet] = useState(false)
  const [frageLoeschen, setFrageLoeschen] = useState(false)
  // Import läuft in zwei Stufen: erst prüfen und als Vorschau merken, dann
  // erst nach Bestätigung schreiben. `importMeldung` zeigt Ablehnungen an.
  // `konflikteErsetzen` ist die ausdrückliche Entscheidung, kollidierende
  // Datensätze durch das Backup zu ersetzen; ohne sie bleibt der lokale Stand.
  const [importVorschau, setImportVorschau] = useState<{
    backup: Backup
    text: string
    konflikte: ImportKonflikte
  } | null>(null)
  const [konflikteErsetzen, setKonflikteErsetzen] = useState(false)
  const [importMeldung, setImportMeldung] = useState<string | null>(null)
  // Verknüpft den Erklärtext mit dem Kästchen für Screenreader.
  const konfliktHinweisId = useId()

  /** Fordert dauerhaften Speicher an und meldet das Ergebnis als Toast. */
  const fordereSpeicherSchutz = async () => {
    const status = await app.fordereSpeicherSchutz()
    if (status === 'geschuetzt') app.zeigeToast('Speicher ist jetzt dauerhaft geschützt.')
    else if (status === 'ungeschuetzt')
      app.zeigeToast('Der Browser hat den Schutz noch nicht gewährt.')
  }

  const konfiguration = app.einstellungen.konfiguration
  const speicher = app.speicherSchutz
  const einheit = einheitVon(konfiguration)
  // Solange Konflikte lokal bleiben, wäre „übernommen“ für die Backup-Zahl
  // falsch: Ein Teil der Datensätze wird übersprungen.
  const importUmfangText = importVorschau
    ? importVorschau.konflikte.gesamt === 0 || konflikteErsetzen
      ? `Übernommen werden: ${importVorschau.text}.`
      : `Im Backup enthalten: ${importVorschau.text}.`
    : ''
  // Vorschau des nächsten Laufs: Serie nur mit Wiederholungszahl und Takt,
  // Versatz nur wenn gesetzt. `null`-Teile werden vor dem Join entfernt.
  const naechsterLauf = [
    app.einstellungen.wiederholungen > 1
      ? `${app.einstellungen.wiederholungen}×${formatStrecke(konfiguration.streckeM, einheit)}`
      : formatStrecke(konfiguration.streckeM, einheit),
    app.einstellungen.reihen > 1
      ? `${app.einstellungen.bahnen * app.einstellungen.reihen} Personen in ${app.einstellungen.reihen} Reihen`
      : `${app.einstellungen.bahnen} Bahnen`,
    app.einstellungen.startversatzMs > 0 && app.einstellungen.reihen > 1
      ? `${app.einstellungen.startversatzMs / 1000} s Reihenversatz`
      : null,
    app.einstellungen.wiederholungen > 1
      ? `Takt ${formatTakt(app.einstellungen.taktSek)}`
      : null,
  ]
    .filter((teil): teil is string => teil !== null)
    .join(' · ')

  /** Schreibt alle Läufe samt Sätzen und Schwimmern als CSV. */
  const exportiereCsv = () => {
    const csv = laeufeAlsCsv(app.laeufe, app.satze, app.schwimmer)
    void speichereDatei(csvDateiname(), csv, 'text/csv;charset=utf-8').catch(() =>
      app.zeigeToast('Export fehlgeschlagen.'),
    )
  }

  /** Sichert den kompletten Bestand als JSON; das Datum steckt im Dateinamen. */
  const exportiereBackup = async () => {
    try {
      const backup = await app.exportiereBackup()
      await speichereDatei(
        `beckenrand-backup-${lokalesDatum(Date.now())}.json`,
        JSON.stringify(backup, null, 2),
        'application/json',
      )
    } catch {
      app.zeigeToast('Backup konnte nicht erstellt werden.')
    }
  }

  /**
   * Liest eine JSON-Datei ein und prüft sie, ohne zu schreiben.
   *
   * Nur der aktive Tab darf importieren. Erst nach der Prüfung über
   * `app.pruefeBackupFuerImport` entsteht eine Vorschau; eine ungültige Datei
   * ändert nichts und zeigt stattdessen eine Meldung. Ein Abbruch der
   * Dateiauswahl ist kein Fehler.
   */
  const importiereBackup = async () => {
    if (!app.tabAktiv) return
    const datei = await waehleDatei('application/json')
    if (!datei) return
    // Vor dem Lesen prüfen: `text()` und `JSON.parse` würden eine riesige
    // Datei sonst vollständig in den Speicher holen.
    if (datei.size > 10 * 1024 * 1024) {
      setImportMeldung('Die Datei ist größer als 10 MB und wird nicht eingelesen.')
      return
    }
    let inhalt: unknown
    try {
      inhalt = JSON.parse(await datei.text())
    } catch {
      setImportMeldung('Die Datei ist kein gültiges JSON.')
      return
    }
    const pruefung = app.pruefeBackupFuerImport(inhalt)
    if (!pruefung.ok) {
      setImportMeldung(pruefung.fehler)
      return
    }
    try {
      // Die Konfliktprüfung liest nur. Sie entscheidet nichts; die Auswahl
      // trifft der Nutzer im nächsten Dialog.
      const konflikte = await app.ermittleImportKonflikte(pruefung.backup)
      setKonflikteErsetzen(false)
      setImportVorschau({
        backup: pruefung.backup,
        text: pruefung.text,
        konflikte,
      })
    } catch {
      setImportMeldung(
        'Der vorhandene Bestand konnte nicht gelesen werden. Es wurde nichts verändert.',
      )
    }
  }

  /**
   * Schreibt das geprüfte Backup und lädt anschließend alle Daten neu.
   *
   * Der Import ergänzt den Bestand; kollidierende Datensätze bleiben ohne
   * ausdrückliche Entscheidung lokal erhalten. Schlägt das Schreiben fehl, wird
   * die Vorschau geschlossen und die Fehlermeldung angezeigt.
   */
  const fuehreImportAus = async () => {
    if (!importVorschau || !app.tabAktiv) return
    const { backup, text } = importVorschau
    const aufloesung = konflikteErsetzen ? 'backupErsetzen' : 'lokalBehalten'
    try {
      const konflikte = await app.importiereBackup(backup, aufloesung)
      setImportVorschau(null)
      setKonflikteErsetzen(false)
      // Die Zahl stammt aus der Prüfung im Schreibvorgang: Sie kann von der
      // Vorschau abweichen, wenn sich der Bestand inzwischen geändert hat.
      const hinweis =
        konflikte.gesamt === 0
          ? ''
          : aufloesung === 'backupErsetzen'
            ? ` ${konflikte.gesamt} Konflikte wurden durch das Backup ersetzt.`
            : ` ${konflikte.gesamt} Konflikte: Der lokale Stand blieb erhalten.`
      const kopf = konflikte.gesamt === 0 ? 'Übernommen' : 'Backup gelesen'
      app.zeigeToast(`${kopf}: ${text}.${hinweis}`)
    } catch (fehler) {
      setImportVorschau(null)
      setKonflikteErsetzen(false)
      setImportMeldung(
        fehler instanceof Error ? fehler.message : 'Das Backup konnte nicht geschrieben werden.',
      )
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line">
        <div className="mx-auto w-full max-w-2xl px-4 py-3 rail:px-6">
          <h1 className="text-lg font-semibold">Einstellungen</h1>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 pb-10 pt-4 rail:px-6">
        {/* Darstellung: Theme gilt sofort und wird in den Einstellungen gemerkt. */}
        <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted">
          Darstellung
        </h2>
        <Karte>
          <div className="px-4 py-3.5">
            <p className="mb-2 text-sm font-medium">Design</p>
            {/* Drei feste Werte; „system“ folgt der Betriebssystem-Einstellung.
                Als Radiogruppe ausgezeichnet, damit die Auswahl auch für
                Screenreader eindeutig ist. */}
            <div role="radiogroup" aria-label="Design" className="grid grid-cols-3 gap-2">
              {(
                [
                  { wert: 'system', label: 'System', icon: null },
                  { wert: 'light', label: 'Hell', icon: <SunIcon className="h-4 w-4" /> },
                  { wert: 'dark', label: 'Dunkel', icon: <MoonIcon className="h-4 w-4" /> },
                ] as const
              ).map(({ wert, label, icon }) => {
                const aktiv = app.themeEinstellung === wert
                return (
                  <button
                    key={wert}
                    type="button"
                    role="radio"
                    aria-checked={aktiv}
                    onClick={() => app.setzeTheme(wert)}
                    className={`flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold ${
                      aktiv
                        ? 'border-accent bg-accent text-accent-fg'
                        : 'border-line bg-surface2 text-fg'
                    }`}
                  >
                    {icon}
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </Karte>

        <h2 className="mb-2 mt-6 px-1 text-[11px] font-bold uppercase tracking-wider text-muted">
          Nächster Lauf
        </h2>
        <Karte>
          <Zeile
            label={`${formatBeckenlaenge(konfiguration.beckenlaengeM, einheit)}-Becken · ${app.einstellungen.bahnen} Bahnen`}
            wert={naechsterLauf}
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
            // Gesperrte Tabs dürfen den Bestand nicht verändern.
            disabled={app.tabGesperrt}
          />
          <Zeile
            label={speicher === 'geschuetzt' ? 'Speicher geschützt' : 'Speicher dauerhaft sichern'}
            wert={
              // Drei Zustände: bereits geschützt, Schutz möglich, API fehlt.
              speicher === 'geschuetzt'
                ? 'Der Browser löscht die Daten nicht bei Platzmangel'
                : speicher === 'ungeschuetzt'
                  ? 'Antippen, um den Schutz anzufordern'
                  : 'Wird von diesem Browser nicht unterstützt'
            }
            onClick={() => void fordereSpeicherSchutz()}
          />
          <Zeile
            label="Alle Daten löschen"
            onClick={() => setFrageLoeschen(true)}
            gefahr
            disabled={app.tabGesperrt}
          />
        </Karte>

        <p className="mt-4 px-1 text-xs leading-relaxed text-muted">
          Die Daten liegen ausschließlich auf diesem Gerät. Sichere regelmäßig ein Backup — beim
          Löschen der Browserdaten sind sie sonst weg.
        </p>

        <h2 className="mb-2 mt-6 px-1 text-[11px] font-bold uppercase tracking-wider text-muted">
          Installation
        </h2>
        <Karte>
          {/* Drei Installationszustände: schon installiert, Dialog verfügbar,
              sonst eine browserspezifische Anleitung (v. a. iOS). */}
          {install.installiert ? (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <CheckIcon className="h-5 w-5 text-ok" />
              <span className="flex-1 text-sm font-medium">Als App installiert</span>
            </div>
          ) : install.kannInstallieren ? (
            <Zeile
              label="App installieren"
              wert="Vollbild, ohne Browserleiste, offline nutzbar"
              onClick={() => void install.installiere()}
              icon={<DownloadIcon className="h-5 w-5" />}
            />
          ) : (
            <p className="px-4 py-3.5 text-xs leading-relaxed text-muted">{install.anleitung}</p>
          )}
        </Karte>

        {install.installiert ? null : (
          <p className="mt-3 px-1 text-xs leading-relaxed text-muted">
            Auf dem iPhone schützt erst die Installation die Daten: Solange die App nicht auf dem
            Home-Bildschirm liegt, kann Safari den lokalen Speicher nach längerer Nichtnutzung
            verwerfen. Sichere zusätzlich regelmäßig ein Backup.
          </p>
        )}

        <div className="mt-8 text-center text-[11px] leading-relaxed text-muted">
          <p>Beckenrand 0.1.0</p>
          <p>Offline nutzbar — alle Daten bleiben auf diesem Gerät.</p>
        </div>
      </div>

      <KonfigurationSheet open={sheet} onClose={() => setSheet(false)} modus="einstellungen" />

      <Bestaetigung
        open={importVorschau !== null}
        titel="Backup importieren?"
        text={
          importVorschau
            ? `${
                konflikteErsetzen
                  ? 'Kollidierende Datensätze werden durch den Stand des Backups ersetzt; die übrigen vorhandenen Daten bleiben erhalten.'
                  : 'Vorhandene Daten bleiben erhalten; neue Datensätze werden ergänzt.'
              } ${importUmfangText}${
                // Eine laufende Messung wird beim Neuladen zurückgesetzt.
                app.brauchtTakt ? ' Eine laufende Messung wird dabei unterbrochen.' : ''
              }`
            : ''
        }
        bestaetigenLabel={konflikteErsetzen ? 'Ersetzen und importieren' : 'Importieren'}
        gefahr={false}
        onBestaetigen={() => void fuehreImportAus()}
        onAbbrechen={() => {
          setImportVorschau(null)
          setKonflikteErsetzen(false)
        }}
      >
        {importVorschau && importVorschau.konflikte.gesamt > 0 ? (
          <div className="mt-3 rounded-xl border border-line bg-surface2 px-3 py-3">
            {/* `status` statt `alert`: Die Vorschau ist bereits offen, die
                Zusammenfassung soll vorgelesen, aber nicht als Fehler gewertet
                werden. */}
            <p role="status" className="text-sm font-medium">
              {importVorschau.konflikte.text}
            </p>
            <label className="mt-2 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={konflikteErsetzen}
                onChange={(event) => setKonflikteErsetzen(event.currentTarget.checked)}
                aria-describedby={konfliktHinweisId}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>Konflikte durch den Stand des Backups ersetzen</span>
            </label>
            <p id={konfliktHinweisId} className="mt-1 text-xs leading-relaxed text-muted">
              Ohne Häkchen bleiben die lokalen Datensätze bei Konflikten unverändert. Nicht
              kollidierende Datensätze werden in beiden Fällen übernommen.
            </p>
          </div>
        ) : null}
      </Bestaetigung>

      <Sheet
        open={importMeldung !== null}
        titel="Import nicht möglich"
        onClose={() => setImportMeldung(null)}
      >
        <p className="text-sm leading-relaxed text-muted">{importMeldung}</p>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Der vorhandene Bestand wurde nicht verändert.
        </p>
        <button
          type="button"
          onClick={() => setImportMeldung(null)}
          className="mt-5 h-12 w-full rounded-xl bg-accent text-sm font-semibold text-accent-fg"
        >
          Schließen
        </button>
      </Sheet>

      <Bestaetigung
        open={frageLoeschen}
        titel="Alle Daten löschen?"
        text={`Schwimmer, Trainings, Wettkämpfe, Läufe und Sätze werden dauerhaft von diesem Gerät entfernt.${
          app.brauchtTakt ? ' Eine laufende Messung wird dabei beendet.' : ''
        }`}
        bestaetigenLabel="Alles löschen"
        onBestaetigen={() => {
          setFrageLoeschen(false)
          // Doppelte Absicherung gegen einen parallel gesperrten Tab.
          if (!app.tabAktiv) return
          void app
            .loescheAlles()
            .then(() => app.zeigeToast('Alle Daten gelöscht.'))
            .catch(() => app.zeigeToast('Löschen fehlgeschlagen. Bitte die App neu laden.'))
        }}
        onAbbrechen={() => setFrageLoeschen(false)}
      />
    </div>
  )
}
