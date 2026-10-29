/**
 * Verlauf aller Messungen, gruppiert nach Satz.
 *
 * Jede Gruppe zeigt Datum, Bezeichnung, Takt und – bei Wettkampf-Disziplinen –
 * den Wettkampfnamen. Ein Tipp auf einen Lauf öffnet das Lauf-Detail, die
 * Bezeichnung eines Satzes lässt sich direkt umbenennen, ein Papierkorb löscht
 * den ganzen Satz samt Läufen. Die Daten kommen aus app/AppProvider, die
 * Zeit- und Vollständigkeitsprüfungen aus domain/lauf und domain/analyse.
 */
import { useMemo, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { hatBegonnen, isComplete } from '../domain/lauf'
import { schnellsteZeit } from '../domain/analyse'
import { formatStrecke, formatTakt, formatTime } from '../domain/format'
import { SCHWIMMARTEN, type Lauf, type SatzPlan } from '../domain/types'
import { Bestaetigung } from './Bestaetigung'
import { ChevronRightIcon, TrashIcon } from './icons'
import { LaufDetail } from './LaufDetail'

/** Tagesdatum der Gruppenüberschrift, deutsch und kurz. */
const datumFormat = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/** Uhrzeit des Laufs in der Zeile; Sekunden wären hier nur Rauschen. */
const uhrzeitFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

/**
 * Formatiert das ISO-Datum eines Satzes (`YYYY-MM-DD`). Die Uhrzeit 12:00
 * verhindert, dass die Zeitzone den Tag auf den Vortag verschiebt; ein
 * unlesbares Datum wird unverändert durchgereicht.
 */
function datumText(datum: string): string {
  if (!datum) return 'Ohne Datum'
  const parsed = new Date(`${datum}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? datum : datumFormat.format(parsed)
}

/** Ein Satz mit allen Läufen und der daraus abgeleiteten Überschrift. */
interface Gruppe {
  id: string
  datum: string
  titel: string
  plan: SatzPlan | null
  /** Name des Wettkampfs, wenn der Satz eine Disziplin daraus ist. */
  wettkampfName: string | null
  /** Alle Läufe des Satzes, für Anzahl und Löschdialog. */
  laeufe: Lauf[]
  /** Nur begonnene Runden; geplante Wiederholungen bleiben im Timer. */
  angezeigt: Lauf[]
}

/**
 * Verlaufs-Tab: gruppierte Liste mit Einstieg ins Lauf-Detail, Umbenennen und
 * Löschen je Satz. Die Ansicht selbst rechnet nicht; sie fasst nur zusammen,
 * was der App-Kontext bereits geladen hat.
 */
export function HistoryScreen() {
  const app = useApp()
  // Öffnet das Vollbild-Detail eines Laufs; `null` heißt geschlossen.
  const [offenerLauf, setOffenerLauf] = useState<string | null>(null)
  // Inline-Umbenennen einer Satzbezeichnung, inklusive aktuellem Eingabewert.
  const [satzEdit, setSatzEdit] = useState<{ id: string; wert: string } | null>(null)
  // Zu löschender Satz samt Anzahl der mitgelöschten Läufe für den Dialog.
  const [satzLoeschen, setSatzLoeschen] = useState<{ id: string; anzahl: number } | null>(null)

  // Der Name wird beim Verlassen des Felds oder mit Enter übernommen.
  const speichereSatz = () => {
    if (!satzEdit) return
    app.benenneSatz(satzEdit.id, satzEdit.wert)
    setSatzEdit(null)
  }

  // Gruppen werden aus den geladenen Läufen abgeleitet; die Sortierung nach
  // Datum und Id macht die Reihenfolge unabhängig von der Speicherreihenfolge.
  const gruppen = useMemo<Gruppe[]>(() => {
    const nachSatz = new Map<string, Lauf[]>()
    for (const lauf of app.laeufe) {
      const key = lauf.satzId ?? 'ohne-satz'
      const liste = nachSatz.get(key)
      if (liste) liste.push(lauf)
      else nachSatz.set(key, [lauf])
    }

    return [...nachSatz.entries()]
      .map(([id, laeufe]) => {
        const satz = app.satze.find((s) => s.id === id)
        // Neueste Runde zuerst; fehlende Startzeiten sortieren ans Ende.
        const alle = [...laeufe].sort(
          (a, b) => (b.startWallMs ?? 0) - (a.startWallMs ?? 0),
        )
        // Die Läufe sind die Quelle der Wahrheit: Vor dem Start lässt sich die
        // Konfiguration eines Laufs noch ändern, ohne den Satz umzuschreiben.
        const konfiguration = alle[0]?.konfiguration ?? satz?.konfiguration
        const art = konfiguration
          ? (SCHWIMMARTEN.find((s) => s.wert === konfiguration.schwimmart)?.label ?? '')
          : ''
        // Eine eigene Bezeichnung hat Vorrang; sonst wird der Satz aus Plan,
        // Strecke und Schwimmart beschrieben.
        const titel =
          satz?.bezeichnung ||
          (konfiguration
            ? `${satz?.plan ? `${satz.plan.wiederholungen}×` : ''}${formatStrecke(konfiguration.streckeM)} · ${art}`
            : 'Ohne Satz')
        // Disziplinen eines Wettkampfs tragen dessen Namen als Zusatz.
        const wettkampfName = satz?.wettkampfId
          ? (app.wettkampfe.find((eintrag) => eintrag.id === satz.wettkampfId)?.name ?? null)
          : null
        return {
          id,
          datum: satz?.datum ?? '',
          titel,
          plan: satz?.plan ?? null,
          wettkampfName,
          laeufe: alle,
          // Nur begonnene Läufe erscheinen im Verlauf, damit rein geplante
          // Wiederholungen einer Serie nicht als leer auftauchen.
          angezeigt: alle.filter((lauf) => hatBegonnen(lauf)),
        }
      })
      // Sätze ohne begonnene Läufe sind für den Verlauf uninteressant.
      .filter((gruppe) => gruppe.angezeigt.length > 0)
      .sort((a, b) => b.datum.localeCompare(a.datum) || b.id.localeCompare(a.id))
  }, [app.laeufe, app.satze, app.wettkampfe])

  // Kopfzeile zählt nur begonnene Läufe, nicht die geplanten Runden.
  const begonneneLaeufe = app.laeufe.filter((lauf) => hatBegonnen(lauf)).length

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line px-4 py-3 rail:px-6">
        <h1 className="text-lg font-semibold">Verlauf</h1>
        <p className="text-xs text-muted">
          {begonneneLaeufe} {begonneneLaeufe === 1 ? 'Lauf' : 'Läufe'}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-8 pt-3 rail:px-6">
        {gruppen.length === 0 ? (
          <p className="mt-16 text-center text-sm text-muted">
            Noch keine Messungen. Starte den ersten Lauf im Tab „Timer“.
          </p>
        ) : null}

        <div className="grid grid-cols-1 items-start gap-6 rail:grid-cols-2">
        {gruppen.map((gruppe) => (
          <section key={gruppe.id} className="min-w-0">
            {/* Kopfzeile: Datum links, Bezeichnung und Kennzeichen rechts.
                Auf schmalen Geräten darf sie umbrechen, statt den Titel zu
                zerquetschen. */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted">
                {datumText(gruppe.datum)}
              </h2>
              {/* Bezeichnung bearbeiten: Blur und Enter speichern, Escape bricht
                  ab. Der Fokus wird gesetzt, damit die Tastatur direkt greift. */}
              {satzEdit?.id === gruppe.id ? (
                <input
                  autoFocus
                  value={satzEdit.wert}
                  onChange={(e) => setSatzEdit({ id: gruppe.id, wert: e.target.value })}
                  onBlur={speichereSatz}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') speichereSatz()
                    if (e.key === 'Escape') setSatzEdit(null)
                  }}
                  aria-label="Satzbezeichnung"
                  className="min-w-0 flex-1 rounded-md border border-line bg-surface2 px-2 py-1 text-right text-xs"
                />
              ) : gruppe.id === 'ohne-satz' ? (
                // Läufe ohne Satzzuordnung lassen sich nicht umbenennen.
                <span className="truncate text-xs text-muted">{gruppe.titel}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setSatzEdit({ id: gruppe.id, wert: gruppe.titel })}
                  className="min-w-0 truncate text-xs text-muted underline decoration-dotted underline-offset-2"
                >
                  {gruppe.titel}
                </button>
              )}
              {/* Kennzeichen statt Langtext: Der Wettkampfname steckt im
                  title-Attribut und in der Laufzeile. */}
              {gruppe.wettkampfName ? (
                <span
                  title={gruppe.wettkampfName}
                  className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent"
                >
                  Wettkampf
                </span>
              ) : null}
              {/* Ein Takt weist den Satz als Serie aus. */}
              {gruppe.plan ? (
                <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                  Takt {formatTakt(gruppe.plan.taktSek)}
                </span>
              ) : null}
              {/* Sammel-Läufe ohne Satz haben keinen Satz zum Löschen. */}
              {gruppe.id === 'ohne-satz' ? null : (
                <button
                  type="button"
                  onClick={() =>
                    setSatzLoeschen({ id: gruppe.id, anzahl: gruppe.laeufe.length })
                  }
                  aria-label={`Satz löschen, ${gruppe.laeufe.length} Läufe`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            <ul className="space-y-2">
              {gruppe.angezeigt.map((lauf) => {
                // Schnellste Zielzeit des Laufs für die Zeile; `null`, solange
                // keine Bahn im Ziel ist.
                const schnellste = schnellsteZeit(lauf)
                // Teilweise gefüllte Läufe bleiben sichtbar, werden aber
                // ausdrücklich als unvollständig gekennzeichnet.
                const vollstaendig = isComplete(lauf)
                return (
                  <li key={lauf.id}>
                    <button
                      type="button"
                      onClick={() => setOffenerLauf(lauf.id)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          {lauf.bahnen.length} Bahnen ·{' '}
                          {formatStrecke(lauf.konfiguration.streckeM)}
                          {!vollstaendig ? (
                            <span className="ml-2 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-bold text-warn">
                              unvollständig
                            </span>
                          ) : null}
                        </p>
                        <p className="tabular text-xs text-muted">
                          {/* Wettkampf-Heats heißen „Lauf“, Serienrunden „R“;
                              beides nur, wenn der Lauf eine Nummer trägt. */}
                          {lauf.wiederholung
                            ? lauf.modus === 'wettkampf'
                              ? `Lauf ${lauf.wiederholung} · `
                              : `R${lauf.wiederholung} · `
                            : ''}
                          {lauf.startWallMs
                            ? `${uhrzeitFormat.format(lauf.startWallMs)} Uhr`
                            : 'ohne Startzeit'}
                          {schnellste !== null ? ` · schnellste ${formatTime(schnellste)}` : ''}
                          {gruppe.wettkampfName ? ` · ${gruppe.wettkampfName}` : ''}
                        </p>
                      </div>
                      <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
        </div>
      </div>

      {/* Das Detail liegt als Vollbild über dem Verlauf; Schließen setzt nur
          die Auswahl zurück, die Liste bleibt gemountet. */}
      {offenerLauf ? (
        <LaufDetail laufId={offenerLauf} onClose={() => setOffenerLauf(null)} />
      ) : null}

      {/* Löschen eines Satzes entfernt auch seine Läufe; der Dialog nennt die
          Anzahl, bevor bestätigt wird. */}
      <Bestaetigung
        open={satzLoeschen !== null}
        titel="Satz löschen?"
        text={
          satzLoeschen
            ? `${satzLoeschen.anzahl} ${satzLoeschen.anzahl === 1 ? 'Lauf wird' : 'Läufe werden'} mitgelöscht. Das lässt sich nicht rückgängig machen.`
            : ''
        }
        bestaetigenLabel="Satz löschen"
        onBestaetigen={() => {
          if (satzLoeschen) app.loescheSatz(satzLoeschen.id)
          setSatzLoeschen(null)
        }}
        onAbbrechen={() => setSatzLoeschen(null)}
      />
    </div>
  )
}
