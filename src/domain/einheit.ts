/**
 * Meter und Yards: die einzige Stelle für Umrechnung und Beschriftung.
 *
 * Gespeichert wird immer kanonisch in Metern (`beckenlaengeM`, `streckeM`);
 * die Anzeige-Einheit (`m` oder `yd`) ändert keine Messdaten. So bleiben alte
 * Läufe und Backups ohne Feld unverändert Meter, und ein Yard-Lauf lässt sich
 * dennoch eindeutig beschreiben: 25 yd sind 22,86 m, 100 yd sind 91,44 m.
 *
 * Grenzen: Yard-Strecken werden auf ganze Yards eingegeben; die kanonischen
 * Meter sind auf zwei Nachkommastellen gerundet. Bestzeiten trennen Meter- und
 * Yard-Becken, weil Zeiten auf unterschiedlich langen Bahnen nicht vergleichbar
 * sind. Die Umrechnung benutzt den internationalen Yard (1 yd = 0,9144 m).
 */
import type { Beckenlaenge, Einheit, LaufKonfiguration } from './types'

/** Ein Yard in Metern (international). */
export const YARD_IN_METER = 0.9144

/** 25 yd als kanonische Beckenlänge in Metern. */
export const BECKENLAENGE_25_YD_M = 22.86

/** 100 yd als kanonische Strecke in Metern. */
export const STRECKE_100_YD_M = 91.44

/** Anzeige-Einheit einer Konfiguration; fehlt sie, gilt Meter. */
export function einheitVon(
  konfiguration: Pick<LaufKonfiguration, 'einheit'> | null | undefined,
): Einheit {
  return konfiguration?.einheit === 'yd' ? 'yd' : 'm'
}

/** Type Guard für Werte aus Formularen, Backups oder alten Einstellungen. */
export function istEinheit(wert: unknown): wert is Einheit {
  return wert === 'm' || wert === 'yd'
}

/** Rundet kanonische Meter auf zwei Nachkommastellen. */
export function rundeMeter(wert: number): number {
  return Math.round(wert * 100) / 100
}

/** Wandelt eine eingegebene Strecke in kanonische Meter. */
export function anzeigeZuMeter(wert: number, einheit: Einheit): number {
  return einheit === 'yd' ? rundeMeter(wert * YARD_IN_METER) : rundeMeter(wert)
}

/**
 * Wandelt kanonische Meter in die Anzeige-Einheit. Yard-Werte werden auf ganze
 * Yards gerundet: 22,86 m sind 25 yd und 91,44 m sind 100 yd. Damit entstehen
 * keine Anzeigen wie „24,999999 yd“.
 */
export function meterZuAnzeige(meter: number, einheit: Einheit): number {
  return einheit === 'yd' ? Math.round(meter / YARD_IN_METER) : Math.round(meter * 100) / 100
}

/** Anzeigewert einer Strecke; `null` bleibt offene Strecke. */
export function streckeAnzeige(streckeM: number | null, einheit: Einheit): number | null {
  return streckeM === null ? null : meterZuAnzeige(streckeM, einheit)
}

/**
 * Überführt eine Konfiguration in die einzige Eingabe-Einheit Meter.
 *
 * Die Einheit wird nicht mehr gewählt; neue Läufe sind immer Meter. Alte
 * Yard-Konfigurationen bleiben lesbar und werden beim Übernehmen in die
 * Einstellungen oder beim Bearbeiten eines Plans umgerechnet. Dabei bleiben die
 * angezeigten Zahlen erhalten (25 yd → 25 m, 100 yd → 100 m): Aus einem
 * 25-Yard-Becken wird so ein 25-m-Becken, ohne dass eine unsichtbare Einheit
 * zurückbleibt.
 */
export function alsMeterKonfiguration(
  konfiguration: LaufKonfiguration,
): LaufKonfiguration {
  if (einheitVon(konfiguration) === 'm') {
    if (konfiguration.einheit === undefined) return konfiguration
    const { einheit: _einheit, ...ohneEinheit } = konfiguration
    return ohneEinheit
  }
  const { einheit: _einheit, ...ohneEinheit } = konfiguration
  return {
    ...ohneEinheit,
    beckenlaengeM: 25,
    streckeM: streckeAnzeige(konfiguration.streckeM, 'yd'),
  }
}

/** Erlaubte Beckenlängen je Einheit: Meter 25/50, Yards nur 25 yd. */
export function beckenlaengenFuer(einheit: Einheit): readonly Beckenlaenge[] {
  return einheit === 'yd' ? ([BECKENLAENGE_25_YD_M] as const) : ([25, 50] as const)
}

/** Voreingestellte Beckenlänge beim Wechsel der Einheit. */
export function standardBeckenlaenge(einheit: Einheit): Beckenlaenge {
  return einheit === 'yd' ? BECKENLAENGE_25_YD_M : 50
}

/** Prüft einen gespeicherten Wert gegen die erlaubten Beckenlängen. */
export function istBeckenlaenge(wert: unknown): wert is Beckenlaenge {
  return wert === 25 || wert === 50 || wert === 22.86
}

/**
 * Pace pro 100 Einheiten in Millisekunden. Bei Yards ist die Bezugsstrecke
 * 91,44 m, nicht 100 m: Ein 1:00 auf 100 yd ergibt 60 000, nicht 65 616.
 */
export function pacePro100Einheit(ms: number, streckeM: number, einheit: Einheit): number {
  if (einheit === 'yd') return (ms * STRECKE_100_YD_M) / streckeM
  return (ms / streckeM) * 100
}

/** Beschriftet eine Strecke in der Einheit, z. B. `100 yd` oder `1.500 m`. */
export function formatStreckeEinheit(streckeM: number | null, einheit: Einheit): string {
  if (streckeM === null) return 'offene Strecke'
  return `${meterZuAnzeige(streckeM, einheit).toLocaleString('de-DE')} ${einheit}`
}

/** Beschriftet eine Beckenlänge, z. B. `25 yd` statt `22,86 m`. */
export function formatBeckenlaenge(beckenlaengeM: Beckenlaenge, einheit: Einheit): string {
  return `${meterZuAnzeige(beckenlaengeM, einheit)} ${einheit}`
}
