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
 *   (`tabAktivRef`). Das verhindert doppelte Schreibvorgänge aus zwei Tabs.
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
  SCHWIMMARTEN,
  type Beckenlaenge,
  type Lauf,
  type LaufKonfiguration,
  type Satz,
  type Schwimmer,
  type Schwimmart,
  type Training,
  type Wettkampf,
} from '../domain/types'
import {
  createLauf,
  finishLane,
  hasStarted,
  hatLaufendeBahn,
  isComplete,
  isFinished,
  korrigiereAnschlag as korrigiereAnschlagImLauf,
  planeLauf,
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
  beschreibeTrainingsSatz,
  neuerTrainingsSatz,
  neuesTraining,
  pruefeTraining,
  pruefeTrainingsSatz,
} from '../domain/training'
import { newId } from '../domain/id'
import { TabKoordinator, type TabRolle } from './tabKoordinator'
import {
  deleteLauf,
  deleteSatzUndLaeufe,
  deleteSchwimmer,
  deleteTraining,
  deleteWettkampfUndDaten,
  loadAll,
  saveLauf,
  saveSatz,
  saveSchwimmer,
  saveTraining,
  saveWettkampf,
} from '../storage/repository'

/** Das tatsächlich angewendete Design. */
export type Theme = 'dark' | 'light'

/**
 * Die gespeicherte Wahl. `system` folgt der Betriebssystem-Einstellung und wird
 * erst über `theme` im Kontext in ein konkretes `Theme` aufgelöst.
 */
export type ThemeEinstellung = Theme | 'system'

/**
 * Vorbelegung für den nächsten Lauf.
 *
 * Diese Werte werden beim Anlegen kopiert und nicht von laufenden Läufen
 * geteilt; eine Änderung hier darf eine laufende Messung nicht umschreiben.
 * Gespeichert wird in `localStorage`, nicht in IndexedDB — die Einstellungen
 * sind deshalb nicht Teil des JSON-Backups.
 */
export interface Einstellungen {
  konfiguration: LaufKonfiguration
  bahnen: number
  /** Vorbelegung der Bahnen für den nächsten Lauf. */
  schwimmerProBahn: (string | null)[]
  /** Abstand zwischen den Starts der Bahnen in ms. 0 = gemeinsam. */
  startversatzMs: number
  /** Wiederholungen der nächsten Serie; 1 = einzelner Lauf. */
  wiederholungen: number
  /** Takt zwischen zwei Wiederholungen in Sekunden. */
  taktSek: number
}

/**
 * Ein Eintrag der Leiste oben.
 *
 * Bei einer Serie ist `lauf` die Ankerwiederholung (Runde 1), `satz` der Satz
 * mit Plan und `serie` wahr. Auf diese Weise erscheint eine Serie als ein
 * Eintrag, nicht als fünf. `lauf` kann auch der zuletzt gewählte Lauf sein,
 * wenn die Anker-ID nicht mehr in der Leiste steht.
 */
export interface AktiverEintrag {
  /** Anker-Lauf in der Leiste; bei einer Serie die erste Wiederholung. */
  id: string
  lauf: Lauf
  satz: Satz | null
  serie: boolean
}

/** Standard-Bahnenzahl, wenn weder gespeichert noch eingegeben etwas Brauchbares vorliegt. */
const STANDARD_BAHNEN = 6

/** Nur der allererste Start (kein lesbarer Speicher) verwendet diese Werte. */
const STANDARD_EINSTELLUNGEN: Einstellungen = {
  konfiguration: { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' },
  bahnen: STANDARD_BAHNEN,
  schwimmerProBahn: Array.from({ length: STANDARD_BAHNEN }, () => null),
  startversatzMs: 0,
  wiederholungen: 1,
  taktSek: 120,
}

/**
 * Bringt eine beliebige gespeicherte Bahnbelegung auf genau `bahnen` Plätze.
 *
 * Zu kurze Listen werden mit `null` aufgefüllt, zu lange abgeschnitten, leere
 * Zeichenketten gelten als „keine Zuordnung“. So kann eine geänderte
 * Bahnenzahl nie zu einer verschobenen Zuordnung führen.
 */
function normalisiereSchwimmerProBahn(liste: unknown, bahnen: number): (string | null)[] {
  const werte = Array.isArray(liste) ? liste : []
  return Array.from({ length: bahnen }, (_, i) => {
    const wert = werte[i]
    return typeof wert === 'string' && wert.length > 0 ? wert : null
  })
}

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
    optionen?: { startversatzMs?: number; wiederholungen?: number; taktSek?: number },
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
 * `localStorage`-Schlüssel der Oberflächenauswahl. Bewusst flach und stabil
 * gehalten, weil sie auch das Onboarding-Gate in `App.tsx` und die E2E-Tests
 * lesen. Sie enthalten nur Verweise (IDs) und Einstellungen, keine Zeiten.
 */
const THEME_KEY = 'beckenrand.theme'
const ACTIVE_KEY = 'beckenrand.aktiverLauf'
const ACTIVE_LIST_KEY = 'beckenrand.aktiveLaeufe'
const EINSTELLUNGEN_KEY = 'beckenrand.einstellungen'

/**
 * Safari im privaten Modus und blockierte Cookies lassen `localStorage`
 * bereits beim Lesen werfen. Die App muss dann weiterlaufen — nur ohne
 * gemerkte Auswahl, nicht mit einer weißen Seite.
 */
function leseText(schluessel: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(schluessel)
  } catch {
    return null
  }
}

