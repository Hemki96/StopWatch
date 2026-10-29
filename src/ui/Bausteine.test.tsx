/**
 * Bausteine der Oberfläche: Banner, Formularfelder, Bestätigung, Sheet, Icons.
 *
 * Die Datei sichert das Verhalten, das mehrere Screens teilen: Der
 * Speicherhinweis erscheint nur bei echten Fehlern und wird als `alert`
 * vorgelesen, `Feld`/`Chip` liefern die erwartete Struktur und den aktiven
 * Zustand, die Bestätigung setzt den Fokus schützend auf „Abbrechen“, und das
 * Sheet schließt per Knopf oder weite Ziehgeste — aber nicht bei einem kurzen
 * oder abgebrochenen Zug. Die Icons müssen dekorativ bleiben.
 *
 * Testhilfen: `render` aus `src/test/render` genügt, weil die Bausteine keinen
 * Provider brauchen. Der `afterEach` setzt die Scroll-Sperre der Dialoge
 * zurück, die global auf `body`/`html` liegt. Zeigergesten werden als
 * `MouseEvent` gesendet, da jsdom keine `PointerEvent`-Konstruktion anbietet.
 */
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

// Dialoge setzen `overflow: hidden` auf `body` und `html`; ohne Rücksetzen
// würde der nächste Test die Sperre erben.
afterEach(() => {
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
  vi.restoreAllMocks()
})

// Dauerhafter Warnstreifen bei fehlendem Speicher: unsichtbar ohne Fehler,
// sonst als `role="alert"` mit klarem Hinweis.
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

// `Feld` ist die Abschnittsüberschrift im Sheet, `Chip` die große
// Auswahlfläche. Beide sind rein darstellend; geprüft werden Struktur,
// Zustandsklassen und die Weitergabe von Klicks.
describe('Feld und Chip', () => {
  it('zeigt Label, Inhalt und optionalen Hinweis', () => {
    const ohneHinweis = render(
      <Feld label="Strecke">
        <p>Inhalt</p>
      </Feld>,
    )
    // `h3` statt `h2`, weil der Sheet-Titel bereits die `h2` ist.
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

  // Der aktive Zustand ist nur über Farbklassen sichtbar; die Assertions
  // sichern deshalb die Tailwind-Token, nicht bloß `aria-pressed` (das es
  // bewusst nicht gibt, weil der Aufrufer die Auswahl führt).
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

  // Ein deaktivierter Chip bleibt im Layout, darf aber weder Klick noch
  // Tastaturaktivierung auslösen.
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

// Bestätigungsdialog für eine einzelne, oft destruktive Entscheidung.
describe('Bestaetigung', () => {
  // Zwei Absicherungen: Der Dialog ist ein `alertdialog` mit verknüpftem
  // Titel, und der Startfokus liegt auf „Abbrechen“. So löst ein
  // versehentliches Enter nichts Löschendes aus.
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

// Sheet: Kopfzeile mit Schließen-Knopf und die Ziehgeste. Der Grenzwert liegt
// bei 90 px; darunter federt es zurück, ein `pointercancel` schließt nie.
describe('Sheet', () => {
  it('schließt über den Knopf', () => {
    const schliessen = vi.fn()
    const ergebnis = render(
      <Sheet open titel="Einstellungen" onClose={schliessen}>
        <p>Inhalt</p>
      </Sheet>,
    )

    // Der Knopf ist über sein zugängliches Label adressiert, nicht über die
    // Position — Screenreader und Tests finden ihn so gleichermaßen.
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

    // Die Ziehfläche ist die Kopfzeile; `clientY` bestimmt die Distanz.
    const kopf = ergebnis.container.querySelector<HTMLElement>('[role="dialog"] > div')!
    const zeiger = (typ: string, clientY: number) =>
      act(() => {
        kopf.dispatchEvent(
          new MouseEvent(typ, { bubbles: true, clientY, cancelable: true }),
        )
      })

    // 160 px liegen über dem Grenzwert von 90 px.
    zeiger('pointerdown', 100)
    zeiger('pointermove', 260)
    zeiger('pointerup', 260)
    expect(schliessen).toHaveBeenCalledOnce()
    ergebnis.unmount()
  })

  // 30 px sind ein versehentliches Wischen; das Sheet muss offen bleiben.
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

  // Systemgeste oder eingehender Anruf bricht die Geste ab (`pointercancel`).
  // Trotz weiter Distanz darf das nicht als Schließwunsch gelten.
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

// Icons tragen nie Bedeutung allein: Alle sind `aria-hidden`, die Größe kommt
// über `className`. Der Test hält beide Regeln für den ganzen Satz fest.
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
    // Das letzte Icon prüft die Weitergabe der Größenklasse exemplarisch.
    expect(svgs[16]?.getAttribute('class')).toBe('h-4 w-4')
    ergebnis.unmount()
  })
})
