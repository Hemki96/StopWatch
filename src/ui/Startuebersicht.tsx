/**
 * Startübersicht: letzte Prüfung, bevor die Uhr läuft.
 *
 * Der Trainer richtet Lauf oder Training ein und sieht danach dieselben Werte
 * noch einmal in ruhender Form — Becken, Strecke, Bahnen, Schwimmer, Takt und
 * Reihenfolge. Erst der Knopf „Jetzt starten“ setzt den ersten Startzeitstempel.
 * Damit fällt ein falsch eingestellter Lauf auf, bevor Zeiten entstehen, die
 * sich nicht mehr ändern lassen.
 *
 * Die Datei ist rein darstellend: Sie liest keine Daten und schreibt nichts.
 * `Startuebersicht` liefert den Rahmen im Sheet, `Zeile`, `SchwimmerListe`,
 * `StartuebersichtLauf` und `StartuebersichtTraining` den Inhalt für die beiden
 * Aufrufer in Timer und Training.
 */
import type { ReactNode } from 'react'
import { formatStrecke, formatTakt } from '../domain/format'
import { warnungSeriePlan } from '../domain/serie'
import {
  trainingsSatzMeta,
  trainingsSatzTitel,
  trainingZusammenfassung,
  type TrainingsSatzFortschritt,
  type TrainingsSatzStatus,
} from '../domain/training'
import {
  type LaufKonfiguration,
  type SatzPlan,
  type Training,
} from '../domain/types'
import { zwischenzeitenGesamt } from '../domain/lauf'
import { Sheet } from './Sheet'
import { CheckIcon } from './icons'

// Kurztext je Satzstatus; die Werte selbst kommen aus domain/training.
const STATUS_LABEL: Record<TrainingsSatzStatus, string> = {
  offen: 'offen',
  bereit: 'bereit',
  laeuft: 'läuft',
  fertig: 'fertig',
}

interface StartuebersichtProps {
  open: boolean
  /** Titel des Sheets; zugleich Frage an den Trainer. */
  titel: string
  /** Ein Satz, der sagt, was gerade beginnt. */
  text: string
  /** Beschriftung des bestätigenden Knopfs, z. B. „Jetzt starten“. */
  startLabel: string
  onStart: () => void
  onClose: () => void
  /** Öffnet die Einstellungen zum Korrigieren; fehlt, wenn es nichts zu ändern gibt. */
  onAendern?: () => void
  aendernLabel?: string
  children: ReactNode
}

/**
 * Rahmen der Startübersicht.
 *
 * Der bestätigende Knopf steht unten und ist der einzige Weg zum Start; das
 * Sheet selbst schließt ohne Nebenwirkung. `onAendern` ist der Ausweg, wenn
 * doch etwas nicht stimmt — er schließt die Übersicht und öffnet das passende
 * Formular.
 */
export function Startuebersicht({
  open,
  titel,
  text,
  startLabel,
  onStart,
  onClose,
  onAendern,
  aendernLabel = 'Ändern',
  children,
}: StartuebersichtProps) {
  return (
    <Sheet open={open} onClose={onClose} titel={titel}>
      <p className="text-sm leading-relaxed text-muted">{text}</p>
      <div className="mt-4 rounded-2xl border border-line bg-surface2/60 px-3">{children}</div>

      <button
        type="button"
        onClick={onStart}
        className="mt-5 flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-xl font-bold text-accent-fg shadow-lg active:scale-[0.99]"
      >
        <CheckIcon className="h-6 w-6" />
        {startLabel}
      </button>
      {onAendern ? (
        <button
          type="button"
          onClick={onAendern}
          className="mt-2 h-12 w-full rounded-xl border border-line bg-surface2 text-sm font-semibold text-muted"
        >
          {aendernLabel}
        </button>
      ) : null}
    </Sheet>
  )
}

/** Eine Zeile „Label links, Wert rechts“ in der Übersicht. */
export function Zeile({ label, wert }: { label: string; wert: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
      <dt className="shrink-0 text-xs text-muted">{label}</dt>
      <dd className="text-right text-sm font-semibold">{wert}</dd>
    </div>
  )
}

/** Abschnittsüberschrift innerhalb der Übersicht. */
function Abschnitt({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="border-t border-line px-0 py-3">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">{label}</h3>
      {children}
    </section>
  )
}

/**
 * Alle Plätze Reihe für Reihe mit Namen.
 *
 * `namen` ist wie `Training.aktive` und `Einstellungen.schwimmerProBahn`
 * aufgebaut: erst alle Bahnen der Reihe 1, dann Reihe 2. Ein leerer Platz wird
 * ausdrücklich als „frei“ gezeigt, weil eine vergessene Zuordnung genau das
 * ist, was diese Übersicht aufdecken soll.
 */
