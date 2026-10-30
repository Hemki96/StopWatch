/**
 * Zentraler Zustand der App: Kontext-Assembly, Tab-Rolle, Laden und Toast.
 *
 * Verantwortlichkeiten:
 * - Bestand aus IndexedDB laden (beim Start und nach einer Tab-Übergabe).
 * - Einstellungen, Schwimmer, Sätze, Läufe und Trainings halten sowie die
 *   Liste der aktiven Läufe und den sichtbaren Lauf.
 * - Die Fachmodule verdrahten: `laufAktionen` und `trainingsAktionen` bekommen
 *   die Ref-Spiegel und schreiben über `useSchreibpfad`; `aktiveLaeufe` und
 *   `einstellungen` liefern Lesen und Normalisierung, `theme` die
 *   Designauflösung samt DOM-Spiegelung. Der Provider selbst hält nur noch den
 *   Rahmen.
 * - Mit anderen Tabs über `TabKoordinator` abstimmen. Nur der aktive Tab
 *   schreibt; alle anderen sind lesend.
 *
 * Invarianten:
 * - Jede persistierte Gruppe existiert doppelt: als React-State fürs Rendern
 *   und als Ref für Aktionen, die zwischen zwei Renders laufen. Beide werden
 *   nur gemeinsam über die `set...Safe`-Funktionen geändert.
 * - `Lauf`-Datensätze sind die einzige Quelle für Zeiten. Sätze und Trainings
 *   sind Rahmen; Serienrunden und Fortschritt werden daraus abgeleitet, nicht
 *   zusätzlich gespeichert.
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
  type Lauf,
  type LaufKonfiguration,
  type Satz,
  type Schwimmer,
  type Training,
} from '../domain/types'
import { rebaseLauf } from '../domain/lauf'
import {
  istSerie,
  runden as rundenVon,
} from '../domain/serie'
import { TabKoordinator, type TabRolle } from './tabKoordinator'
import {
  clearAll,
  importBackup,
  loadAll,
} from '../storage/repository'
import {
  erzeugeBackup,
  ermittleImportKonflikte as ermittleKonflikte,
  fordereSchutzAn,
  leseSchutz,
  pruefeBackupFuerImport,
  type Backup,
  type BackupKonflikte,
  type BackupVorschau,
  type ImportKonflikte,
  type KonfliktAufloesung,
  type SpeicherSchutz,
} from './daten'
import {
  begrenzeEinstellungen,
  leseEinstellungen,
  schreibeEinstellungen,
  type Einstellungen,
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
import {
  useTheme,
  type Theme,
  type ThemeEinstellung,
} from './theme'
import { createLaufAktionen } from './laufAktionen'
import { createSchwimmerAktionen } from './schwimmerAktionen'
import { createTrainingsAktionen } from './trainingsAktionen'
import { useSchreibpfad } from './schreibpfad'

export { leseEinstellungen } from './einstellungen'
export type { Einstellungen } from './einstellungen'
export type { Theme, ThemeEinstellung } from './theme'
export type { Backup, ImportKonflikte, KonfliktAufloesung, SpeicherSchutz } from './daten'

export type { AktiverEintrag } from './aktiveLaeufe'

/**
 * Öffentliche Schnittstelle des Providers. Screens greifen ausschließlich
 * hierüber auf Daten und Aktionen zu.
 *
 * Die Felder zerfallen in vier Gruppen:
 * - Bestand (lesend): `schwimmer`, `satze`, `laeufe`, `trainings`.
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
   *
   * `aufloesung` entscheidet über Kollisionen: Ohne Angabe bleibt der lokale
   * Datensatz erhalten. Die Rückgabe nennt die tatsächlich erkannten Konflikte.
   */
  importiereBackup: (
    backup: Backup,
    aufloesung?: KonfliktAufloesung,
  ) => Promise<BackupKonflikte>
  /** Erzeugt ein Backup des kompletten Bestands; geschrieben wird über `export/`. */
  exportiereBackup: () => Promise<Backup>
  /**
   * Prüft einen geparsten Backup-Inhalt für die Import-Vorschau. Es wird nichts
   * geschrieben; erst `importiereBackup` übernimmt die Daten.
   */
  pruefeBackupFuerImport: (inhalt: unknown) => BackupVorschau
  /**
   * Vergleicht ein geprüftes Backup mit dem lokalen Bestand, ohne zu schreiben.
   * Liefert Anzahl und Art der Kollisionen samt Text für die Vorschau.
   */
  ermittleImportKonflikte: (backup: Backup) => Promise<ImportKonflikte>
  /** Zuletzt gelesener Zustand des dauerhaften Speichers. */
  speicherSchutz: SpeicherSchutz
  /** Fordert dauerhaften Speicher an und liefert den resultierenden Zustand. */
  fordereSpeicherSchutz: () => Promise<SpeicherSchutz>
  /** Leert alle fünf Bestände und lädt neu; ebenfalls nur im aktiven Tab. */
  loescheAlles: () => Promise<void>
  geladen: boolean
  schwimmer: Schwimmer[]
  satze: Satz[]
  laeufe: Lauf[]
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
  /** Benennt einen Tag im Verlauf; der Name gilt für alle Sätze des Datums. */
  benenneTag: (datum: string, bezeichnung: string) => void
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
 * gesammelt gemeldet und vorher kurz erneut versucht (siehe `useSchreibpfad`).
 */
