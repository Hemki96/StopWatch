/**
 * Kleine Bausteine für Formulare in Sheets.
 *
 * `Feld` gliedert einen Abschnitt, `Chip` ist die große Auswahlfläche für
 * Strecke, Takt oder Versatz. Beide sind rein darstellend; Zustand und
 * Gültigkeit bleiben beim aufrufenden Sheet.
 */
import type { ReactNode } from 'react'

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
  hint?: string
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
