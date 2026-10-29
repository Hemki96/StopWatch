/**
 * Verhalten der Bahnkachel jenseits der Domäne.
 *
 * Geprüft wird der Langdruck: Er nimmt nach 450 ms den letzten Anschlag
 * zurück, darf das aber nicht mehr tun, wenn die Kachel inzwischen ausgebaut
 * wurde (etwa durch einen Tab-Wechsel). Ohne den Unmount-Cleanup feuert der
 * Timer weiter und macht eine Messung rückgängig, die niemand mehr sieht.
 */
// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLauf, startAll } from '../domain/lauf'
import type { Lauf } from '../domain/types'
import { render } from '../test/render'
import { LaneTile } from './LaneTile'

const K100 = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' } as const

/** Eine laufende Bahn mit einem Anschlag; damit ist Zurücknehmen möglich. */
function laufendeBahn(): Lauf {
  const lauf = startAll(createLauf(K100, [{ nummer: 1 }]), 0, 1)
  return {
    ...lauf,
    bahnen: lauf.bahnen.map((bahn) => ({
      ...bahn,
      anschlaege: [{ laengeNr: 1, splitMs: 30_000, erfasstAt: 2, istFinish: false }],
    })),
  }
}

function pointerDown(element: Element): void {
  act(() => {
    element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  })
}

function kachel(onUndo: () => void) {
  const lauf = laufendeBahn()
  return render(
    <LaneTile
      bahn={lauf.bahnen[0]!}
      konfiguration={lauf.konfiguration}
      now={1_000}
      schwimmerName={null}
      onTap={() => undefined}
      onUndo={onUndo}
      onFinish={() => undefined}
    />,
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe('LaneTile', () => {
  it('nimmt nach langem Drücken den letzten Anschlag zurück', () => {
    vi.useFakeTimers()
    const onUndo = vi.fn()
    const tile = kachel(onUndo)

    pointerDown(tile.container.querySelector('[role="button"]')!)
    act(() => vi.advanceTimersByTime(500))

    expect(onUndo).toHaveBeenCalledOnce()
    tile.unmount()
  })

  it('nimmt den letzten Anschlag auch per Tastatur zurück', () => {
    const onUndo = vi.fn()
    const tile = kachel(onUndo)

    act(() => {
      tile.container
        .querySelector('[role="button"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
    })

    expect(onUndo).toHaveBeenCalledOnce()
    tile.unmount()
  })

  it('nimmt nach dem Unmount nichts mehr zurück', () => {
    vi.useFakeTimers()
    const onUndo = vi.fn()
    const tile = kachel(onUndo)

    pointerDown(tile.container.querySelector('[role="button"]')!)
    tile.unmount()
    act(() => vi.advanceTimersByTime(500))

    expect(onUndo).not.toHaveBeenCalled()
  })
})
