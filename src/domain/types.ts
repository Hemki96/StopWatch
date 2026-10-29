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
 * gewählt, dass ältere Backups weiter laden (fehlendes `modus` gilt als
 * Training).
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
 * Erlaubte Beckenlängen in Metern: 25 (Kurzbahn) und 50 (Langbahn).
 * Bestzeiten hängen an diesem Wert, deshalb ist er bewusst nicht frei.
 */
export type Beckenlaenge = 25 | 50

/**
 * Ein Lauf ist entweder Training (Anschläge pro Länge) oder Wettkampf (ein
 * Tap pro Bahn ist das Ziel). Der Modus entscheidet über die Bedienung, nicht
 * über die Datenhaltung: Beide bestehen aus Bahnen mit Anschlägen. Fehlt das
 * Feld in älteren Datensätzen, gilt `training`.
 */
export type LaufModus = 'training' | 'wettkampf'

/** Die Konfiguration eines Laufs. `streckeM: null` bedeutet offene Strecke. */
export interface LaufKonfiguration {
  /** Beckenlänge, in der gemessen wird. */
  beckenlaengeM: Beckenlaenge
  /** Zu schwimmende Distanz in Metern; ein Vielfaches der Beckenlänge. */
  streckeM: number | null
  /** Schwimmart für Bestzeiten und Beschreibung. */
  schwimmart: Schwimmart
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
  /** Bahnnummer, 1-basiert und innerhalb eines Laufs eindeutig. */
  nummer: number
  /** Schwimmer-ID oder `null`; ein unbekannter Verweis wird als „Ohne Namen“ angezeigt. */
  schwimmerId: string | null
  /** Monotone Startzeit der Bahn (`performance.now`), null solange nicht gestartet. */
  startMs: number | null
  anschlaege: Anschlag[]
}

/**
 * Eine Messung über eine oder mehrere Bahnen. Im Wettkampf ist ein Lauf ein
 * Heat; bei einer Serie eine Wiederholung.
 */
export interface Lauf {
  id: string
  /** Zugehöriger `Satz` oder `null`, wenn der Lauf keinem Satz zugeordnet ist. */
  satzId: string | null
  konfiguration: LaufKonfiguration
  /** Wanduhr-Anker des Starts dieser Wiederholung (`Date.now`). */
  startWallMs: number | null
  /** Fester Abstand zwischen den Starts der Bahnen in ms. 0 = gemeinsamer Start. */
  startversatzMs: number
  /** 1-basierte Wiederholung innerhalb einer geplanten Serie, sonst null. */
  wiederholung: number | null
  /** Training oder Wettkampf. Ältere Datensätze ohne Feld gelten als Training. */
  modus?: LaufModus
  bahnen: Bahn[]
}

/**
 * Ein Wettkampftag. Disziplinen und Läufe hängen über den Satz daran; der
 * Wettkampf ist damit nur der Rahmen um mehrere Sätze.
 */
export interface Wettkampf {
  id: string
  /** Anzeigename des Wettkampfs, z. B. „Herbstpokal“. */
  name: string
  /** Wettkampftag als ISO-Datum (YYYY-MM-DD). */
  datum: string
  beckenlaengeM: Beckenlaenge
  /** Erstellungszeitpunkt als Wanduhr (`Date.now`), für Sortierung und Backup. */
  erstelltAm: number
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
  /** Abstand zwischen den Starts der Bahnen innerhalb einer Wiederholung in ms. */
  startversatzMs: number
}

/**
 * Ein Satz ist der Container für Läufe: entweder ein freier Trainingssatz,
 * eine Serie (`plan` gesetzt) oder eine Wettkampfdisziplin (`wettkampfId`
 * gesetzt). Die drei Fälle schließen sich in der Praxis aus; die Domain prüft
 * das nicht hart, die Erzeuger halten es ein.
 */
export interface Satz {
  id: string
  /** Trainingstag als ISO-Datum (YYYY-MM-DD). */
  datum: string
  /** Anzeigename, z. B. „100 m Freistil“ oder der Name einer Serie. */
  bezeichnung: string
  /** Läufe mit identischer Konfiguration am selben Tag landen im selben Satz. */
  konfiguration: LaufKonfiguration
  /** Plan, wenn der Satz eine Serie mit festem Takt ist. */
  plan: SatzPlan | null
  /** Gesetzt, wenn der Satz eine Disziplin eines Wettkampfs ist. */
  wettkampfId?: string | null
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
  /** Abstand zwischen den Starts der Bahnen innerhalb einer Wiederholung in ms. */
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
  /** Anzahl der Bahnen für alle noch nicht gestarteten Sätze. */
  bahnen: number
  /** Schwimmer je Bahn; `null` heißt ohne Zuordnung. */
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
