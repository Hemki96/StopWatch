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
import type { Lauf, LaufKonfiguration, Satz, Schwimmer } from '../domain/types'
import {
  createLauf,
  finishLane,
  isComplete,
  korrigiereAnschlag as korrigiereAnschlagImLauf,
  startAll,
  tapLane,
  undoLane,
  setSchwimmer as setSchwimmerOnLane,
  updateStrecke,
} from '../domain/lauf'
import { newId } from '../domain/id'
import { TabKoordinator, type TabRolle } from './tabKoordinator'
import {
  deleteLauf,
  deleteSatzUndLaeufe,
  deleteSchwimmer,
  loadAll,
  saveLauf,
  saveSatz,
  saveSchwimmer,
} from '../storage/repository'

export type Theme = 'dark' | 'light'
/** Die gespeicherte Wahl. `system` folgt der Betriebssystem-Einstellung. */
export type ThemeEinstellung = Theme | 'system'

export interface Einstellungen {
  konfiguration: LaufKonfiguration
  bahnen: number
  /** Vorbelegung der Bahnen für den nächsten Lauf. */
  schwimmerProBahn: (string | null)[]
}

const STANDARD_EINSTELLUNGEN: Einstellungen = {
  konfiguration: { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' },
  bahnen: 6,
  schwimmerProBahn: [],
}

function normalisiereSchwimmerProBahn(
  liste: (string | null)[] | undefined,
  bahnen: number,
): (string | null)[] {
  return Array.from({ length: bahnen }, (_, i) => liste?.[i] ?? null)
}

export interface AppContextValue {
  einstellungen: Einstellungen
  setzeEinstellungen: (einstellungen: Einstellungen) => void
  neuLaden: () => Promise<void>
  geladen: boolean
  schwimmer: Schwimmer[]
  satze: Satz[]
  laeufe: Lauf[]
  aktiverLauf: Lauf | null
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
  ) => void
  startAlle: (now: number, wallNow: number) => void
  tippe: (bahnId: string, now: number, wallNow: number) => void
  beende: (bahnId: string, now: number, wallNow: number) => void
  rueckgaengig: (bahnId: string) => void
  setzeSchwimmer: (bahnId: string, schwimmerId: string | null) => void
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
}

const AppContext = createContext<AppContextValue | null>(null)

const THEME_KEY = 'beckenrand.theme'
const ACTIVE_KEY = 'beckenrand.aktiverLauf'
const EINSTELLUNGEN_KEY = 'beckenrand.einstellungen'

function leseEinstellungen(): Einstellungen {
  try {
    const roh = localStorage.getItem(EINSTELLUNGEN_KEY)
    if (!roh) return STANDARD_EINSTELLUNGEN
    const parsed = JSON.parse(roh) as Partial<Einstellungen>
    const konfiguration = parsed.konfiguration ?? STANDARD_EINSTELLUNGEN.konfiguration
    const bahnen = typeof parsed.bahnen === 'number' ? parsed.bahnen : STANDARD_EINSTELLUNGEN.bahnen
    const begrenzt = Math.min(10, Math.max(1, Math.round(bahnen)))
    return {
      konfiguration: {
        beckenlaengeM: konfiguration.beckenlaengeM === 25 ? 25 : 50,
        streckeM: konfiguration.streckeM ?? null,
        schwimmart: konfiguration.schwimmart ?? 'freistil',
      },
      bahnen: begrenzt,
      schwimmerProBahn: normalisiereSchwimmerProBahn(parsed.schwimmerProBahn, begrenzt),
    }
  } catch {
    return STANDARD_EINSTELLUNGEN
  }
}

