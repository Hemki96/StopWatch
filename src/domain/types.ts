/**
 * Die Domänentypen, die gespeichert und zwischen Modulen geteilt werden.
 *
 * Diese Datei enthält nur Typen und die Liste der Schwimmarten, keine Logik.
 * Sie ist die gemeinsame Sprache von Domäne, Speicherung, Oberfläche und
 * Export; die Feldbedeutung folgt GLOSSARY.md und dem Datenmodell
 * (docs/entwicklung/datenmodell.md).
 *
 * Zwei Zeitbegriffe werden strikt getrennt: `startMs` und `splitMs` stammen aus
 * der monotonen Uhr (`performance.now()`) und gelten nur in der laufenden
 * Seitensitzung; `startWallMs`, `erfasstAt` und `erstelltAm` sind
 * `Date.now()`-Werte und überleben einen Reload. Optionale Felder sind so
 * gewählt, dass ältere Backups weiter laden.
 */

/**
 * Schwimmart einer Strecke. `lagen` steht für Medley, `beliebig` für eine
 * Übung ohne Vorgabe. Der Wert wird persistiert und ist deshalb stabil zu
 * halten; die Anzeige kommt aus `SCHWIMMARTEN`.
 */
export type Schwimmart =
  | 'freistil'
  | 'brust'
  | 'ruecken'
  | 'schmetterling'
  | 'lagen'
  | 'beliebig'

/**
 * Alle Schwimmarten mit deutschem Label in Anzeigereihenfolge. `wert` ist der
 * gespeicherte Wert, `label` die Beschriftung in Auswahl und Beschreibung.
 */
export const SCHWIMMARTEN: readonly { wert: Schwimmart; label: string }[] = [
  { wert: 'freistil', label: 'Freistil' },
  { wert: 'brust', label: 'Brust' },
  { wert: 'ruecken', label: 'Rücken' },
  { wert: 'schmetterling', label: 'Schmetterling' },
  { wert: 'lagen', label: 'Lagen' },
  { wert: 'beliebig', label: 'Beliebig' },
]

/**
 * Anzeige-Einheit eines Laufs.
 *
 * `m` ist die Voreinstellung; fehlt das Feld in älteren Daten, gilt Meter.
 * Gespeichert wird immer kanonisch in Metern — die Einheit steuert nur
 * Eingabe, Anzeige und die Trennung der Bestzeiten (ADR 0009).
 */
export type Einheit = 'm' | 'yd'

/**
 * Erlaubte Beckenlängen in Metern: 25 (Kurzbahn), 50 (Langbahn) und 22,86 m
 * für ein 25-Yard-Becken. Bestzeiten hängen an diesem Wert, deshalb ist er
 * bewusst nicht frei.
 */
export type Beckenlaenge = 25 | 50 | 22.86

/**
 * Die Konfiguration eines Laufs. `streckeM: null` bedeutet offene Strecke.
 *
 * `beckenlaengeM` und `streckeM` sind immer kanonisch in Metern gespeichert;
 * `einheit` ist nur die Anzeige- und Eingabeeinheit. Fehlt sie, gilt `m`
 * (ältere Daten und Backups bleiben unverändert lesbar).
 */
export interface LaufKonfiguration {
  /** Beckenlänge, in der gemessen wird (kanonisch in Metern). */
  beckenlaengeM: Beckenlaenge
  /** Zu schwimmende Distanz in Metern; ein Vielfaches der Beckenlänge. */
  streckeM: number | null
  /** Schwimmart für Bestzeiten und Beschreibung. */
  schwimmart: Schwimmart
  /** Anzeige-Einheit; fehlt = `m`. */
  einheit?: Einheit
  /**
   * Gewünschte Zahl der Zwischenzeiten. Fehlt der Wert oder ist er `null`,
   * ergibt er sich aus Strecke und Beckenlänge (letzte Länge = Ziel). `0`
   * bedeutet, dass schon der erste Anschlag das Ziel ist.
   */
  zwischenzeiten?: number | null
}

/**
 * Ein Anschlag an der Wand, kumuliert ab Start der Bahn gemessen.
 *
 * Anschläge sind nach `laengeNr` aufsteigend und in `splitMs` streng monoton;
 * höchstens der letzte trägt `istFinish`. Änderungen erzeugen neue Objekte,
 * damit der React-Zustand die Änderung erkennt.
 */
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

/**
 * Eine Bahn ist ein einzelner Timer innerhalb eines Laufs und gehört genau
 * einem Schwimmer (oder niemandem, `schwimmerId: null`).
 */
export interface Bahn {
  id: string
  /** Bahnnummer, 1-basiert und innerhalb ihrer Reihe eindeutig. */
  nummer: number
  /**
   * Startgruppe innerhalb des Laufs, 1-basiert. Alle Bahnen derselben Reihe
   * starten gemeinsam; die nächste Reihe versetzt um den Startversatz.
   * Ältere Datensätze ohne Feld gelten als Reihe 1.
   */
  reihe: number
  /** Schwimmer-ID oder `null`; ein unbekannter Verweis wird als „Ohne Namen“ angezeigt. */
  schwimmerId: string | null
  /** Monotone Startzeit der Bahn (`performance.now`), null solange nicht gestartet. */
  startMs: number | null
  anschlaege: Anschlag[]
}

