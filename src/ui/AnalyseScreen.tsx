/**
 * Analyse: Zwischenzeiten im Satz vergleichen.
 *
 * Einstieg ist die Satzliste; ein Satz öffnet eine Matrix Person × Runde, ein
 * Tipp auf eine Person die Längenzeiten über alle Runden. Die Ansicht rechnet
 * nicht selbst: Runden, Abweichungen, Schnellste und die Referenz „zuletzt“
 * kommen aus domain/analyse. Es gibt keine neue Speicherung — alles leitet sich
 * aus den Splits der Läufe ab.
 *
 * Wettkampf-Läufe erscheinen nicht, weil sie keine Splits haben (ADR 0006).
 * Offene Strecken erscheinen in der Matrix und im Drill-down, aber nicht als
 * Referenz für einen anderen Satz: Dort fehlt die feste Strecke.
 */
import { useMemo, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { istAnalyseSatzAusRunden } from '../domain/analyse'
import { formatDelta, formatStrecke, formatTakt, formatTime } from '../domain/format'
import { einheitVon, formatBeckenlaenge } from '../domain/einheit'
import { SCHWIMMARTEN, type Satz } from '../domain/types'
import {
  kennzahlenFuerSatz,
  laeufeNachSatz,
  matrixFuerSatz,
  personFuerSatz,
} from './analyseMemo'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

const datumFormat = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/** Kurzes Tagesdatum für die Referenzzeile, z. B. „22.10.“. */
const datumKurzFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' })

/** Formatiert ein ISO-Datum (`YYYY-MM-DD`); unlesbare Werte bleiben stehen. */
function datumText(datum: string): string {
  if (!datum) return 'Ohne Datum'
  const parsed = new Date(`${datum}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? datum : datumFormat.format(parsed)
}

function kurzDatum(datum: string): string {
  if (!datum) return '—'
  const parsed = new Date(`${datum}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? datum : datumKurzFormat.format(parsed)
}

function artLabel(schwimmart: string): string {
  return SCHWIMMARTEN.find((art) => art.wert === schwimmart)?.label ?? ''
}

/** Titel eines Satzes: eigene Bezeichnung oder Strecke und Schwimmart. */
function satzTitel(satz: Satz): string {
  if (satz.bezeichnung) return satz.bezeichnung
  return `${formatStrecke(satz.konfiguration.streckeM, einheitVon(satz.konfiguration))} · ${artLabel(satz.konfiguration.schwimmart)}`
}

/** Kurzbeschreibung der Konfiguration für die Satzzeile. */
function satzMeta(satz: Satz, runden: number): string {
  const einheit = einheitVon(satz.konfiguration)
  return [
    `${formatBeckenlaenge(satz.konfiguration.beckenlaengeM, einheit)}-Becken`,
    satz.plan ? `${satz.plan.wiederholungen}×` : `${runden}×`,
    formatStrecke(satz.konfiguration.streckeM, einheit),
    artLabel(satz.konfiguration.schwimmart),
  ].join(' · ')
}

/**
 * Kleine Abweichung unter einer Zeit. Farbe trägt nur die Abweichung: grün ist
 * schneller, rot langsamer, grau gleich; die Zeit selbst bleibt ungefärbt.
 * Der Vorlesetext nennt das Vorzeichen, weil Farbe allein nicht reicht.
 */
function Abweichung({ ms }: { ms: number | null }) {
  if (ms === null) return null
  const farbe = ms < 0 ? 'text-ok' : ms > 0 ? 'text-danger' : 'text-muted'
  return (
    <span
      data-abweichung={Math.round(ms)}
      className={`tabular block text-[10px] leading-tight ${farbe}`}
    >
      {formatDelta(ms)}
      <span className="sr-only"> zur Vorrunde</span>
    </span>
  )
}

/** Leerzustand, wenn noch kein Satz Splits hat. */
function Leer() {
  return (
    <p className="mt-16 px-4 text-center text-sm leading-relaxed text-muted">
      Noch keine auswertbaren Sätze. Splits entstehen im Training bei jedem Anschlag; Wettkampf-Läufe
      haben keine Zwischenzeiten.
    </p>
  )
}

/** Satzliste: neuester auswertbarer Satz zuerst, mit Kernzahl. */
function SatzListe({ onOeffnen }: { onOeffnen: (satzId: string) => void }) {
  const app = useApp()
  // Einmal gruppieren statt für jeden Satz alle Läufe zu filtern (#68). Die
  // Kennzahlen je Zeile kommen memoisiert aus `analyseMemo`.
  const saetze = useMemo(() => {
    const nachSatz = laeufeNachSatz(app.laeufe)
    return app.satze
      .filter((satz) => istAnalyseSatzAusRunden(satz, nachSatz.get(satz.id) ?? []))
      .sort((a, b) => b.datum.localeCompare(a.datum) || b.erstelltAm - a.erstelltAm)
  }, [app.satze, app.laeufe])

  if (saetze.length === 0) return <Leer />

  // Wie im Verlauf nach Tag gruppiert; innerhalb des Tages bleibt die
  // Reihenfolge aus der Sortierung (neueste Anlage zuerst).
  const tage = new Map<string, Satz[]>()
  for (const satz of saetze) {
    const liste = tage.get(satz.datum)
    if (liste) liste.push(satz)
    else tage.set(satz.datum, [satz])
  }

  return (
    <div className="space-y-5">
      {[...tage.entries()].map(([datum, tagesSaetze]) => (
        <section key={datum}>
          <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
            {datumText(datum)}
          </h2>
          <ul className="space-y-2">
      {tagesSaetze.map((satz) => {
        const { runden, abweichungen, unvollstaendig, manuell } = kennzahlenFuerSatz(
          satz,
          app.laeufe,
        )
        return (
          <li key={satz.id}>
            <button
              type="button"
              data-analyse-satz={satz.id}
              onClick={() => onOeffnen(satz.id)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-sm font-semibold">{satzTitel(satz)}</h2>
                  {unvollstaendig ? (
                    <span className="rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-bold text-warn">
                      unvollständig
                    </span>
                  ) : null}
                  {manuell ? (
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                      manuell
                    </span>
                  ) : null}
                </div>
                <p className="tabular mt-0.5 text-[11px] text-muted">
                  {satzMeta(satz, runden.length)}
                </p>
                <p className="tabular mt-1 text-xs">
                  {abweichungen.length > 0 ? (
                    abweichungen.map((eintrag) => (
                      <span key={eintrag.runde} className="mr-2 inline-block">
                        <span className="text-muted">R{eintrag.runde}</span>{' '}
                        <span
                          className={
                            (eintrag.mittelMs ?? 0) < 0
                              ? 'text-ok'
                              : (eintrag.mittelMs ?? 0) > 0
                                ? 'text-danger'
                                : 'text-muted'
                          }
                        >
                          {formatDelta(eintrag.mittelMs ?? 0)}
                        </span>
                      </span>
                    ))
                  ) : (
                    <span className="text-muted">noch keine Abweichung</span>
                  )}
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
  )
}

/** Kopfzeile der Matrix und des Drill-downs mit Rückweg. */
function Kopf({
  titel,
  untertitel,
  onZurueck,
  zurueckLabel,
}: {
  titel: string
  untertitel: string
  onZurueck: () => void
  zurueckLabel: string
}) {
  return (
    <div className="border-b border-line px-3 pb-2 pt-3 rail:px-4">
      <button
        type="button"
        onClick={onZurueck}
        className="flex h-9 items-center gap-1 rounded-xl text-sm font-medium text-accent"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        {zurueckLabel}
      </button>
      <h2 className="mt-1 truncate text-lg font-semibold">{titel}</h2>
      <p className="text-[11px] text-muted">{untertitel}</p>
    </div>
  )
}

/** Matrix Person × Runde mit Referenzspalte „zuletzt“. */
function SatzMatrix({
  satz,
  onZurueck,
  onPerson,
}: {
  satz: Satz
  onZurueck: () => void
  onPerson: (index: number) => void
}) {
  const app = useApp()
  // Matrix, Referenz und „läuft“-Markierung werden nur für diesen Satz und nur
  // bei geänderten Läufen neu gerechnet (#68). Die Markierung fällt nach einem
  // Reload aus, weil dann die Startzeiten fehlen.
  const { anzahlRunden, referenz, matrix, laufendeRunde, unvollstaendig } = matrixFuerSatz(
    satz,
    app.satze,
    app.laeufe,
  )
  const name = (id: string | null) =>
    id ? (app.schwimmer.find((eintrag) => eintrag.id === id)?.name ?? null) : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Kopf
        titel={satzTitel(satz)}
        untertitel={[
          datumText(satz.datum),
          `${formatBeckenlaenge(satz.konfiguration.beckenlaengeM, einheitVon(satz.konfiguration))}-Becken · ${formatStrecke(
            satz.konfiguration.streckeM,
            einheitVon(satz.konfiguration),
          )} · ${artLabel(satz.konfiguration.schwimmart)}`,
          `${anzahlRunden} ${anzahlRunden === 1 ? 'Runde' : 'Runden'}`,
          satz.plan ? `Takt ${formatTakt(satz.plan.taktSek)}` : null,
        ]
          .filter((teil): teil is string => Boolean(teil))
          .join(' · ')}
        onZurueck={onZurueck}
        zurueckLabel="Satzliste"
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-8 pt-3 rail:px-4">
        {unvollstaendig ? (
          <p className="mb-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-[11px] text-warn">
            Der Satz ist unvollständig. Fehlende Zeiten bleiben leer und zählen nicht als
            Abweichung.
          </p>
        ) : null}

        {referenz ? (
          <p className="tabular mb-2 text-[11px] text-muted">
            zuletzt: {kurzDatum(referenz.datum)}
            {referenz.plan ? ` · Takt ${formatTakt(referenz.plan.taktSek)}` : ''}
          </p>
        ) : null}

        {matrix.zeilen.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted">Dieser Satz hat noch keine Bahnen.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-surface2 text-[10px] uppercase tracking-wider text-muted">
                  <th className="sticky left-0 z-10 min-w-[8.5rem] bg-surface2 px-2 py-2 font-bold">
                    Person
                  </th>
                  {matrix.runden.map((lauf, index) => {
                    const nummer = lauf.wiederholung ?? index + 1
                    const laeuft = lauf.wiederholung !== null && lauf.wiederholung === laufendeRunde
                    return (
                      <th
                        key={lauf.id}
                        className={`min-w-[4.5rem] px-1.5 py-2 text-center font-bold ${
                          laeuft ? 'bg-accent/10 text-accent' : ''
                        }`}
                      >
                        R{nummer}
                        {laeuft ? <span className="block text-[9px] normal-case">läuft</span> : null}
                      </th>
                    )
                  })}
                  {referenz ? (
                    <th className="min-w-[4.5rem] border-l border-line px-1.5 py-2 text-center font-bold">
                      zuletzt
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {matrix.zeilen.map((zeile) => {
                  const personName = name(zeile.schwimmerId)
                  return (
                    <tr key={zeile.index} className="border-t border-line">
                      <th className="sticky left-0 z-10 bg-surface px-1 py-1.5 text-left font-medium">
                        <button
                          type="button"
                          data-person={zeile.index}
                          data-schwimmer={zeile.schwimmerId ?? undefined}
                          onClick={() => onPerson(zeile.index)}
                          aria-label={`${personName ?? 'Ohne Namen'}, Bahn ${zeile.nummer}, Längenzeiten`}
                          className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left"
                        >
                          <span className="tabular w-5 shrink-0 text-[10px] font-bold text-muted">
                            {zeile.nummer}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">
                            {personName ?? 'Ohne Namen'}
                          </span>
                          <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
                        </button>
                      </th>
                      {zeile.zellen.map((zelle, index) => {
                        if (!zelle) {
                          return (
                            <td key={index} className="px-1.5 py-1.5 text-center text-muted">
                              —
                            </td>
                          )
                        }
                        return (
                          <td
                            key={zelle.lauf.id}
                            data-unvollstaendig={zelle.unvollstaendig ? 'true' : undefined}
                            data-manuell={zelle.manuell ? 'true' : undefined}
                            className={`px-1.5 py-1.5 text-center align-top ${
                              laufendeRunde !== null &&
                              matrix.runden[index]?.wiederholung === laufendeRunde
                                ? 'bg-accent/5'
                                : ''
                            }`}
                          >
                            {zelle.ms === null ? (
                              <span className="tabular text-muted">—</span>
                            ) : (
                              <span
                                data-schnellste={zelle.istSchnellste ? 'true' : undefined}
                                className={`tabular block ${zelle.istSchnellste ? 'font-semibold' : ''}`}
                              >
                                {formatTime(zelle.ms)}
                              </span>
                            )}
                            <Abweichung ms={zelle.abweichungMs} />
                            {zelle.manuell ? (
                              <span className="block text-[9px] leading-tight text-warn">
                                korr.
                              </span>
                            ) : null}
                          </td>
                        )
                      })}
                      {referenz ? (
                        <td className="tabular border-l border-line px-1.5 py-1.5 text-center align-top text-muted">
                          {zeile.letzteMs === null ? '—' : formatTime(zeile.letzteMs)}
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/** Längenzeiten einer Person über alle Runden. */
function PersonDrilldown({
  satz,
  index,
  onZurueck,
}: {
  satz: Satz
  index: number
  onZurueck: () => void
}) {
  const app = useApp()
  // Längenzeiten und Live-Abweichung je Person memoisiert; ein Wechsel der
  // Runden invalidiert den Eintrag, ein reiner Render nicht (#68).
  const { runden, matrix, live } = personFuerSatz(satz, index, app.laeufe)
  const basis = runden[0]?.bahnen[index]
  const name = basis?.schwimmerId
    ? (app.schwimmer.find((eintrag) => eintrag.id === basis.schwimmerId)?.name ?? null)
    : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Kopf
        titel={name ?? 'Ohne Namen'}
        untertitel={[
          `Bahn ${basis?.nummer ?? '—'}`,
          `${runden.length} ${runden.length === 1 ? 'Runde' : 'Runden'}`,
          formatStrecke(satz.konfiguration.streckeM, einheitVon(satz.konfiguration)),
          live !== null ? `zuletzt ${formatDelta(live)}` : null,
        ]
          .filter((teil): teil is string => Boolean(teil))
          .join(' · ')}
        onZurueck={onZurueck}
        zurueckLabel="Matrix"
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-8 pt-3 rail:px-4">
        <p className="mb-2 text-[11px] text-muted">
          Längenzeit je Runde (nicht kumuliert). Darunter steht die Abweichung zur Vorrunde.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-surface2 text-[10px] uppercase tracking-wider text-muted">
                <th className="sticky left-0 z-10 min-w-[4.5rem] bg-surface2 px-2 py-2 font-bold">
                  Länge
                </th>
                {matrix.runden.map((lauf, rundeIndex) => (
                  <th
                    key={lauf.id}
                    className="min-w-[4.5rem] px-1.5 py-2 text-center font-bold"
                  >
                    R{lauf.wiederholung ?? rundeIndex + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.zeilen.map((zeile) => (
                <tr key={zeile.laengeNr} className="border-t border-line">
                  <th className="tabular sticky left-0 z-10 bg-surface px-2 py-1.5 text-left text-[11px] font-semibold text-muted">
                    {zeile.meter === null
                      ? `Länge ${zeile.laengeNr}`
                      : formatStrecke(zeile.meter, einheitVon(satz.konfiguration))}
                  </th>
                  {zeile.zellen.map((zelle, rundeIndex) => (
                    <td
                      key={matrix.runden[rundeIndex]?.id ?? rundeIndex}
                      data-manuell={zelle?.manuell ? 'true' : undefined}
                      className="px-1.5 py-1.5 text-center align-top"
                    >
                      {zelle ? (
                        <>
                          <span className="tabular block">{formatTime(zelle.zeitMs)}</span>
                          <Abweichung ms={zelle.abweichungMs} />
                          {zelle.manuell ? (
                            <span className="block text-[9px] leading-tight text-warn">korr.</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="tabular text-muted">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/**
 * Analyse-Bereich im Verlauf-Tab. Der Zustand (Satz, Person) ist lokal und
 * geht beim Tab-Wechsel bewusst verloren; die Auswertung selbst kommt aus den
 * gespeicherten Läufen.
 */
export function AnalyseScreen() {
  const app = useApp()
  const [satzId, setSatzId] = useState<string | null>(null)
  const [personIndex, setPersonIndex] = useState<number | null>(null)
  const satz = satzId ? (app.satze.find((eintrag) => eintrag.id === satzId) ?? null) : null

  if (satz && personIndex !== null) {
    return (
      <PersonDrilldown
        satz={satz}
        index={personIndex}
        onZurueck={() => setPersonIndex(null)}
      />
    )
  }

  if (satz) {
    return (
      <SatzMatrix
        satz={satz}
        onZurueck={() => setSatzId(null)}
        onPerson={setPersonIndex}
      />
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-3 rail:px-6">
      <SatzListe onOeffnen={setSatzId} />
    </div>
  )
}
