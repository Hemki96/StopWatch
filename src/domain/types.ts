export type Schwimmart =
  | 'freistil'
  | 'brust'
  | 'ruecken'
  | 'schmetterling'
  | 'lagen'
  | 'beliebig'

export const SCHWIMMARTEN: readonly { wert: Schwimmart; label: string }[] = [
  { wert: 'freistil', label: 'Freistil' },
  { wert: 'brust', label: 'Brust' },
  { wert: 'ruecken', label: 'Rücken' },
  { wert: 'schmetterling', label: 'Schmetterling' },
  { wert: 'lagen', label: 'Lagen' },
  { wert: 'beliebig', label: 'Beliebig' },
]

export type Beckenlaenge = 25 | 50

/** Die Konfiguration eines Laufs. `streckeM: null` bedeutet offene Strecke. */
export interface LaufKonfiguration {
  beckenlaengeM: Beckenlaenge
  streckeM: number | null
  schwimmart: Schwimmart
}

/** Ein Anschlag an der Wand, kumuliert ab Start der Bahn gemessen. */
export interface Anschlag {
  /** Fortlaufende Nummer der Länge innerhalb der Bahn, beginnend bei 1. */
  laengeNr: number
  /** Kumulierte Zeit seit Start der Bahn in Millisekunden. */
  splitMs: number
  /** Wanduhr-Zeitpunkt der Erfassung (`Date.now`). */
  erfasstAt: number
  /** True, wenn dieser Anschlag die konfigurierte Strecke abschließt. */
  istFinish: boolean
  /** True, wenn die Zeit nachträglich von Hand korrigiert wurde. */
  manuell?: boolean
}

export interface Bahn {
  id: string
  nummer: number
  schwimmerId: string | null
  /** Monotone Startzeit der Bahn (`performance.now`), null solange nicht gestartet. */
  startMs: number | null
  anschlaege: Anschlag[]
}

export interface Lauf {
  id: string
  satzId: string | null
  konfiguration: LaufKonfiguration
  /** Wanduhr-Anker des Starts dieser Wiederholung (`Date.now`). */
  startWallMs: number | null
  /** Fester Abstand zwischen den Starts der Bahnen in ms. 0 = gemeinsamer Start. */
  startversatzMs: number
  /** 1-basierte Wiederholung innerhalb einer geplanten Serie, sonst null. */
  wiederholung: number | null
  bahnen: Bahn[]
}

export interface Schwimmer {
  id: string
  name: string
  jahrgang: number | null
  notiz: string
  erstelltAm: number
}

/**
 * Der Plan einer Serie: mehrere Wiederholungen im festen Takt. Die Starts aller
 * Wiederholungen stehen beim Start fest, damit die App ohne Timer auskommt.
 */
export interface SatzPlan {
  /** Anzahl der Wiederholungen (Läufe) in der Serie. */
  wiederholungen: number
  /** Zeit zwischen zwei Wiederholungen in Sekunden. */
  taktSek: number
  /** Abstand zwischen den Starts der Bahnen innerhalb einer Wiederholung in ms. */
  startversatzMs: number
}

export interface Satz {
  id: string
  /** Trainingstag als ISO-Datum (YYYY-MM-DD). */
  datum: string
  bezeichnung: string
  /** Läufe mit identischer Konfiguration am selben Tag landen im selben Satz. */
  konfiguration: LaufKonfiguration
  /** Plan, wenn der Satz eine Serie mit festem Takt ist. */
  plan: SatzPlan | null
  erstelltAm: number
}

export type BahnStatus = 'bereit' | 'geplant' | 'laeuft' | 'beendet'
