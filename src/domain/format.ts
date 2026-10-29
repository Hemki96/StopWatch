/**
 * Zeitformatierung, Countdown und Abschneiden auf Hundertstel.
 *
 * Schwimmzeiten werden auf Hundertstel abgeschnitten, nicht gerundet, damit die
 * Anzeige nie schneller wirkt als die gemessene Zeit. Diese Datei ist rein und
 * ohne Browser-API; sie wird von Anzeige, CSV-Export und Prüfungen gemeinsam
 * genutzt.
 *
 * Zwei Formate sind bewusst unterschiedlich: Messzeiten stehen als `mm:ss,hh`
 * (Minuten laufen über 60 hinaus), Countdowns dagegen gröber auf Zehntel. Für
 * Eingabefelder liest `parseTime` das deutsche Format zurück.
 */

/**
 * Zeiten werden auf Hundertstel abgeschnitten, nicht gerundet.
 * So entstehen keine Abweichungen zu offiziellen Schwimmzeiten.
 */
export function truncateToHundredths(ms: number): number {
  return Math.trunc(ms / 10) * 10
}

/** Füllt eine Zahl links mit Nullen auf; Werte mit mehr Stellen bleiben ganz. */
function pad(value: number, width = 2): string {
  return value.toString().padStart(width, '0')
}

/**
 * Formatiert Millisekunden als `mm:ss,hh`. Negative Werte werden als 0
 * behandelt, Minuten laufen ohne Stundenteil über 60 hinaus (`61:01,99`).
 */
export function formatTime(ms: number): string {
  const t = truncateToHundredths(Math.max(0, ms))
  const hundredths = Math.floor((t % 1000) / 10)
  const totalSeconds = Math.floor(t / 1000)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60)
  return `${pad(minutes)}:${pad(seconds)},${pad(hundredths)}`
}

/**
 * Formatiert eine Differenz mit Vorzeichen, z. B. `-1,23` oder `+0,45`.
 *
 * Die führenden Minuten werden nur bei `00:` entfernt; ab einer Minute bleibt
 * `mm:ss,hh` stehen. Das Vorzeichen wird immer gesetzt, damit ein Delta nicht
 * mit einer Messzeit verwechselt wird.
 */
export function formatDelta(ms: number): string {
  const sign = ms < 0 ? '-' : '+'
  return `${sign}${formatTime(Math.abs(ms)).replace(/^00:/, '')}`
}

/**
 * Countdown bis zum Start einer Bahn, auf Zehntel abgeschnitten: `7,4` oder
 * `1:07,4`. Bewusst gröber als eine Messzeit — hier zählt die Lesbarkeit.
 *
 * Ohne Minuten entfällt die führende Null (`7,4` statt `07,4`). Negative
 * Restzeiten werden als 0 angezeigt.
 */
export function formatCountdown(ms: number): string {
  const zehntel = Math.trunc(Math.max(0, ms) / 100)
  const gesamtSekunden = Math.floor(zehntel / 10)
  const restZehntel = zehntel % 10
  const sekunden = gesamtSekunden % 60
  const minuten = Math.floor(gesamtSekunden / 60)
  if (minuten === 0) return `${sekunden},${restZehntel}`
  return `${minuten}:${pad(sekunden)},${restZehntel}`
}

/**
 * Formatiert einen Takt in Sekunden als `mm:ss`, z. B. `02:00`.
 *
 * Hier wird gerundet, weil der Takt aus einer Sekundeneingabe stammt und keine
 * Messzeit ist; negative Werte werden als 0 angezeigt.
 */
export function formatTakt(sekunden: number): string {
  const s = Math.max(0, Math.round(sekunden))
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
}

/**
 * Liest eine Eingabe wie `01:23,45` (oder `1:23,45`, `83,45`, `1:02:03,45`) als
 * Millisekunden. Gibt null zurück, wenn die Eingabe keine gültige Zeit ist.
 *
 * Erlaubt sind höchstens drei Zahlengruppen (h:mm:ss) und ein bis zwei
 * Nachkommastellen; ein Komma oder Punkt trennt die Hundertstel. Fehlende
 * Hundertstel werden mit 0 aufgefüllt (`1:23,4` = 83,40 s). Sekunden und
 * Minuten müssen unter 60 liegen, sobald eine größere Einheit angegeben ist;
 * Stunden sind nicht begrenzt.
 */
export function parseTime(eingabe: string): number | null {
  // Leerraum wird überall entfernt, damit „ 01:00,00 “ und „1: 00“ gleich wirken.
  const text = eingabe.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^\d{1,3}(:\d{1,2}){0,2}(\.\d{1,2})?$/.test(text)) return null

  const teile = text.split(':')
  const mitMinuten = teile.length > 1
  const sekundenTeil = teile.pop()
  if (sekundenTeil === undefined) return null
  const [sekundenRoh, hundertstelRoh = ''] = sekundenTeil.split('.')
  const sekunden = Number(sekundenRoh)
  if (!Number.isFinite(sekunden)) return null
  // Ohne Minutenangabe sind auch 90 s als Kurzform zulässig.
  if (mitMinuten && sekunden >= 60) return null

  let minuten = 0
  let stunden = 0
  if (teile.length === 1) minuten = Number(teile[0])
  else if (teile.length === 2) {
    stunden = Number(teile[0])
    minuten = Number(teile[1])
  }
  if (!Number.isFinite(minuten) || minuten >= 60) return null
  if (!Number.isFinite(stunden)) return null

  // Eine einzelne Nachkommastelle bedeutet Zehntel, wird also auf Hundertstel
  // ergänzt; mehr als zwei Stellen hat der reguläre Ausdruck bereits abgelehnt.
  const hundertstel = Number(hundertstelRoh.padEnd(2, '0').slice(0, 2))
  if (!Number.isFinite(hundertstel)) return null

  return ((stunden * 60 + minuten) * 60 + sekunden) * 1000 + hundertstel * 10
}

/**
 * Eingabeformat für Korrekturen, z. B. `01:23,45`. Bewusst ein Alias von
 * `formatTime`, damit Korrekturfeld und Anzeige nicht auseinanderlaufen.
 */
export function formatTimeInput(ms: number): string {
  return formatTime(ms)
}

/**
 * Formatiert eine Distanz, z. B. `100 m` oder `1.500 m` (deutscher
 * Tausenderpunkt). `null` steht für eine offene Strecke ohne feste Distanz.
 */
export function formatStrecke(streckeM: number | null): string {
  if (streckeM === null) return 'offene Strecke'
  return `${streckeM.toLocaleString('de-DE')} m`
}

/**
 * Datum als lokales ISO-Datum (YYYY-MM-DD), nicht UTC.
 *
 * `toISOString()` würde am Abend je nach Zeitzone schon den nächsten Tag
 * liefern; Wettkampf- und Trainingsdaten sollen aber den Tag am Beckenrand
 * tragen. Die Bestandteile kommen deshalb aus den lokalen Gettern.
 */
export function lokalesDatum(ms: number): string {
  const d = new Date(ms)
  const monat = `${d.getMonth() + 1}`.padStart(2, '0')
  const tag = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${monat}-${tag}`
}
