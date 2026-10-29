/**
 * Schreibpfad: Tab-Tor, Warteschlange und Fehlerbanner.
 *
 * Geprüft wird die Schnittstelle von `useSchreibpfad`, nicht die interne
 * Buchführung: Aktionen dürfen nur im aktiven Tab schreiben, offene Vorgänge
 * müssen eine Tab-Übergabe überleben, und ein Fehler darf weder verloren gehen
 * noch das Warten blockieren. Was hier nicht geprüft wird, ist die konkrete
 * Persistenz — dafür sind Repository- und Provider-Tests zuständig.
 */
// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '../test/render'
import { useSchreibpfad } from './schreibpfad'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useSchreibpfad', () => {
  // Ein frischer Tab ist lesend. Erst der Koordinator öffnet das Tor; jede
  // Aktion fragt es vor dem Schreiben ab.
  it('startet gesperrt und folgt der Tab-Rolle', () => {
    const hook = renderHook(() => useSchreibpfad())
    expect(hook.aktuell().istAktiv()).toBe(false)

    act(() => hook.aktuell().setzeAktiv(true))
    expect(hook.aktuell().istAktiv()).toBe(true)

    act(() => hook.aktuell().setzeAktiv(false))
    expect(hook.aktuell().istAktiv()).toBe(false)
  })

  // Ein Speicherfehler wird zum dauerhaften Banner. Mehrere Taps dürfen es
  // nicht mehrfach umschalten; die Meldung bleibt für die ganze Sitzung stehen.
  it('meldet einen Speicherfehler genau einmal im Banner', () => {
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    const hook = renderHook(() => useSchreibpfad())

    act(() => hook.aktuell().meldeFehler())
    expect(hook.aktuell().speicherFehler).toBe(true)

    act(() => hook.aktuell().meldeFehler())
    expect(hook.aktuell().speicherFehler).toBe(true)
    expect(fehler).toHaveBeenCalled()
  })

  // Ein abgelehnter Schreibvorgang landet im Banner, statt als unbehandeltes
  // Promise zu verschwinden. Der Aufrufer sieht die Ablehnung weiterhin.
  it('verfolgt einen abgelehnten Schreibvorgang und meldet ihn', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const hook = renderHook(() => useSchreibpfad())
    const vorgang = hook.aktuell().verfolge(Promise.reject(new Error('kaputt')))

    await act(async () => {
      await expect(vorgang).rejects.toThrow('kaputt')
    })
    expect(hook.aktuell().speicherFehler).toBe(true)
  })

  // Eine Tab-Übergabe schließt zuerst das Tor und wartet dann, bis alle schon
  // gestarteten Vorgänge fertig sind. Sonst könnte ein Tap während des Wartens
  // einen Schreibvorgang starten, den der nächste Tab nie sieht.
  it('schließt das Tor und wartet auf offene Schreibvorgänge', async () => {
    const hook = renderHook(() => useSchreibpfad())
    act(() => hook.aktuell().setzeAktiv(true))

    let abschliessen!: () => void
    const offen = new Promise<void>((resolve) => {
      abschliessen = resolve
    })
    hook.aktuell().verfolge(offen)

    let fertig = false
    const warten = hook.aktuell().warteAufOffene().then(() => {
      fertig = true
    })

    // Das Tor ist sofort zu, noch bevor der Vorgang fertig ist.
    expect(hook.aktuell().istAktiv()).toBe(false)
    await Promise.resolve()
    expect(fertig).toBe(false)

    abschliessen()
    await act(async () => {
      await warten
    })
    expect(fertig).toBe(true)
  })

  // Ein fehlgeschlagener Vorgang darf die Übergabe nicht blockieren; sonst
  // bliebe der nächste Tab dauerhaft lesend.
  it('wartet auch dann weiter, wenn ein Vorgang scheitert', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const hook = renderHook(() => useSchreibpfad())
    hook.aktuell().verfolge(Promise.reject(new Error('kaputt')))

    await act(async () => {
      await hook.aktuell().warteAufOffene()
    })
    expect(hook.aktuell().speicherFehler).toBe(true)
  })
})