/**
 * Schreibt einen Wert nach `localStorage` und schluckt Fehler.
 *
 * Ein voller oder gesperrter Speicher darf die Bedienung nicht unterbrechen;
 * die Sitzung läuft dann ohne gemerkte Auswahl weiter. Persistente Daten
 * (Läufe, Sätze, …) gehen dagegen über IndexedDB und melden Fehler über das
 * Banner.
 */
function schreibeText(schluessel: string, wert: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(schluessel, wert)
  } catch {
    // ohne Speicher bleibt die Sitzung bedienbar
  }
}

function entferneText(schluessel: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(schluessel)
  } catch {
    // siehe oben
  }
}

/**
 * Klemmt den Startversatz auf 0 … 120 s und rundet auf ganze Sekunden.
 *
 * Die Grenze ist eine Bedienentscheidung, keine Domänenregel: Ein Versatz über
 * zwei Minuten ist am Beckenrand nicht mehr sinnvoll und würde nur die
 * Countdown-Anzeige verstopfen.
 */
function begrenzeVersatz(wert: unknown): number {
  if (typeof wert !== 'number' || !Number.isFinite(wert)) return 0
  return Math.min(120_000, Math.max(0, Math.round(wert / 1000) * 1000))
}

/**
 * Begrenzt die Wiederholungen einer Serie auf 1 … 20 (wie `MAX_WIEDERHOLUNGEN`
 * im Trainingsmodell). 1 bedeutet „kein Plan“, also einen einzelnen Lauf.
 */
function begrenzeWiederholungen(wert: unknown): number {
  if (typeof wert !== 'number' || !Number.isFinite(wert)) return 1
  return Math.min(20, Math.max(1, Math.round(wert)))
}

/**
 * Begrenzt den Takt auf 10 … 3600 s. Unter 10 s wäre ein Takt kein Takt mehr,
 * über einer Stunde passt er nicht mehr zu einer Trainingseinheit.
 */
function begrenzeTakt(wert: unknown): number {
  if (typeof wert !== 'number' || !Number.isFinite(wert)) return 120
  return Math.min(3600, Math.max(10, Math.round(wert)))
}

/**
 * Liest die aktiven Lauf-IDs; die alte Einzel-ID bleibt als Migration lesbar.
 *
 * Reihenfolge: zuerst die Liste, dann der alte Einzelwert. Kaputtes JSON fällt
 * still auf die Einzel-ID zurück, damit ein abgebrochener Schreibvorgang nicht
 * die ganze Leiste kostet.
 */
function leseAktiveIds(): string[] {
  const roh = leseText(ACTIVE_LIST_KEY)
  if (roh) {
    try {
      const geparst: unknown = JSON.parse(roh)
      if (Array.isArray(geparst)) {
        return geparst.filter((wert): wert is string => typeof wert === 'string' && wert.length > 0)
      }
    } catch {
      // Ohne lesbaren Speicher startet die App ohne aktive Läufe.
    }
  }
  const alt = leseText(ACTIVE_KEY)
  return alt ? [alt] : []
}

/**
 * Entfernt verwaiste und vollständig beendete Einträge. Eine Serie bleibt
 * aktiv, solange irgendeine ihrer Wiederholungen offen ist; ihr Anker ist die
 * erste Wiederholung, damit die Leiste nicht fünf Chips für einen Satz zeigt.
 *
 * Regeln im Einzelnen:
 * - Unbekannte IDs (gelöschter Lauf) fallen weg.
 * - Wettkampf-Läufe erscheinen nie in der Trainingsleiste; sie werden im
 *   Wettkampf-Tab bedient.
 * - Vollständig beendete Läufe und Serien werden ausgeblendet, bleiben aber im
 *   Verlauf. Nach einem Neustart ist die Leiste dadurch aufgeräumt.
 * - Doppelte Einträge derselben Serie bzw. desselben Laufs werden über
 *   `gesehen` zusammengefasst.
 */
