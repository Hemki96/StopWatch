/**
 * Polite Live-Region für seltene Ereignisse in der Messung.
 *
 * `Ansage` bleibt dauerhaft im DOM, damit Screenreader überhaupt eine
 * Textänderung wahrnehmen. Beschrieben wird sie nur bei Start, Anschlag, Ziel
 * und Laufende — nie pro Animationsframe. Die gedrosselte Zeit für
 * `aria-describedby` liegt in `useGedaempfteZeit`.
 */
export function Ansage({ text }: { text: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-ansage={text || undefined}
      className="sr-only"
    >
      {text}
    </span>
  )
}
