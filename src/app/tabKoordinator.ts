/**
 * Genau ein Tab hält die Messung. Die Tabs verständigen sich über
 * `BroadcastChannel`; ohne Unterstützung bleibt die App wie bisher bedienbar.
 *
 * Das Protokoll ist absichtlich klein:
 * - `claim` fragt, wer die Messung hält.
 * - `held` antwortet mit dem Halter.
 * - `heartbeat` zeigt, dass der Halter noch lebt.
 * - `release` gibt beim Schließen frei.
 * - `takeover`/`yield` übergeben auf ausdrücklichen Wunsch.
 *
 * Rollen: `startet` ist der Zustand zwischen `claim` und Antwort, `aktiv` hält
 * die Messung und darf schreiben, `gesperrt` liest nur und wartet auf die
 * Freigabe. Die Rollen schließen sich aus; jedes `setzeRolle` informiert den
 * Aufrufer über `onRolle`.
 *
 * Konfliktauflösung: Starten zwei Tabs gleichzeitig, gewinnt die kleinere
 * Tab-ID (lexikografischer Vergleich). Das ist willkürlich, aber für beide
 * Tabs gleich und damit ohne Verhandlung entscheidbar. Verpasst ein Tab ein
 * `yield`, korrigiert der nächste Heartbeat die Lage.
 *
 * Ohne `BroadcastChannel` (ältere oder eingebettete Browser) wird der Tab
 * sofort `aktiv`. Lieber kein Schutz als ein toter Tab.
 */

/** Rolle dieses Tabs im Zusammenspiel. Nur `aktiv` darf schreiben. */
export type TabRolle = 'startet' | 'aktiv' | 'gesperrt'

/**
 * Nachrichten des Protokolls. `ziel` ist die adressierte Tab-ID oder `*` für
 * „an alle“; `tabId` ist immer der Absender.
 */
type Nachricht =
  | { typ: 'claim'; tabId: string }
  | { typ: 'held'; tabId: string; ziel: string }
  | { typ: 'release'; tabId: string }
  | { typ: 'takeover'; tabId: string }
  | { typ: 'yield'; tabId: string; ziel: string }
  | { typ: 'heartbeat'; tabId: string }

/**
 * Minimaler Kanal, damit der Koordinator ohne Browser testbar bleibt.
 * `onmessage` wird von außen gesetzt; `postMessage` erreicht alle anderen Tabs.
 */
export interface TabKanal {
  onmessage: ((nachricht: Nachricht) => void) | null
  postMessage(nachricht: Nachricht): void
  close(): void
}

/** `BroadcastChannel` hinter der schmalen `TabKanal`-Schnittstelle. */
class BroadcastKanal implements TabKanal {
  onmessage: ((nachricht: Nachricht) => void) | null = null

  constructor(private readonly channel: BroadcastChannel) {
    this.channel.onmessage = (event: MessageEvent<Nachricht>) => {
      this.onmessage?.(event.data)
    }
  }

  postMessage(nachricht: Nachricht): void {
    this.channel.postMessage(nachricht)
  }

  close(): void {
    this.channel.close()
  }
}

/**
 * Öffnet den Standardkanal oder liefert `null`, wenn die API fehlt.
 *
 * Ein `BroadcastChannel` wird pro Tab nur einmal geöffnet; der Name
 * `beckenrand.tabs` ist der gemeinsame Bus aller Tabs der App.
 */
function standardKanal(): TabKanal | null {
  if (typeof BroadcastChannel === 'undefined') return null
  return new BroadcastKanal(new BroadcastChannel('beckenrand.tabs'))
}

/**
 * Konfiguration des Koordinators. Alle Zeiten sind absichtlich klein: Der
 * Rollenwechsel soll schnell sein, ohne den Hauptthread zu belasten.
 * `claimMs` ist die Wartezeit auf Antworten, `heartbeatMs` die Melderate des
 * Halters, `ausfallMs` die Geduld, bis ein stummer Halter als geschlossen gilt.
 */
