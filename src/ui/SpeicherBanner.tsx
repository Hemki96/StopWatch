/**
 * Dauerhafter Warnstreifen für fehlenden lokalen Speicher.
 *
 * Wird in App.tsx anhand von `speicherFehler` aus app/AppProvider eingeblendet.
 * Anders als ein Toast verschwindet er nicht: Ohne Persistenz gehen alle Zeiten
 * beim Schließen verloren, und das muss bis dahin sichtbar bleiben.
 */
/**
 * Zeigt den Hinweis, solange `sichtbar` gilt; ohne Speicherfehler rendert die
 * Komponente nichts.
 */
export function SpeicherBanner({ sichtbar }: { sichtbar: boolean }) {
  // Kein leerer Platzhalter, wenn der Speicher funktioniert.
  if (!sichtbar) return null
  return (
    <p
      // `role="alert"` liest den Hinweis vor, sobald er auftaucht.
      role="alert"
      className="border-b border-danger/40 bg-danger/10 px-3 py-2 text-center text-[11px] font-medium text-danger"
    >
      Kein Speicher verfügbar — Daten gehen beim Schließen verloren.
    </p>
  )
}
