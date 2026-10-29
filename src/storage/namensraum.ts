/**
 * Namensraum aller persistenten Daten dieser App.
 *
 * GitHub Pages liefert alle Projektseiten eines Accounts unter derselben
 * Origin aus (`https://<account>.github.io`). IndexedDB und `localStorage` sind
 * originweit — nicht pfadgebunden. Zwei Projekte auf derselben Origin sehen
 * deshalb dieselben Datenbanken und Schlüssel, wenn sie dieselben Namen
 * verwenden. Ein Namensraum macht Kollisionen unwahrscheinlich und trennt
 * diesen Bestand von der früheren, unspezifischen Namensgebung; er ist **keine
 * Sicherheitsgrenze** gegen fremdes JavaScript auf derselben Origin. Diese
 * Grenze schafft nur eine eigene Origin (eigene Domain). Siehe ADR-0011.
 *
 * Die Kennung ist bewusst stabil und hängt nicht vom Auslieferungspfad ab:
 * Ein Wechsel zwischen `/StopWatch/` und `/` (etwa lokal) oder ein Lesezeichen
 * auf `index.html` darf nicht zu einer zweiten, scheinbar leeren Datenbank
 * führen. Der Namensraum steigt nur, wenn sich die Namenskonvention selbst
 * ändert.
 */

/** Stabile App-Kennung; bleibt über Deployments und Pfade hinweg gleich. */
export const APP_ID = 'beckenrand'

/**
 * Generation der Speicher-Namensgebung. Unabhängig von der App-Version und von
 * der IndexedDB-Schemaversion (`DB_VERSION` in `db.ts`).
 */
export const SPEICHER_GENERATION = 2

/** Gemeinsamer Namensraum für Datenbank, localStorage und BroadcastChannel. */
export const NAMENSRAUM = `${APP_ID}.v${SPEICHER_GENERATION}`

/** Name der aktuellen IndexedDB-Datenbank. */
export const DATENBANK_NAME = NAMENSRAUM

/** Frühere Datenbank ohne Namensraum; wird nur lesend für die Übernahme geöffnet. */
export const LEGACY_DATENBANK_NAME = APP_ID

/** Präfix der früheren localStorage-Schlüssel, z. B. `beckenrand.theme`. */
export const LEGACY_SCHLUESSEL_PRAEFIX = `${APP_ID}.`

/**
 * Gemeinsamer BroadcastChannel aller Tabs dieser App.
 *
 * Bewusst **ohne** neuen Namensraum: Der Kanal speichert keine Daten. Behält er
 * den bisherigen Namen, koordinieren sich während des Updates auch ein noch
 * offener Tab der alten Version und die neue Version, statt gleichzeitig in
 * zwei getrennte Datenbanken zu schreiben. Siehe ADR-0011.
 */
export const KANAL_NAME = `${APP_ID}.tabs`

/**
 * Bildet einen logischen Schlüssel auf den namensraumgebundenen
 * `localStorage`-Schlüssel ab, z. B. `theme` → `beckenrand.v2.theme`.
 */
export function speicherSchluessel(name: string): string {
  return `${NAMENSRAUM}.${name}`
}

/**
 * Früherer Schlüssel ohne Namensraum, z. B. `theme` → `beckenrand.theme`.
 *
 * Wird nur lesend als Rückfall verwendet, damit bestehende Installationen
 * ihre Auswahl behalten. Geschrieben wird immer der neue Schlüssel.
 */
export function legacySchluessel(name: string): string {
  return `${LEGACY_SCHLUESSEL_PRAEFIX}${name}`
}
