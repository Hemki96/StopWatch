/**
 * Abstimmung zwischen mehreren Tabs über die Messung.
 *
 * Geprüft wird das Protokoll aus `claim`, `held`, `release`, `takeover`,
 * `yield` und `heartbeat`: Genau ein Tab ist aktiv, ein zweiter wird lesend,
 * eine Übergabe wartet auf offene Schreibvorgänge, und ein verschwundener
 * Halter wird nach der Ausfallzeit ersetzt. Regressionsfälle sind der Absturz
 * ohne `release`, ein scheiterndes `vorUebergabe` und ein fehlender
 * `BroadcastChannel`; die App muss in allen Fällen bedienbar bleiben.
 *
 * Testhilfen: Der `TestBus` ersetzt `BroadcastChannel` durch einen synchronen
 * In-Memory-Bus, damit Reihenfolge und Empfänger deterministisch sind. Fake
 * Timer machen `claimMs`, Heartbeat und Ausfall-Wächter ohne Wartezeit
 * prüfbar; echte Timer würden den Test langsam und unzuverlässig machen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TabKoordinator, type TabKanal } from './tabKoordinator'

/** Ausschnitt des Nachrichtenformats; `ziel` adressiert einen Tab oder `*`. */
interface Nachricht {
  typ: string
  tabId: string
  ziel?: string
}

/**
 * Ein Kanal eines einzelnen Tabs. `postMessage` geht über den Bus, `close`
 * meldet den Tab dort ab — so verhält sich ein geschlossener Tab wie im
 * Browser, der keine Nachrichten mehr senden oder empfangen kann.
 */
class TestKanal implements TabKanal {
  onmessage: ((nachricht: Nachricht) => void) | null = null

  constructor(
    private readonly bus: TestBus,
    readonly id: string,
  ) {}

  postMessage(nachricht: Nachricht): void {
    this.bus.zustellen(this.id, nachricht)
  }

  close(): void {
    this.bus.entfernen(this.id)
  }
}

/**
 * Synchroner Ersatz für `BroadcastChannel`. Bewusst ohne Queue: Nachrichten
 * werden sofort zugestellt, sodass die Tests ohne zusätzliche `await`-Runden
 * die Reihenfolge des Protokolls nachvollziehen können.
 */
class TestBus {
  private readonly kanaele = new Map<string, TestKanal>()

  /** Liefert die Kanal-Factory für einen Tab; jeder Tab bekommt einen eigenen Kanal. */
  factoryFuer(id: string) {
    return () => {
      const kanal = new TestKanal(this, id)
      this.kanaele.set(id, kanal)
      return kanal
    }
  }

  zustellen(von: string, nachricht: Nachricht): void {
    // Ein entfernter Tab kann nichts mehr senden — auch keinen Heartbeat.
    if (!this.kanaele.has(von)) return
    for (const [id, kanal] of this.kanaele) {
      if (id === von) continue
      kanal.onmessage?.(nachricht)
    }
  }

  entfernen(id: string): void {
    this.kanaele.delete(id)
  }
}

/**
 * Zwei Koordinatoren mit festen IDs `a` und `b`. Die festen IDs machen den
 * Tie-Breaker (kleinere ID gewinnt) nachvollziehbar.
 */
function zweiTabs() {
  const bus = new TestBus()
  const a = new TabKoordinator({
    tabId: 'a',
    kanal: bus.factoryFuer('a'),
    onRolle: () => undefined,
  })
  const b = new TabKoordinator({
    tabId: 'b',
    kanal: bus.factoryFuer('b'),
    onRolle: () => undefined,
  })
  return { bus, a, b }
}