function bereinigeAktiveIds(ids: string[], laeufe: Lauf[], satze: Satz[]): string[] {
  const ergebnis: string[] = []
  const gesehen = new Set<string>()
  for (const id of ids) {
    const lauf = laeufe.find((eintrag) => eintrag.id === id)
    if (!lauf || lauf.modus === 'wettkampf') continue
    const satz = satze.find((eintrag) => eintrag.id === lauf.satzId)
    if (istSerie(satz) && satz) {
      const runden = rundenVon(laeufe, satz.id)
      if (runden.length === 0 || runden.every(isComplete)) continue
      const schluessel = `satz:${satz.id}`
      if (gesehen.has(schluessel)) continue
      gesehen.add(schluessel)
      ergebnis.push(runden[0]!.id)
      continue
    }
    if (isComplete(lauf)) continue
    const schluessel = `lauf:${lauf.id}`
    if (gesehen.has(schluessel)) continue
    gesehen.add(schluessel)
    ergebnis.push(lauf.id)
  }
  return ergebnis
}

/**
 * Liest und bereinigt die gespeicherten Einstellungen. Für Tests exportiert.
 *
 * Jedes Feld wird einzeln geprüft: Ein kaputter Teil fällt auf seinen
 * Standardwert zurück, statt alle Einstellungen zu verwerfen. Nur ein
 * unlesbarer Datensatz führt komplett zu `STANDARD_EINSTELLUNGEN`.
 * Die Strecke muss positiv und ein Vielfaches der Beckenlänge sein; sonst gilt
 * der Standard. `null` ist dagegen ein gültiger Wert (offene Strecke).
 */
export function leseEinstellungen(): Einstellungen {
  const roh = leseText(EINSTELLUNGEN_KEY)
  if (!roh) return STANDARD_EINSTELLUNGEN
  try {
    const geparst: unknown = JSON.parse(roh)
    if (typeof geparst !== 'object' || geparst === null) return STANDARD_EINSTELLUNGEN
    const parsed = geparst as Partial<Einstellungen>
    const roheKonfiguration: Partial<LaufKonfiguration> =
      typeof parsed.konfiguration === 'object' && parsed.konfiguration !== null
        ? parsed.konfiguration
        : STANDARD_EINSTELLUNGEN.konfiguration
    const beckenlaengeM: Beckenlaenge = roheKonfiguration.beckenlaengeM === 25 ? 25 : 50
    const roheStrecke = roheKonfiguration.streckeM
    // `null` bleibt erhalten und bedeutet „offene Strecke“; nur ein
    // unbrauchbarer Zahlenwert fällt auf den Standard zurück.
    const streckeM =
      roheStrecke === null
        ? null
        : typeof roheStrecke === 'number' &&
            Number.isFinite(roheStrecke) &&
            roheStrecke > 0 &&
            roheStrecke % beckenlaengeM === 0
          ? Math.round(roheStrecke)
          : STANDARD_EINSTELLUNGEN.konfiguration.streckeM
    const schwimmart =
      SCHWIMMARTEN.find((eintrag) => eintrag.wert === roheKonfiguration.schwimmart)?.wert ??
      'freistil'
    const bahnen =
      typeof parsed.bahnen === 'number' && Number.isFinite(parsed.bahnen)
        ? parsed.bahnen
        : STANDARD_EINSTELLUNGEN.bahnen
    const begrenzt = Math.min(MAX_BAHNEN, Math.max(1, Math.round(bahnen)))
    return {
      konfiguration: { beckenlaengeM, streckeM, schwimmart },
      bahnen: begrenzt,
      schwimmerProBahn: normalisiereSchwimmerProBahn(parsed.schwimmerProBahn, begrenzt),
      startversatzMs: begrenzeVersatz(parsed.startversatzMs),
      wiederholungen: begrenzeWiederholungen(parsed.wiederholungen),
      taktSek: begrenzeTakt(parsed.taktSek),
    }
  } catch {
    return STANDARD_EINSTELLUNGEN
  }
}

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
    a.schwimmart === b.schwimmart
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
 * Liest die Designwahl. Unbekannte oder fehlende Werte ergeben `system`, damit
 * eine ältere oder manipulierte Einstellung nie zu einem unsichtbaren Design
 * führt.
 */