/**
 * Eine Messung über eine oder mehrere Bahnen. Bei einer Serie ist ein Lauf eine
 * Wiederholung.
 */
export interface Lauf {
  id: string
  /** Zugehöriger `Satz` oder `null`, wenn der Lauf keinem Satz zugeordnet ist. */
  satzId: string | null
  konfiguration: LaufKonfiguration
  /** Wanduhr-Anker des Starts dieser Wiederholung (`Date.now`). */
  startWallMs: number | null
  /**
   * Fester Abstand zwischen den Starts zweier Reihen in ms. 0 = gemeinsamer
   * Start aller Reihen. Innerhalb einer Reihe starten alle Bahnen gemeinsam.
   */
  startversatzMs: number
  /** 1-basierte Wiederholung innerhalb einer geplanten Serie, sonst null. */
  wiederholung: number | null
  bahnen: Bahn[]
}

/**
 * Ein Schwimmer ist im MVP nur ein Name mit optionalem Jahrgang; es gibt keine
 * Stammdaten wie Verein oder Geschlecht. Die ID verbindet Bahnen, Aktive und
 * gemeldete Starts.
 */
export interface Schwimmer {
  id: string
  name: string
  /** Geburtsjahrgang oder `null`, wenn unbekannt. */
  jahrgang: number | null
  /** Freie Notiz, leer wenn nichts erfasst wurde. */
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
  /**
   * Abstand zwischen den Starts der Reihen innerhalb einer Wiederholung in ms.
   * Innerhalb einer Reihe starten alle Bahnen gemeinsam.
   */
  startversatzMs: number
}

/**
 * Ein Satz ist der Container für Läufe: entweder ein freier Trainingssatz
 * oder eine Serie (`plan` gesetzt).
 */
export interface Satz {
  id: string
  /** Trainingstag als ISO-Datum (YYYY-MM-DD). */
  datum: string
  /** Anzeigename, z. B. „100 m Freistil“ oder der Name einer Serie. */
  bezeichnung: string
  /**
   * Name des Trainingstags, z. B. „Kader A“. Er gilt für alle Sätze desselben
   * Datums und wird dort gepflegt; fehlt er, hat der Tag keinen Namen.
   */
  tagesbezeichnung?: string
  /** Läufe mit identischer Konfiguration am selben Tag landen im selben Satz. */
  konfiguration: LaufKonfiguration
  /** Plan, wenn der Satz eine Serie mit festem Takt ist. */
  plan: SatzPlan | null
  erstelltAm: number
}

/**
 * Ein vorbereiteter Satz innerhalb eines Trainings. Er beschreibt nur den Plan;
 * erst beim Start entstehen daraus ein `Satz` und seine `Lauf`-Wiederholungen.
 */
export interface TrainingsSatz {
  id: string
  /** Freie Bezeichnung, z. B. „Einschwimmen“. Leer = aus der Konfiguration. */
  bezeichnung: string
  konfiguration: LaufKonfiguration
  /** Geplante Wiederholungen. 1 = einzelner Lauf. */
  wiederholungen: number
  /** Zeit zwischen zwei Wiederholungen in Sekunden. */
  taktSek: number
  /**
   * Abstand zwischen den Starts der Reihen innerhalb einer Wiederholung in ms.
   * Innerhalb einer Reihe starten alle Bahnen gemeinsam.
   */
  startversatzMs: number
}

/**
 * Ein Training ist die Vorbereitung einer Einheit: feste Aktive je Bahn und
 * mehrere Sätze in fester Reihenfolge. Der Plan bleibt bearbeitbar, bis ein
 * Satz gestartet wurde; ab dann zählen die tatsächlich gemessenen Läufe.
 */
export interface Training {
  id: string
  /** Trainingstag als ISO-Datum (YYYY-MM-DD). */
  datum: string
  /** Freie Bezeichnung der Einheit, z. B. „Montagabend“; leer ist erlaubt. */
  bezeichnung: string
  /** Anzahl der Bahnen je Reihe für alle noch nicht gestarteten Sätze. */
  bahnen: number
  /** Anzahl der Reihen (Startgruppen) für alle noch nicht gestarteten Sätze. */
  reihen: number
  /**
   * Startet den nächsten noch offenen Satz automatisch, sobald der aktuelle
   * vollständig im Ziel ist. Fehlt das Feld (ältere Trainings), gilt `false`.
   */
  autostart?: boolean
  /**
   * Schwimmer je Bahn, Reihe für Reihe: erst alle Bahnen der Reihe 1, dann
   * Reihe 2. Die Länge ist `bahnen × reihen`; `null` heißt ohne Zuordnung.
   */
  aktive: (string | null)[]
  saetze: TrainingsSatz[]
  /** Zuordnung `TrainingsSatz.id` → `Satz.id` der bereits angelegten Läufe. */
  gestartet: Record<string, string>
  erstelltAm: number
}

/**
 * Zustand einer Bahn für die Anzeige. `bereit` = nicht gestartet, `geplant` =
 * Start liegt in der Zukunft (Startversatz), `laeuft` = gestartet und offen,
 * `beendet` = Finish erfasst.
 */
export type BahnStatus = 'bereit' | 'geplant' | 'laeuft' | 'beendet'
