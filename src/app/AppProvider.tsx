/**
 * Zentraler Zustand der App und einzige Schreibstelle zum lokalen Speicher.
 *
 * Verantwortlichkeiten:
 * - Bestand aus IndexedDB laden (beim Start und nach einer Tab-Übergabe).
 * - Einstellungen, Schwimmer, Sätze, Läufe, Trainings und Wettkämpfe halten
 *   sowie die Liste der aktiven Läufe und den sichtbaren Lauf.
 * - Alle Aktionen ausführen: Sie rechnen über den reinen Zeitkern in `domain/`
 *   und schreiben das Ergebnis sofort weg.
 * - Mit anderen Tabs über `TabKoordinator` abstimmen. Nur der aktive Tab
 *   schreibt; alle anderen sind lesend.
 *
 * Invarianten:
 * - Jede persistierte Gruppe existiert doppelt: als React-State fürs Rendern
 *   und als Ref für Aktionen, die zwischen zwei Renders laufen. Beide werden
 *   nur gemeinsam über die `set...Safe`-Funktionen geändert.
 * - `Lauf`-Datensätze sind die einzige Quelle für Zeiten. Sätze, Trainings und
 *   Wettkämpfe sind Rahmen; Serienrunden und Fortschritt werden daraus
 *   abgeleitet, nicht zusätzlich gespeichert.
 * - Jede Aktion ist No-Op, solange dieser Tab nicht die Messung hält
 *   (`istAktiv`). Das verhindert doppelte Schreibvorgänge aus zwei Tabs.
 * - Geschrieben wird unmittelbar nach jeder Änderung, nicht gebündelt: Ein
 *   Tab-Wechsel oder Absturz darf höchstens den letzten Tap kosten.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  type Beckenlaenge,
  type Lauf,
  type LaufKonfiguration,
  type Satz,
  type Schwimmer,
  type Schwimmart,
  type Training,
  type Wettkampf,
  type WettkampfStatus,
  type Einheit,
} from '../domain/types'
import { einheitVon } from '../domain/einheit'
import {
  bahnReihe,
  createLauf,
  finishLane,
  hasStarted,
  isComplete,
  isFinished,
  istVielfacheDerBeckenlaenge,
  korrigiereAnschlag as korrigiereAnschlagImLauf,
  planeLauf,
  rebaseLauf,
  setzeWettkampfStatus as setzeWettkampfStatusImLauf,
  setzeZielzeit,
  startAll,
  tapLane,
  undoLane,
  setSchwimmer as setSchwimmerOnLane,
  updateStrecke,
  validateKonfiguration,
} from '../domain/lauf'
import {
  createWettkampf,
  createWettkampfLauf,
  createWettkampfSatz,
  disziplinBezeichnung,
  type WettkampfDisziplinPlan,
  type WettkampfPlan,
} from '../domain/wettkampf'
import {
  istSerie,
  letzterAnschlag,
  runden as rundenVon,
} from '../domain/serie'
import {
  MAX_BAHNEN,
  bahnenGesamt,
  beschreibeTrainingsSatz,
  neuerTrainingsSatz,
  neuesTraining,
  pruefeTraining,
  pruefeTrainingsSatz,
} from '../domain/training'
import { newId } from '../domain/id'
import { TabKoordinator, type TabRolle } from './tabKoordinator'
import {
  clearAll,
  deleteLauf,
  deleteSatzUndLaeufe,
  deleteSchwimmer,
  deleteTraining,
  deleteWettkampfUndDaten,
  importBackup,
  loadAll,
  saveLauf,
  saveMehrere,
  saveSatz,
  saveSchwimmer,
  saveTraining,
  saveWettkampf,
} from '../storage/repository'
import type { Backup } from '../storage/backup'
import {
  STANDARD_EINSTELLUNGEN,
  begrenzeEinstellungen,
  begrenzeReihen,
  begrenzeTakt,
  begrenzeVersatz,
  begrenzeWiederholungen,
  leseEinstellungen,
  leseThemeEinstellung,
  schreibeEinstellungen,
  schreibeThemeEinstellung,
  type Einstellungen,
  type Theme,
  type ThemeEinstellung,
} from './einstellungen'
import {
  berechneAktiveEintraege,
  berechneBrauchtTakt,
  bereinigeAktiveIds,
  leseAktiveIds,
  leseAktivenLaufId,
  speichereAktiveIds,
  speichereAktivenLaufId,
  waehleOffenenLauf,
  type AktiverEintrag,
} from './aktiveLaeufe'
import { useSchreibpfad } from './schreibpfad'

export { leseEinstellungen } from './einstellungen'
export type { Einstellungen, Theme, ThemeEinstellung } from './einstellungen'

export type { AktiverEintrag } from './aktiveLaeufe'

/**
 * Öffentliche Schnittstelle des Providers. Screens greifen ausschließlich
 * hierüber auf Daten und Aktionen zu.
 *
 * Die Felder zerfallen in vier Gruppen:
 * - Bestand (lesend): `schwimmer`, `satze`, `laeufe`, `wettkampfe`, `trainings`.
 * - Auswahl und Anzeige: `aktiverLauf`, `aktiverSatz`, `aktiveRunden`,
 *   `aktiveEintraege`, `brauchtTakt`, `theme`, `toast`.
 * - Tab-Rolle: `tabAktiv`, `tabGesperrt`, `uebernehmen`.
 * - Aktionen. Sie geben entweder nichts zurück oder eine neue ID; `null`
 *   bedeutet „abgelehnt“ (ungültige Eingabe, falsche Tab-Rolle oder fehlende
 *   Daten). Aktionen, die Zeiten verändern, erwarten `now` (monoton, aus
 *   `performance.now()`) und `wallNow` (Wanduhr) vom Aufrufer, damit der
 *   Zeitkern frei von Seiteneffekten bleibt.
 */
export interface AppContextValue {
  einstellungen: Einstellungen
  setzeEinstellungen: (einstellungen: Einstellungen) => void
  neuLaden: () => Promise<void>
  /**
   * Schreibt ein geprüftes Backup und lädt den Bestand neu. Nur der aktive Tab
   * darf das; der Schreibvorgang läuft über dieselbe Warteschlange wie die
   * Messungen, damit eine Tab-Übergabe ihn abwartet.
   */
  importiereBackup: (backup: Backup) => Promise<void>
  /** Leert alle fünf Bestände und lädt neu; ebenfalls nur im aktiven Tab. */
  loescheAlles: () => Promise<void>
  geladen: boolean
  schwimmer: Schwimmer[]
  satze: Satz[]
  laeufe: Lauf[]
  wettkampfe: Wettkampf[]
  trainings: Training[]
  aktiverLauf: Lauf | null
  aktiverSatz: Satz | null
  /** Die Wiederholungen der ausgewählten Serie; leer bei einem einzelnen Lauf. */
  aktiveRunden: Lauf[]
  /** Ein Eintrag pro Lauf oder Serie in der Leiste. */
  aktiveEintraege: AktiverEintrag[]
  /** Wahr, solange irgendein aktiver Lauf plant oder läuft. */
  brauchtTakt: boolean
  /** Das tatsächlich aktive Design, nach Auflösung von `themeEinstellung`. */
  theme: Theme
  themeEinstellung: ThemeEinstellung
  toast: string | null
  /** Wahr, sobald Laden oder Schreiben im lokalen Speicher gescheitert ist. */
  speicherFehler: boolean
  /** Wahr, wenn ein anderer Tab die Messung hält. */
  tabGesperrt: boolean
  /** Wahr, sobald dieser Tab die Messung hält. */
  tabAktiv: boolean
  /** Übernimmt die Messung aus dem anderen Tab. */
  uebernehmen: () => void
  setzeTheme: (einstellung: ThemeEinstellung) => void
  zeigeToast: (nachricht: string) => void
  neuerLauf: (
    konfiguration: LaufKonfiguration,
    bahnen: number,
    schwimmerProBahn?: (string | null)[],
    optionen?: { startversatzMs?: number; wiederholungen?: number; taktSek?: number; reihen?: number },
  ) => string | null
  anlegenLauf: () => void
  waehleLauf: (id: string) => void
  schliesseAktivenLauf: () => void
  startAlle: (now: number, wallNow: number) => void
  tippe: (bahnId: string, now: number, wallNow: number) => void
  tippeSerie: (bahnIndex: number, now: number, wallNow: number) => void
  beende: (bahnId: string, now: number, wallNow: number) => void
  beendeSerie: (bahnIndex: number, now: number, wallNow: number) => void
  rueckgaengig: (bahnId: string) => void
  rueckgaengigSerie: (bahnIndex: number) => void
  setzeSchwimmer: (bahnId: string, schwimmerId: string | null) => void
  setzeSchwimmerSerie: (bahnIndex: number, schwimmerId: string | null) => void
  setzeSchwimmerImLauf: (laufId: string, bahnId: string, schwimmerId: string | null) => void
  korrigiereAnschlag: (
    laufId: string,
    bahnId: string,
    laengeNr: number,
    splitMs: number,
  ) => void
  setzeKonfiguration: (konfiguration: LaufKonfiguration) => void
  verwerfeAktivenLauf: () => void
  loescheLauf: (id: string) => void
  loescheSatz: (id: string) => void
  speichereSchwimmer: (daten: {
    id?: string
    name: string
    jahrgang: number | null
    notiz: string
  }) => Schwimmer | null
  loescheSchwimmer: (id: string) => void
  benenneSatz: (id: string, bezeichnung: string) => void
  erstelleWettkampf: (daten: {
    name: string
    datum: string
    beckenlaengeM: Beckenlaenge
  }) => string | null
  benenneWettkampf: (id: string, name: string) => void
  importiereWettkampf: (plan: WettkampfPlan, wettkampfId?: string | null) => string | null
  erstelleWettkampfDisziplin: (
    wettkampfId: string,
    disziplin: {
      bezeichnung: string
      streckeM: number
      schwimmart: Schwimmart
      laeufe: number
      bahnen: number
    },
  ) => string | null
  loescheWettkampf: (id: string) => void
  starteWettkampfLauf: (laufId: string, now: number, wallNow: number) => void
  tippeWettkampf: (laufId: string, bahnId: string, now: number, wallNow: number) => void
  rueckgaengigWettkampf: (laufId: string, bahnId: string) => void
  setzeWettkampfZeit: (laufId: string, bahnId: string, splitMs: number) => void
  /** Markiert eine offene Bahn als DNS/DNF oder hebt die Markierung auf. */
  setzeWettkampfStatus: (
    laufId: string,
    bahnId: string,
    status: WettkampfStatus | null,
  ) => void
  setzeWettkampfNamen: (laufId: string, namen: string[]) => void
  /** Legt ein Training aus den aktuellen Einstellungen an und liefert seine ID. */
  anlegeTraining: () => string | null
  speichereTraining: (training: Training) => void
  /** Löscht nur den Plan; gemessene Sätze und Läufe bleiben im Verlauf. */
  loescheTraining: (id: string) => void
  /**
   * Startet einen vorbereiteten Satz: beim ersten Mal entstehen Satz und Läufe,
   * danach wird der bestehende Lauf nur ausgewählt. Liefert die Anker-Lauf-ID.
   */
  starteTrainingsSatz: (
    trainingId: string,
    trainingsSatzId: string,
    now: number,
    wallNow: number,
  ) => string | null
}

// `null` als Startwert ist Absicht: `useApp` erkennt daran einen fehlenden
// Provider und kann eine klare Meldung werfen, statt `undefined` zu liefern.
const AppContext = createContext<AppContextValue | null>(null)

/**
 * Heutiges Datum als `YYYY-MM-DD` in lokaler Zeit.
 *
 * Bewusst nicht `toISOString()`: Das liefert UTC und würde am Abend bereits den
 * Folgetag erzeugen. Sätze werden über dieses Datum gruppiert.
 */
