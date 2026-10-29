/**
 * Heutiges Datum als `YYYY-MM-DD` in lokaler Zeit.
 *
 * Bewusst nicht `toISOString()`: Das liefert UTC und würde am Abend bereits den
 * Folgetag erzeugen. Sätze werden über dieses Datum gruppiert.
 */
export function heute(): string {
  const d = new Date()
  const monat = `${d.getMonth() + 1}`.padStart(2, '0')
  const tag = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${monat}-${tag}`
}
