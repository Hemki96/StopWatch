/**
 * Zeiten werden auf Hundertstel abgeschnitten, nicht gerundet.
 * So entstehen keine Abweichungen zu offiziellen Schwimmzeiten.
 */
export function truncateToHundredths(ms: number): number {
  return Math.trunc(ms / 10) * 10
}

function pad(value: number, width = 2): string {
  return value.toString().padStart(width, '0')
}

/** Formatiert Millisekunden als `mm:ss,hh`. */
export function formatTime(ms: number): string {
  const t = truncateToHundredths(Math.max(0, ms))
  const hundredths = Math.floor((t % 1000) / 10)
  const totalSeconds = Math.floor(t / 1000)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60)
  return `${pad(minutes)}:${pad(seconds)},${pad(hundredths)}`
}

/** Formatiert eine Differenz mit Vorzeichen, z. B. `-1,23` oder `+0,45`. */
export function formatDelta(ms: number): string {
  const sign = ms < 0 ? '-' : '+'
  return `${sign}${formatTime(Math.abs(ms)).replace(/^00:/, '')}`
}

/** Formatiert eine Distanz, z. B. `100 m` oder `1.500 m`. */
export function formatStrecke(streckeM: number | null): string {
  if (streckeM === null) return 'offene Strecke'
  return `${streckeM.toLocaleString('de-DE')} m`
}

/** Datum als lokales ISO-Datum (YYYY-MM-DD), nicht UTC. */
export function lokalesDatum(ms: number): string {
  const d = new Date(ms)
  const monat = `${d.getMonth() + 1}`.padStart(2, '0')
  const tag = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${monat}-${tag}`
}
