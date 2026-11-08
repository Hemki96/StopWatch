/**
 * PDF-Schreiber: Seitenaufbau, WinAnsi-Kodierung und gültige Dateistruktur.
 *
 * Die Tests prüfen die Bytes, nicht gerenderte Pixel. Wichtig sind der
 * PDF-Header, die xref-Tabelle am Ende, die Seitennummerierung, das Maskieren
 * von Klammern und die Umlaute, die als WinAnsi-Bytes ankommen müssen.
 */
import { describe, expect, it } from 'vitest'
import { erzeugePdf } from './pdf'

/** Liest die PDF-Bytes als Latin-1-String; so bleiben die Bytepositionen sichtbar. */
function alsText(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return text
}

describe('erzeugePdf', () => {
  it('schreibt eine vollständige PDF-Hülle mit Fonts und Fußzeile', () => {
    const pdf = erzeugePdf([{ text: 'Training: Kader A', stil: 'titel' }], 'Training: Kader A')
    const text = alsText(pdf)

    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text).toContain('/Type /Catalog')
    expect(text).toContain('/Type /Pages')
    expect(text).toContain('/BaseFont /Helvetica')
    expect(text).toContain('/BaseFont /Helvetica-Bold')
    expect(text).toContain('/Encoding /WinAnsiEncoding')
    expect(text).toContain('Training: Kader A')
    expect(text).toContain('Seite 1 von 1')
    expect(text.endsWith('%%EOF\n')).toBe(true)
  })

  it('verweist mit startxref auf eine vorhandene xref-Tabelle', () => {
    const text = alsText(erzeugePdf([{ text: 'Inhalt' }], 'Bericht'))
    const treffer = /startxref\n(\d+)\n%%EOF\n$/.exec(text)

    expect(treffer).not.toBeNull()
    const start = Number(treffer?.[1])
    expect(text.slice(start, start + 4)).toBe('xref')
  })

  it('maskiert Klammern und Backslashes im PDF-String', () => {
    const text = alsText(erzeugePdf([{ text: 'Test (x) \\ y' }], 'Bericht'))

    expect(text).toContain('(Test \\(x\\) \\\\ y)')
  })

  it('kodiert Umlaute und ß als WinAnsi statt UTF-8', () => {
    const pdf = erzeugePdf([{ text: 'Größe' }], 'Größe')
    const text = alsText(pdf)

    expect(text).toContain('(Gr\u00f6\u00dfe)')
    expect(Array.from(pdf)).toContain(0xf6)
    expect(Array.from(pdf)).toContain(0xdf)
    expect(text).not.toContain('Ã')
  })

  it('bricht lange Zeilen um und verteilt sie auf mehrere Seiten', () => {
    const zeilen = Array.from({ length: 60 }, (_, index) => ({
      text: `Zeile ${index + 1}: ${'Ein langer Text '.repeat(4)}`,
    }))
    const text = alsText(erzeugePdf(zeilen, 'Langer Bericht'))

    expect(text).toContain('/Count 2')
    expect(text).toContain('Seite 2 von 2')
    expect(text).toContain('Seite 1 von 2')
  })

  it('ersetzt Zeichen außerhalb von WinAnsi durch ein Fragezeichen', () => {
    const text = alsText(erzeugePdf([{ text: 'Stern 😀' }], 'Bericht'))

    expect(text).toContain('(Stern ?)')
  })
})
