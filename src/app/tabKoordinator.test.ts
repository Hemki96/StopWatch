import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TabKoordinator, type TabKanal } from './tabKoordinator'

interface Nachricht {
  typ: string
  tabId: string
  ziel?: string
}

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

class TestBus {
  private readonly kanaele = new Map<string, TestKanal>()

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

describe('TabKoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

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
