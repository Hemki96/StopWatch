/**
 * Kleine Bausteine für Formulare in Sheets.
 *
 * `Feld` gliedert einen Abschnitt, `Chip` ist die große Auswahlfläche für
 * Strecke, Takt oder Versatz. Beide sind rein darstellend; Zustand und
 * Gültigkeit bleiben beim aufrufenden Sheet.
 */
import { useState, type ReactNode } from 'react'
import { formatTakt } from '../domain/format'
import { MAX_ZWISCHENZEITEN } from '../domain/lauf'

/**
 * Überschrift plus Inhalt eines Abschnitts in einem Sheet.
 *
 * `hint` erklärt eine Regel unter dem Inhalt, etwa dass die Bahnzahl nur für
 * kommende Sätze gilt.
 */
export function Feld({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string | undefined
  children: ReactNode
}) {
  return (
    <section className="mb-5">
      {/* `h3` statt `h2`: Der Sheet-Titel ist die `h2` der Ebene darüber. */}
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">{label}</h3>
      {children}
      {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
    </section>
  )
}

/**
 * Großer, auch mit nassen Fingern treffsicherer Auswahlknopf.
 *
 * `aktiv` schaltet die Akzentfarbe, `disabled` sperrt die Auswahl (etwa eine
 * gesperrte Strecke). Die Mindestbreite von 44 px entspricht der üblichen
 * Touch-Zielgröße.
 */
export function Chip({
  aktiv,
  disabled,
  onClick,
  children,
}: {
  aktiv: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      // Farbe allein ist kein Zustand für Screenreader. `aria-pressed` macht
      // die Auswahl auch ohne Sehen erkennbar.
      aria-pressed={aktiv}
      // Das Deaktivieren muss auch optisch erkennbar sein, nicht nur über
      // `disabled` im DOM.
      className={`h-11 min-w-11 rounded-xl border px-3 text-sm font-semibold transition-colors disabled:opacity-40 ${
        aktiv ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface2 text-fg'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Ein-/Ausschalter für eine Einstellung mit Erklärung.
 *
 * Der ganze Block ist der Schalter, damit auch nasse Finger die Zeile treffen.
 * `role="switch"` plus `aria-checked` macht den Zustand für Screenreader
 * erkennbar; die Farbe allein wäre kein Zustand.
 */
export function Schalter({
  an,
  onAendern,
  titel,
  beschreibung,
}: {
  an: boolean
  onAendern: (an: boolean) => void
  titel: string
  beschreibung?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={an}
      onClick={() => onAendern(!an)}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3 text-left"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{titel}</span>
        {beschreibung ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted">{beschreibung}</span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          an ? 'bg-accent' : 'bg-line'
        }`}
      >
        <span
          className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-surface shadow-sm transition-transform ${
            an ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  )
}

// Gängige Taktzeiten als Schnellauswahl. Der jeweils aktuelle Wert wird bei
// Bedarf ergänzt, damit auch ein frei eingegebener Takt als Chip sichtbar
// bleibt.
const TAKTE = [60, 75, 90, 105, 120, 135, 150, 180, 240] as const
/** Obergrenze aus der Domäne: ein Takt von höchstens 60 Minuten. */
const MAX_TAKT_SEK = 3600

/**
 * Auswahl des Takts: gängige Werte als Chip, jeder andere Wert über Minuten und
 * Sekunden.
 *
 * Die beiden Zahlenfelder sind bewusst getrennt: Auf dem Handy öffnet sich so
 * die Zifferntastatur, und ein Doppelpunkt muss nicht getippt werden. Überlauf
 * wird umgerechnet (90 s ergibt 1:30), erst oberhalb von 60 Minuten gekappt.
 * Der Aufrufer prüft die Grenzen erneut über die Domäne.
 */
export function TaktWahl({
  wert,
  onWert,
  disabled = false,
}: {
  /** Takt in Sekunden. */
  wert: number
  onWert: (sekunden: number) => void
  disabled?: boolean
}) {
  // Der aktuelle Wert kann außerhalb der Schnellauswahl liegen; er wird
  // einsortiert ergänzt, statt auf einen anderen Chip zu springen.
  const optionen = Array.from(new Set<number>([...TAKTE, wert])).sort((a, b) => a - b)
  const minuten = Math.floor(wert / 60)
  const sekunden = wert % 60

  /** Liest ein Zahlenfeld; leere oder unlesbare Eingaben zählen als 0. */
  const zahl = (roh: string) => {
    const n = Number(roh)
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
  }

  /** Setzt den Takt aus beiden Feldern und kappt nur an der Obergrenze. */
  const setze = (m: number, s: number) => {
    onWert(Math.min(MAX_TAKT_SEK, m * 60 + s))
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {optionen.map((option) => (
          <Chip
            key={option}
            aktiv={wert === option}
            disabled={disabled}
            onClick={() => onWert(option)}
          >
            {formatTakt(option)}
          </Chip>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-muted">Eigener Takt</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={60}
          step={1}
          value={minuten}
          disabled={disabled}
          onChange={(event) => setze(zahl(event.target.value), sekunden)}
          aria-label="Takt Minuten"
          className="tabular h-11 w-16 rounded-xl border border-line bg-surface2 px-2 text-center text-sm disabled:opacity-40"
        />
        <span className="text-sm font-semibold text-muted">:</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={59}
          step={1}
          value={sekunden}
          disabled={disabled}
          onChange={(event) => setze(minuten, zahl(event.target.value))}
          aria-label="Takt Sekunden"
          className="tabular h-11 w-16 rounded-xl border border-line bg-surface2 px-2 text-center text-sm disabled:opacity-40"
        />
        <span className="text-xs text-muted">min:s</span>
      </div>
    </div>
  )
}

/**
 * Auswahl der Zwischenzeiten: Die Zahl lässt sich direkt eintippen oder über
 * Plus/Minus ändern. „Automatisch“ leitet sie aus Strecke und Beckenlänge ab
 * und bleibt als Rückweg sichtbar. Sobald der Trainer eine Zahl setzt, gilt sie
 * fest; `null` steht für „automatisch“.
 */
export function ZwischenzeitenWahl({
  wert,
  automatisch,
  onWert,
  disabled = false,
}: {
  /** Eingestellte Zahl oder `null` für automatisch. */
  wert: number | null
  /** Zahl, die sich aus Strecke und Beckenlänge ergibt; `null` bei offener Strecke. */
  automatisch: number | null
  onWert: (wert: number | null) => void
  disabled?: boolean
}) {
  // Die Anzeige folgt der eingestellten Zahl; bei „Automatisch“ zeigt sie den
  // abgeleiteten Wert, damit die Wirkung vor dem Start sichtbar ist. Während
  // des Tippens hält `eingabe` den rohen Text, damit ein kurzes Leeren nicht
  // sofort wieder auf den abgeleiteten Wert springt.
  const effektiv = wert ?? automatisch
  const [eingabe, setEingabe] = useState<string | null>(null)
  const angezeigt = eingabe ?? (effektiv === null ? '' : String(effektiv))

  /** Setzt eine fertige Zahl und beendet den Tippzustand. */
  const setze = (zahl: number | null) => {
    setEingabe(null)
    onWert(zahl)
  }

  /** Übernimmt die Eingabe; ein leeres Feld bedeutet „automatisch“. */
  const uebernehmen = (text: string) => {
    setEingabe(text)
    if (text.trim() === '') {
      onWert(null)
      return
    }
    const zahl = Number(text)
    if (!Number.isFinite(zahl)) return
    onWert(Math.min(MAX_ZWISCHENZEITEN, Math.max(0, Math.round(zahl))))
  }

  const aendere = (delta: number) => {
    if (effektiv === null && delta < 0) {
      setze(0)
      return
    }
    setze(Math.min(MAX_ZWISCHENZEITEN, Math.max(0, (effektiv ?? 0) + delta)))
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Weniger Zwischenzeiten"
          disabled={disabled || effektiv === 0}
          onClick={() => aendere(-1)}
          className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold disabled:opacity-40"
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_ZWISCHENZEITEN}
          step={1}
          value={angezeigt}
          disabled={disabled}
          onChange={(event) => uebernehmen(event.target.value)}
          onBlur={() => setEingabe(null)}
          aria-label="Anzahl Zwischenzeiten"
          data-zwischenzeiten={effektiv === null ? 'offen' : effektiv}
          className="tabular h-12 w-16 rounded-xl border border-line bg-surface2 px-2 text-center text-2xl font-semibold disabled:opacity-40"
        />
        <button
          type="button"
          aria-label="Mehr Zwischenzeiten"
          disabled={disabled || (effektiv !== null && effektiv >= MAX_ZWISCHENZEITEN)}
          onClick={() => aendere(1)}
          className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold disabled:opacity-40"
        >
          +
        </button>
        <span className="text-xs text-muted">Zwischenzeiten, dann das Ziel</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Chip aktiv={wert === null} disabled={disabled} onClick={() => setze(null)}>
          Automatisch
        </Chip>
        <span className="text-xs text-muted">
          {automatisch === null
            ? 'offene Strecke'
            : `Vorgabe aus Strecke und Becken: ${automatisch}`}
        </span>
      </div>
    </div>
  )
}
