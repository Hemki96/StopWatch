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
import { act, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '../test/render'
import { Bestaetigung } from './Bestaetigung'
import { Chip, Feld, Schalter, TaktWahl, ZwischenzeitenWahl } from './Felder'
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

  // Der aktive Zustand ist über Farbe *und* `aria-pressed` erkennbar. Die
  // Farb-Token bleiben als Regressionsschutz, die Semantik ist der eigentliche
  // Vertrag für Screenreader.
  it('färbt den aktiven Chip, meldet die Auswahl und Klicks', () => {
    const klick = vi.fn()
    const inaktiv = render(
      <Chip aktiv={false} onClick={klick}>
        50 m
      </Chip>,
    )
    const knopf = inaktiv.container.querySelector('button')!
    expect(knopf.className).toContain('bg-surface2')
    expect(knopf.getAttribute('aria-pressed')).toBe('false')
    act(() => knopf.click())
    expect(klick).toHaveBeenCalledOnce()
    inaktiv.unmount()

    const aktiv = render(
      <Chip aktiv onClick={() => undefined}>
        100 m
      </Chip>,
    )
    const aktivKnopf = aktiv.container.querySelector('button')!
    expect(aktivKnopf.className).toContain('bg-accent')
    expect(aktivKnopf.getAttribute('aria-pressed')).toBe('true')
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

// Schalter: Der ganze Block schaltet, der Zustand ist über `aria-checked`
// auch ohne Farbe erkennbar.
describe('Schalter', () => {
  it('meldet den Zustand und schaltet beim Tippen', () => {
    const aendern = vi.fn()
    const aus = render(
      <Schalter an={false} onAendern={aendern} titel="Sätze automatisch starten" />,
    )
    const knopf = aus.container.querySelector<HTMLButtonElement>('[role="switch"]')!
    expect(knopf.getAttribute('aria-checked')).toBe('false')
    act(() => knopf.click())
    expect(aendern).toHaveBeenCalledWith(true)
    aus.unmount()

    const an = render(<Schalter an onAendern={aendern} titel="Sätze automatisch starten" />)
    expect(an.container.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe(
      'true',
    )
    an.unmount()
  })
})

// Takt: Schnellauswahl plus freie Eingabe in Minuten und Sekunden. Die
// Zahlenfelder umgehen die Zifferntastatur nicht, deshalb werden sie einzeln
// geprüft. Freie Werte bleiben als eigener Chip sichtbar.
describe('TaktWahl', () => {
  /** Setzt den Feldwert so, wie es ein Tippen im Browser täte. */
  const tippe = (feld: HTMLInputElement, wert: string) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set
    act(() => {
      setter?.call(feld, wert)
      feld.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  it('zeigt einen freien Wert in Minuten und Sekunden und als Chip', () => {
    const aendere = vi.fn()
    const ergebnis = render(<TaktWahl wert={100} onWert={aendere} />)
    const minuten = ergebnis.container.querySelector<HTMLInputElement>(
      'input[aria-label="Takt Minuten"]',
    )!
    const sekunden = ergebnis.container.querySelector<HTMLInputElement>(
      'input[aria-label="Takt Sekunden"]',
    )!
    expect(minuten.value).toBe('1')
    expect(sekunden.value).toBe('40')

    const freierChip = [...ergebnis.container.querySelectorAll('button')].find(
      (knopf) => knopf.textContent === '01:40',
    )!
    act(() => freierChip.click())
    expect(aendere).toHaveBeenCalledWith(100)
    ergebnis.unmount()
  })

  it('rechnet die Eingabe in Sekunden um und kappt bei 60 Minuten', () => {
    // Der Zustand liegt wie im Sheet beim Aufrufer; nur so wirken mehrere
    // Eingaben hintereinander aufeinander.
    function Harness() {
      const [wert, setWert] = useState(120)
      return <TaktWahl wert={wert} onWert={setWert} />
    }

    const ergebnis = render(<Harness />)
    const minuten = ergebnis.container.querySelector<HTMLInputElement>(
      'input[aria-label="Takt Minuten"]',
    )!
    const sekunden = ergebnis.container.querySelector<HTMLInputElement>(
      'input[aria-label="Takt Sekunden"]',
    )!

    // 1:30 ist kein Chip-Wert, sondern nur über die Felder erreichbar.
    tippe(minuten, '1')
    tippe(sekunden, '30')
    expect(minuten.value).toBe('1')
    expect(sekunden.value).toBe('30')

    // 90 s im Sekundenfeld werden zu 2:30 weitergerechnet, 70 Minuten auf
    // die Obergrenze von 60:00 gekappt.
    tippe(sekunden, '90')
    expect(minuten.value).toBe('2')
    expect(sekunden.value).toBe('30')
    tippe(minuten, '70')
    expect(minuten.value).toBe('60')
    expect(sekunden.value).toBe('0')
    ergebnis.unmount()
  })

  it('sperrt Chips und Felder zusammen', () => {
    const aendere = vi.fn()
    const ergebnis = render(<TaktWahl wert={120} onWert={aendere} disabled />)
    for (const feld of ergebnis.container.querySelectorAll('input')) {
      expect(feld.disabled).toBe(true)
    }
    for (const knopf of ergebnis.container.querySelectorAll('button')) {
      expect(knopf.disabled).toBe(true)
    }
    ergebnis.unmount()
  })
})

// Zwischenzeiten: direkte Zahleneingabe, Plus/Minus und der Rückweg
// „Automatisch“. Der abgeleitete Wert dient nur als Anzeige, solange keine
// eigene Zahl gesetzt ist.
describe('ZwischenzeitenWahl', () => {
  /** Setzt den Feldwert so, wie es ein Tippen im Browser täte. */
  const tippe = (feld: HTMLInputElement, wert: string) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set
    act(() => {
      setter?.call(feld, wert)
      feld.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  it('zeigt den automatischen Wert und übernimmt eine direkt eingetippte Zahl', () => {
    const aendere = vi.fn()
    const ergebnis = render(
      <ZwischenzeitenWahl wert={null} automatisch={1} onWert={aendere} />,
    )
    const feld = ergebnis.container.querySelector<HTMLInputElement>(
      'input[aria-label="Anzahl Zwischenzeiten"]',
    )!
    expect(feld.value).toBe('1')
    expect(ergebnis.container.textContent).toContain('Vorgabe aus Strecke und Becken: 1')

    tippe(feld, '3')
    expect(aendere).toHaveBeenCalledWith(3)
    ergebnis.unmount()
  })

  it('setzt über Plus und Minus eine feste Zahl und kehrt zu Automatisch zurück', () => {
    const aendere = vi.fn()
    const ergebnis = render(
      <ZwischenzeitenWahl wert={2} automatisch={1} onWert={aendere} />,
    )
    act(() =>
      [...ergebnis.container.querySelectorAll('button')]
        .find((knopf) => knopf.textContent === '+')!
        .click(),
    )
    expect(aendere).toHaveBeenCalledWith(3)
    act(() =>
      [...ergebnis.container.querySelectorAll('button')]
        .find((knopf) => knopf.textContent === '−')!
        .click(),
    )
    expect(aendere).toHaveBeenCalledWith(1)
    act(() =>
      [...ergebnis.container.querySelectorAll('button')]
        .find((knopf) => knopf.textContent === 'Automatisch')!
        .click(),
    )
    expect(aendere).toHaveBeenCalledWith(null)
    ergebnis.unmount()
  })

  it('macht ein leeres Feld wieder automatisch und sperrt alle Bedienelemente', () => {
    const aendere = vi.fn()
    const ergebnis = render(
      <ZwischenzeitenWahl wert={3} automatisch={1} onWert={aendere} disabled />,
    )
    const feld = ergebnis.container.querySelector<HTMLInputElement>(
      'input[aria-label="Anzahl Zwischenzeiten"]',
    )!
    expect(feld.disabled).toBe(true)
    for (const knopf of ergebnis.container.querySelectorAll('button')) {
      expect(knopf.disabled).toBe(true)
    }
    ergebnis.unmount()

    const offen = render(<ZwischenzeitenWahl wert={3} automatisch={1} onWert={aendere} />)
    const offenesFeld = offen.container.querySelector<HTMLInputElement>(
      'input[aria-label="Anzahl Zwischenzeiten"]',
    )!
    tippe(offenesFeld, '')
    expect(aendere).toHaveBeenLastCalledWith(null)
    offen.unmount()
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
    expect(svgs).toHaveLength(16)
    for (const svg of svgs) {
      expect(svg.getAttribute('aria-hidden')).toBe('true')
    }
    // Das letzte Icon prüft die Weitergabe der Größenklasse exemplarisch.
    expect(svgs[15]?.getAttribute('class')).toBe('h-4 w-4')
    ergebnis.unmount()
  })
})
