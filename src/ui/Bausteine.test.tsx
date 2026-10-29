// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '../test/render'
import { Bestaetigung } from './Bestaetigung'
import { Chip, Feld } from './Felder'
import { Sheet } from './Sheet'
import { SpeicherBanner } from './SpeicherBanner'
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  GearIcon,
  HistoryIcon,
  MoonIcon,
  PencilIcon,
  PeopleIcon,
  PlusIcon,
  SunIcon,
  TimerIcon,
  TrainingIcon,
  TrashIcon,
  TrophyIcon,
  UploadIcon,
  XIcon,
} from './icons'

afterEach(() => {
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
  vi.restoreAllMocks()
})

describe('SpeicherBanner', () => {
  it('zeigt den dauerhaften Hinweis nur bei Speicherfehlern', () => {
    const aus = render(<SpeicherBanner sichtbar={false} />)
    expect(aus.container.querySelector('[role="alert"]')).toBeNull()
    aus.unmount()

    const an = render(<SpeicherBanner sichtbar />)
    expect(an.container.querySelector('[role="alert"]')?.textContent).toContain(
      'Kein Speicher verfügbar',
    )
    an.unmount()
  })
})

describe('Feld und Chip', () => {
  it('zeigt Label, Inhalt und optionalen Hinweis', () => {
    const ohneHinweis = render(
      <Feld label="Strecke">
        <p>Inhalt</p>
      </Feld>,
    )
    expect(ohneHinweis.container.querySelector('h3')?.textContent).toBe('Strecke')
    expect(ohneHinweis.container.textContent).toContain('Inhalt')
    expect(ohneHinweis.container.querySelectorAll('p')).toHaveLength(1)
    ohneHinweis.unmount()

    const mitHinweis = render(
      <Feld label="Takt" hint="Zeit zwischen zwei Starts">
        <p>Inhalt</p>
      </Feld>,
    )
    expect(mitHinweis.container.textContent).toContain('Zeit zwischen zwei Starts')
    expect(mitHinweis.container.querySelectorAll('p')).toHaveLength(2)
    mitHinweis.unmount()
  })

  it('färbt den aktiven Chip und meldet Klicks', () => {
    const klick = vi.fn()
    const inaktiv = render(
      <Chip aktiv={false} onClick={klick}>
        50 m
      </Chip>,
    )
    const knopf = inaktiv.container.querySelector('button')!
    expect(knopf.className).toContain('bg-surface2')
    act(() => knopf.click())
    expect(klick).toHaveBeenCalledOnce()
    inaktiv.unmount()

    const aktiv = render(
      <Chip aktiv onClick={() => undefined}>
        100 m
      </Chip>,
    )
    expect(aktiv.container.querySelector('button')?.className).toContain('bg-accent')
    aktiv.unmount()
  })

  it('deaktiviert einen Chip', () => {
    const klick = vi.fn()
    const ergebnis = render(
      <Chip aktiv={false} disabled onClick={klick}>
        Nicht verfügbar
      </Chip>,
    )
    const knopf = ergebnis.container.querySelector('button')!
    expect(knopf.disabled).toBe(true)
    act(() => knopf.click())
    expect(klick).not.toHaveBeenCalled()
    ergebnis.unmount()
  })
})

describe('Bestaetigung', () => {
  it('fragt nach und meldet beide Wege', () => {
    const bestaetigen = vi.fn()
    const abbrechen = vi.fn()
    const ergebnis = render(
      <Bestaetigung
        open
        titel="Lauf verwerfen?"
        text="Die Zeiten gehen verloren."
        bestaetigenLabel="Verwerfen"
        onBestaetigen={bestaetigen}
        onAbbrechen={abbrechen}
      />,
    )

    const dialog = ergebnis.container.querySelector('[role="alertdialog"]')
    expect(dialog?.textContent).toContain('Lauf verwerfen?')
    const knoepfe = [...ergebnis.container.querySelectorAll('button')]
    const abbrechenKnopf = knoepfe.find((knopf) => knopf.textContent === 'Abbrechen')!
    expect(document.activeElement).toBe(abbrechenKnopf)

    act(() => abbrechenKnopf.click())
    expect(abbrechen).toHaveBeenCalledOnce()

    const verwerfen = knoepfe.find((knopf) => knopf.textContent === 'Verwerfen')!
    act(() => verwerfen.click())
    expect(bestaetigen).toHaveBeenCalledOnce()
    ergebnis.unmount()
  })
})