function leseThemeEinstellung(): ThemeEinstellung {
  const gespeichert = leseText(THEME_KEY)
  if (gespeichert === 'light' || gespeichert === 'dark' || gespeichert === 'system') {
    return gespeichert
  }
  return 'system'
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
 * gesammelt gemeldet (siehe `meldeSpeicherFehler`).
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
  const [speicherFehler, setSpeicherFehler] = useState(false)
  const [tabRolle, setTabRolle] = useState<TabRolle>('startet')

  // Ref-Spiegel des States. Aktionen laufen in `useCallback`s und sähen sonst
  // den Stand des letzten Renders; mehrere Taps im selben Frame würden sich
  // gegenseitig überschreiben. Gelesen wird immer aus den Refs, geschrieben
  // über die `set...Safe`-Funktionen.
  const laeufeRef = useRef<Lauf[]>([])
  const satzeRef = useRef<Satz[]>([])
  const wettkampfeRef = useRef<Wettkampf[]>([])
  const trainingsRef = useRef<Training[]>([])
  const aktiverLaufIdRef = useRef<string | null>(null)
  const aktiveIdsRef = useRef<string[]>([])
  const speicherFehlerRef = useRef(false)
  // Spiegelt die Tab-Rolle für Aktionen. Die Wahrheit hält der Koordinator;
  // hier steht nur, ob dieser Tab schreiben darf.
  const tabAktivRef = useRef(false)
  const koordinatorRef = useRef<TabKoordinator | null>(null)
  // Offene Schreibvorgänge, damit eine Tab-Übergabe auf sie warten kann
  // (siehe `vorUebergabe` beim Koordinator).
  const schreibvorgaengeRef = useRef(new Set<Promise<unknown>>())
  // Immer die aktuelle Lade-Funktion. Der Koordinator wird vor dem Lade-Effekt
  // erzeugt; über diese Ref kann er trotzdem nachladen, wenn er die Rolle
  // „aktiv“ erhält, ohne dass der Effekt neu laufen muss.
  const ladeDatenRef = useRef<(() => Promise<void>) | null>(null)

  // Ref und State werden ausschließlich zusammen gesetzt: Aktionen lesen die
  // Ref, das Rendern den State. Ein Auseinanderlaufen würde Taps verlieren.
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
    schreibeText(ACTIVE_LIST_KEY, JSON.stringify(ids))
  }, [])

  /**
   * Wechselt den sichtbaren Lauf. Maßgeblich ist `aktiveIds`; der Einzelwert
   * unter `ACTIVE_KEY` bleibt als Migrationspfad erhalten, damit ältere Stände
   * weiterhin gelesen werden können (`leseAktiveIds`).
   */
  const setAktivenLaufId = useCallback((id: string | null) => {
    aktiverLaufIdRef.current = id
    setAktiverLaufId(id)
    if (id) schreibeText(ACTIVE_KEY, id)
    else entferneText(ACTIVE_KEY)
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
   * Speicherfehler werden zu einem dauerhaften Banner. Ein Toast pro Tap wäre
   * bei sechs Bahnen sechsmal dieselbe Meldung und damit unlesbar.
   */
  const meldeSpeicherFehler = useCallback(() => {
    console.error('Speichern im lokalen Speicher fehlgeschlagen.')
    if (speicherFehlerRef.current) return
    speicherFehlerRef.current = true
    setSpeicherFehler(true)
  }, [])

  /**
   * Verfolgt Schreibvorgänge, damit eine Tab-Übergabe nichts verliert.
   *
   * Fehler landen gesammelt im Banner statt in einem unbehandelten Promise;
   * eine Tab-Übergabe wartet über `warteAufSchreibvorgaenge` auf alle offenen
   * Vorgänge. Der Eintrag wird in jedem Fall entfernt, damit die Menge nicht
   * wächst.
   */
  const verfolge = useCallback(
    <T,>(vorgang: Promise<T>): Promise<T> => {
      schreibvorgaengeRef.current.add(vorgang)
      vorgang
        .catch(() => meldeSpeicherFehler())
        .finally(() => schreibvorgaengeRef.current.delete(vorgang))
      return vorgang
    },
    [meldeSpeicherFehler],
  )

  /**
   * Wartet auf alle offenen Schreibvorgänge, ohne zu scheitern.
   *
   * `allSettled` ist bewusst gewählt: Ein fehlgeschlagener Schreibvorgang darf
   * eine Tab-Übergabe nicht blockieren, sonst bliebe der neue Tab lesend.
   */
  const warteAufSchreibvorgaenge = useCallback(
    () => Promise.allSettled([...schreibvorgaengeRef.current]).then(() => undefined),
    [],
  )

  /**
   * Lädt den kompletten Bestand und gleicht die Auswahl damit ab.
   *
   * Reihenfolge ist wichtig: Erst kommen die Daten in State und Refs, dann wird
   * die gespeicherte Leiste bereinigt — dafür werden die geladenen Läufe und
   * Sätze gebraucht. Ist danach nichts mehr aktiv, wird der zuletzt gestartete
   * offene Lauf als Kandidat angenommen, damit die Leiste nach einem Neustart
   * nicht leer wirkt.
   *
   * Wird auch bei jeder Tab-Übernahme aufgerufen. Alle Schritte lesen nur und
   * sind deshalb wiederholbar.
   */
  const ladeDaten = useCallback(async () => {
    const daten = await loadAll()
    setSchwimmer(daten.schwimmer)
    setSatzeSafe(daten.satze)
    setLaeufeSafe(daten.laeufe)
    setWettkampfeSafe(daten.wettkampfe)
    setTrainingsSafe(daten.trainings)

    // Verwaiste und vollständig beendete Einträge fallen weg. Bleibt nichts
    // übrig, wird der zuletzt gestartete offene Lauf angeboten; bei einer Serie
    // ist das ihr Anker, nicht die zuletzt gestartete Wiederholung.
    let aktive = bereinigeAktiveIds(leseAktiveIds(), daten.laeufe, daten.satze)
    if (aktive.length === 0) {
      const kandidat = [...daten.laeufe]
        .sort((a, b) => (b.startWallMs ?? 0) - (a.startWallMs ?? 0))
        .find((lauf) => !isComplete(lauf) && lauf.modus !== 'wettkampf')
      if (kandidat) {
        const satz = daten.satze.find((eintrag) => eintrag.id === kandidat.satzId)
        const anker =
          istSerie(satz) && satz ? (rundenVon(daten.laeufe, satz.id)[0] ?? kandidat) : kandidat
        aktive = [anker.id]
      }
    }
    setAktiveIds(aktive)

    // Sichtbaren Lauf nur übernehmen, wenn er noch in der Leiste steht. Sonst
    // beginnt die App mit dem ersten verfügbaren Eintrag oder ohne Auswahl.
    const gemerkt = leseText(ACTIVE_KEY)
    const auswahl = gemerkt && aktive.includes(gemerkt) ? gemerkt : (aktive[0] ?? null)
    setAktivenLaufId(auswahl)

    // Ein noch offener Lauf mit erfasstem Anschlag ist der unterbrochene Lauf:
    // `performance.now()` ist nach einem Reload wertlos, die Zeiten bleiben aber
    // im Verlauf. Der Hinweis erscheint auch nach einer Tab-Übergabe — er ist
    // bewusst nur eine Information, keine Fehlermeldung.
    const kandidat = auswahl ? daten.laeufe.find((lauf) => lauf.id === auswahl) : null
    if (kandidat?.bahnen.some((bahn) => bahn.anschlaege.length > 0)) {
      zeigeToast('Der letzte Lauf wurde unterbrochen. Erfasste Zeiten bleiben erhalten.')
    }
  }, [
    setAktiveIds,
    setAktivenLaufId,
    setLaeufeSafe,
    setSatzeSafe,
    setWettkampfeSafe,
    setTrainingsSafe,
    zeigeToast,
    meldeSpeicherFehler,
  ])

  // Die Ref zeigt immer auf die jüngste Fassung. Der Koordinator greift darauf
  // zu, statt `ladeDaten` als Abhängigkeit zu binden — sonst würde jede neue
  // Funktionsidentität den Koordinator neu starten und die Tab-Rolle verlieren.
  ladeDatenRef.current = ladeDaten

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
        tabAktivRef.current = rolle === 'aktiv'
        setTabRolle(rolle)
        if (rolle === 'aktiv') {
          // Nach einer Übergabe den Stand des vorherigen Tabs übernehmen.
          // Schlägt das Lesen fehl, bleibt der aktuelle Stand bedienbar.
          void ladeDatenRef.current?.().catch(() => meldeSpeicherFehler())
        }
      },
      vorUebergabe: warteAufSchreibvorgaenge,
    })
    koordinatorRef.current = koordinator
    koordinator.start()

    const beiSeitenende = () => koordinator.stop()
    window.addEventListener('pagehide', beiSeitenende)
    return () => {
      window.removeEventListener('pagehide', beiSeitenende)
      koordinator.stop()
      koordinatorRef.current = null
    }
  }, [meldeSpeicherFehler, warteAufSchreibvorgaenge])

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
        meldeSpeicherFehler()
      })
    return () => {
      abgebrochen = true
    }
  }, [ladeDaten, meldeSpeicherFehler])

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
    schreibeText(THEME_KEY, einstellung)
  }, [])

  /**
   * Übernimmt und bereinigt neue Einstellungen und speichert sie sofort.
   *
   * Alle Grenzen werden hier erneut angewendet, obwohl die Oberfläche sie schon
   * begrenzt: Der Provider ist die einzige Schreibstelle und darf sich nicht
   * darauf verlassen, dass jeder Aufrufer brav validiert.
   */
  const setzeEinstellungen = useCallback((naechste: Einstellungen) => {
    const bahnen =
      typeof naechste.bahnen === 'number' && Number.isFinite(naechste.bahnen)
        ? Math.min(MAX_BAHNEN, Math.max(1, Math.round(naechste.bahnen)))
        : STANDARD_EINSTELLUNGEN.bahnen
    const bereinigt: Einstellungen = {
      ...naechste,
      bahnen,
      schwimmerProBahn: normalisiereSchwimmerProBahn(naechste.schwimmerProBahn, bahnen),
      startversatzMs: begrenzeVersatz(naechste.startversatzMs),
      wiederholungen: begrenzeWiederholungen(naechste.wiederholungen),
      taktSek: begrenzeTakt(naechste.taktSek),
    }
    setEinstellungenState(bereinigt)
    schreibeText(EINSTELLUNGEN_KEY, JSON.stringify(bereinigt))
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
   * Die Leiste oben: ein Eintrag je Lauf oder Serie, dedupliziert wie in
   * `bereinigeAktiveIds`. Verwaiste IDs werden still übersprungen, damit ein
   * gelöschter Lauf keinen leeren Chip hinterlässt.
   */
  const aktiveEintraege = useMemo<AktiverEintrag[]>(() => {
    const gesehen = new Set<string>()
    const ergebnis: AktiverEintrag[] = []
    for (const id of aktiveIds) {
      const lauf = laeufe.find((eintrag) => eintrag.id === id)
      if (!lauf) continue
      const satz = lauf.satzId
        ? (satze.find((eintrag) => eintrag.id === lauf.satzId) ?? null)
        : null
      const serie = istSerie(satz)
      const schluessel = serie && satz ? `satz:${satz.id}` : `lauf:${lauf.id}`
      if (gesehen.has(schluessel)) continue
      gesehen.add(schluessel)
      ergebnis.push({ id: lauf.id, lauf, satz, serie })
    }
    return ergebnis
  }, [aktiveIds, laeufe, satze])

  /**
   * Wahr, solange irgendein aktiver Lauf plant oder läuft. Steuert in den
   * Screens die Animationsschleife (`useNow`) und den Wake Lock; bei `false`
   * laufen keine Frames und der Bildschirm darf schlafen.
   *
   * Bewusst aus den Daten abgeleitet und nicht als Flag gepflegt: Ein
   * vergessener Zähler würde den Bildschirm dauerhaft wachhalten.
   */
  const brauchtTakt = useMemo(
    () =>
      aktiveEintraege.some((eintrag) => {
        if (eintrag.serie && eintrag.satz) {
          return rundenVon(laeufe, eintrag.satz.id).some(hatLaufendeBahn)
        }
        return hatLaufendeBahn(eintrag.lauf)
      }) ||
      // Ein laufender Wettkampf-Lauf hält den Takt genauso nötig wie ein
      // Trainingslauf, auch wenn er nicht in der Trainingsleiste steht.
      laeufe.some((lauf) => lauf.modus === 'wettkampf' && hatLaufendeBahn(lauf)),
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
      if (!tabAktivRef.current) return
      const id = aktiverLaufIdRef.current
      if (!id) return
      const aktuell = laeufeRef.current.find((l) => l.id === id)
      if (!aktuell) return
      const naechster = fn(aktuell)
      if (naechster === aktuell) return
      setLaeufeSafe(laeufeRef.current.map((l) => (l.id === id ? naechster : l)))
      verfolge(saveLauf(naechster))
    },
    [setLaeufeSafe, meldeSpeicherFehler],
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
      if (!tabAktivRef.current) return
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
            bahnen: eintrag.bahnen.map((bahn, index) =>
              bahn.startMs === null && !isFinished(bahn)
                ? { ...bahn, startMs: now + index * satz.plan!.startversatzMs }
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
      if (!tabAktivRef.current) return
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
      if (!tabAktivRef.current) return
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
      if (!tabAktivRef.current) return
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
      if (!tabAktivRef.current) return
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
      if (!tabAktivRef.current) return
      const lauf = laeufeRef.current.find((l) => l.id === laufId)
      if (!lauf) return
      const naechster = setSchwimmerOnLane(lauf, bahnId, schwimmerId)
      if (naechster === lauf) return
      setLaeufeSafe(laeufeRef.current.map((l) => (l.id === laufId ? naechster : l)))
      verfolge(saveLauf(naechster))
    },
    [setLaeufeSafe, meldeSpeicherFehler],
  )

  /**
   * Korrigiert einen bereits erfassten Anschlag. Die Domäne prüft die
   * Reihenfolge (kein Split hinter einem späteren) und markiert die Zeit als
   * `manuell`, damit sie im CSV und bei Bestzeiten sichtbar bleibt.
   */
  const korrigiereAnschlag = useCallback(
    (laufId: string, bahnId: string, laengeNr: number, splitMs: number) => {
      if (!tabAktivRef.current) return
      const lauf = laeufeRef.current.find((l) => l.id === laufId)
      if (!lauf) return
      const naechster = korrigiereAnschlagImLauf(lauf, bahnId, laengeNr, splitMs)
      if (naechster === lauf) return
      setLaeufeSafe(laeufeRef.current.map((l) => (l.id === laufId ? naechster : l)))
      verfolge(saveLauf(naechster))
    },
    [setLaeufeSafe, meldeSpeicherFehler],
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
      optionen: { startversatzMs?: number; wiederholungen?: number; taktSek?: number } = {},
    ): string | null => {
      if (!tabAktivRef.current) return null
      if (validateKonfiguration(konfiguration) !== null) return null
      const anzahlBahnen = Number.isFinite(bahnen)
        ? Math.min(MAX_BAHNEN, Math.max(1, Math.round(bahnen)))
        : STANDARD_EINSTELLUNGEN.bahnen
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
        setSatzeSafe([satz, ...satzeRef.current])
        verfolge(saveSatz(satz))
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
          setSatzeSafe([satz, ...satzeRef.current])
          verfolge(saveSatz(satz))
        }
      }

      const bahnenInit = Array.from({ length: anzahlBahnen }, (_, i) => ({
        nummer: i + 1,
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
      for (const lauf of neueLaeufe) verfolge(saveLauf(lauf))

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
    if (!tabAktivRef.current) return
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
    if (!tabAktivRef.current) return
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
      if (!tabAktivRef.current) return
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
      if (!tabAktivRef.current) return
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
      if (!tabAktivRef.current) return null
      const name = daten.name.trim()
      if (!name) return null
      const vorhanden = daten.id ? schwimmer.find((s) => s.id === daten.id) : undefined
      const eintrag: Schwimmer = {
        id: vorhanden?.id ?? newId(),
        name,
        jahrgang: daten.jahrgang,
        notiz: daten.notiz.trim(),
        erstelltAm: vorhanden?.erstelltAm ?? Date.now(),
      }
      setSchwimmer((aktuell) =>
        [...aktuell.filter((s) => s.id !== eintrag.id), eintrag].sort((a, b) =>
          a.name.localeCompare(b.name, 'de'),
        ),
      )
      verfolge(saveSchwimmer(eintrag))
      return eintrag
    },
    [schwimmer, meldeSpeicherFehler],
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
      if (!tabAktivRef.current) return
      setSchwimmer((aktuell) => aktuell.filter((s) => s.id !== id))
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
      setLaeufeSafe,
      setTrainingsSafe,
      setzeEinstellungen,
      verfolge,
      meldeSpeicherFehler,
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
      if (!tabAktivRef.current) return
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
    (daten: { name: string; datum: string; beckenlaengeM: Beckenlaenge }) => {
      if (!tabAktivRef.current) return null
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
      if (!tabAktivRef.current) return
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
      if (!tabAktivRef.current) return null
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
        })
      if (!vorhanden) {
        setWettkampfeSafe([wettkampf, ...wettkampfeRef.current])
        verfolge(saveWettkampf(wettkampf))
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
              schwimmerIdFuer(start.name, start.jahrgang ?? null, schwimmer, neueSchwimmer),
            ),
          )
        }
      })

      if (neueSchwimmer.length > 0) {
        setSchwimmer((aktuell) =>
          [...aktuell, ...neueSchwimmer].sort((a, b) => a.name.localeCompare(b.name, 'de')),
        )
        for (const eintrag of neueSchwimmer) verfolge(saveSchwimmer(eintrag))
      }

      setSatzeSafe([...neueSatze, ...satzeRef.current])
      setLaeufeSafe([...neueLaeufe, ...laeufeRef.current])
      for (const satz of neueSatze) verfolge(saveSatz(satz))
      for (const lauf of neueLaeufe) verfolge(saveLauf(lauf))
      return wettkampf.id
    },
    [schwimmer, setLaeufeSafe, setSatzeSafe, setWettkampfeSafe, verfolge],
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
      if (!tabAktivRef.current) return null
      const wettkampf = wettkampfeRef.current.find((eintrag) => eintrag.id === wettkampfId)
      if (!wettkampf) return null
      const streckeM = Math.round(disziplin.streckeM)
      if (
        !Number.isFinite(streckeM) ||
        streckeM <= 0 ||
        streckeM % wettkampf.beckenlaengeM !== 0
      ) {
        return null
      }
      const laeufe = Math.min(20, Math.max(1, Math.round(disziplin.laeufe)))
      const bahnen = Math.min(10, Math.max(1, Math.round(disziplin.bahnen)))
      const plan: WettkampfDisziplinPlan = {
        // Ohne eigene Bezeichnung heißt die Disziplin wie ihre Strecke, z. B.
        // „100 m Freistil“; das ist auch der Name im Verlauf.
        bezeichnung:
          disziplin.bezeichnung.trim() ||
          disziplinBezeichnung(streckeM, disziplin.schwimmart),
        streckeM,
        schwimmart: disziplin.schwimmart,
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
          schwimmerIdFuer(start.name, start.jahrgang ?? null, schwimmer, []),
        ),
      )
      setSatzeSafe([satz, ...satzeRef.current])
      setLaeufeSafe([...neueLaeufe, ...laeufeRef.current])
      verfolge(saveSatz(satz))
      for (const lauf of neueLaeufe) verfolge(saveLauf(lauf))
      return satz.id
    },
    [schwimmer, setLaeufeSafe, setSatzeSafe, verfolge],
  )

  /**
   * Löscht einen Wettkampf mit allen Disziplinen, Heats und Ergebnissen.
   *
   * Die betroffenen IDs werden vor dem Filtern bestimmt: Danach sind die Läufe
   * aus der Ref verschwunden und ließen sich nicht mehr zuordnen.
   */
  const loescheWettkampf = useCallback(
    (id: string) => {
      if (!tabAktivRef.current) return
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
      if (!tabAktivRef.current) return
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
      if (!tabAktivRef.current) return
      const lauf = laeufeRef.current.find((eintrag) => eintrag.id === laufId)
      if (!lauf) return
      aendereLauf(lauf, tapLane(lauf, bahnId, now, wallNow))
    },
    [aendereLauf],
  )

  /** Nimmt den Zielanschlag eines Heats zurück (Fehleingabe beim Tippen). */
  const rueckgaengigWettkampf = useCallback(
    (laufId: string, bahnId: string) => {
      if (!tabAktivRef.current) return
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
      if (!tabAktivRef.current) return
      const lauf = laeufeRef.current.find((eintrag) => eintrag.id === laufId)
      if (!lauf) return
      aendereLauf(lauf, setzeZielzeit(lauf, bahnId, splitMs))
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
      if (!tabAktivRef.current) return
      const lauf = laeufeRef.current.find((eintrag) => eintrag.id === laufId)
      if (!lauf) return
      const neueSchwimmer: Schwimmer[] = []
      const ids = namen.map((name) =>
        schwimmerIdFuer(name, null, schwimmer, neueSchwimmer),
      )
      let naechster = lauf
      lauf.bahnen.forEach((bahn, index) => {
        naechster = setSchwimmerOnLane(naechster, bahn.id, ids[index] ?? null)
      })
      if (neueSchwimmer.length > 0) {
        setSchwimmer((aktuell) =>
          [...aktuell, ...neueSchwimmer].sort((a, b) => a.name.localeCompare(b.name, 'de')),
        )
        for (const eintrag of neueSchwimmer) verfolge(saveSchwimmer(eintrag))
      }
      aendereLauf(lauf, naechster)
    },
    [aendereLauf, schwimmer, verfolge],
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
    if (!tabAktivRef.current) return null
    const werte = einstellungen
    const training = neuesTraining({
      datum: heute(),
      bahnen: werte.bahnen,
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
      if (!tabAktivRef.current) return
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
      if (!tabAktivRef.current) return
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
      if (!tabAktivRef.current) return null
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
      // Training gelten nur für noch nicht gestartete Sätze.
      const bahnenInit = Array.from({ length: training.bahnen }, (_, index) => ({
        nummer: index + 1,
        schwimmerId: training.aktive[index] ?? null,
      }))
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
      verfolge(saveSatz(satz))
      verfolge(saveTraining(naechstesTraining))
      for (const lauf of neueLaeufe) verfolge(saveLauf(lauf))

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
      neuLaden: ladeDaten,
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
