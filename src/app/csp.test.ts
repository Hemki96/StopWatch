/**
 * Content-Security-Policy: Der Build muss eine Policy ausliefern, die zum
 * tatsächlichen HTML passt.
 *
 * Der Test liest `index.html` wie der Build und prüft drei Dinge: Die Policy
 * erlaubt keine fremden Netzwerkziele, der Hash passt zum Inline-Theme-Skript
 * (sonst blockiert der Browser den Theme-Boot), und das Meta-Tag steht vor dem
 * Inline-Skript. Damit fällt jede Änderung am Inline-Skript auf, ohne dass ein
 * Hash von Hand gepflegt werden muss.
 */
// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cspInhalt, mitCsp, skriptHashes } from './csp'

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')

/** Der Inline-Theme-Block ist das einzige klassische Inline-Skript im Kopf. */
function themeSkript(source: string): string {
  const treffer = /<script>([\s\S]*?)<\/script>/.exec(source)
  if (!treffer?.[1]) throw new Error('Inline-Theme-Skript in index.html nicht gefunden.')
  return treffer[1]
}

describe('Content-Security-Policy', () => {
  it('beschränkt Netzwerkziele auf die eigene Origin', () => {
    const policy = cspInhalt(html)

    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("connect-src 'self'")
    expect(policy).not.toContain('connect-src *')
    expect(policy).not.toMatch(/https?:\/\//)
  })

  it('erlaubt den Theme-Boot über den Hash des Inline-Skripts', () => {
    const inhalt = themeSkript(html)
    const erwartet = `'sha256-${createHash('sha256').update(inhalt, 'utf8').digest('base64')}'`

    expect(skriptHashes(html)).toEqual([erwartet])
    expect(cspInhalt(html)).toContain(`script-src 'self' ${erwartet}`)
  })

  it('verbietet Objekte, fremde Basen und Formularziele', () => {
    const policy = cspInhalt(html)

    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("base-uri 'none'")
    expect(policy).toContain("form-action 'none'")
  })

  it('setzt das Meta-Tag vor Style und Inline-Skript', () => {
    const gebaut = mitCsp(html)
    const position = gebaut.indexOf('<meta http-equiv="Content-Security-Policy"')

    expect(position).toBeGreaterThan(-1)
    expect(position).toBeLessThan(gebaut.indexOf('<style>'))
    expect(position).toBeLessThan(gebaut.indexOf('<script>'))
    expect(position).toBeLessThan(gebaut.indexOf('/src/main.tsx'))
  })

  it('ersetzt eine vorhandene Policy statt sie zu doppeln', () => {
    const einmal = mitCsp(html)
    const zweimal = mitCsp(einmal)

    expect(zweimal.match(/http-equiv="Content-Security-Policy"/g)).toHaveLength(1)
  })
})
