/**
 * Dauerhafter Hinweis, sobald Laden oder Schreiben im lokalen Speicher
 * scheitert. Anders als ein Toast verschwindet er nicht: Ohne Persistenz gehen
 * alle Zeiten beim Schließen verloren, und das muss bis dahin sichtbar bleiben.
 */
export function SpeicherBanner({ sichtbar }: { sichtbar: boolean }) {
  if (!sichtbar) return null
  return (
    <p
      role="alert"
      className="border-b border-danger/40 bg-danger/10 px-3 py-2 text-center text-[11px] font-medium text-danger"
    >
      Kein Speicher verfügbar — Daten gehen beim Schließen verloren.
    </p>
  )
}
