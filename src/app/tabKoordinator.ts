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
 */

export type TabRolle = 'startet' | 'aktiv' | 'gesperrt'

type Nachricht =
  | { typ: 'claim'; tabId: string }
  | { typ: 'held'; tabId: string; ziel: string }
  | { typ: 'release'; tabId: string }
  | { typ: 'takeover'; tabId: string }
  | { typ: 'yield'; tabId: string; ziel: string }
  | { typ: 'heartbeat'; tabId: string }

export interface TabKanal {
  onmessage: ((nachricht: Nachricht) => void) | null
  postMessage(nachricht: Nachricht): void
  close(): void
}

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

function standardKanal(): TabKanal | null {
  if (typeof BroadcastChannel === 'undefined') return null
  return new BroadcastKanal(new BroadcastChannel('beckenrand.tabs'))
}

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

function neueId(): string {
  return Math.random().toString(36).slice(2, 10)
}

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

  get aktuelleRolle(): TabRolle {
    return this.rolle
  }

  get aktuellerBesitzer(): string | null {
    return this.besitzer
  }

  start(): void {
    this.kanal = this.kanalFactory()
    if (!this.kanal) {
      // Lieber kein Schutz als ein toter Tab.
      this.setzeRolle('aktiv', null)
      return
    }
    this.kanal.onmessage = (nachricht) => this.empfange(nachricht)
    this.werbe()
  }

  uebernehmen(): void {
    if (this.rolle !== 'gesperrt' || !this.kanal) return
    this.kanal.postMessage({ typ: 'takeover', tabId: this.tabId })
    this.takeoverTimer = globalThis.setTimeout(() => {
      // Der andere Tab antwortet nicht — dann selbst übernehmen.
      if (this.rolle !== 'aktiv') this.werbe()
    }, 600)
  }

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

  private setzeRolle(rolle: TabRolle, besitzer: string | null): void {
    this.rolle = rolle
    this.besitzer = besitzer
    this.onRolle(rolle, besitzer)
  }

  private werbe(): void {
    if (!this.kanal || this.gestoppt) return
    this.raeumeTimerAuf()
    this.setzeRolle('startet', null)
    this.kanal.postMessage({ typ: 'claim', tabId: this.tabId })
    this.claimTimer = globalThis.setTimeout(() => {
      if (this.rolle === 'startet') this.werdeAktiv()
    }, this.claimMs)
  }

  private werdeAktiv(): void {
    if (!this.kanal || this.gestoppt) return
    this.raeumeTimerAuf()
    this.setzeRolle('aktiv', this.tabId)
    this.kanal.postMessage({ typ: 'held', tabId: this.tabId, ziel: '*' })
    this.heartbeatTimer = globalThis.setInterval(() => {
      this.kanal?.postMessage({ typ: 'heartbeat', tabId: this.tabId })
    }, this.heartbeatMs)
  }

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

  private empfange(nachricht: Nachricht): void {
    if (this.gestoppt || nachricht.tabId === this.tabId || !this.kanal) return

    switch (nachricht.typ) {
      case 'claim':
        if (this.rolle === 'aktiv') {
          this.kanal.postMessage({ typ: 'held', tabId: this.tabId, ziel: nachricht.tabId })
        } else if (this.rolle === 'gesperrt' && this.besitzer) {
          this.kanal.postMessage({ typ: 'held', tabId: this.besitzer, ziel: nachricht.tabId })
        } else if (this.rolle === 'startet' && nachricht.tabId < this.tabId) {
          // Zwei Tabs starten gleichzeitig: die kleinere ID gewinnt.
          this.setzeGesperrt(nachricht.tabId)
        }
        break

      case 'held':
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
          this.letzterKontakt = Date.now()
        } else if (this.rolle === 'aktiv' && nachricht.tabId < this.tabId) {
          // Zwei aktive Tabs (etwa nach einem verpassten yield): die kleinere ID bleibt.
          this.setzeGesperrt(nachricht.tabId)
          this.kanal.postMessage({ typ: 'yield', tabId: this.tabId, ziel: nachricht.tabId })
        }
        break

      case 'release':
        if (this.rolle === 'gesperrt' && nachricht.tabId === this.besitzer) {
          this.werbe()
        }
        break

      case 'takeover':
        if (this.rolle === 'aktiv') {
          // Sofort lesend werden, offene Schreibvorgänge abwarten, dann übergeben.
          this.raeumeTimerAuf()
          this.setzeRolle('gesperrt', nachricht.tabId)
          this.letzterKontakt = Date.now()
          void (this.vorUebergabe?.() ?? Promise.resolve()).finally(() => {
            this.kanal?.postMessage({ typ: 'yield', tabId: this.tabId, ziel: nachricht.tabId })
            this.setzeGesperrt(nachricht.tabId)
          })
        }
        break

      case 'yield':
        if (nachricht.ziel !== this.tabId) return
        if (this.takeoverTimer !== null) globalThis.clearTimeout(this.takeoverTimer)
        this.takeoverTimer = null
        this.werdeAktiv()
        break
    }
  }
}
