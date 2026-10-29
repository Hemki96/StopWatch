// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { speichereDatei, waehleDatei } from './datei'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('speichereDatei', () => {
  it('teilt die Datei, wenn das Share-Sheet sie annimmt', async () => {
    const share = vi.fn(async (_daten: ShareData) => undefined)
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    const klick = vi.spyOn(HTMLAnchorElement.prototype, 'click')

    await speichereDatei('zeiten.csv', 'a;b\n1;2', 'text/csv')

    expect(share).toHaveBeenCalledOnce()
    const argument = share.mock.calls[0]![0] as unknown as { files: File[]; title: string }
    expect(argument.title).toBe('zeiten.csv')
    expect(argument.files[0]?.name).toBe('zeiten.csv')
    expect(klick).not.toHaveBeenCalled()
  })

  it('bleibt still, wenn der Nutzer das Teilen abbricht', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('abgebrochen', 'AbortError')
    })
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    const klick = vi.spyOn(HTMLAnchorElement.prototype, 'click')

    await speichereDatei('zeiten.csv', 'inhalt', 'text/csv')

    expect(klick).not.toHaveBeenCalled()
    expect(document.querySelector('a[download]')).toBeNull()
  })

  it('lädt herunter, wenn das Teilen aus anderem Grund scheitert', async () => {
    const share = vi.fn(async () => {
      throw new TypeError('Share nicht möglich')
    })
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    const klick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)

    await speichereDatei('zeiten.csv', 'inhalt', 'text/csv')

    expect(klick).toHaveBeenCalledOnce()
  })

  it('erzeugt ohne Share-Unterstützung einen Download und räumt die URL auf', async () => {
    const create = vi.fn(() => 'blob:beckenrand')
    const revoke = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { value: create, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true })
    const klick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    const angehaengt: HTMLAnchorElement[] = []
    const append = vi.spyOn(document.body, 'append').mockImplementation((...elements) => {
      for (const element of elements) {
        if (element instanceof HTMLAnchorElement) angehaengt.push(element)
      }
    })

    vi.useFakeTimers()
    await speichereDatei('zeiten.csv', 'inhalt', 'text/csv')
    expect(create).toHaveBeenCalledOnce()
    expect(klick).toHaveBeenCalledOnce()
    expect(angehaengt[0]?.download).toBe('zeiten.csv')
    expect(angehaengt[0]?.href).toBe('blob:beckenrand')
    expect(append).toHaveBeenCalled()

    vi.advanceTimersByTime(2000)
    expect(revoke).toHaveBeenCalledWith('blob:beckenrand')
    vi.useRealTimers()
  })
})

describe('waehleDatei', () => {
  it('liefert die ausgewählte Datei und entfernt das Eingabefeld', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    const ergebnis = waehleDatei('.csv')

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).not.toBeNull()
    expect(input?.accept).toBe('.csv')
    expect(input?.style.display).toBe('none')

    const file = new File(['a;b'], 'liste.csv', { type: 'text/csv' })
    Object.defineProperty(input!, 'files', { value: [file], configurable: true })
    input!.dispatchEvent(new Event('change'))

    await expect(ergebnis).resolves.toBe(file)
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('liefert null, wenn die Auswahl abgebrochen wird', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    const ergebnis = waehleDatei('.json')

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    input!.dispatchEvent(new Event('cancel'))

    await expect(ergebnis).resolves.toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('liefert null, wenn der Dialog ohne Datei schließt', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    const ergebnis = waehleDatei('.json')

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    Object.defineProperty(input!, 'files', { value: null, configurable: true })
    input!.dispatchEvent(new Event('change'))

    await expect(ergebnis).resolves.toBeNull()
  })
})