export function SchwimmerListe({
  bahnen,
  reihen,
  namen,
}: {
  /** Bahnen je Reihe. */
  bahnen: number
  reihen: number
  namen: (string | null)[]
}) {
  return (
    <div className="space-y-2">
      {Array.from({ length: reihen }, (_, reiheIndex) => (
        <div key={reiheIndex}>
          {reihen > 1 ? (
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">
              Reihe {reiheIndex + 1}
            </p>
          ) : null}
          <ul>
            {Array.from({ length: bahnen }, (_, bahnIndex) => {
              const name = namen[reiheIndex * bahnen + bahnIndex] ?? null
              return (
                <li
                  key={bahnIndex}
                  className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-b-0"
                >
                  <span className="tabular shrink-0 text-xs text-muted">Bahn {bahnIndex + 1}</span>
                  <span
                    className={`truncate text-sm font-semibold ${name ? '' : 'font-normal italic text-muted'}`}
                  >
                    {name ?? 'frei'}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

/**
 * Übersicht eines Laufs oder der Vorgaben für den nächsten Lauf.
 *
 * Beide Fälle teilen sich dieselben Felder; der Aufrufer liefert die Werte aus
 * `Einstellungen` oder aus dem aktiven `Lauf`. Ein Plan wird nur ab zwei
 * Wiederholungen gezeigt, weil eine einzelne Wiederholung keine Serie ist.
 */
export function StartuebersichtLauf({
  konfiguration,
  bahnen,
  reihen,
  namen,
  startversatzMs,
  plan,
}: {
  konfiguration: LaufKonfiguration
  /** Bahnen je Reihe. */
  bahnen: number
  reihen: number
  /** Schwimmernamen je Platz, Reihe für Reihe. */
  namen: (string | null)[]
  startversatzMs: number
  plan: SatzPlan | null
}) {
  const zwischenzeiten = zwischenzeitenGesamt(konfiguration)
  const strecke = formatStrecke(konfiguration.streckeM)
  const serie = plan && plan.wiederholungen > 1 ? plan : null
  // Ein zu kurzer Takt wäre sonst erst mitten in der Serie sichtbar.
  const warnung = serie ? warnungSeriePlan(serie, reihen) : null
  const personen = bahnen * reihen

  return (
    <>
      <dl>
        <Zeile label="Beckenlänge" wert={`${konfiguration.beckenlaengeM} m`} />
        <Zeile label="Strecke" wert={serie ? `${serie.wiederholungen}×${strecke}` : strecke} />
        <Zeile
          label="Zwischenzeiten"
          wert={
            zwischenzeiten === null
              ? 'offen (Ziel per Knopf)'
              : `${zwischenzeiten} ${zwischenzeiten === 1 ? 'Zwischenzeit' : 'Zwischenzeiten'}, dann das Ziel`
          }
        />
        <Zeile
          label="Bahnen"
          wert={
            reihen > 1
              ? `${personen} Personen in ${reihen} Reihen`
              : `${personen} ${personen === 1 ? 'Bahn' : 'Bahnen'}`
          }
        />
        <Zeile
          label="Startversatz"
          wert={startversatzMs === 0 ? 'aus' : `${Math.round(startversatzMs / 1000)} s`}
        />
        {reihen > 1 && startversatzMs > 0 ? (
          <Zeile
            label="Startzeiten"
            wert={Array.from(
              { length: reihen },
              (_, index) => `R${index + 1} ${Math.round((startversatzMs * index) / 1000)} s`,
            ).join(' · ')}
          />
        ) : null}
        {serie ? <Zeile label="Takt" wert={formatTakt(serie.taktSek)} /> : null}
      </dl>
      <Abschnitt label="Schwimmer">
        <SchwimmerListe bahnen={bahnen} reihen={reihen} namen={namen} />
      </Abschnitt>
      {warnung ? (
        <p role="status" className="mb-3 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">
          {warnung}
        </p>
      ) : null}
    </>
  )
}

/**
 * Übersicht eines Trainings: Datum, Aktive und alle Sätze in fester
 * Reihenfolge. Der Satz, der gleich startet, ist hervorgehoben, damit die
 * Reihenfolge vor dem Start sichtbar ist.
 */
export function StartuebersichtTraining({
  training,
  fortschritt,
  namen,
  startSatzId,
}: {
  training: Training
  fortschritt: TrainingsSatzFortschritt[]
  /** Schwimmernamen je Platz, Reihe für Reihe. */
  namen: (string | null)[]
  /** ID des Trainingssatzes, der mit „Jetzt starten“ beginnt. */
  startSatzId: string
}) {
  const { fertig, gesamt } = trainingZusammenfassung(fortschritt)
  const personen = training.bahnen * training.reihen

  return (
    <>
      <dl>
        <Zeile
          label="Aktive"
          wert={`${personen} in ${training.reihen} ${training.reihen === 1 ? 'Reihe' : 'Reihen'}`}
        />
        <Zeile label="Sätze" wert={`${gesamt} · ${fertig} erledigt`} />
      </dl>
      <Abschnitt label="Schwimmer">
        <SchwimmerListe
          bahnen={training.bahnen}
          reihen={training.reihen}
          namen={namen}
        />
      </Abschnitt>
      <Abschnitt label="Reihenfolge">
        <ol className="space-y-1.5">
          {fortschritt.map((eintrag) => {
            const startet = eintrag.eintrag.id === startSatzId
            return (
              <li
                key={eintrag.eintrag.id}
                aria-current={startet ? 'step' : undefined}
                className={`rounded-xl border px-2.5 py-2 ${
                  startet ? 'border-accent/60 bg-accent/10' : 'border-line'
                }`}
              >
                <p className="flex items-center gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-surface text-[11px] font-bold text-muted">
                    {eintrag.index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {trainingsSatzTitel(eintrag.eintrag)}
                  </span>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted">
                    {startet ? 'startet jetzt' : STATUS_LABEL[eintrag.status]}
                  </span>
                </p>
                <p className="mt-0.5 truncate pl-7 text-[11px] text-muted">
                  {trainingsSatzMeta(eintrag.eintrag)}
                </p>
              </li>
            )
          })}
        </ol>
      </Abschnitt>
    </>
  )
}
