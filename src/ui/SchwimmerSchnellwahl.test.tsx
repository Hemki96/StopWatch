/**
 * Schnellzuordnung: ein Tipp belegt den nächsten freien Platz, ein zweiter
 * entfernt die Person. Ist alles belegt, bleiben nicht zugeordnete Personen
 * gesperrt, statt still nichts zu tun.
 */
// @vitest-environment jsdom
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Schwimmer } from '../domain/types'
import { render } from '../test/render'
import { SchwimmerSchnellwahl } from './SchwimmerSchnellwahl'

const ANNA: Schwimmer = { id: 'a', name: 'Anna', jahrgang: null, notiz: '', erstelltAm: 0 }
const BEN: Schwimmer = { id: 'b', name: 'Ben', jahrgang: null, notiz: '', erstelltAm: 0 }
const CLARA: Schwimmer = { id: 'c', name: 'Clara', jahrgang: null, notiz: '', erstelltAm: 0 }

function knopf(container: HTMLElement, name: string): HTMLButtonElement {
  const gefunden = [...container.querySelectorAll('button')].find(
    (kandidat) => kandidat.textContent?.trim() === name,
  )
  if (!gefunden) throw new Error(`Knopf „${name}“ fehlt`)
  return gefunden
}

describe('SchwimmerSchnellwahl', () => {
  it('belegt den nächsten freien Platz und meldet die Person', () => {
    const aendern = vi.fn()
    const ergebnis = render(
      <SchwimmerSchnellwahl
        schwimmer={[ANNA, BEN]}
        zuordnung={[null, null]}
        onAendern={aendern}
      />,
    )

    act(() => knopf(ergebnis.container, 'Anna').click())
    expect(aendern).toHaveBeenCalledWith('a', 0)

    ergebnis.unmount()
  })

  it('entfernt eine bereits zugeordnete Person von ihrem Platz', () => {
    const aendern = vi.fn()
    const ergebnis = render(
      <SchwimmerSchnellwahl
        schwimmer={[ANNA, BEN]}
        zuordnung={['a', 'b']}
        onAendern={aendern}
      />,
    )

    expect(knopf(ergebnis.container, 'Anna').getAttribute('aria-pressed')).toBe('true')
    act(() => knopf(ergebnis.container, 'Ben').click())

    expect(aendern).toHaveBeenCalledWith(null, 1)
    ergebnis.unmount()
  })

  it('sperrt nicht zugeordnete Personen, wenn kein Platz frei ist', () => {
    const ergebnis = render(
      <SchwimmerSchnellwahl
        schwimmer={[ANNA, BEN, CLARA]}
        zuordnung={['a', 'b']}
        onAendern={() => undefined}
      />,
    )

    expect(knopf(ergebnis.container, 'Clara').disabled).toBe(true)
    expect(ergebnis.container.textContent).toContain('Alle Plätze sind belegt')
    ergebnis.unmount()
  })

  it('zeigt ohne Schwimmer nichts', () => {
    const ergebnis = render(
      <SchwimmerSchnellwahl schwimmer={[]} zuordnung={[null]} onAendern={() => undefined} />,
    )

    expect(ergebnis.container.querySelector('button')).toBeNull()
    ergebnis.unmount()
  })
})