export interface KoordinatorOptionen {
  tabId?: string
  kanal?: () => TabKanal | null
  onRolle: (rolle: TabRolle, besitzer: string | null) => void
  /** Läuft vor dem `yield`: offene Schreibvorgänge müssen fertig sein. */
  vorUebergabe?: () => Promise<void>
  claimMs?: number
  heartbeatMs?: number
  /** Nach dieser Zeit ohne Lebenszeichen gilt der andere Tab als geschlossen. */
  ausfallMs?: number
}

/**
 * Zufällige, kurze Tab-ID. Sie muss nur innerhalb einer Sitzung eindeutig sein
 * und dient zugleich als Tie-Breaker bei gleichzeitigem Start; kryptografische
 * Zufälligkeit ist nicht nötig.
 */
function neueId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Handelt die Rolle dieses Tabs mit den anderen Tabs aus.
 *
 * Lebenszyklus: `start()` öffnet den Kanal und wirbt um die Rolle; `stop()` gibt
 * frei, räumt alle Timer auf und schließt den Kanal. Je nach Rolle läuft genau
 * ein Timer: Claim-Wartezeit (`startet`), Heartbeat (`aktiv`) oder
 * Ausfall-Wächter (`gesperrt`). Eine angeforderte Übergabe setzt zusätzlich
 * einen kurzen Timeout.
 *
 * Der Koordinator trifft keine fachlichen Entscheidungen; er meldet Rollen über
 * `onRolle` und ruft vor einer Übergabe `vorUebergabe` auf, damit offene
 * Schreibvorgänge abgeschlossen sind.
 */
export class TabKoordinator {
  readonly tabId: string
  private readonly kanalFactory: () => TabKanal | null
  private readonly onRolle: KoordinatorOptionen['onRolle']
  private readonly vorUebergabe?: () => Promise<void>
  private readonly claimMs: number
  private readonly heartbeatMs: number
  private readonly ausfallMs: number

  private kanal: TabKanal | null = null
  private rolle: TabRolle = 'startet'
  private besitzer: string | null = null
  // `letzterKontakt` ist der Zeitpunkt des letzten Heartbeats des Halters und
  // nur als Gesperrter relevant; `gestoppt` macht `stop()` idempotent.
  private letzterKontakt = 0
  private claimTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private waechterTimer: ReturnType<typeof setInterval> | null = null
  private takeoverTimer: ReturnType<typeof setTimeout> | null = null
  private gestoppt = false

  constructor(optionen: KoordinatorOptionen) {
    this.tabId = optionen.tabId ?? neueId()
    this.kanalFactory = optionen.kanal ?? standardKanal
    this.onRolle = optionen.onRolle
    this.vorUebergabe = optionen.vorUebergabe
    this.claimMs = optionen.claimMs ?? 300
    this.heartbeatMs = optionen.heartbeatMs ?? 1500
    this.ausfallMs = optionen.ausfallMs ?? 4000
  }

  /** Aktuelle Rolle; für Tests und für Entscheidungen im Aufrufer. */
  get aktuelleRolle(): TabRolle {
    return this.rolle
  }

  /** Tab-ID des aktuellen Halters oder `null`, wenn keiner bekannt ist. */
  get aktuellerBesitzer(): string | null {
    return this.besitzer
  }

  /**
   * Startet die Abstimmung. Schlägt das Öffnen des Kanals fehl (manche
   * eingebetteten Browser werfen), wird dieser Tab sofort `aktiv`, damit die
   * App bedienbar bleibt.
   */
  start(): void {
    try {
      this.kanal = this.kanalFactory()
    } catch {
      // Manche eingebettete Browser werfen beim Öffnen eines BroadcastChannel.
      this.kanal = null
    }
    if (!this.kanal) {
      // Lieber kein Schutz als ein toter Tab.
      this.setzeRolle('aktiv', null)
      return
    }
    this.kanal.onmessage = (nachricht) => this.empfange(nachricht)
    this.werbe()
  }