describe('Sheet', () => {
  it('schließt über den Knopf', () => {
    const schliessen = vi.fn()
    const ergebnis = render(
      <Sheet open titel="Einstellungen" onClose={schliessen}>
        <p>Inhalt</p>
      </Sheet>,
    )

    act(() =>
      ergebnis.container
        .querySelector<HTMLButtonElement>('button[aria-label="Schließen"]')!
        .click(),
    )
    expect(schliessen).toHaveBeenCalledOnce()
    ergebnis.unmount()
  })

  it('schließt nach einem weiten Zug nach unten', () => {
    const schliessen = vi.fn()
    const ergebnis = render(
      <Sheet open titel="Einstellungen" onClose={schliessen}>
        <p>Inhalt</p>
      </Sheet>,
    )

    const kopf = ergebnis.container.querySelector<HTMLElement>('[role="dialog"] > div')!
    const zeiger = (typ: string, clientY: number) =>
      act(() => {
        kopf.dispatchEvent(
          new MouseEvent(typ, { bubbles: true, clientY, cancelable: true }),
        )
      })

    zeiger('pointerdown', 100)
    zeiger('pointermove', 260)
    zeiger('pointerup', 260)
    expect(schliessen).toHaveBeenCalledOnce()
    ergebnis.unmount()
  })

  it('bleibt bei einem kurzen Zug offen', () => {
    const schliessen = vi.fn()
    const ergebnis = render(
      <Sheet open titel="Einstellungen" onClose={schliessen}>
        <p>Inhalt</p>
      </Sheet>,
    )

    const kopf = ergebnis.container.querySelector<HTMLElement>('[role="dialog"] > div')!
    const zeiger = (typ: string, clientY: number) =>
      act(() => {
        kopf.dispatchEvent(new MouseEvent(typ, { bubbles: true, clientY }))
      })

    zeiger('pointerdown', 100)
    zeiger('pointermove', 130)
    zeiger('pointerup', 130)
    expect(schliessen).not.toHaveBeenCalled()
    ergebnis.unmount()
  })

  it('bricht einen Zug ab, ohne zu schließen', () => {
    const schliessen = vi.fn()
    const ergebnis = render(
      <Sheet open titel="Einstellungen" onClose={schliessen}>
        <p>Inhalt</p>
      </Sheet>,
    )

    const kopf = ergebnis.container.querySelector<HTMLElement>('[role="dialog"] > div')!
    act(() => {
      kopf.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 100 }))
      kopf.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientY: 300 }))
      kopf.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true }))
    })
    expect(schliessen).not.toHaveBeenCalled()
    ergebnis.unmount()
  })
})

describe('Icons', () => {
  it('rendert alle Symbole als dekorative SVGs', () => {
    const ergebnis = render(
      <div>
        <TimerIcon />
        <TrainingIcon />
        <TrophyIcon />
        <HistoryIcon />
        <PeopleIcon />
        <GearIcon />
        <PlusIcon />
        <ChevronLeftIcon />
        <ChevronRightIcon />
        <TrashIcon />
        <DownloadIcon />
        <UploadIcon />
        <SunIcon />
        <MoonIcon />
        <PencilIcon />
        <CheckIcon />
        <XIcon className="h-4 w-4" />
      </div>,
    )

    const svgs = ergebnis.container.querySelectorAll('svg')
    expect(svgs).toHaveLength(17)
    for (const svg of svgs) {
      expect(svg.getAttribute('aria-hidden')).toBe('true')
    }
    expect(svgs[16]?.getAttribute('class')).toBe('h-4 w-4')
    ergebnis.unmount()
  })
})