function heute(): string {
  const d = new Date()
  const monat = `${d.getMonth() + 1}`.padStart(2, '0')
  const tag = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${monat}-${tag}`
}

function gleicheKonfiguration(a: LaufKonfiguration, b: LaufKonfiguration): boolean {
  return (
    a.beckenlaengeM === b.beckenlaengeM &&
    a.streckeM === b.streckeM &&
    a.schwimmart === b.schwimmart
  )
}

function leseThemeEinstellung(): ThemeEinstellung {
  const gespeichert = localStorage.getItem(THEME_KEY)
  if (gespeichert === 'light' || gespeichert === 'dark' || gespeichert === 'system') {
    return gespeichert
  }
  return 'system'
}

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

export function AppProvider({ children }: { children: ReactNode }) {
  const [geladen, setGeladen] = useState(false)
  const [schwimmer, setSchwimmer] = useState<Schwimmer[]>([])
  const [satze, setSatze] = useState<Satz[]>([])
  const [laeufe, setLaeufe] = useState<Lauf[]>([])
  const [aktiverLaufId, setAktiverLaufId] = useState<string | null>(null)
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

  const laeufeRef = useRef<Lauf[]>([])
  const aktiverLaufIdRef = useRef<string | null>(null)
  const speicherFehlerRef = useRef(false)
  const tabAktivRef = useRef(false)
  const koordinatorRef = useRef<TabKoordinator | null>(null)
  const schreibvorgaengeRef = useRef(new Set<Promise<unknown>>())
  const ladeDatenRef = useRef<(() => Promise<void>) | null>(null)

  const setLaeufeSafe = useCallback((next: Lauf[]) => {
    laeufeRef.current = next
    setLaeufe(next)
  }, [])

  const setAktivenLaufId = useCallback((id: string | null) => {
    aktiverLaufIdRef.current = id
    setAktiverLaufId(id)
    if (id) localStorage.setItem(ACTIVE_KEY, id)
    else localStorage.removeItem(ACTIVE_KEY)
  }, [])

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

  /** Verfolgt Schreibvorgänge, damit eine Tab-Übergabe nichts verliert. */
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

  const warteAufSchreibvorgaenge = useCallback(
    () => Promise.allSettled([...schreibvorgaengeRef.current]).then(() => undefined),
    [],
  )

  const ladeDaten = useCallback(async () => {
    const daten = await loadAll()
    setSchwimmer(daten.schwimmer)
    setSatze(daten.satze)
    setLaeufeSafe(daten.laeufe)

    const gemerkt = localStorage.getItem(ACTIVE_KEY)
    const kandidat =
      daten.laeufe.find((l) => l.id === gemerkt) ??
      [...daten.laeufe].sort((a, b) => (b.startWallMs ?? 0) - (a.startWallMs ?? 0))[0]
    if (kandidat && !isComplete(kandidat)) {
      setAktivenLaufId(kandidat.id)
      if (kandidat.bahnen.some((bahn) => bahn.anschlaege.length > 0)) {
        zeigeToast('Der letzte Lauf wurde unterbrochen. Erfasste Zeiten bleiben erhalten.')
      }
    } else if (!kandidat) {
      setAktivenLaufId(null)
    } else {
      // Ein abgeschlossener Lauf bleibt im Verlauf, nicht auf dem Timer.
      setAktivenLaufId(null)
    }
  }, [setAktivenLaufId, setLaeufeSafe, zeigeToast, meldeSpeicherFehler])

  ladeDatenRef.current = ladeDaten

  useEffect(() => {
    const koordinator = new TabKoordinator({
      onRolle: (rolle) => {
        tabAktivRef.current = rolle === 'aktiv'
        setTabRolle(rolle)
        if (rolle === 'aktiv') {
          // Nach einer Übergabe den Stand des vorherigen Tabs übernehmen.
          void ladeDatenRef.current?.()
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
  }, [warteAufSchreibvorgaenge])

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

  useEffect(() => {
    const abfrage = window.matchMedia?.('(prefers-color-scheme: light)')
    if (!abfrage) return
    const reagiere = () => setSystemDunkel(!abfrage.matches)
    abfrage.addEventListener('change', reagiere)
    return () => abfrage.removeEventListener('change', reagiere)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#070c15' : '#eef2f7')
    setzeStatusleistenStil(theme)
  }, [theme])

  const setzeTheme = useCallback((einstellung: ThemeEinstellung) => {
    setThemeEinstellung(einstellung)
    localStorage.setItem(THEME_KEY, einstellung)
  }, [])

  const setzeEinstellungen = useCallback((naechste: Einstellungen) => {
    const bereinigt: Einstellungen = {
      ...naechste,
      schwimmerProBahn: normalisiereSchwimmerProBahn(naechste.schwimmerProBahn, naechste.bahnen),
    }
    setEinstellungenState(bereinigt)
    localStorage.setItem(EINSTELLUNGEN_KEY, JSON.stringify(bereinigt))
  }, [])

  const aktiverLauf = useMemo(
    () => laeufe.find((l) => l.id === aktiverLaufId) ?? null,
    [laeufe, aktiverLaufId],
  )

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

  const startAlle = useCallback(
    (now: number, wallNow: number) => aktualisiereAktiven((l) => startAll(l, now, wallNow)),
    [aktualisiereAktiven],
  )

  const tippe = useCallback(
    (bahnId: string, now: number, wallNow: number) =>
      aktualisiereAktiven((l) => tapLane(l, bahnId, now, wallNow)),
    [aktualisiereAktiven],
  )

  const beende = useCallback(
    (bahnId: string, now: number, wallNow: number) =>
      aktualisiereAktiven((l) => finishLane(l, bahnId, now, wallNow)),
    [aktualisiereAktiven],
  )

  const rueckgaengig = useCallback(
    (bahnId: string) => aktualisiereAktiven((l) => undoLane(l, bahnId)),
    [aktualisiereAktiven],
  )

  const setzeSchwimmer = useCallback(
    (bahnId: string, schwimmerId: string | null) =>
      aktualisiereAktiven((l) => setSchwimmerOnLane(l, bahnId, schwimmerId)),
    [aktualisiereAktiven],
  )

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

  const setzeKonfiguration = useCallback(
    (konfiguration: LaufKonfiguration) =>
      aktualisiereAktiven((l) => updateStrecke(l, konfiguration)),
    [aktualisiereAktiven],
  )

  const neuerLauf = useCallback(
    (konfiguration: LaufKonfiguration, bahnen: number, schwimmerProBahn: (string | null)[] = []) => {
      if (!tabAktivRef.current) return
      const datum = heute()
      const vorhandenerSatz = [...satze]
        .reverse()
        .find((s) => s.datum === datum && gleicheKonfiguration(s.konfiguration, konfiguration))

      let satzId = vorhandenerSatz?.id ?? null
      if (!vorhandenerSatz) {
        const satz: Satz = {
          id: newId(),
          datum,
          bezeichnung: '',
          konfiguration: { ...konfiguration },
          plan: null,
          erstelltAm: Date.now(),
        }
        satzId = satz.id
        setSatze((aktuell) => [satz, ...aktuell])
        verfolge(saveSatz(satz))
      }

      const lauf = createLauf(
        konfiguration,
        Array.from({ length: bahnen }, (_, i) => ({
          nummer: i + 1,
          schwimmerId: schwimmerProBahn[i] ?? null,
        })),
        satzId,
      )
      setLaeufeSafe([lauf, ...laeufeRef.current])
      setAktivenLaufId(lauf.id)
      verfolge(saveLauf(lauf))
    },
    [satze, setAktivenLaufId, setLaeufeSafe, meldeSpeicherFehler],
  )

  const verwerfeAktivenLauf = useCallback(() => {
    if (!tabAktivRef.current) return
    const id = aktiverLaufIdRef.current
    if (!id) return
    setLaeufeSafe(laeufeRef.current.filter((l) => l.id !== id))
    setAktivenLaufId(null)
    verfolge(deleteLauf(id))
    zeigeToast('Lauf verworfen.')
  }, [setAktivenLaufId, setLaeufeSafe, zeigeToast, meldeSpeicherFehler])

  const loescheLauf = useCallback(
    (id: string) => {
      if (!tabAktivRef.current) return
      const lauf = laeufeRef.current.find((l) => l.id === id)
      const verbleibend = laeufeRef.current.filter((l) => l.id !== id)
      setLaeufeSafe(verbleibend)
      if (aktiverLaufIdRef.current === id) setAktivenLaufId(null)
      verfolge(deleteLauf(id))

      // Ein Satz ohne Läufe ist unsichtbar, aber nicht weg. Er verschwindet
      // mit seinem letzten Lauf.
      const satzId = lauf?.satzId
      if (satzId && !verbleibend.some((l) => l.satzId === satzId)) {
        setSatze((aktuell) => aktuell.filter((s) => s.id !== satzId))
        verfolge(deleteSatzUndLaeufe(satzId))
      }
    },
    [setAktivenLaufId, setLaeufeSafe, meldeSpeicherFehler],
  )

  const loescheSatz = useCallback(
    (id: string) => {
      if (!tabAktivRef.current) return
      const betroffen = laeufeRef.current.filter((l) => l.satzId === id)
      setSatze((aktuell) => aktuell.filter((s) => s.id !== id))
      setLaeufeSafe(laeufeRef.current.filter((l) => l.satzId !== id))
      if (betroffen.some((l) => l.id === aktiverLaufIdRef.current)) setAktivenLaufId(null)
      verfolge(deleteSatzUndLaeufe(id))
    },
    [setAktivenLaufId, setLaeufeSafe, meldeSpeicherFehler],
  )

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
    },
    [einstellungen, setLaeufeSafe, setzeEinstellungen, meldeSpeicherFehler],
  )

  const uebernehmen = useCallback(() => {
    koordinatorRef.current?.uebernehmen()
  }, [])

  const benenneSatz = useCallback(
    (id: string, bezeichnung: string) => {
      if (!tabAktivRef.current) return
      const satz = satze.find((s) => s.id === id)
      if (!satz) return
      const naechster = { ...satz, bezeichnung: bezeichnung.trim() }
      setSatze((aktuell) => aktuell.map((s) => (s.id === id ? naechster : s)))
      verfolge(saveSatz(naechster))
    },
    [satze, meldeSpeicherFehler],
  )

  const value = useMemo<AppContextValue>(
    () => ({
      geladen,
      einstellungen,
      setzeEinstellungen,
      neuLaden: ladeDaten,
      schwimmer,
      satze,
      laeufe,
      aktiverLauf,
      theme,
      themeEinstellung,
      toast,
      speicherFehler,
      tabGesperrt: tabRolle === 'gesperrt',
      tabAktiv: tabRolle === 'aktiv',
      uebernehmen,
      setzeTheme,
      zeigeToast,
      neuerLauf,
      startAlle,
      tippe,
      beende,
      rueckgaengig,
      setzeSchwimmer,
      setzeSchwimmerImLauf,
      korrigiereAnschlag,
      setzeKonfiguration,
      verwerfeAktivenLauf,
      loescheLauf,
      loescheSatz,
      speichereSchwimmer,
      loescheSchwimmer,
      benenneSatz,
    }),
    [
      geladen,
      einstellungen,
      setzeEinstellungen,
      ladeDaten,
      schwimmer,
      satze,
      laeufe,
      aktiverLauf,
      theme,
      themeEinstellung,
      toast,
      speicherFehler,
      tabRolle,
      uebernehmen,
      setzeTheme,
      zeigeToast,
      neuerLauf,
      startAlle,
      tippe,
      beende,
      rueckgaengig,
      setzeSchwimmer,
      setzeSchwimmerImLauf,
      korrigiereAnschlag,
      setzeKonfiguration,
      verwerfeAktivenLauf,
      loescheLauf,
      loescheSatz,
      speichereSchwimmer,
      loescheSchwimmer,
      benenneSatz,
      uebernehmen,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp muss innerhalb von AppProvider verwendet werden.')
  return ctx
}
