/**
 * Schreibpfad: Tab-Tor, Warteschlange, Wiederholung und Fehlerbanner.
 *
 * Geprüft wird die Schnittstelle von `useSchreibpfad`, nicht die interne
 * Buchführung: Aktionen dürfen nur im aktiven Tab schreiben, offene Vorgänge
 * müssen eine Tab-Übergabe überleben, und ein Fehler darf weder verloren gehen
 * noch das Warten blockieren. Zusätzlich wird geprüft, dass nur vorübergehende
 * Fehler wiederholt werden und dass die Übergabe eine laufende Wiederholung
 * abwartet. Was hier nicht geprüft wird, ist die konkrete Persistenz — dafür
 * sind Repository- und Provider-Tests zuständig.
 */
// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '../test/render'
import { useSchreibpfad } from './schreibpfad'

/** Vorübergehender IndexedDB-Fehler, etwa ein abgebrochener Schreibvorgang. */
function voruebergehend(nachricht = 'kaputt'): DOMException {
  return new DOMException(nachricht, 'UnknownError')
}

/** Dauerhafter Fehler: Der Speicher ist voll, erneutes Schreiben hilft nicht. */
function speicherVoll(): DOMException {
  return new DOMException('voll', 'QuotaExceededError')
}

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

  // Ein Speicherfehler wird zum Banner. Mehrere Taps dürfen es nicht mehrfach
  // umschalten; die Meldung bleibt stehen, bis ein Schreibvorgang gelingt.
  it('meldet einen Speicherfehler genau einmal im Banner', () => {
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    const hook = renderHook(() => useSchreibpfad())

    act(() => hook.aktuell().meldeFehler())
    expect(hook.aktuell().speicherFehler).toBe(true)

    act(() => hook.aktuell().meldeFehler())
    expect(hook.aktuell().speicherFehler).toBe(true)
    expect(fehler).toHaveBeenCalledTimes(2)
  })

  // Der Kern des Issues: Ein abgelehnter Vorgang wird erneut ausgeführt, weil
  // `verfolge` den Thunk und nicht das bereits abgelehnte Promise bekommt.
  it('wiederholt einen vorübergehend abgelehnten Schreibvorgang', async () => {
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    const hook = renderHook(() => useSchreibpfad({ versuche: 3, backoffMs: 0 }))
    let versuche = 0

    const ergebnis = await hook.aktuell().verfolge(() => {
      versuche += 1
      return versuche === 1 ? Promise.reject(voruebergehend()) : Promise.resolve('gespeichert')
    })

    expect(versuche).toBe(2)
    expect(ergebnis).toBe('gespeichert')
    expect(hook.aktuell().speicherFehler).toBe(false)
    // Erst der letzte Versuch entscheidet; ein geglückter Retry ist kein Fehler.
    expect(fehler).not.toHaveBeenCalled()
  })

  // Dauerhafte Fehler werden nicht wiederholt: Quota gewinnt durch Warten nicht.
  it('wiederholt einen dauerhaften Fehler nicht', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const hook = renderHook(() => useSchreibpfad({ versuche: 3, backoffMs: 0 }))
    let versuche = 0

    await act(async () => {
      await expect(
        hook.aktuell().verfolge(() => {
          versuche += 1
          return Promise.reject(speicherVoll())
        }),
      ).rejects.toMatchObject({ name: 'QuotaExceededError' })
    })

    expect(versuche).toBe(1)
    expect(hook.aktuell().speicherFehler).toBe(true)
  })

  // Validierungsfehler sind gewöhnliche `Error` und werden ebenfalls nicht
  // wiederholt; die Daten würden beim zweiten Mal genauso abgelehnt.
  it('wiederholt einen Validierungsfehler nicht', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const hook = renderHook(() => useSchreibpfad({ versuche: 3, backoffMs: 0 }))
    let versuche = 0

    await act(async () => {
      await expect(
        hook.aktuell().verfolge(() => {
          versuche += 1
          return Promise.reject(new Error('ungültiges Backup'))
        }),
      ).rejects.toThrow('ungültiges Backup')
    })

    expect(versuche).toBe(1)
    expect(hook.aktuell().speicherFehler).toBe(true)
  })

  // Das Banner erscheint erst nach dem letzten Versuch, nicht schon beim ersten.
  it('meldet einen Fehler erst nach dem letzten Versuch', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const hook = renderHook(() => useSchreibpfad({ versuche: 2, backoffMs: 0 }))
    let versuche = 0

    const vorgang = hook.aktuell().verfolge(() => {
      versuche += 1
      return Promise.reject(voruebergehend())
    })
    // Der erste Fehlschlag allein zeigt noch kein Banner.
    expect(hook.aktuell().speicherFehler).toBe(false)

    await act(async () => {
      await expect(vorgang).rejects.toBeInstanceOf(DOMException)
    })
    expect(versuche).toBe(2)
    expect(hook.aktuell().speicherFehler).toBe(true)
  })

  // Ein späterer erfolgreicher Schreibvorgang nimmt das Banner zurück; der
  // Trainer sieht, dass der Speicher wieder trägt.
  it('nimmt das Banner nach einem erfolgreichen Schreibvorgang zurück', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const hook = renderHook(() => useSchreibpfad({ versuche: 1, backoffMs: 0 }))

    await act(async () => {
      await expect(
        hook.aktuell().verfolge(() => Promise.reject(voruebergehend())),
      ).rejects.toBeInstanceOf(DOMException)
    })
    expect(hook.aktuell().speicherFehler).toBe(true)

    await act(async () => {
      await hook.aktuell().verfolge(() => Promise.resolve())
    })
    expect(hook.aktuell().speicherFehler).toBe(false)
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
    hook.aktuell().verfolge(() => offen)

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

  // Die Übergabe wartet die ganze Wiederholungskette ab, nicht nur den ersten
  // Versuch. Sonst wäre der Retry nach dem Tab-Wechsel verloren.
  it('wartet auf eine noch laufende Wiederholung', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const hook = renderHook(() => useSchreibpfad({ versuche: 3, backoffMs: 0 }))
    let versuch = 0
    let wiederholungAbbrechen!: () => void

    const vorgang = hook.aktuell().verfolge(() => {
      versuch += 1
      if (versuch === 1) return Promise.reject(voruebergehend())
      return new Promise<void>((resolve) => {
        wiederholungAbbrechen = resolve
      })
    })

    let fertig = false
    const warten = hook.aktuell().warteAufOffene().then(() => {
      fertig = true
    })
    // Bis die Wiederholung selbst abgeschlossen ist, bleibt die Übergabe offen.
    await Promise.resolve()
    await Promise.resolve()
    expect(versuch).toBe(2)
    expect(fertig).toBe(false)

    wiederholungAbbrechen()
    await act(async () => {
      await warten
    })
    await expect(vorgang).resolves.toBeUndefined()
    expect(fertig).toBe(true)
  })

  // Ein dauerhaft fehlschlagender Vorgang darf die Übergabe nicht blockieren;
  // sonst bliebe der nächste Tab dauerhaft lesend.
  it('blockiert die Übergabe nicht durch einen dauerhaft scheiternden Vorgang', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const hook = renderHook(() => useSchreibpfad({ versuche: 3, backoffMs: 0 }))
    const vorgang = hook.aktuell().verfolge(() => Promise.reject(speicherVoll()))

    await act(async () => {
      await hook.aktuell().warteAufOffene()
    })
    await expect(vorgang).rejects.toBeInstanceOf(DOMException)
    expect(hook.aktuell().speicherFehler).toBe(true)
  })
})