export function AppProvider({ children }: { children: ReactNode }) {
  // ---- Zustandsgruppen -----------------------------------------------------
  // geladen: Abschluss des ersten Ladevorgangs, unabhängig von dessen Ausgang.
  // Bestand (IndexedDB), in dieser Reihenfolge deklariert:
  //   schwimmer  Stammdaten der Personen, namenssortiert gehalten.
  //   satze      Rahmen/Gruppen; ein Satz mit `plan` ist eine Serie. Trägt
  //              keine Zeiten.
  //   laeufe     die Messungen: Bahnen mit Startzeit und Anschlägen. Einzige
  //              Quelle für Zeiten, Splits, Ziel und Bestzeiten.
  //   trainings  Vorbereitung: Aktive und noch nicht gestartete Sätze.
  // Auswahl (localStorage): aktiverLaufId (sichtbarer Lauf) und aktiveIds
  //   (Leiste oben, ein Eintrag pro Lauf oder Serie).
  // Design: `useTheme` kapselt gespeicherte Wahl, Live-Systemabfrage und die
  // Spiegelung in DOM und Browser-Chrome.
  // Einstellungen: Vorbelegung des nächsten Laufs.
  // Flüchtig: toast, speicherFehler, tabRolle.
  const [geladen, setGeladen] = useState(false)
  const [schwimmer, setSchwimmer] = useState<Schwimmer[]>([])
  const [satze, setSatze] = useState<Satz[]>([])
  const [laeufe, setLaeufe] = useState<Lauf[]>([])
  const [trainings, setTrainings] = useState<Training[]>([])
  const [aktiverLaufId, setAktiverLaufId] = useState<string | null>(null)
  const [aktiveIds, setAktiveIdsState] = useState<string[]>(() => leseAktiveIds())
  const { theme, themeEinstellung, setzeTheme } = useTheme()
  const [einstellungen, setEinstellungenState] = useState<Einstellungen>(() => leseEinstellungen())
  const [toast, setToast] = useState<string | null>(null)
  const [tabRolle, setTabRolle] = useState<TabRolle>('startet')
  // Speicherschutz ist kein Bestand, sondern eine Browser-Zusage. Der Wert wird
  // beim Start gelesen und nach einer Anfrage aktualisiert; bis dahin gilt
  // `unbekannt`.
  const [speicherSchutz, setSpeicherSchutz] = useState<SpeicherSchutz>('unbekannt')
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
    benenneTag,
    aktiviereSatz,
  } = laufAktionen

  /** Trainingsaktionen: Pläne anlegen, speichern und starten. */
  const trainingsAktionen = useMemo(
    () =>
      createTrainingsAktionen({
        istAktiv,
        verfolge,
        laeufeRef,
        satzeRef,
        trainingsRef,
        aktiveIdsRef,
        setLaeufe: setLaeufeSafe,
        setSatze: setSatzeSafe,
        setTrainings: setTrainingsSafe,
        setAktiveIds,
        setAktivenLaufId,
        getEinstellungen,
        startAlle,
        aktiviereSatz,
      }),
    [
      istAktiv,
      verfolge,
      setLaeufeSafe,
      setSatzeSafe,
      setTrainingsSafe,
      setAktiveIds,
      setAktivenLaufId,
      getEinstellungen,
      startAlle,
      aktiviereSatz,
    ],
  )
  const { anlegeTraining, speichereTraining, loescheTraining, starteTrainingsSatz } =
    trainingsAktionen

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
   * erneut, damit kein Aufrufer sie überspringen kann. Dort werden auch die
   * Konflikte gegen den aktuellen Stand neu ermittelt; `aufloesung` legt fest,
   * ob der lokale Stand bleibt (Standard) oder das Backup ihn ersetzt.
   */
  const importiereBackup = useCallback(
    async (backup: Backup, aufloesung: KonfliktAufloesung = 'lokalBehalten') => {
      if (!istAktiv()) {
        throw new Error('Nur der aktive Tab darf ein Backup importieren.')
      }
      return verfolge(() =>
        importBackup(backup, { konflikte: aufloesung }).then(async (konflikte) => {
          await ladeDaten()
          return konflikte
        }),
      )
    },
    [istAktiv, ladeDaten, verfolge],
  )

  /** Leert alle Bestände und lädt neu; nur der aktive Tab darf das. */
  const loescheAlles = useCallback(async () => {
    if (!istAktiv()) {
      throw new Error('Nur der aktive Tab darf alle Daten löschen.')
    }
    const vorgang = verfolge(() => clearAll().then(() => ladeDaten()))
    await vorgang
  }, [istAktiv, ladeDaten, verfolge])

  /**
   * Fordert dauerhaften Speicher an und hält das Ergebnis im Kontext.
   *
   * Die Anfrage beim App-Start macht `main.tsx` unabhängig vom Rendern. Hier
   * wird nur auf Wunsch der Einstellungen erneut gefragt; der Rückgabewert
   * erlaubt dem Screen eine passende Meldung.
   */
  const fordereSpeicherSchutz = useCallback(async () => {
    const status = await fordereSchutzAn()
    setSpeicherSchutz(status)
    return status
  }, [])

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

  /**
   * Speicherschutz einmal lesen, ohne ihn anzufordern. Die Anfrage beim Start
   * erledigt `main.tsx`; die Einstellungen zeigen nur den Zustand an.
   * `abgebrochen` verhindert ein Setzen nach dem Unmount (StrictMode führt den
   * Effekt in der Entwicklung doppelt aus).
   */
  useEffect(() => {
    let abgebrochen = false
    void leseSchutz().then((status) => {
      if (!abgebrochen) setSpeicherSchutz(status)
    })
    return () => {
      abgebrochen = true
    }
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

  /** Schwimmeraktionen: Stammdaten pflegen, Zuordnungen beim Löschen räumen. */
  const schwimmerAktionen = useMemo(
    () =>
      createSchwimmerAktionen({
        istAktiv,
        verfolge,
        schwimmerRef,
        laeufeRef,
        trainingsRef,
        setSchwimmer: setSchwimmerSafe,
        setLaeufe: setLaeufeSafe,
        setTrainings: setTrainingsSafe,
        getEinstellungen,
        setzeEinstellungen,
      }),
    [
      istAktiv,
      verfolge,
      setSchwimmerSafe,
      setLaeufeSafe,
      setTrainingsSafe,
      getEinstellungen,
      setzeEinstellungen,
    ],
  )
  const { speichereSchwimmer, loescheSchwimmer } = schwimmerAktionen

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
   * Bittet den Koordinator, die Messung aus dem anderen Tab zu übernehmen.
   * Wirksam nur, wenn dieser Tab gerade gesperrt ist; der eigentliche Wechsel
   * läuft über `yield`/`takeover` im Koordinator.
   */
  const uebernehmen = useCallback(() => {
    koordinatorRef.current?.uebernehmen()
  }, [])

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
      // Backup lesen und prüfen sind reine Storage-Zugriffe; der Provider reicht
      // sie durch, damit `ui/` nichts aus `storage/` importiert.
      exportiereBackup: erzeugeBackup,
      pruefeBackupFuerImport,
      ermittleImportKonflikte: ermittleKonflikte,
      speicherSchutz,
      fordereSpeicherSchutz,
      loescheAlles,
      schwimmer,
      satze,
      laeufe,
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
      benenneTag,
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
      speicherSchutz,
      fordereSpeicherSchutz,
      loescheAlles,
      schwimmer,
      satze,
      laeufe,
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
      benenneTag,
      anlegeTraining,
      speichereTraining,
      loescheTraining,
      starteTrainingsSatz,
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
