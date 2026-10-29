/**
 * Dateiausgabe und Dateiauswahl im Browser.
 *
 * Sichert die beiden Pfade aus `datei.ts` ab: Zuerst wird das Share-Sheet
 * versucht, bei Abbruch bleibt es still, bei jedem anderen Fehler oder ohne
 * Unterstützung wird heruntergeladen. Der Download muss den Anker kurz ins DOM
 * hängen und die Objekt-URL nach kurzer Zeit freigeben. `waehleDatei` muss das
 * temporäre Eingabefeld wieder entfernen und sowohl Abbruch als auch eine
 * Auswahl ohne Datei als `null` melden.
 *
 * Die Tests laufen in jsdom, weil `Blob`, `File`, `URL` und das DOM gebraucht
 * werden. `navigator.canShare`/`share` fehlen dort und werden pro Test über
 * `Object.defineProperty` gesetzt; `afterEach` räumt Spies, Globals und DOM auf.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { speichereDatei, waehleDatei } from './datei'

// Jeder Test hinterlässt gepatchte APIs und DOM-Knoten; beides wird
// zurückgesetzt, damit die Fälle unabhängig bleiben.
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

// Export: zuerst Teilen, sonst Download. Ein bewusster Abbruch ist kein Fehler.
describe('speichereDatei', () => {
  // `canShare` sagt ja, `share` nimmt die Datei an: kein Download-Anker, die
  // Datei heißt wie gewünscht.
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

  // `AbortError` heißt, der Nutzer hat das Share-Sheet geschlossen; ein
  // Download wäre hier übergriffig.
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

  // Jeder andere Fehler (hier `TypeError`) fällt auf den Download zurück, damit
  // der Export nicht blockiert.
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

  // Ohne Web Share wird ein Anker mit `download` geklickt. Der Anker wird
  // sofort wieder entfernt, deshalb sammelt der `append`-Spy ihn ein. Die
  // Objekt-URL darf nicht sofort freigegeben werden; mit fake Timers wird die
  // Freigabe nach 2000 ms geprüft.
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

// Dateiauswahl: Ein unsichtbares Eingabefeld wird eingehängt, geklickt und nach
// der Auswahl wieder entfernt.
describe('waehleDatei', () => {
  // `accept` wird übernommen, das Feld ist unsichtbar und hängt im DOM, weil
  // Safari den Klick auf ein nicht eingehängtes Feld verweigert. Nach `change`
  // löst die Promise mit der Datei auf und das Feld ist weg.
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

  // `cancel` ist der Abbruch im Dialog; nicht jeder Browser feuert es, deshalb
  // prüft der Test den unterstützten Pfad.
  it('liefert null, wenn die Auswahl abgebrochen wird', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    const ergebnis = waehleDatei('.json')

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    input!.dispatchEvent(new Event('cancel'))

    await expect(ergebnis).resolves.toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  // Schließt der Dialog über `change` ohne Datei, ist das ebenfalls kein
  // Fehlerfall, sondern eine leere Auswahl.
  it('liefert null, wenn der Dialog ohne Datei schließt', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    const ergebnis = waehleDatei('.json')

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    Object.defineProperty(input!, 'files', { value: null, configurable: true })
    input!.dispatchEvent(new Event('change'))

    await expect(ergebnis).resolves.toBeNull()
  })
})