  /**
   * Fordert die Messung vom anderen Tab an („Hier weiterarbeiten“).
   *
   * Nur aus der Rolle `gesperrt` sinnvoll. Antwortet der Halter nicht innerhalb
   * von 600 ms — etwa weil er eingefroren ist —, wird die Rolle selbst
   * beansprucht. Der Timeout wird durch ein eintreffendes `yield` wieder
   * abgeräumt, damit nicht zwei Tabs gleichzeitig aktiv werden.
   */
  uebernehmen(): void {
    if (this.rolle !== 'gesperrt' || !this.kanal) return
    this.kanal.postMessage({ typ: 'takeover', tabId: this.tabId })
    this.takeoverTimer = globalThis.setTimeout(() => {
      // Der andere Tab antwortet nicht — dann selbst übernehmen.
      if (this.rolle !== 'aktiv') this.werbe()
    }, 600)
  }

  /**
   * Beendet die Teilnahme: Timer aufräumen, als Halter freigeben, Kanal
   * schließen. Idempotent, damit `pagehide` und der Effekt-Cleanup beide
   * aufrufen können.
   */
  stop(): void {
    if (this.gestoppt) return
    this.gestoppt = true
    this.raeumeTimerAuf()
    if (this.rolle === 'aktiv' && this.kanal) {
      this.kanal.postMessage({ typ: 'release', tabId: this.tabId })
    }
    this.kanal?.close()
    this.kanal = null
  }

  /** Stoppt alle offenen Timer. Wird vor jedem Rollenwechsel aufgerufen. */
  private raeumeTimerAuf(): void {
    if (this.claimTimer !== null) globalThis.clearTimeout(this.claimTimer)
    if (this.heartbeatTimer !== null) globalThis.clearInterval(this.heartbeatTimer)
    if (this.waechterTimer !== null) globalThis.clearInterval(this.waechterTimer)
    if (this.takeoverTimer !== null) globalThis.clearTimeout(this.takeoverTimer)
    this.claimTimer = null
    this.heartbeatTimer = null
    this.waechterTimer = null
    this.takeoverTimer = null
  }

  /** Einziger Ort, an dem die Rolle wechselt; meldet jede Änderung nach außen. */
  private setzeRolle(rolle: TabRolle, besitzer: string | null): void {
    this.rolle = rolle
    this.besitzer = besitzer
    this.onRolle(rolle, besitzer)
  }

  /**
   * Wirbt um die Messung: `claim` senden und nach `claimMs` aktiv werden, wenn
   * niemand widerspricht. Der Zwischenzustand `startet` verhindert, dass ein
   * zweiter Tab dieses Tabs Claim als Freigabe missversteht.
   */
  private werbe(): void {
    if (!this.kanal || this.gestoppt) return
    this.raeumeTimerAuf()
    this.setzeRolle('startet', null)
    this.kanal.postMessage({ typ: 'claim', tabId: this.tabId })
    this.claimTimer = globalThis.setTimeout(() => {
      if (this.rolle === 'startet') this.werdeAktiv()
    }, this.claimMs)
  }

  /**
   * Übernimmt die Rolle endgültig: `held` an alle melden und den Heartbeat
   * starten, an dem ein gesperrter Tab erkennt, dass der Halter lebt.
   */
  private werdeAktiv(): void {
    if (!this.kanal || this.gestoppt) return
    this.raeumeTimerAuf()
    this.setzeRolle('aktiv', this.tabId)
    this.kanal.postMessage({ typ: 'held', tabId: this.tabId, ziel: '*' })
    this.heartbeatTimer = globalThis.setInterval(() => {
      this.kanal?.postMessage({ typ: 'heartbeat', tabId: this.tabId })
    }, this.heartbeatMs)
  }

  /**
   * Wird lesend und überwacht den Halter.
   *
   * Der Wächter prüft in einem Viertel der Ausfallzeit, ob seit `letzterKontakt`
   * noch ein Lebenszeichen kam. Bleibt es länger als `ausfallMs` aus, gilt der
   * Halter als geschlossen oder abgestürzt und es wird neu geworben. Die
   * Mindestrate von 250 ms verhindert einen Timer pro Millisekunde.
   */
  private setzeGesperrt(besitzer: string): void {
    this.raeumeTimerAuf()
    this.letzterKontakt = Date.now()
    this.setzeRolle('gesperrt', besitzer)
    this.waechterTimer = globalThis.setInterval(() => {
      if (this.rolle !== 'gesperrt') return
      if (Date.now() - this.letzterKontakt > this.ausfallMs) {
        // Der Halter ist verschwunden (Tab geschlossen oder abgestürzt).
        this.werbe()
      }
    }, Math.max(250, Math.floor(this.ausfallMs / 4)))
  }