function heute(): string {
  const d = new Date()
  const monat = `${d.getMonth() + 1}`.padStart(2, '0')
  const tag = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${monat}-${tag}`
}

/**
 * Vergleicht nur die fachlich relevanten Felder einer Lauf-Konfiguration.
 * Wird beim Anlegen eines einzelnen Laufs genutzt, um einen passenden Satz des
 * Tages wiederzuverwenden, statt für jeden Lauf einen neuen Satz anzulegen.
 */
function gleicheKonfiguration(a: LaufKonfiguration, b: LaufKonfiguration): boolean {
  return (
    a.beckenlaengeM === b.beckenlaengeM &&
    a.streckeM === b.streckeM &&
    a.schwimmart === b.schwimmart &&
    einheitVon(a) === einheitVon(b)
  )
}

/**
 * Löst einen Namen aus einer Meldeliste auf. Vorhandene Schwimmer werden
 * wiederverwendet, neue nur einmal pro Import angelegt. Leere Namen bleiben
 * ohne Zuordnung — so entstehen manuell angelegte, noch namenlose Bahnen.
 *
 * Verglichen wird ohne Rücksicht auf Groß-/Kleinschreibung und umgebende
 * Leerzeichen (deutsche Locale), damit derselbe Mensch nicht als zweiter
 * Datensatz mit eigener Bestzeit erscheint. `neue` ist der Puffer des laufenden
 * Imports: Er verhindert Dubletten innerhalb eines Aufrufs, bevor der State
 * aktualisiert ist, und wird vom Aufrufer gespeichert.
 */
function schwimmerIdFuer(
  name: string,
  jahrgang: number | null,
  vorhandene: Schwimmer[],
  neue: Schwimmer[],
): string | null {
  const bereinigt = name.trim()
  if (!bereinigt) return null
  const normal = bereinigt.toLocaleLowerCase('de')
  const treffer = [...vorhandene, ...neue].find(
    (eintrag) => eintrag.name.toLocaleLowerCase('de') === normal,
  )
  if (treffer) return treffer.id
  const eintrag: Schwimmer = {
    id: newId(),
    name: bereinigt,
    jahrgang,
    notiz: '',
    erstelltAm: Date.now(),
  }
  neue.push(eintrag)
  return eintrag.id
}

/**
 * Fragt die Systemeinstellung ab. Gefragt wird nach „hell“, nicht nach „dunkel“:
 * Ohne `matchMedia` (ältere oder eingebettete Browser) ist `matches` dann false
 * und die App startet dunkel, also im gestalterischen Standard.
 */
function systemIstDunkel(): boolean {
  return !window.matchMedia?.('(prefers-color-scheme: light)').matches
}

/**
 * Die Statusleiste des installierten iOS-Starts wird über dieses Meta gesteuert.
 * `black-translucent` schiebt den Inhalt unter die Uhr und erzwingt weiße Schrift —
 * im hellen Design unlesbar. Deshalb pro Design eine deckende Variante.
 */
function setzeStatusleistenStil(theme: Theme): void {
  const meta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
  meta?.setAttribute('content', theme === 'dark' ? 'black' : 'default')
}

/**
 * Stellt den App-Zustand allen Screens bereit.
 *
 * Lebenszyklus:
 * 1. Beim ersten Rendern werden Einstellungen, Design und aktive IDs synchron
 *    aus `localStorage` gelesen (klein und sofort verfügbar).
 * 2. Der Koordinator startet die Tab-Abstimmung, ein zweiter Effekt lädt den
 *    Bestand aus IndexedDB. Erst danach wird `geladen` wahr — auch im
 *    Fehlerfall, damit die Oberfläche nicht dauerhaft im Ladezustand hängt.
 * 3. Aktionen ändern State und Ref gemeinsam und stoßen das Schreiben an.
 *
 * Fehlerbehandlung: Ein Lesefehler beim Start ergibt eine leere, aber
 * bedienbare App mit Banner; Schreibfehler setzen dasselbe Banner, werden aber
 * gesammelt gemeldet (siehe `useSchreibpfad`).
 */
export function AppProvider({ children }: { children: ReactNode }) {
  // ---- Zustandsgruppen -----------------------------------------------------
  // geladen: Abschluss des ersten Ladevorgangs, unabhängig von dessen Ausgang.
  // Bestand (IndexedDB), in dieser Reihenfolge deklariert:
  //   schwimmer  Stammdaten der Personen, namenssortiert gehalten.
  //   satze      Rahmen/Gruppen; ein Satz mit `plan` ist eine Serie, ein Satz mit
  //              `wettkampfId` eine Disziplin. Trägt keine Zeiten.
  //   laeufe     die Messungen: Bahnen mit Startzeit und Anschlägen. Einzige
  //              Quelle für Zeiten, Splits, Ziel und Bestzeiten.
  //   wettkampfe Wettkampf-Rahmen (Name, Datum, Beckenlänge).
  //   trainings  Vorbereitung: Aktive und noch nicht gestartete Sätze.
  // Auswahl (localStorage): aktiverLaufId (sichtbarer Lauf) und aktiveIds
  //   (Leiste oben, ein Eintrag pro Lauf oder Serie).
  // Design: themeEinstellung ist die Wahl, systemDunkel die Live-Systemabfrage.
  // Einstellungen: Vorbelegung des nächsten Laufs.
  // Flüchtig: toast, speicherFehler, tabRolle.
  const [geladen, setGeladen] = useState(false)
  const [schwimmer, setSchwimmer] = useState<Schwimmer[]>([])
  const [satze, setSatze] = useState<Satz[]>([])
  const [laeufe, setLaeufe] = useState<Lauf[]>([])
  const [wettkampfe, setWettkampfe] = useState<Wettkampf[]>([])
  const [trainings, setTrainings] = useState<Training[]>([])
  const [aktiverLaufId, setAktiverLaufId] = useState<string | null>(null)
  const [aktiveIds, setAktiveIdsState] = useState<string[]>(() => leseAktiveIds())
  const [themeEinstellung, setThemeEinstellung] = useState<ThemeEinstellung>(() =>
    leseThemeEinstellung(),
  )
  const [systemDunkel, setSystemDunkel] = useState(systemIstDunkel)
  const theme: Theme =
    themeEinstellung === 'system' ? (systemDunkel ? 'dark' : 'light') : themeEinstellung
  const [einstellungen, setEinstellungenState] = useState<Einstellungen>(() => leseEinstellungen())
  const [toast, setToast] = useState<string | null>(null)
  const [tabRolle, setTabRolle] = useState<TabRolle>('startet')
  const schreibpfad = useSchreibpfad()
  const { istAktiv, setzeAktiv, verfolge, warteAufOffene, speicherFehler, meldeFehler } =
    schreibpfad

  // Ref-Spiegel des States. Aktionen laufen in `useCallback`s und sähen sonst
  // den Stand des letzten Renders; mehrere Taps im selben Frame würden sich
  // gegenseitig überschreiben. Gelesen wird immer aus den Refs, geschrieben
  // über die `set...Safe`-Funktionen.
  const schwimmerRef = useRef<Schwimmer[]>([])
  const laeufeRef = useRef<Lauf[]>([])
  const satzeRef = useRef<Satz[]>([])
  const wettkampfeRef = useRef<Wettkampf[]>([])
  const trainingsRef = useRef<Training[]>([])
  const aktiverLaufIdRef = useRef<string | null>(null)
  const aktiveIdsRef = useRef<string[]>([])
  const koordinatorRef = useRef<TabKoordinator | null>(null)
  // Immer die aktuelle Lade-Funktion. Der Koordinator wird vor dem Lade-Effekt
  // erzeugt; über diese Ref kann er trotzdem nachladen, wenn er die Rolle
  // „aktiv“ erhält, ohne dass der Effekt neu laufen muss.
  const ladeDatenRef = useRef<((uebernahme?: boolean) => Promise<void>) | null>(null)
  // Ob dieser Tab bereits aktiv war bzw. lesend auf die Übergabe gewartet hat.
  // Nur dann ist eine erneute Aktivierung eine Übergabe und der laufende Start
  // muss auf die monotone Uhr dieses Dokuments umgerechnet werden. Ein frisch
  // geladener Tab, der zum ersten Mal aktiv wird, ist dagegen ein Reload und
  // normalisiert wie bisher.
  const warAktivRef = useRef(false)
  const warGesperrtRef = useRef(false)

  // Ref und State werden ausschließlich zusammen gesetzt: Aktionen lesen die
  // Ref, das Rendern den State. Ein Auseinanderlaufen würde Taps verlieren.
  const setSchwimmerSafe = useCallback((next: Schwimmer[]) => {
    schwimmerRef.current = next
    setSchwimmer(next)
  }, [])

  const setLaeufeSafe = useCallback((next: Lauf[]) => {
    laeufeRef.current = next
    setLaeufe(next)
  }, [])

  const setSatzeSafe = useCallback((next: Satz[]) => {
    satzeRef.current = next
    setSatze(next)
  }, [])

  const setWettkampfeSafe = useCallback((next: Wettkampf[]) => {
    wettkampfeRef.current = next
    setWettkampfe(next)
  }, [])

  const setTrainingsSafe = useCallback((next: Training[]) => {
    trainingsRef.current = next
    setTrainings(next)
  }, [])

  /**
   * Setzt die aktiven IDs und spiegelt sie nach `localStorage`.
   *
   * Die Liste ist reine Oberflächenauswahl, keine Messdaten; sie darf deshalb
   * verloren gehen, ohne dass Zeiten fehlen. Beim nächsten Start wird sie über
   * `bereinigeAktiveIds` wieder auf existierende, offene Läufe reduziert.
   */
  const setAktiveIds = useCallback((ids: string[]) => {
    aktiveIdsRef.current = ids
    setAktiveIdsState(ids)
    speichereAktiveIds(ids)
  }, [])

  /**
   * Wechselt den sichtbaren Lauf. Maßgeblich ist `aktiveIds`; der Einzelwert
   * unter `ACTIVE_KEY` bleibt als Migrationspfad erhalten, damit ältere Stände
   * weiterhin gelesen werden können (`leseAktiveIds`).
   */
  const setAktivenLaufId = useCallback((id: string | null) => {
    aktiverLaufIdRef.current = id
    setAktiverLaufId(id)
    speichereAktivenLaufId(id)
  }, [])

  /**
   * Zeigt eine kurze Rückmeldung für etwa 3,2 s.
   *
   * Der Timeout löscht nur, wenn inzwischen keine andere Meldung kam; bei
   * identischem Text gewinnt der frühere Timer. So überschreibt eine neue
   * Aktion die alte Meldung, statt von ihr gelöscht zu werden.
   */
  const zeigeToast = useCallback((nachricht: string) => {
    setToast(nachricht)
    window.setTimeout(() => setToast((aktuell) => (aktuell === nachricht ? null : aktuell)), 3200)
  }, [])

  /**
   * Lädt den kompletten Bestand und gleicht die Auswahl damit ab.
   *
   * Reihenfolge ist wichtig: Erst kommen die Daten in State und Refs, dann wird
   * die gespeicherte Leiste bereinigt — dafür werden die geladenen Läufe und
   * Sätze gebraucht. Ist danach nichts mehr aktiv, wird der zuletzt gestartete
   * offene Lauf als Kandidat angenommen, damit die Leiste nach einem Neustart
   * nicht leer wirkt.
   *
   * Wird auch bei jeder Tab-Übergabe aufgerufen. Alle Schritte lesen nur und
   * sind deshalb wiederholbar.
   *
   * `uebernahme` unterscheidet die Tab-Übergabe vom Neuladen nach einem
   * Reload oder Backup-Import: Bei einer Übergabe lebt die Messung weiter und
   * die Startzeitpunkte werden über `rebaseLauf` auf die monotone Uhr dieses
   * Dokuments verschoben. Ohne diese Umrechnung wäre `performance.now()` aus
   * dem anderen Tab wertlos und die Bahnen würden fälschlich als „bereit“
   * erscheinen.
   */
  const ladeDaten = useCallback(async (uebernahme = false) => {
    const daten = await loadAll({ behalteLaufende: uebernahme })
    const jetzt = uebernahme ? performance.now() : 0
    const wandJetzt = uebernahme ? Date.now() : 0
    const laeufe = uebernahme
      ? daten.laeufe.map((lauf) => rebaseLauf(lauf, jetzt, wandJetzt))
      : daten.laeufe
    setSchwimmerSafe(daten.schwimmer)
    setSatzeSafe(daten.satze)
    setLaeufeSafe(laeufe)
    setWettkampfeSafe(daten.wettkampfe)
    setTrainingsSafe(daten.trainings)

    // Verwaiste und vollständig beendete Einträge fallen weg. Bleibt nichts
    // übrig, wird der zuletzt gestartete offene Lauf angeboten; bei einer Serie
    // ist das ihr Anker, nicht die zuletzt gestartete Wiederholung.
    let aktive = bereinigeAktiveIds(leseAktiveIds(), laeufe, daten.satze)
    if (aktive.length === 0) {
      const offen = waehleOffenenLauf(laeufe, daten.satze)
      if (offen) aktive = [offen]
    }
    setAktiveIds(aktive)

    // Sichtbaren Lauf nur übernehmen, wenn er noch in der Leiste steht. Sonst
    // beginnt die App mit dem ersten verfügbaren Eintrag oder ohne Auswahl.
    const gemerkt = leseAktivenLaufId()
    const auswahl = gemerkt && aktive.includes(gemerkt) ? gemerkt : (aktive[0] ?? null)
    setAktivenLaufId(auswahl)

    // Ein noch offener Lauf mit erfasstem Anschlag ist der unterbrochene Lauf:
    // `performance.now()` ist nach einem Reload wertlos, die Zeiten bleiben aber
    // im Verlauf. Bei einer Tab-Übergabe läuft die Messung dagegen weiter —
    // dort wäre der Hinweis falsch.
    if (!uebernahme) {
      const kandidat = auswahl ? laeufe.find((lauf) => lauf.id === auswahl) : null
      if (kandidat?.bahnen.some((bahn) => bahn.anschlaege.length > 0)) {
        zeigeToast('Der letzte Lauf wurde unterbrochen. Erfasste Zeiten bleiben erhalten.')
      }
    }
  }, [
    setAktiveIds,
    setAktivenLaufId,
    setSchwimmerSafe,
    setLaeufeSafe,
    setSatzeSafe,
    setWettkampfeSafe,
    setTrainingsSafe,
    zeigeToast,
  ])

  // Die Ref zeigt immer auf die jüngste Fassung. Der Koordinator greift darauf
  // zu, statt `ladeDaten` als Abhängigkeit zu binden — sonst würde jede neue
  // Funktionsidentität den Koordinator neu starten und die Tab-Rolle verlieren.
  ladeDatenRef.current = ladeDaten

  /**
   * Schreibt ein geprüftes Backup und lädt den Bestand neu.
   *
   * Bewusst im Provider und nicht im Einstellungs-Screen: Nur hier ist die
   * Tab-Rolle bekannt, und nur hier landet der Vorgang in der Warteschlange,
   * auf die eine Tab-Übergabe wartet. Die Prüfung läuft in `importBackup`
   * erneut, damit kein Aufrufer sie überspringen kann.
   */
  const importiereBackup = useCallback(
    async (backup: Backup) => {
      if (!istAktiv()) {
        throw new Error('Nur der aktive Tab darf ein Backup importieren.')
      }
      const vorgang = importBackup(backup).then(() => ladeDaten())
      verfolge(vorgang)
      await vorgang
    },
    [ladeDaten, verfolge],
  )

  /** Leert alle Bestände und lädt neu; nur der aktive Tab darf das. */
  const loescheAlles = useCallback(async () => {
    if (!istAktiv()) {
      throw new Error('Nur der aktive Tab darf alle Daten löschen.')
    }
    const vorgang = clearAll().then(() => ladeDaten())
    verfolge(vorgang)
    await vorgang
  }, [ladeDaten, verfolge])

  /**
   * Startet die Tab-Abstimmung.
   *
   * Der Effekt läuft bewusst vor dem Lade-Effekt: Der Koordinator meldet sofort
   * eine Rolle (ohne `BroadcastChannel` direkt `aktiv`, sonst nach dem Claim).
   * Wird dieser Tab aktiv, lädt er den Stand neu — das kann parallel zum
   * ohnehin laufenden ersten Ladevorgang passieren, beide lesen nur.
   *
   * `vorUebergabe` wartet auf offene Schreibvorgänge, damit der nächste Tab
   * keinen älteren Stand sieht. Beim Verlassen der Seite wird freigegeben,
   * damit ein anderer Tab nicht auf den Ausfall-Wächter warten muss.
   */
  useEffect(() => {
    const koordinator = new TabKoordinator({
      onRolle: (rolle) => {
        // Nur ein Tab, der schon einmal aktiv war oder lesend auf die Übergabe
        // gewartet hat, übernimmt eine laufende Messung. Der erste Aktivwerden
        // nach einem Seitenaufruf ist ein Reload und normalisiert.
        const uebernahme = rolle === 'aktiv' && (warAktivRef.current || warGesperrtRef.current)
        if (rolle === 'aktiv') warAktivRef.current = true
        if (rolle === 'gesperrt') warGesperrtRef.current = true
        setzeAktiv(rolle === 'aktiv')
        setTabRolle(rolle)
        if (rolle === 'aktiv') {
          // Nach einer Übergabe den Stand des vorherigen Tabs übernehmen.
          // Schlägt das Lesen fehl, bleibt der aktuelle Stand bedienbar.
          void ladeDatenRef.current?.(uebernahme).catch(() => meldeFehler())
        }
      },
      vorUebergabe: warteAufOffene,
    })
    koordinatorRef.current = koordinator
    koordinator.start()

    const beiSeitenende = () => koordinator.stop()
    // Ein aus dem bfcache wiederhergestellter Tab hat `pagehide` gesehen und
    // wäre sonst dauerhaft gestoppt: Er würde weiter Taps annehmen, ohne noch
    // am BroadcastChannel teilzunehmen. Beim Zurückkehren deshalb neu werben
    // und den Bestand des anderen Tabs übernehmen.
    const beiSeitenAnzeige = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      koordinator.start()
      void ladeDatenRef
        .current?.(warAktivRef.current || warGesperrtRef.current)
        .catch(() => meldeFehler())
    }
    window.addEventListener('pagehide', beiSeitenende)
    window.addEventListener('pageshow', beiSeitenAnzeige)
    return () => {
      window.removeEventListener('pagehide', beiSeitenende)
      window.removeEventListener('pageshow', beiSeitenAnzeige)
      koordinator.stop()
      koordinatorRef.current = null
    }
  }, [meldeFehler, setzeAktiv, warteAufOffene])

  /**
   * Erstladung des Bestands. `geladen` wird in jedem Fall wahr — auch wenn
   * IndexedDB nicht lesbar ist —, sonst bliebe die App im Ladezustand stehen.
   * `abgebrochen` verhindert ein Setzen nach dem Unmount (StrictMode führt den
   * Effekt in der Entwicklung doppelt aus).
   */
  useEffect(() => {
    let abgebrochen = false
    ladeDaten()
      .then(() => {
        if (!abgebrochen) setGeladen(true)
      })
      .catch(() => {
        if (abgebrochen) return
        setGeladen(true)
        meldeFehler()
      })
    return () => {
      abgebrochen = true
    }
  }, [ladeDaten, meldeFehler])

  // Systemdesign live verfolgen. Der Listener hängt auch dann, wenn fest
  // gewählt wurde — das ist billiger als ihn ab- und anzuhängen, und `theme`
  // ignoriert `systemDunkel` in diesem Fall ohnehin.
  useEffect(() => {
    const abfrage = window.matchMedia?.('(prefers-color-scheme: light)')
    if (!abfrage) return
    const reagiere = () => setSystemDunkel(!abfrage.matches)
    abfrage.addEventListener('change', reagiere)
    return () => abfrage.removeEventListener('change', reagiere)
  }, [])

  // Design in DOM und Browser-Chrome spiegeln. Die Farbwerte müssen zu den
  // Meta-Angaben in `index.html` passen, sonst blinkt der Startbildschirm in
  // der falschen Farbe. Der Effekt läuft nur bei echter Änderung von `theme`.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#070c15' : '#eef2f7')
    setzeStatusleistenStil(theme)
  }, [theme])

  /**
   * Speichert die Designwahl. `system` wird als solches gemerkt, nicht als
   * aufgelöstes Design — so folgt die App später einer Änderung des Systems.
   */
  const setzeTheme = useCallback((einstellung: ThemeEinstellung) => {
    setThemeEinstellung(einstellung)
    schreibeThemeEinstellung(einstellung)
  }, [])

  /**
   * Übernimmt und bereinigt neue Einstellungen und speichert sie sofort.
   *
   * Alle Grenzen werden hier erneut angewendet, obwohl die Oberfläche sie schon
   * begrenzt: Der Provider ist die einzige Schreibstelle und darf sich nicht
   * darauf verlassen, dass jeder Aufrufer brav validiert.
   */
  const setzeEinstellungen = useCallback((naechste: Einstellungen) => {
    const bereinigt = begrenzeEinstellungen(naechste)
    setEinstellungenState(bereinigt)
    schreibeEinstellungen(bereinigt)
  }, [])

  // Abgeleitete Anzeige. Alle drei lesen nur aus dem Bestand; es gibt keinen
  // zweiten Speicherort für „aktuell sichtbar“.
  const aktiverLauf = useMemo(
    () => laeufe.find((l) => l.id === aktiverLaufId) ?? null,
    [laeufe, aktiverLaufId],
  )

  /** Der Rahmen des sichtbaren Laufs. Auch ein einzelner Lauf hat einen Satz (die Tagesgruppe). */
  const aktiverSatz = useMemo(
    () =>
      aktiverLauf?.satzId
        ? (satze.find((eintrag) => eintrag.id === aktiverLauf.satzId) ?? null)
        : null,
    [aktiverLauf, satze],
  )

  /**
   * Wiederholungen der ausgewählten Serie, nach Wiederholungsnummer sortiert
   * (Reihenfolge kommt aus `rundenVon`). Leer bei einem einzelnen Lauf.
   */
  const aktiveRunden = useMemo(
    () => (istSerie(aktiverSatz) && aktiverSatz ? rundenVon(laeufe, aktiverSatz.id) : []),
    [aktiverSatz, laeufe],
  )

  /**
   * Die Leiste oben und ob irgendein aktiver Lauf Takt braucht. Beides ist aus
   * Bestand und Auswahl abgeleitet; es gibt keinen zweiten Speicherort.
   */
  const aktiveEintraege = useMemo<AktiverEintrag[]>(
    () => berechneAktiveEintraege(aktiveIds, laeufe, satze),
    [aktiveIds, laeufe, satze],
  )

  const brauchtTakt = useMemo(
    () => berechneBrauchtTakt(aktiveEintraege, laeufe),
    [aktiveEintraege, laeufe],
  )

  /**
   * Wendet eine reine Domänenfunktion auf den sichtbaren Lauf an.
   *
   * Der gemeinsame Schreibpfad für alle Timer-Aktionen: Rolle prüfen, aktuellen
   * Stand aus der Ref holen, Funktion anwenden, bei echter Änderung State und
   * Speicher nachziehen. Die Domänenfunktionen geben bei ungültigen Eingaben
   * dasselbe Objekt zurück; `naechster === aktuell` ist deshalb die billige
   * Prüfung auf „nichts zu tun“ und verhindert überflüssige Schreibvorgänge.
   */
  const aktualisiereAktiven = useCallback(
    (fn: (lauf: Lauf) => Lauf) => {
      if (!istAktiv()) return
      const id = aktiverLaufIdRef.current
      if (!id) return
      const aktuell = laeufeRef.current.find((l) => l.id === id)
      if (!aktuell) return
      const naechster = fn(aktuell)
      if (naechster === aktuell) return
      setLaeufeSafe(laeufeRef.current.map((l) => (l.id === id ? naechster : l)))
      verfolge(saveLauf(naechster))
    },
    [setLaeufeSafe, verfolge],
  )

  /**
   * Startet den sichtbaren Lauf — bei einer Serie alle Wiederholungen auf
   * einmal, mit vorausberechneten Startzeitpunkten.
   *
   * Der Serienzweig ist bewusst eigenständig (statt nur `startAll` aufzurufen),
   * weil er mehrere Läufe gleichzeitig ändert:
   * 1. Nur unberührte Runden (kein Start, kein Anschlag) werden neu geplant.
   * 2. Angefangene Runden mit fehlender Startzeit werden ergänzt — der Fall
   *    „Reload mitten in der Runde“; die fehlenden Bahnen starten jetzt (plus
   *    ihrem Startversatz), bereits erfasste Anschläge bleiben unberührt.
   * 3. Wird eine Runde fortgesetzt, beginnt die nächste einen Takt später,
   *    damit der Takt ab dem tatsächlichen Neustart weiterläuft.
   *
   * Ist nichts zu tun (alles berührt oder bereits gestartet), kehrt die
   * Funktion still zurück; dadurch ist „Weiter“ beliebig oft antippbar.
   */
  const startAlle = useCallback(
    (now: number, wallNow: number) => {
      if (!istAktiv()) return
      const id = aktiverLaufIdRef.current
      if (!id) return
      const lauf = laeufeRef.current.find((eintrag) => eintrag.id === id)
      if (!lauf) return
      const satz = lauf.satzId
        ? satzeRef.current.find((eintrag) => eintrag.id === lauf.satzId)
        : undefined

      if (istSerie(satz) && satz?.plan) {
        const betroffen = rundenVon(laeufeRef.current, satz.id)
        const taktMs = satz.plan.taktSek * 1000
        const unberuehrt = betroffen.filter(
          (runde) =>
            !hasStarted(runde) && runde.bahnen.every((bahn) => bahn.anschlaege.length === 0),
        )
        // Nach einem Reload oder einem abgebrochenen Start können einzelne
        // Bahnen einer bereits begonnenen Runde ohne Startzeit zurückbleiben.
        // „Weiter“ muss auch diese wieder aufnehmen, nicht nur unberührte
        // Runden planen.
        const fehlendeStarts = betroffen.some(
          (runde) =>
            !isComplete(runde) &&
            runde.bahnen.some((bahn) => bahn.startMs === null && !isFinished(bahn)),
        )
        if (unberuehrt.length === 0 && !fehlendeStarts) return

        const betroffeneIds = new Set(betroffen.map((runde) => runde.id))
        const unberuehrtIds = new Set(unberuehrt.map((runde) => runde.id))
        // Eine angefangene Runde ist unvollständig, aber nicht mehr unberührt.
        const teilweise = betroffen.some(
          (runde) =>
            !unberuehrtIds.has(runde.id) &&
            !isComplete(runde) &&
            runde.bahnen.some((bahn) => bahn.startMs === null && !isFinished(bahn)),
        )
        // Wird eine angefangene Runde jetzt fortgesetzt, beginnt die nächste
        // unberührte Runde erst einen Takt später statt gleichzeitig.
        const versatzBisNaechsterRunde = teilweise ? taktMs : 0
        // Startzeit je noch unberührter Runde: fortlaufend ein Takt Abstand,
        // gerechnet ab jetzt (plus Versatz, falls eine Runde fortgesetzt wird).
        const startZeiten = new Map(
          unberuehrt.map((runde, index) => [
            runde.id,
            now + versatzBisNaechsterRunde + index * taktMs,
          ]),
        )
        // Sammelt nur die tatsächlich geänderten Läufe; nur sie werden
        // geschrieben, unberührte Runden kosten keinen Schreibvorgang.
        const geaendert: Lauf[] = []
        const naechste = laeufeRef.current.map((eintrag) => {
          const start = startZeiten.get(eintrag.id)
          if (start !== undefined) {
            // Der Wanduhr-Anker wird mitgezogen: Gemessen wird monoton, für
            // Verlauf und CSV braucht jeder Lauf aber eine echte Uhrzeit.
            const geplant = planeLauf(
              eintrag,
              start,
              wallNow + (start - now),
              satz.plan!.startversatzMs,
            )
            geaendert.push(geplant)
            return geplant
          }

          if (
            !betroffeneIds.has(eintrag.id) ||
            !eintrag.bahnen.some((bahn) => bahn.startMs === null && !isFinished(bahn))
          ) {
            return eintrag
          }

          // Angefangene Runde: nur fehlende Bahnen bekommen eine Startzeit,
          // ein bereits gesetzter Wanduhr-Anker bleibt erhalten.
          const ergaenzt: Lauf = {
            ...eintrag,
            startWallMs: eintrag.startWallMs ?? wallNow,
            bahnen: eintrag.bahnen.map((bahn) =>
              bahn.startMs === null && !isFinished(bahn)
                ? { ...bahn, startMs: now + (bahnReihe(bahn) - 1) * satz.plan!.startversatzMs }
                : bahn,
            ),
          }
          geaendert.push(ergaenzt)
          return ergaenzt
        })
        setLaeufeSafe(naechste)
        for (const eintrag of geaendert) verfolge(saveLauf(eintrag))
        return
      }

      aktualisiereAktiven((eintrag) => startAll(eintrag, now, wallNow))
    },
    [aktualisiereAktiven, setLaeufeSafe, verfolge],
  )

  /** Tap auf eine Bahn: Länge abschließen oder, bei konfigurierter Strecke, das Ziel. */
  const tippe = useCallback(
    (bahnId: string, now: number, wallNow: number) =>
      aktualisiereAktiven((l) => tapLane(l, bahnId, now, wallNow)),
    [aktualisiereAktiven],
  )

  /** Setzt das Ziel einer Bahn, auch bei offener Strecke. */
  const beende = useCallback(
    (bahnId: string, now: number, wallNow: number) =>
      aktualisiereAktiven((l) => finishLane(l, bahnId, now, wallNow)),
    [aktualisiereAktiven],
  )

  /** Nimmt den letzten Anschlag einer Bahn zurück; die Domäne entscheidet, was gültig ist. */
  const rueckgaengig = useCallback(
    (bahnId: string) => aktualisiereAktiven((l) => undoLane(l, bahnId)),
    [aktualisiereAktiven],
  )

  /**
   * Schreibpfad für einen beliebigen Lauf, nicht nur den sichtbaren.
   *
   * Wird für Serienrunden, Wettkampf-Heats und Korrekturen im Lauf-Detail
   * gebraucht. Die Tab-Rolle prüfen die Aufrufer. Wie überall gilt: kein
   * Schreiben, wenn die Domäne denselben Lauf zurückgibt.
   */
  const aendereLauf = useCallback(
    (lauf: Lauf, naechster: Lauf) => {
      if (naechster === lauf) return
      setLaeufeSafe(laeufeRef.current.map((eintrag) => (eintrag.id === lauf.id ? naechster : eintrag)))
      verfolge(saveLauf(naechster))
    },
    [setLaeufeSafe, verfolge],
  )

  /**
   * Aktuelle Serie des sichtbaren Laufs: Anker, Satz und alle Runden.
   * `null`, wenn der sichtbare Lauf keine Serie ist oder die Daten fehlen.
   */
  const holeAktiveSerie = useCallback(() => {
    const id = aktiverLaufIdRef.current
    if (!id) return null
    const lauf = laeufeRef.current.find((eintrag) => eintrag.id === id)
    const satz = lauf?.satzId
      ? satzeRef.current.find((eintrag) => eintrag.id === lauf.satzId)
      : undefined
    if (!lauf || !istSerie(satz) || !satz) return null
    return { lauf, satz, runden: rundenVon(laeufeRef.current, satz.id) }
  }, [])

  /**
   * Tap in der Serien-Ansicht: schließt die älteste offene Runde der Bahn.
   *
   * Gesucht wird in Rundenreihenfolge (Runde 1 zuerst) die erste Bahn, deren
   * Start vorbei ist und die noch nicht fertig ist. Eine überholte Runde wird
   * also zuerst bedient, auch wenn eine neuere schon läuft. Bahnen mit
   * zukünftigem Start (`geplant`) werden ignoriert.
   */
  const tippeSerie = useCallback(
    (bahnIndex: number, now: number, wallNow: number) => {
      if (!istAktiv()) return
      const serie = holeAktiveSerie()
      if (!serie) return
      const ziel = serie.runden.find((runde) => {
        const bahn = runde.bahnen[bahnIndex]
        return bahn && bahn.startMs !== null && bahn.startMs <= now && !isFinished(bahn)
      })
      if (!ziel) return
      const bahn = ziel.bahnen[bahnIndex]
      if (!bahn) return
      aendereLauf(ziel, tapLane(ziel, bahn.id, now, wallNow))
    },
    [aendereLauf, holeAktiveSerie],
  )

  /**
   * Setzt das Ziel in der Serien-Ansicht, mit derselben Auswahlregel wie
   * `tippeSerie`: älteste offene, bereits gestartete Runde der Bahn.
   */
  const beendeSerie = useCallback(
    (bahnIndex: number, now: number, wallNow: number) => {
      if (!istAktiv()) return
      const serie = holeAktiveSerie()
      if (!serie) return
      const ziel = serie.runden.find((runde) => {
        const bahn = runde.bahnen[bahnIndex]
        return bahn && bahn.startMs !== null && bahn.startMs <= now && !isFinished(bahn)
      })
      if (!ziel) return
      const bahn = ziel.bahnen[bahnIndex]
      if (!bahn) return
      aendereLauf(ziel, finishLane(ziel, bahn.id, now, wallNow))
    },
    [aendereLauf, holeAktiveSerie],
  )

  /**
   * Nimmt den letzten Anschlag einer Bahn über alle Runden hinweg zurück.
   *
   * Anders als beim Tippen wird hier nicht die älteste offene Runde gesucht,
   * sondern der jüngste Anschlag: Rückgängig soll immer die zuletzt gemachte
   * Eingabe treffen.
   */
  const rueckgaengigSerie = useCallback(
    (bahnIndex: number) => {
      if (!istAktiv()) return
      const serie = holeAktiveSerie()
      if (!serie) return
      const treffer = letzterAnschlag(serie.runden, bahnIndex)
      if (!treffer) return
      aendereLauf(treffer.lauf, undoLane(treffer.lauf, treffer.bahn.id))
    },
    [aendereLauf, holeAktiveSerie],
  )

  /**
   * Ordnet einer Bahn in allen Runden denselben Schwimmer zu.
   *
   * Die Zuordnung gilt zeilenweise für die ganze Serie: Sonst hätte dieselbe
   * Schwimmerposition je Runde einen anderen Namen und Bestzeiten wären nicht
   * mehr zuordenbar. Bereits gemessene Zeiten bleiben unverändert.
   */
  const setzeSchwimmerSerie = useCallback(
    (bahnIndex: number, schwimmerId: string | null) => {
      if (!istAktiv()) return
      const serie = holeAktiveSerie()
      if (!serie) return
      const geaendert: Lauf[] = []
      for (const runde of serie.runden) {
        const bahn = runde.bahnen[bahnIndex]
        if (!bahn) continue
        const naechster = setSchwimmerOnLane(runde, bahn.id, schwimmerId)
        if (naechster !== runde) {
          geaendert.push(naechster)
        }
      }
      if (geaendert.length === 0) return
      const nachId = new Map(geaendert.map((lauf) => [lauf.id, lauf]))
      setLaeufeSafe(laeufeRef.current.map((lauf) => nachId.get(lauf.id) ?? lauf))
      for (const lauf of geaendert) verfolge(saveLauf(lauf))
    },
    [holeAktiveSerie, setLaeufeSafe, verfolge],
  )

  /** Ordnet dem sichtbaren Lauf eine Bahn einem Schwimmer zu. */
  const setzeSchwimmer = useCallback(
    (bahnId: string, schwimmerId: string | null) =>
      aktualisiereAktiven((l) => setSchwimmerOnLane(l, bahnId, schwimmerId)),
    [aktualisiereAktiven],
  )

  /** Bahnzuordnung in einem beliebigen Lauf, etwa beim Nachtragen im Wettkampf oder im Detail. */
  const setzeSchwimmerImLauf = useCallback(
    (laufId: string, bahnId: string, schwimmerId: string | null) => {
      if (!istAktiv()) return
      const lauf = laeufeRef.current.find((l) => l.id === laufId)
      if (!lauf) return
      const naechster = setSchwimmerOnLane(lauf, bahnId, schwimmerId)
      if (naechster === lauf) return
      setLaeufeSafe(laeufeRef.current.map((l) => (l.id === laufId ? naechster : l)))
      verfolge(saveLauf(naechster))
    },
    [setLaeufeSafe, verfolge],
  )

  /**
   * Korrigiert einen bereits erfassten Anschlag. Die Domäne prüft die
   * Reihenfolge (kein Split hinter einem späteren) und markiert die Zeit als
   * `manuell`, damit sie im CSV und bei Bestzeiten sichtbar bleibt.
   */
  const korrigiereAnschlag = useCallback(
    (laufId: string, bahnId: string, laengeNr: number, splitMs: number) => {
      if (!istAktiv()) return
      const lauf = laeufeRef.current.find((l) => l.id === laufId)
      if (!lauf) return
      const naechster = korrigiereAnschlagImLauf(lauf, bahnId, laengeNr, splitMs)
      if (naechster === lauf) return
      setLaeufeSafe(laeufeRef.current.map((l) => (l.id === laufId ? naechster : l)))
      verfolge(saveLauf(naechster))
    },
    [setLaeufeSafe, verfolge],
  )

  /**
   * Ändert Strecke und Schwimmart des sichtbaren Laufs. Nur vor dem Start
   * zulässig; die Domäne lehnt es sonst ab, indem sie denselben Lauf zurückgibt.
   */
  const setzeKonfiguration = useCallback(
    (konfiguration: LaufKonfiguration) =>
      aktualisiereAktiven((l) => updateStrecke(l, konfiguration)),
    [aktualisiereAktiven],
  )

  /**
   * Legt einen Lauf oder eine Serie an und macht ihn zum sichtbaren Eintrag.
   *
   * Ablauf:
   * 1. Eingaben prüfen und begrenzen. Eine ungültige Konfiguration wird mit
   *    `null` abgelehnt, ohne etwas zu schreiben.
   * 2. Satz bestimmen: Bei mehr als einer Wiederholung entsteht immer ein neuer
   *    Satz mit Plan. Bei einem einzelnen Lauf wird ein passender Satz des
   *    Tages wiederverwendet, damit der Verlauf nicht pro Lauf eine eigene
   *    Gruppe anlegt.
   * 3. Läufe anlegen — bei einer Serie sofort alle Wiederholungen. Die
   *    Startzeitpunkte setzt erst `startAlle`.
   * 4. Leiste aufräumen: fertige Einträge fallen heraus, die neuen stehen vorn.
   *
   * Rückgabe ist die Anker-ID (erste Wiederholung) oder `null`.
   */
  const neuerLauf = useCallback(
    (
      konfiguration: LaufKonfiguration,
      bahnen: number,
      schwimmerProBahn: (string | null)[] = [],
      optionen: { startversatzMs?: number; wiederholungen?: number; taktSek?: number; reihen?: number } = {},
    ): string | null => {
      if (!istAktiv()) return null
      if (validateKonfiguration(konfiguration) !== null) return null
      const anzahlBahnen = Number.isFinite(bahnen)
        ? Math.min(MAX_BAHNEN, Math.max(1, Math.round(bahnen)))
        : STANDARD_EINSTELLUNGEN.bahnen
      const anzahlReihen = begrenzeReihen(optionen.reihen ?? einstellungen.reihen)
      const datum = heute()
      const startversatzMs = begrenzeVersatz(
        optionen.startversatzMs ?? einstellungen.startversatzMs,
      )
      const wiederholungen = begrenzeWiederholungen(
        optionen.wiederholungen ?? einstellungen.wiederholungen,
      )
      const taktSek = begrenzeTakt(optionen.taktSek ?? einstellungen.taktSek)
      const geplanteSerie = wiederholungen > 1

      let satzId: string | null = null
      let neuerSatz: Satz | null = null
      if (geplanteSerie) {
        const satz: Satz = {
          id: newId(),
          datum,
          bezeichnung: '',
          konfiguration: { ...konfiguration },
          plan: { wiederholungen, taktSek, startversatzMs },
          erstelltAm: Date.now(),
        }
        satzId = satz.id
        neuerSatz = satz
        setSatzeSafe([satz, ...satzeRef.current])
      } else {
        // Einzelner Lauf: den letzten Satz desselben Tages mit gleicher
        // Konfiguration weiterverwenden, statt einen neuen anzulegen. `reverse`
        // sucht rückwärts, weil die Liste neueste Sätze vorn führt.
        const vorhandenerSatz = [...satzeRef.current]
          .reverse()
          .find(
            (satz) =>
              satz.datum === datum &&
              satz.plan === null &&
              !satz.wettkampfId &&
              gleicheKonfiguration(satz.konfiguration, konfiguration),
          )
        if (vorhandenerSatz) {
          satzId = vorhandenerSatz.id
        } else {
          const satz: Satz = {
            id: newId(),
            datum,
            bezeichnung: '',
            konfiguration: { ...konfiguration },
            plan: null,
            erstelltAm: Date.now(),
          }
          satzId = satz.id
          neuerSatz = satz
          setSatzeSafe([satz, ...satzeRef.current])
        }
      }

      // Personen werden Reihe für Reihe angelegt: erst alle Bahnen der Reihe 1,
      // dann Reihe 2. `nummer` ist die Bahn innerhalb ihrer Reihe.
      const gesamt = bahnenGesamt(anzahlBahnen, anzahlReihen)
      const bahnenInit = Array.from({ length: gesamt }, (_, i) => ({
        nummer: (i % anzahlBahnen) + 1,
        reihe: Math.floor(i / anzahlBahnen) + 1,
        schwimmerId: schwimmerProBahn[i] ?? null,
      }))
      // Bei einer Serie entstehen alle Wiederholungen sofort, aber noch ohne
      // Startzeit. `wiederholung` ordnet jede dem Satz zu; geplant wird erst
      // mit `startAlle`.
      const anzahl = geplanteSerie ? wiederholungen : 1
      const neueLaeufe = Array.from({ length: anzahl }, (_, index) =>
        createLauf(konfiguration, bahnenInit, satzId, {
          startversatzMs,
          wiederholung: geplanteSerie ? index + 1 : null,
        }),
      )

      setLaeufeSafe([...neueLaeufe, ...laeufeRef.current])
      // Satz und Läufe gehören zusammen: Entweder ist der Lauf vollständig
      // angelegt oder gar nicht.
      verfolge(saveMehrere({ satze: neuerSatz ? [neuerSatz] : [], laeufe: neueLaeufe }))

      // Fertig gemessene Einträge verschwinden beim Anlegen aus der Leiste,
      // bleiben aber im Verlauf. Offene Läufe werden weitergeführt.
      const istEintragFertig = (laufId: string): boolean => {
        const eintrag = laeufeRef.current.find((lauf) => lauf.id === laufId)
        if (!eintrag) return true
        const satz = satzeRef.current.find((eintragSatz) => eintragSatz.id === eintrag.satzId)
        if (istSerie(satz) && satz) {
          return rundenVon(laeufeRef.current, satz.id).every(isComplete)
        }
        return isComplete(eintrag)
      }
      const behalten = aktiveIdsRef.current.filter((id) => !istEintragFertig(id))
      const anker = neueLaeufe[0]!
      setAktiveIds([anker.id, ...behalten])
      setAktivenLaufId(anker.id)
      return anker.id
    },
    [
      einstellungen,
      setAktiveIds,
      setAktivenLaufId,
      setLaeufeSafe,
      setSatzeSafe,
      verfolge,
    ],
  )

  /** „Lauf anlegen“ mit den aktuellen Einstellungen als Vorbelegung. */
  const anlegenLauf = useCallback(() => {
    const werte = einstellungen
    neuerLauf(werte.konfiguration, werte.bahnen, werte.schwimmerProBahn, {
      startversatzMs: werte.startversatzMs,
      wiederholungen: werte.wiederholungen,
      taktSek: werte.taktSek,
      reihen: werte.reihen,
    })
  }, [einstellungen, neuerLauf])

  /**
   * Wechselt den sichtbaren Lauf innerhalb der Leiste. IDs, die nicht in der
   * Leiste stehen (etwa ein Wettkampf-Heat), werden ignoriert.
   */
  const waehleLauf = useCallback(
    (id: string) => {
      if (!aktiveIdsRef.current.includes(id)) return
      setAktivenLaufId(id)
    },
    [setAktivenLaufId],
  )

  /**
   * Nimmt einen Lauf aus der Leiste, ohne Daten zu löschen. Der Verlauf bleibt
   * vollständig; danach wird der erste verbleibende Eintrag sichtbar.
   */
  const schliesseAktivenLauf = useCallback(() => {
    if (!istAktiv()) return
    const id = aktiverLaufIdRef.current
    if (!id) return
    const naechste = aktiveIdsRef.current.filter((eintrag) => eintrag !== id)
    setAktiveIds(naechste)
    setAktivenLaufId(naechste[0] ?? null)
    zeigeToast('Lauf geschlossen.')
  }, [setAktiveIds, setAktivenLaufId, zeigeToast])

  /**
   * Verwirft den sichtbaren Lauf samt Messwerten.
   *
   * Bei einer Serie werden alle Runden und der Satz gelöscht — es gibt keine
   * halbe Serie, sonst bliebe ein Satz mit falscher Wiederholungszahl zurück.
   * Für „nur aus der Leiste nehmen“ siehe `schliesseAktivenLauf`.
   */
  const verwerfeAktivenLauf = useCallback(() => {
    if (!istAktiv()) return
    const id = aktiverLaufIdRef.current
    if (!id) return
    const lauf = laeufeRef.current.find((eintrag) => eintrag.id === id)
    const satz = lauf?.satzId
      ? satzeRef.current.find((eintrag) => eintrag.id === lauf.satzId)
      : undefined

    if (istSerie(satz) && satz) {
      const betroffen = rundenVon(laeufeRef.current, satz.id)
      const ids = new Set(betroffen.map((eintrag) => eintrag.id))
      setLaeufeSafe(laeufeRef.current.filter((eintrag) => !ids.has(eintrag.id)))
      setSatzeSafe(satzeRef.current.filter((eintrag) => eintrag.id !== satz.id))
      const naechste = aktiveIdsRef.current.filter((eintrag) => !ids.has(eintrag))
      setAktiveIds(naechste)
      setAktivenLaufId(naechste[0] ?? null)
      verfolge(deleteSatzUndLaeufe(satz.id))
      zeigeToast('Serie abgebrochen.')
      return
    }

    setLaeufeSafe(laeufeRef.current.filter((eintrag) => eintrag.id !== id))
    const naechste = aktiveIdsRef.current.filter((eintrag) => eintrag !== id)
    setAktiveIds(naechste)
    setAktivenLaufId(naechste[0] ?? null)
    verfolge(deleteLauf(id))

    const satzId = lauf?.satzId
    // Ein Satz ohne Läufe wäre im Verlauf unsichtbar; er verschwindet mit
    // seinem letzten Lauf.
    if (satzId && !laeufeRef.current.some((eintrag) => eintrag.satzId === satzId)) {
      setSatzeSafe(satzeRef.current.filter((eintrag) => eintrag.id !== satzId))
      verfolge(deleteSatzUndLaeufe(satzId))
    }
    zeigeToast('Lauf verworfen.')
  }, [
    setAktiveIds,
    setAktivenLaufId,
    setLaeufeSafe,
    setSatzeSafe,
    zeigeToast,
    verfolge,
  ])

  /**
   * Löscht einen Lauf aus dem Verlauf (etwa eine Fehleingabe).
   *
   * Anders als `verwerfeAktivenLauf` wird hier gezielt eine ID angesprochen,
   * typischerweise aus dem Verlauf. Die Leiste wird mitgepflegt; bei einer
   * Serie übernimmt die nächste verbliebene Wiederholung den Anker.
   */
  const loescheLauf = useCallback(
    (id: string) => {
      if (!istAktiv()) return
      const lauf = laeufeRef.current.find((eintrag) => eintrag.id === id)
      const satz = lauf?.satzId
        ? satzeRef.current.find((eintrag) => eintrag.id === lauf.satzId)
        : undefined
      const verbleibend = laeufeRef.current.filter((eintrag) => eintrag.id !== id)
      setLaeufeSafe(verbleibend)
      verfolge(deleteLauf(id))

      // War der gelöschte Lauf der Anker einer Serie, übernimmt die nächste
      // verbliebene Wiederholung die Rolle in der Leiste.
      let naechsteAktive = aktiveIdsRef.current.filter((eintrag) => eintrag !== id)
      if (naechsteAktive.length !== aktiveIdsRef.current.length && istSerie(satz) && satz) {
        const rest = rundenVon(verbleibend, satz.id)
        if (rest.length > 0) naechsteAktive = [rest[0]!.id, ...naechsteAktive]
      }
      if (naechsteAktive.length !== aktiveIdsRef.current.length) {
        setAktiveIds(naechsteAktive)
        if (aktiverLaufIdRef.current === id) setAktivenLaufId(naechsteAktive[0] ?? null)
      }

      // Ein Satz ohne Läufe ist unsichtbar, aber nicht weg. Er verschwindet
      // mit seinem letzten Lauf.
      const satzId = lauf?.satzId
      if (satzId && !verbleibend.some((eintrag) => eintrag.satzId === satzId)) {
        setSatzeSafe(satzeRef.current.filter((eintrag) => eintrag.id !== satzId))
        verfolge(deleteSatzUndLaeufe(satzId))
      }
    },
    [setAktiveIds, setAktivenLaufId, setLaeufeSafe, setSatzeSafe, verfolge],
  )

  /**
   * Löscht einen Satz mit allen seinen Läufen. Wird im Verlauf verwendet, um
   * eine ganze Gruppe zu entfernen; die Leiste wird bereinigt.
   */
  const loescheSatz = useCallback(
    (id: string) => {
      if (!istAktiv()) return
      const betroffen = laeufeRef.current.filter((l) => l.satzId === id)
      setSatzeSafe(satzeRef.current.filter((s) => s.id !== id))
      setLaeufeSafe(laeufeRef.current.filter((l) => l.satzId !== id))
      const ids = new Set(betroffen.map((lauf) => lauf.id))
      const naechste = aktiveIdsRef.current.filter((eintrag) => !ids.has(eintrag))
      setAktiveIds(naechste)
      if (betroffen.some((lauf) => lauf.id === aktiverLaufIdRef.current)) {
        setAktivenLaufId(naechste[0] ?? null)
      }
      verfolge(deleteSatzUndLaeufe(id))
    },
    [setAktiveIds, setAktivenLaufId, setLaeufeSafe, setSatzeSafe, verfolge],
  )

  /**
   * Legt einen Schwimmer an oder aktualisiert ihn (anhand von `daten.id`).
   *
   * Name und Notiz werden getrimmt, ein leerer Name wird abgelehnt. Die Liste
   * bleibt nach Namen sortiert, damit die Auswahl in den Dialogen stabil ist.
   * `erstelltAm` bleibt bei einer Bearbeitung erhalten.
   */
  const speichereSchwimmer = useCallback(
    (daten: { id?: string; name: string; jahrgang: number | null; notiz: string }) => {
      if (!istAktiv()) return null
      const name = daten.name.trim()
      if (!name) return null
      const vorhanden = daten.id
        ? schwimmerRef.current.find((s) => s.id === daten.id)
        : undefined
      const eintrag: Schwimmer = {
        id: vorhanden?.id ?? newId(),
        name,
        jahrgang: daten.jahrgang,
        notiz: daten.notiz.trim(),
        erstelltAm: vorhanden?.erstelltAm ?? Date.now(),
      }
      setSchwimmerSafe(
        [...schwimmerRef.current.filter((s) => s.id !== eintrag.id), eintrag].sort((a, b) =>
          a.name.localeCompare(b.name, 'de'),
        ),
      )
      verfolge(saveSchwimmer(eintrag))
      return eintrag
    },
    [setSchwimmerSafe, verfolge],
  )

  /**
   * Löscht einen Schwimmer und räumt alle Verweise darauf auf.
   *
   * Kein Kaskadenlöschen von Messungen: Läufe, Einstellungen und vorbereitete
   * Trainings verlieren nur die Zuordnung, die Zeiten bleiben im Verlauf. Das
   * ist Absicht — eine gelöschte Person darf keine Messreihe mitnehmen.
   */
  const loescheSchwimmer = useCallback(
    (id: string) => {
      if (!istAktiv()) return
      setSchwimmerSafe(schwimmerRef.current.filter((s) => s.id !== id))
      verfolge(deleteSchwimmer(id))

      const geaenderteLaeufe: Lauf[] = []
      const naechsteLaeufe = laeufeRef.current.map((lauf) => {
        if (!lauf.bahnen.some((bahn) => bahn.schwimmerId === id)) return lauf
        const geaendert: Lauf = {
          ...lauf,
          bahnen: lauf.bahnen.map((bahn) =>
            bahn.schwimmerId === id ? { ...bahn, schwimmerId: null } : bahn,
          ),
        }
        geaenderteLaeufe.push(geaendert)
        return geaendert
      })
      if (geaenderteLaeufe.length > 0) {
        setLaeufeSafe(naechsteLaeufe)
        for (const lauf of geaenderteLaeufe) {
          verfolge(saveLauf(lauf))
        }
      }

      if (einstellungen.schwimmerProBahn.includes(id)) {
        setzeEinstellungen({
          ...einstellungen,
          schwimmerProBahn: einstellungen.schwimmerProBahn.map((wert) =>
            wert === id ? null : wert,
          ),
        })
      }

      // Auch vorbereitete Trainings dürfen nicht auf einen gelöschten
      // Schwimmer zeigen; die Bahn bleibt bestehen, nur ohne Zuordnung.
      const geaenderteTrainings: Training[] = []
      const naechsteTrainings = trainingsRef.current.map((training) => {
        if (!training.aktive.includes(id)) return training
        const geaendert: Training = {
          ...training,
          aktive: training.aktive.map((wert) => (wert === id ? null : wert)),
        }
        geaenderteTrainings.push(geaendert)
        return geaendert
      })
      if (geaenderteTrainings.length > 0) {
        setTrainingsSafe(naechsteTrainings)
        for (const training of geaenderteTrainings) verfolge(saveTraining(training))
      }
    },
    [
      einstellungen,
      setSchwimmerSafe,
      setLaeufeSafe,
      setTrainingsSafe,
      setzeEinstellungen,
      verfolge,
    ],
  )

  /**
   * Bittet den Koordinator, die Messung aus dem anderen Tab zu übernehmen.
   * Wirksam nur, wenn dieser Tab gerade gesperrt ist; der eigentliche Wechsel
   * läuft über `yield`/`takeover` im Koordinator.
   */
  const uebernehmen = useCallback(() => {
    koordinatorRef.current?.uebernehmen()
  }, [])

  /** Benennt einen Satz um (Freitext im Verlauf). Leerer Text entfernt die Bezeichnung. */
  const benenneSatz = useCallback(
    (id: string, bezeichnung: string) => {
      if (!istAktiv()) return
      const satz = satzeRef.current.find((eintrag) => eintrag.id === id)
      if (!satz) return
      const naechster = { ...satz, bezeichnung: bezeichnung.trim() }
      setSatzeSafe(satzeRef.current.map((eintrag) => (eintrag.id === id ? naechster : eintrag)))
      verfolge(saveSatz(naechster))
    },
    [setSatzeSafe, verfolge],
  )

  /**
   * Legt einen leeren Wettkampf an. Name und Datum werden geprüft; das Datum
   * muss `YYYY-MM-DD` sein (Formularformat), sonst wird abgelehnt.
   */
  const erstelleWettkampf = useCallback(
    (daten: { name: string; datum: string; beckenlaengeM: Beckenlaenge; einheit?: Einheit }) => {
      if (!istAktiv()) return null
      const name = daten.name.trim()
      if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(daten.datum)) return null
      const wettkampf = createWettkampf({ ...daten, name })
      setWettkampfeSafe([wettkampf, ...wettkampfeRef.current])
      verfolge(saveWettkampf(wettkampf))
      return wettkampf.id
    },
    [setWettkampfeSafe, verfolge],
  )

  /** Benennt einen Wettkampf um; ein leerer Name lässt den bisherigen stehen. */
  const benenneWettkampf = useCallback(
    (id: string, name: string) => {
      if (!istAktiv()) return
      const wettkampf = wettkampfeRef.current.find((eintrag) => eintrag.id === id)
      if (!wettkampf) return
      const naechster = { ...wettkampf, name: name.trim() || wettkampf.name }
      setWettkampfeSafe(
        wettkampfeRef.current.map((eintrag) => (eintrag.id === id ? naechster : eintrag)),
      )
      verfolge(saveWettkampf(naechster))
    },
    [setWettkampfeSafe, verfolge],
  )

  /**
   * Schreibt einen geprüften Meldelisten-Plan in die Datenhaltung.
   *
   * Mit `wettkampfId` wird ein bestehender Wettkampf ergänzt; sein Name bleibt.
   * Ohne ID entsteht ein neuer Wettkampf aus den Planangaben. Der Import ist
   * eine Transaktion: Erst werden alle Sätze, Läufe und Schwimmer gesammelt,
   * dann gemeinsam gesetzt und geschrieben. Ein halb importierter Wettkampf
   * kann so nicht entstehen.
   *
   * Bereits bekannte Namen werden wiederverwendet (siehe `schwimmerIdFuer`),
   * damit Bestzeiten über Importe hinweg zusammenpassen. Rückgabe ist die
   * Wettkampf-ID oder `null` bei leerem Plan.
   */
  const importiereWettkampf = useCallback(
    (plan: WettkampfPlan, wettkampfId: string | null = null): string | null => {
      if (!istAktiv()) return null
      const name = plan.name.trim()
      if (!name || plan.disziplinen.length === 0) return null

      const vorhanden = wettkampfId
        ? wettkampfeRef.current.find((eintrag) => eintrag.id === wettkampfId)
        : undefined
      const wettkampf =
        vorhanden ??
        createWettkampf({
          name,
          datum: plan.datum,
          beckenlaengeM: plan.beckenlaengeM,
          ...(plan.einheit ? { einheit: plan.einheit } : {}),
        })
      if (!vorhanden) {
        setWettkampfeSafe([wettkampf, ...wettkampfeRef.current])
      }

      const neueSchwimmer: Schwimmer[] = []
      const neueSatze: Satz[] = []
      const neueLaeufe: Lauf[] = []
      // Die Sätze bekommen gestaffelte Zeitstempel, damit die Sortierung im
      // Verlauf der Reihenfolge der Disziplinen in der Meldeliste folgt.
      const jetzt = Date.now()

      plan.disziplinen.forEach((disziplin, index) => {
        // Ein Wettkampf-Satz ist eine Disziplin; seine Läufe sind die Heats.
        const satz = createWettkampfSatz(wettkampf, disziplin, jetzt + index)
        neueSatze.push(satz)
        for (const laufPlan of disziplin.laeufe) {
          neueLaeufe.push(
            createWettkampfLauf(satz, laufPlan, (start) =>
              schwimmerIdFuer(
                start.name,
                start.jahrgang ?? null,
                schwimmerRef.current,
                neueSchwimmer,
              ),
            ),
          )
        }
      })

      if (neueSchwimmer.length > 0) {
        setSchwimmerSafe(
          [...schwimmerRef.current, ...neueSchwimmer].sort((a, b) =>
            a.name.localeCompare(b.name, 'de'),
          ),
        )
      }

      setSatzeSafe([...neueSatze, ...satzeRef.current])
      setLaeufeSafe([...neueLaeufe, ...laeufeRef.current])
      // Ein Wettkampf mit Disziplinen, Heats und neuen Schwimmern gehört
      // zusammen: eine Transaktion statt bis zu tausender Einzel-Schreibvorgänge.
      verfolge(
        saveMehrere({
          wettkampfe: vorhanden ? [] : [wettkampf],
          schwimmer: neueSchwimmer,
          satze: neueSatze,
          laeufe: neueLaeufe,
        }),
      )
      return wettkampf.id
    },
    [setSchwimmerSafe, setLaeufeSafe, setSatzeSafe, setWettkampfeSafe, verfolge],
  )

  /**
   * Legt eine Disziplin von Hand an — ohne Meldeliste, etwa wenn kurzfristig
   * ein Heat ergänzt wird.
   *
   * Die Strecke muss ein Vielfaches der Beckenlänge des Wettkampfs sein.
   * Läufe und Bahnen werden begrenzt (20 bzw. 10). Fehlt eine Bezeichnung,
   * wird sie aus Strecke und Schwimmart gebildet. Alle Bahnen bleiben leer und
   * werden später im Wettkampf besetzt.
   */
  const erstelleWettkampfDisziplin = useCallback(
    (
      wettkampfId: string,
      disziplin: {
        bezeichnung: string
        streckeM: number
        schwimmart: Schwimmart
        laeufe: number
        bahnen: number
      },
    ): string | null => {
      if (!istAktiv()) return null
      const wettkampf = wettkampfeRef.current.find((eintrag) => eintrag.id === wettkampfId)
      if (!wettkampf) return null
      const streckeM = Math.round(disziplin.streckeM * 100) / 100
      if (
        !Number.isFinite(streckeM) ||
        streckeM <= 0 ||
        !istVielfacheDerBeckenlaenge(streckeM, wettkampf.beckenlaengeM)
      ) {
        return null
      }
      const einheit: Einheit = einheitVon(wettkampf)
      const laeufe = Math.min(20, Math.max(1, Math.round(disziplin.laeufe)))
      const bahnen = Math.min(10, Math.max(1, Math.round(disziplin.bahnen)))
      const plan: WettkampfDisziplinPlan = {
        // Ohne eigene Bezeichnung heißt die Disziplin wie ihre Strecke, z. B.
        // „100 m Freistil“; das ist auch der Name im Verlauf.
        bezeichnung:
          disziplin.bezeichnung.trim() ||
          disziplinBezeichnung(streckeM, disziplin.schwimmart, einheit),
        streckeM,
        schwimmart: disziplin.schwimmart,
        einheit,
        laeufe: Array.from({ length: laeufe }, (_, index) => ({
          nummer: index + 1,
          starts: Array.from({ length: bahnen }, (_, bahnIndex) => ({
            name: '',
            bahn: bahnIndex + 1,
          })),
        })),
      }

      const satz = createWettkampfSatz(wettkampf, plan)
      const neueLaeufe = plan.laeufe.map((laufPlan) =>
        createWettkampfLauf(satz, laufPlan, (start) =>
          schwimmerIdFuer(start.name, start.jahrgang ?? null, schwimmerRef.current, []),
        ),
      )
      setSatzeSafe([satz, ...satzeRef.current])
      setLaeufeSafe([...neueLaeufe, ...laeufeRef.current])
      verfolge(saveMehrere({ satze: [satz], laeufe: neueLaeufe }))
      return satz.id
    },
    [setLaeufeSafe, setSatzeSafe, verfolge],
  )

  /**
   * Löscht einen Wettkampf mit allen Disziplinen, Heats und Ergebnissen.
   *
   * Die betroffenen IDs werden vor dem Filtern bestimmt: Danach sind die Läufe
   * aus der Ref verschwunden und ließen sich nicht mehr zuordnen.
   */
  const loescheWettkampf = useCallback(
    (id: string) => {
      if (!istAktiv()) return
      const satzIds = new Set(
        satzeRef.current
          .filter((satz) => satz.wettkampfId === id)
          .map((satz) => satz.id),
      )
      // Vor dem Filtern bestimmen: Danach sind die betroffenen Läufe aus dem
      // Ref verschwunden und ließen sich nicht mehr zuordnen.
      const geloeschteLaufIds = new Set(
        laeufeRef.current
          .filter((lauf) => lauf.satzId !== null && satzIds.has(lauf.satzId))
          .map((lauf) => lauf.id),
      )
      setWettkampfeSafe(wettkampfeRef.current.filter((eintrag) => eintrag.id !== id))
      setSatzeSafe(satzeRef.current.filter((satz) => !satzIds.has(satz.id)))
      setLaeufeSafe(
        laeufeRef.current.filter((lauf) => !lauf.satzId || !satzIds.has(lauf.satzId)),
      )
      const naechsteAktive = aktiveIdsRef.current.filter(
        (eintrag) => !geloeschteLaufIds.has(eintrag),
      )
      if (naechsteAktive.length !== aktiveIdsRef.current.length) {
        setAktiveIds(naechsteAktive)
        if (!naechsteAktive.includes(aktiverLaufIdRef.current ?? '')) {
          setAktivenLaufId(naechsteAktive[0] ?? null)
        }
      }
      verfolge(deleteWettkampfUndDaten(id))
    },
    [
      setAktiveIds,
      setAktivenLaufId,
      setLaeufeSafe,
      setSatzeSafe,
      setWettkampfeSafe,
      verfolge,
    ],
  )

  /**
   * Startet einen Heat im Wettkampf-Tab.
   *
   * Heats stehen nicht in der Trainingsleiste; deshalb geht der Start direkt
   * über `aendereLauf` statt über den „aktiven Lauf“. Gestartet wird mit
   * `startAll`, also alle Bahnen gemeinsam (Wettkampf-Läufe haben keinen
   * Startversatz).
   */
  const starteWettkampfLauf = useCallback(
    (laufId: string, now: number, wallNow: number) => {
      if (!istAktiv()) return
      const lauf = laeufeRef.current.find((eintrag) => eintrag.id === laufId)
      if (!lauf) return
      aendereLauf(lauf, startAll(lauf, now, wallNow))
    },
    [aendereLauf],
  )

  /**
   * Tap im Wettkampf: Der erste Tap nach dem Start ist das Ziel.
   *
   * Das Verzweigen übernimmt `tapLane` anhand von `lauf.modus`; hier wird nur
   * der richtige Lauf gewählt. Splits pro Länge gibt es im Wettkampf bewusst
   * nicht.
   */
  const tippeWettkampf = useCallback(
    (laufId: string, bahnId: string, now: number, wallNow: number) => {
      if (!istAktiv()) return
      const lauf = laeufeRef.current.find((eintrag) => eintrag.id === laufId)
      if (!lauf) return
      aendereLauf(lauf, tapLane(lauf, bahnId, now, wallNow))
    },
    [aendereLauf],
  )

  /** Nimmt den Zielanschlag eines Heats zurück (Fehleingabe beim Tippen). */
  const rueckgaengigWettkampf = useCallback(
    (laufId: string, bahnId: string) => {
      if (!istAktiv()) return
      const lauf = laeufeRef.current.find((eintrag) => eintrag.id === laufId)
      if (!lauf) return
      aendereLauf(lauf, undoLane(lauf, bahnId))
    },
    [aendereLauf],
  )

  /**
   * Trägt eine Zielzeit von Hand ein oder korrigiert sie. Die Zeit wird als
   * `manuell` markiert, damit sie in CSV und Bestzeiten erkennbar bleibt.
   */
  const setzeWettkampfZeit = useCallback(
    (laufId: string, bahnId: string, splitMs: number) => {
      if (!istAktiv()) return
      const lauf = laeufeRef.current.find((eintrag) => eintrag.id === laufId)
      if (!lauf) return
      aendereLauf(lauf, setzeZielzeit(lauf, bahnId, splitMs))
    },
    [aendereLauf],
  )

  /**
   * Markiert eine Bahn als DNS/DNF oder hebt die Markierung auf. Die Domäne
   * lehnt gewertete Bahnen und Trainingsläufe ab; hier wird nur der richtige
   * Lauf gewählt und geschrieben.
   */
  const setzeWettkampfStatus = useCallback(
    (laufId: string, bahnId: string, status: WettkampfStatus | null) => {
      if (!istAktiv()) return
      const lauf = laeufeRef.current.find((eintrag) => eintrag.id === laufId)
      if (!lauf) return
      aendereLauf(lauf, setzeWettkampfStatusImLauf(lauf, bahnId, status))
    },
    [aendereLauf],
  )

  /**
   * Setzt die Namen aller Bahnen eines Heats in einem Schritt.
   *
   * Wird genutzt, wenn eine Startliste erst am Beckenrand eingetragen wird.
   * Unbekannte Namen legen neue Schwimmer an, leere Namen entfernen die
   * Zuordnung. Da alle Bahnen über `aendereLauf` in einem Lauf landen, gibt es
   * nur einen Schreibvorgang.
   */
  const setzeWettkampfNamen = useCallback(
    (laufId: string, namen: string[]) => {
      if (!istAktiv()) return
      const lauf = laeufeRef.current.find((eintrag) => eintrag.id === laufId)
      if (!lauf) return
      const neueSchwimmer: Schwimmer[] = []
      const ids = namen.map((name) =>
        schwimmerIdFuer(name, null, schwimmerRef.current, neueSchwimmer),
      )
      let naechster = lauf
      lauf.bahnen.forEach((bahn, index) => {
        naechster = setSchwimmerOnLane(naechster, bahn.id, ids[index] ?? null)
      })
      if (neueSchwimmer.length > 0) {
        setSchwimmerSafe(
          [...schwimmerRef.current, ...neueSchwimmer].sort((a, b) =>
            a.name.localeCompare(b.name, 'de'),
          ),
        )
        for (const eintrag of neueSchwimmer) verfolge(saveSchwimmer(eintrag))
      }
      aendereLauf(lauf, naechster)
    },
    [aendereLauf, setSchwimmerSafe, verfolge],
  )

  /**
   * Wählt einen bereits angelegten Satz aus, ohne gemessene Zeiten anzutasten.
   *
   * Bevorzugt wird eine noch offene Runde, sonst die erste. Der alte Anker
   * derselben Serie wird aus der Leiste entfernt, damit sie dort nicht zweimal
   * erscheint.
   */
  const aktiviereSatz = useCallback(
    (satz: Satz): string | null => {
      const runden = rundenVon(laeufeRef.current, satz.id)
      const kandidat = runden.find((lauf) => !isComplete(lauf)) ?? runden[0]
      if (!kandidat) return null
      // Eine Serie ist genau ein Eintrag in der Leiste. Ein alter Anker
      // derselben Serie wird ersetzt, nicht als zweiter Chip behalten.
      const rundenIds = new Set(runden.map((lauf) => lauf.id))
      const behalten = aktiveIdsRef.current.filter((id) => !rundenIds.has(id))
      setAktiveIds([kandidat.id, ...behalten])
      setAktivenLaufId(kandidat.id)
      return kandidat.id
    },
    [setAktiveIds, setAktivenLaufId],
  )

  /**
   * Legt ein neues Training aus den aktuellen Einstellungen an.
   *
   * Es startet mit einem vorbereiteten Satz, damit die Vorbereitung nicht mit
   * einem leeren Formular beginnt. Gemessen wird nichts; Läufe entstehen erst
   * beim Start eines Trainingssatzes.
   */
  const anlegeTraining = useCallback((): string | null => {
    if (!istAktiv()) return null
    const werte = einstellungen
    const training = neuesTraining({
      datum: heute(),
      bahnen: werte.bahnen,
      reihen: werte.reihen,
      aktive: werte.schwimmerProBahn,
      saetze: [
        neuerTrainingsSatz({
          konfiguration: { ...werte.konfiguration },
          wiederholungen: werte.wiederholungen,
          taktSek: werte.taktSek,
          startversatzMs: werte.startversatzMs,
        }),
      ],
    })
    setTrainingsSafe([training, ...trainingsRef.current])
    verfolge(saveTraining(training))
    return training.id
  }, [einstellungen, setTrainingsSafe, verfolge])

  /**
   * Speichert einen Trainingsplan (neu oder geändert).
   *
   * Ungültige Pläne werden verworfen, nicht teilweise übernommen. `pruefeTraining`
   * prüft Struktur (ID, Datumsformat, Bahnenzahl, Aktive, 1..20 gültige Sätze),
   * aber nicht, ob ein Satz schon gestartet ist — das entscheidet die
   * Oberfläche anhand des Fortschritts.
   */
  const speichereTraining = useCallback(
    (training: Training) => {
      if (!istAktiv()) return
      if (pruefeTraining(training) !== null) return
      const vorhanden = trainingsRef.current.some((eintrag) => eintrag.id === training.id)
      setTrainingsSafe(
        vorhanden
          ? trainingsRef.current.map((eintrag) =>
              eintrag.id === training.id ? training : eintrag,
            )
          : [training, ...trainingsRef.current],
      )
      verfolge(saveTraining(training))
    },
    [setTrainingsSafe, verfolge],
  )

  /**
   * Löscht nur den Trainingsplan. Bereits gestartete Sätze und ihre Läufe
   * bleiben im Verlauf — das Training ist Vorbereitung, nicht der Besitz der
   * Messungen.
   */
  const loescheTraining = useCallback(
    (id: string) => {
      if (!istAktiv()) return
      setTrainingsSafe(trainingsRef.current.filter((eintrag) => eintrag.id !== id))
      verfolge(deleteTraining(id))
    },
    [setTrainingsSafe, verfolge],
  )

  /**
   * Startet einen vorbereiteten Trainingssatz oder wählt ihn erneut aus.
   *
   * Erster Aufruf: Aus dem Trainingssatz entstehen ein `Satz` und — bei
   * mehreren Wiederholungen — alle Läufe auf einmal. Bahnenzahl und Aktive
   * werden aus dem Training kopiert; spätere Änderungen am Training schreiben
   * gemessene Läufe nicht um. Die Zuordnung `training.gestartet` merkt sich die
   * Satz-ID und macht den Aufruf idempotent: Ein zweiter Tap startet keine
   * zweite Messung, sondern wählt den bestehenden Satz über `aktiviereSatz`.
   *
   * Der Satz bekommt nur dann einen Plan, wenn es mehr als eine Wiederholung
   * gibt; ein einzelner Lauf bleibt ein normaler Lauf.
   *
   * Reihenfolge am Ende ist wichtig: erst State und Persistenz, dann Leiste,
   * dann `startAlle(now, …)`. So plant `startAlle` exakt die neuen Läufe mit
   * demselben Zeitstempel, ohne dass ein Render dazwischenkommt.
   *
   * Rückgabe ist die Anker-ID oder `null` bei ungültigem Plan.
   */
  const starteTrainingsSatz = useCallback(
    (
      trainingId: string,
      trainingsSatzId: string,
      now: number,
      wallNow: number,
    ): string | null => {
      if (!istAktiv()) return null
      const training = trainingsRef.current.find((eintrag) => eintrag.id === trainingId)
      const eintrag = training?.saetze.find((satz) => satz.id === trainingsSatzId)
      if (!training || !eintrag) return null
      if (pruefeTrainingsSatz(eintrag) !== null) return null

      // Schon gestartet? Dann nur auswählen — sonst entstünde eine zweite
      // Messung für denselben Trainingssatz.
      const vorhandenerSatz = training.gestartet[eintrag.id]
        ? satzeRef.current.find((satz) => satz.id === training.gestartet[eintrag.id])
        : undefined
      if (vorhandenerSatz) return aktiviereSatz(vorhandenerSatz)

      const satz: Satz = {
        id: newId(),
        datum: training.datum,
        bezeichnung: eintrag.bezeichnung.trim() || beschreibeTrainingsSatz(eintrag),
        konfiguration: { ...eintrag.konfiguration },
        plan:
          eintrag.wiederholungen > 1
            ? {
                wiederholungen: eintrag.wiederholungen,
                taktSek: eintrag.taktSek,
                startversatzMs: eintrag.startversatzMs,
              }
            : null,
        erstelltAm: Date.now(),
      }
      // Aktive und Bahnenzahl werden kopiert, nicht referenziert: Änderungen am
      // Training gelten nur für noch nicht gestartete Sätze. Die Personen sind
      // Reihe für Reihe abgelegt; `nummer` zählt innerhalb der Reihe.
      const bahnenInit = Array.from(
        { length: bahnenGesamt(training.bahnen, training.reihen) },
        (_, index) => ({
          nummer: (index % training.bahnen) + 1,
          reihe: Math.floor(index / training.bahnen) + 1,
          schwimmerId: training.aktive[index] ?? null,
        }),
      )
      const neueLaeufe = Array.from({ length: eintrag.wiederholungen }, (_, index) =>
        createLauf(eintrag.konfiguration, bahnenInit, satz.id, {
          startversatzMs: eintrag.startversatzMs,
          wiederholung: satz.plan ? index + 1 : null,
        }),
      )
      const anker = neueLaeufe[0]
      if (!anker) return null

      const naechstesTraining: Training = {
        ...training,
        gestartet: { ...training.gestartet, [eintrag.id]: satz.id },
      }
      setSatzeSafe([satz, ...satzeRef.current])
      setLaeufeSafe([...neueLaeufe, ...laeufeRef.current])
      setTrainingsSafe(
        trainingsRef.current.map((kandidat) =>
          kandidat.id === training.id ? naechstesTraining : kandidat,
        ),
      )
      // Satz, Trainingsverweis und Läufe gehören zusammen. Eine Transaktion
      // verhindert den Zustand „gestartet, aber ohne Läufe“ nach einem Abbruch.
      verfolge(saveMehrere({ satze: [satz], trainings: [naechstesTraining], laeufe: neueLaeufe }))

      setAktiveIds([...new Set([anker.id, ...aktiveIdsRef.current])])
      setAktivenLaufId(anker.id)
      // Erst anlegen, dann mit demselben Zeitstempel starten: Ein Takt von
      // mehreren Wiederholungen wird wie im Timer vorausberechnet.
      startAlle(now, wallNow)
      return anker.id
    },
    [
      aktiviereSatz,
      setAktiveIds,
      setAktivenLaufId,
      setLaeufeSafe,
      setSatzeSafe,
      setTrainingsSafe,
      startAlle,
      verfolge,
    ],
  )

  // Der Kontextwert wird memoisiert: Screens rendern nur neu, wenn sich Daten
  // oder Aktionen wirklich geändert haben. Alle Aktionen sind `useCallback`-
  // stabil; die Abhängigkeitsliste muss trotzdem jede davon enthalten, sonst
  // bekämen Screens eine veraltete Funktion.
  const value = useMemo<AppContextValue>(
    () => ({
      geladen,
      einstellungen,
      setzeEinstellungen,
      // Bewusst der Ladevorgang, keine Seitenaktualisierung: „Neu laden“ in den
      // Einstellungen liest den Bestand erneut, ohne die Messung zu verlieren.
      // Ein Reload normalisiert laufende Bahnen wie nach einem Neustart; die
      // Übergabe-Variante bleibt dem Tab-Koordinator vorbehalten.
      neuLaden: () => ladeDaten(),
      importiereBackup,
      loescheAlles,
      schwimmer,
      satze,
      laeufe,
      wettkampfe,
      trainings,
      aktiverLauf,
      aktiverSatz,
      aktiveRunden,
      aktiveEintraege,
      brauchtTakt,
      theme,
      themeEinstellung,
      toast,
      speicherFehler,
      // Die Rollen werden aus der einen Quelle `tabRolle` abgeleitet; Screens
      // sehen nur zwei boolesche Sichten darauf.
      tabGesperrt: tabRolle === 'gesperrt',
      tabAktiv: tabRolle === 'aktiv',
      uebernehmen,
      setzeTheme,
      zeigeToast,
      neuerLauf,
      anlegenLauf,
      waehleLauf,
      schliesseAktivenLauf,
      startAlle,
      tippe,
      tippeSerie,
      beende,
      beendeSerie,
      rueckgaengig,
      rueckgaengigSerie,
      setzeSchwimmer,
      setzeSchwimmerSerie,
      setzeSchwimmerImLauf,
      korrigiereAnschlag,
      setzeKonfiguration,
      verwerfeAktivenLauf,
      loescheLauf,
      loescheSatz,
      speichereSchwimmer,
      loescheSchwimmer,
      benenneSatz,
      erstelleWettkampf,
      benenneWettkampf,
      importiereWettkampf,
      erstelleWettkampfDisziplin,
      loescheWettkampf,
      starteWettkampfLauf,
      tippeWettkampf,
      rueckgaengigWettkampf,
      setzeWettkampfZeit,
      setzeWettkampfStatus,
      setzeWettkampfNamen,
      anlegeTraining,
      speichereTraining,
      loescheTraining,
      starteTrainingsSatz,
    }),
    [
      geladen,
      einstellungen,
      setzeEinstellungen,
      ladeDaten,
      importiereBackup,
      loescheAlles,
      schwimmer,
      satze,
      laeufe,
      wettkampfe,
      trainings,
      aktiverLauf,
      aktiverSatz,
      aktiveRunden,
      aktiveEintraege,
      brauchtTakt,
      theme,
      themeEinstellung,
      toast,
      speicherFehler,
      tabRolle,
      uebernehmen,
      setzeTheme,
      zeigeToast,
      neuerLauf,
      anlegenLauf,
      waehleLauf,
      schliesseAktivenLauf,
      startAlle,
      tippe,
      tippeSerie,
      beende,
      beendeSerie,
      rueckgaengig,
      rueckgaengigSerie,
      setzeSchwimmer,
      setzeSchwimmerSerie,
      setzeSchwimmerImLauf,
      korrigiereAnschlag,
      setzeKonfiguration,
      verwerfeAktivenLauf,
      loescheLauf,
      loescheSatz,
      speichereSchwimmer,
      loescheSchwimmer,
      benenneSatz,
      erstelleWettkampf,
      benenneWettkampf,
      importiereWettkampf,
      erstelleWettkampfDisziplin,
      loescheWettkampf,
      starteWettkampfLauf,
      tippeWettkampf,
      rueckgaengigWettkampf,
      setzeWettkampfZeit,
      setzeWettkampfStatus,
      setzeWettkampfNamen,
      anlegeTraining,
      speichereTraining,
      loescheTraining,
      starteTrainingsSatz,
      uebernehmen,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

/**
 * Zugriff auf den App-Kontext. Muss innerhalb von `AppProvider` verwendet
 * werden; außerhalb wirft der Hook mit einer verständlichen Meldung, statt
 * `undefined` weiterzureichen.
 */
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp muss innerhalb von AppProvider verwendet werden.')
  return ctx
}