// Zeitgesteuerte Rollenwechsel laufen mit Fake Timern; die Tests schieben die
// Uhr gezielt über `claimMs` (300 ms) bzw. `ausfallMs` (4000 ms).
describe('TabKoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Erster Tab wirbt und wird nach der Claim-Wartezeit aktiv; der zweite
  // erfährt vom Halter und bleibt lesend.
  it('macht den ersten Tab aktiv und den zweiten lesend', () => {
    const { a, b } = zweiTabs()
    a.start()
    vi.advanceTimersByTime(400)
    expect(a.aktuelleRolle).toBe('aktiv')

    b.start()
    expect(b.aktuelleRolle).toBe('gesperrt')
    expect(b.aktuellerBesitzer).toBe('a')

    a.stop()
    b.stop()
  })

  // „Hier weiterarbeiten“: Der gebende Tab wird sofort lesend, wartet auf
  // `vorUebergabe` (offene Schreibvorgänge) und gibt erst dann per `yield` frei.
  // Die zwei Microtask-Runden lassen die Promise-Kette von `vorUebergabe`
  // ablaufen.
  it('übernimmt auf Wunsch und macht den vorherigen Tab lesend', async () => {
    const bus = new TestBus()
    let gespeichert = false
    const a = new TabKoordinator({
      tabId: 'a',
      kanal: bus.factoryFuer('a'),
      onRolle: () => undefined,
      vorUebergabe: async () => {
        gespeichert = true
      },
    })
    const b = new TabKoordinator({
      tabId: 'b',
      kanal: bus.factoryFuer('b'),
      onRolle: () => undefined,
    })
    a.start()
    vi.advanceTimersByTime(400)
    b.start()
    expect(b.aktuelleRolle).toBe('gesperrt')

    b.uebernehmen()
    await Promise.resolve()
    await Promise.resolve()

    expect(gespeichert).toBe(true)
    expect(b.aktuelleRolle).toBe('aktiv')
    expect(a.aktuelleRolle).toBe('gesperrt')
    a.stop()
    b.stop()
  })

  // Scheitert das Warten auf offene Schreibvorgänge, muss die Übergabe trotzdem
  // abgeschlossen werden. Sonst bliebe der anfragende Tab für immer gesperrt
  // und die App wäre auf diesem Gerät nicht mehr bedienbar.
  it('übergibt auch dann, wenn offene Schreibvorgänge scheitern', async () => {
    const bus = new TestBus()
    const a = new TabKoordinator({
      tabId: 'a',
      kanal: bus.factoryFuer('a'),
      onRolle: () => undefined,
      vorUebergabe: async () => {
        throw new Error('Schreiben fehlgeschlagen')
      },
    })
    const b = new TabKoordinator({
      tabId: 'b',
      kanal: bus.factoryFuer('b'),
      onRolle: () => undefined,
    })
    a.start()
    vi.advanceTimersByTime(400)
    b.start()

    b.uebernehmen()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(b.aktuelleRolle).toBe('aktiv')
    expect(a.aktuelleRolle).toBe('gesperrt')
    a.stop()
    b.stop()
  })

  // Normales Schließen: `stop()` sendet `release`, der wartende Tab wirbt
  // sofort neu und wird nach der Claim-Zeit aktiv, ohne den Ausfall-Wächter
  // abzuwarten.
  it('gibt nach dem Schließen des aktiven Tabs wieder frei', () => {
    const { a, b } = zweiTabs()
    a.start()
    vi.advanceTimersByTime(400)
    b.start()
    expect(b.aktuelleRolle).toBe('gesperrt')

    a.stop()
    vi.advanceTimersByTime(400)
    expect(b.aktuelleRolle).toBe('aktiv')
    b.stop()
  })

  // Absturz statt geordnetem Schließen: Es kommt kein `release`, nur der
  // Heartbeat bleibt aus. Der Wächter muss den Halter nach `ausfallMs` als
  // verschwunden erkennen und die Rolle neu vergeben.
  it('übernimmt nach kurzer Zeit, wenn der aktive Tab ohne Freigabe verschwindet', () => {
    const { bus, a, b } = zweiTabs()
    a.start()
    vi.advanceTimersByTime(400)
    b.start()
    expect(b.aktuelleRolle).toBe('gesperrt')

    // Tab A verschwindet ohne `release` (Absturz).
    bus.entfernen('a')
    vi.advanceTimersByTime(6000)
    expect(b.aktuelleRolle).toBe('aktiv')
    b.stop()
  })

  // Manche eingebetteten Browser werfen beim Öffnen eines BroadcastChannel.
  // Der Tab muss dann sofort aktiv werden, statt in `startet` zu hängen.
  it('bleibt bedienbar, wenn der Kanal nicht geöffnet werden kann', () => {
    const a = new TabKoordinator({
      tabId: 'a',
      kanal: () => {
        throw new Error('kein BroadcastChannel')
      },
      onRolle: () => undefined,
    })
    a.start()
    expect(a.aktuelleRolle).toBe('aktiv')
    a.stop()
  })

  // bfcache: `pagehide` stoppt den Koordinator, `pageshow` muss ihn wieder
  // aufnehmen. Ohne diesen Neustart bliebe der Tab für immer stumm und würde
  // weiter Taps annehmen, obwohl ein anderer Tab die Messung hält.
  it('nimmt nach stop() und start() wieder am Protokoll teil', () => {
    const { a } = zweiTabs()
    a.start()
    vi.advanceTimersByTime(400)
    expect(a.aktuelleRolle).toBe('aktiv')

    a.stop()
    a.start()
    expect(a.aktuelleRolle).toBe('startet')
    vi.advanceTimersByTime(400)
    expect(a.aktuelleRolle).toBe('aktiv')
    a.stop()
  })

  // Ohne BroadcastChannel gibt es keinen Schutz, aber auch keinen toten Tab:
  // `kanal` liefert `null`, die Rolle wird genau einmal als `aktiv` gemeldet.
  it('bleibt ohne BroadcastChannel bedienbar', () => {
    const rollen: string[] = []
    const koordinator = new TabKoordinator({
      kanal: () => null,
      onRolle: (rolle) => rollen.push(rolle),
    })
    koordinator.start()
    expect(koordinator.aktuelleRolle).toBe('aktiv')
    expect(rollen).toEqual(['aktiv'])
  })
})
