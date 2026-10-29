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
} from '../domain/types'
import {
  createLauf,
  rebaseLauf,
} from '../domain/lauf'
import {
  type WettkampfPlan,
} from '../domain/wettkampf'
import {
  istSerie,
  runden as rundenVon,
} from '../domain/serie'
import {
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
  deleteSchwimmer,
  deleteTraining,
  importBackup,
  loadAll,
  saveLauf,
  saveMehrere,
  saveSchwimmer,
  saveTraining,
} from '../storage/repository'
import type { Backup } from '../storage/backup'
import {
  begrenzeEinstellungen,
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
import { createLaufAktionen } from './laufAktionen'
import { createWettkampfAktionen } from './wettkampfAktionen'
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
  // Einstellungen für Aktionen, die zwischen zwei Renders laufen. Der State
  // bleibt die Anzeige; die Ref hält die Vorbelegung für `neuerLauf` aktuell.
  const einstellungenRef = useRef<Einstellungen>(einstellungen)
  const getEinstellungen = useCallback(() => einstellungenRef.current, [])

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
   * Lauf- und Serienaktionen. Sie bekommen die Ref-Spiegel, damit mehrere Taps
   * im selben Frame denselben Stand sehen, und bleiben über Renders stabil.
   */
  const laufAktionen = useMemo(
    () =>
      createLaufAktionen({
        istAktiv,
        verfolge,
        laeufeRef,
        satzeRef,
        aktiveIdsRef,
        aktiverLaufIdRef,
        setLaeufe: setLaeufeSafe,
        setSatze: setSatzeSafe,
        setAktiveIds,
        setAktivenLaufId,
        getEinstellungen,
        zeigeToast,
      }),
    [
      istAktiv,
      verfolge,
      setLaeufeSafe,
      setSatzeSafe,
      setAktiveIds,
      setAktivenLaufId,
      getEinstellungen,
      zeigeToast,
    ],
  )
  const {
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
    neuerLauf,
    anlegenLauf,
    waehleLauf,
    schliesseAktivenLauf,
    verwerfeAktivenLauf,
    loescheLauf,
    loescheSatz,
    benenneSatz,
    aktiviereSatz,
    aendereLauf,
  } = laufAktionen

  /** Wettkampfaktionen: Meldeliste, Heats und Disziplinen. */
  const wettkampfAktionen = useMemo(
    () =>
      createWettkampfAktionen({
        istAktiv,
        verfolge,
        laeufeRef,
        satzeRef,
        wettkampfeRef,
        schwimmerRef,
        aktiveIdsRef,
        aktiverLaufIdRef,
        setLaeufe: setLaeufeSafe,
        setSatze: setSatzeSafe,
        setWettkampfe: setWettkampfeSafe,
        setSchwimmer: setSchwimmerSafe,
        setAktiveIds,
        setAktivenLaufId,
        aendereLauf,
      }),
    [
      istAktiv,
      verfolge,
      setLaeufeSafe,
      setSatzeSafe,
      setWettkampfeSafe,
      setSchwimmerSafe,
      setAktiveIds,
      setAktivenLaufId,
      aendereLauf,
    ],
  )
  const {
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
  } = wettkampfAktionen

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
    einstellungenRef.current = bereinigt
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
