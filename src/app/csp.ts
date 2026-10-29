/**
 * Content-Security-Policy für den statischen Build.
 *
 * GitHub Pages kann keine eigenen HTTP-Header setzen. Die Policy wird deshalb
 * als `<meta http-equiv="Content-Security-Policy">` in `dist/index.html`
 * eingefügt — und zwar erst im Build: Der Dev-Server braucht Inline-Skripte von
 * Vite und React Refresh, die kein Hash abdecken kann.
 *
 * Der Hash des Inline-Theme-Skripts wird beim Build aus dem tatsächlichen HTML
 * berechnet. Ändert sich das Skript, ändert sich der Hash mit; ein veralteter
 * Hash kann nicht entstehen.
 *
 * Bewusste Grenzen: `frame-ancestors`, `report-uri` und `sandbox` ignoriert der
 * Browser in einem Meta-Tag. Wer Clickjacking-Schutz oder Reporte braucht,
 * muss die Policy zusätzlich als HTTP-Header ausliefern.
 */
import { createHash } from 'node:crypto'

/** Namen der Policy, damit Build und Test dieselbe Schreibweise prüfen. */
export const CSP_HTTP_EQUIV = 'Content-Security-Policy'

/**
 * Hashes aller ausführbaren Inline-Skripte im HTML.
 *
 * Der Browser hasht den exakten Text zwischen den Tags (inklusive
 * Einrückung und Zeilenumbrüchen), nicht die Tags selbst. Skripte mit `src`
 * laufen über `'self'`; nicht ausführbare Typen wie `application/json` brauchen
 * keinen Hash.
 */
export function skriptHashes(html: string): string[] {
  const hashes: string[] = []

  for (const treffer of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attribute = treffer[1] ?? ''
    const inhalt = treffer[2] ?? ''

    if (/\bsrc\s*=/i.test(attribute)) continue
    const typ = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attribute)?.[1]?.toLowerCase()
    if (typ !== undefined && typ !== 'module' && typ !== 'text/javascript') continue

    const digest = createHash('sha256').update(inhalt, 'utf8').digest('base64')
    hashes.push(`'sha256-${digest}'`)
  }

  return hashes
}

/**
 * Die Policy als String.
 *
 * - `script-src`: nur eigene Dateien und der Hash des Theme-Skripts.
 * - `style-src 'unsafe-inline'`: das Inline-`<style>` im Kopf und die
 *   `style`-Attribute von React/Tailwind lassen sich ohne Nonce nicht hashen.
 * - `connect-src 'self'`: kein Netzwerkziel außer der eigenen Origin.
 * - `img-src 'self' data:`: Icons kommen aus dem Build, `data:` bleibt für
 *   eingebettete Bilder erlaubt.
 * - `worker-src 'self'`: Service Worker und Workbox-Importe liegen auf der
 *   eigenen Origin. Blob-Worker gibt es nicht und sind deshalb gesperrt.
 */
export function cspInhalt(html: string): string {
  const skripte = skriptHashes(html)
  return [
    "default-src 'self'",
    ["script-src 'self'", ...skripte].join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
}

/**
 * Fügt die Policy als Meta-Tag in den Kopf ein.
 *
 * Das Tag steht vor `<style>` und Inline-Skript, weil ein Meta-CSP nur für den
 * Inhalt gilt, der darauf folgt. Eine bereits vorhandene Policy wird ersetzt,
 * damit ein zweiter Aufruf kein Duplikat erzeugt.
 */
export function mitCsp(html: string): string {
  const meta = `<meta http-equiv="${CSP_HTTP_EQUIV}" content="${cspInhalt(html)}" />`
  const ohneAlt = html.replace(
    /\s*<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>\s*/i,
    '\n',
  )
  const charset = /<meta\s+charset\s*=\s*["'][^"']+["']\s*\/?>/i

  if (charset.test(ohneAlt)) {
    // Nach dem Charset, damit die Zeichenkodierung im Kopf zuerst steht.
    return ohneAlt.replace(charset, (treffer) => `${treffer}\n    ${meta}`)
  }

  return ohneAlt.replace(/<head(\s[^>]*)?>/i, (kopf) => `${kopf}\n    ${meta}`)
}