  /**
   * Verarbeitet eine Nachricht eines anderen Tabs.
   *
   * Eigene Nachrichten werden ignoriert — `BroadcastChannel` stellt sie gar
   * nicht zu, der Testbus ebenfalls nicht; die Prüfung ist die zweite
   * Absicherung. Jeder Zweig endet in einem Rollenwechsel oder bleibt bewusst
   * ohne Wirkung, damit ein verspätetes Paket keinen Zustand zurücksetzt.
   */
  private empfange(nachricht: Nachricht): void {
    if (this.gestoppt || nachricht.tabId === this.tabId || !this.kanal) return

    switch (nachricht.typ) {
      case 'claim':
        if (this.rolle === 'aktiv') {
          // Ich halte die Messung: dem Fragenden direkt antworten.
          this.kanal.postMessage({ typ: 'held', tabId: this.tabId, ziel: nachricht.tabId })
        } else if (this.rolle === 'gesperrt' && this.besitzer) {
          // Ich kenne den Halter und gebe sein Wissen weiter, statt zu schweigen.
          this.kanal.postMessage({ typ: 'held', tabId: this.besitzer, ziel: nachricht.tabId })
        } else if (this.rolle === 'startet' && nachricht.tabId < this.tabId) {
          // Zwei Tabs starten gleichzeitig: die kleinere ID gewinnt.
          this.setzeGesperrt(nachricht.tabId)
        }
        break

      case 'held':
        // Nur Reaktionen auf eigene Claims oder Rundrufe sind relevant.
        if (nachricht.ziel !== '*' && nachricht.ziel !== this.tabId) return
        if (this.rolle === 'aktiv') {
          // Zwei gleichzeitig gestartete Tabs: die kleinere ID gewinnt.
          if (nachricht.tabId < this.tabId) {
            this.setzeGesperrt(nachricht.tabId)
            this.kanal.postMessage({ typ: 'yield', tabId: this.tabId, ziel: nachricht.tabId })
          }
          return
        }
        this.setzeGesperrt(nachricht.tabId)
        break

      case 'heartbeat':
        if (this.rolle === 'gesperrt' && nachricht.tabId === this.besitzer) {
          // Lebenszeichen des Halters: Der Ausfall-Wächter bleibt ruhig.
          this.letzterKontakt = Date.now()
        } else if (this.rolle === 'aktiv' && nachricht.tabId < this.tabId) {
          // Zwei aktive Tabs (etwa nach einem verpassten yield): die kleinere ID bleibt.
          this.setzeGesperrt(nachricht.tabId)
          this.kanal.postMessage({ typ: 'yield', tabId: this.tabId, ziel: nachricht.tabId })
        }
        break

      case 'release':
        // Der Halter ist gegangen: sofort neu werben, ohne auf den Wächter zu warten.
        if (this.rolle === 'gesperrt' && nachricht.tabId === this.besitzer) {
          this.werbe()
        }
        break

      case 'takeover':
        if (this.rolle === 'aktiv') {
          // Sofort lesend werden, offene Schreibvorgänge abwarten, dann übergeben.
          // `finally` gibt auch dann frei, wenn das Warten scheitert — sonst
          // bliebe der anfragende Tab für immer gesperrt.
          this.raeumeTimerAuf()
          this.setzeRolle('gesperrt', nachricht.tabId)
          this.letzterKontakt = Date.now()
          void (this.vorUebergabe?.() ?? Promise.resolve())
            .catch(() => undefined)
            .finally(() => {
              this.kanal?.postMessage({ typ: 'yield', tabId: this.tabId, ziel: nachricht.tabId })
              this.setzeGesperrt(nachricht.tabId)
            })
        }
        break

      case 'yield':
        if (nachricht.ziel !== this.tabId) return
        // Der bisherige Halter hat übergeben; ein noch laufender
        // Übernahme-Timeout ist damit erledigt.
        if (this.takeoverTimer !== null) globalThis.clearTimeout(this.takeoverTimer)
        this.takeoverTimer = null
        this.werdeAktiv()
        break
    }
  }
}
