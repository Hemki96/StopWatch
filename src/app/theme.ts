/**
 * Designwahl, Systemauflösung und Spiegelung in DOM und Browser-Chrome.
 *
 * Gespeichert wird die Wahl (`system`, `dark`, `light`) unter dem logischen
 * Schlüssel `theme`; `lokalSpeicher` ergänzt den Namensraum und liest den
 * früheren Schlüssel als Rückfall (siehe `storage/namensraum.ts`). `system`
 * bleibt als solches gemerkt, damit die App später einer Änderung des Systems
 * folgt. Erst `theme` ist das tatsächlich angewendete Design.
 *
 * Die Farbwerte müssen zu den Meta-Angaben in `index.html` passen, sonst blinkt
 * der Startbildschirm in der falschen Farbe. `useTheme` bündelt alles, was der
 * Provider zum Design braucht; der Provider setzt den Hook nur noch zusammen.
 */
import { useCallback, useEffect, useState } from 'react'
import { leseText, schreibeText } from './lokalSpeicher'

/** Das tatsächlich angewendete Design. */
export type Theme = 'dark' | 'light'

/**
 * Die gespeicherte Wahl. `system` folgt der Betriebssystem-Einstellung und wird
 * erst über `loeseThemeAuf` in ein konkretes `Theme` aufgelöst.
 */
export type ThemeEinstellung = Theme | 'system'

/** Logischer Schlüssel der Designwahl; den Namensraum ergänzt `lokalSpeicher`. */
const THEME_KEY = 'theme'

/**
 * Gefragt wird nach „hell“, nicht nach „dunkel“: Ohne `matchMedia` (ältere oder
 * eingebettete Browser) ist `matches` dann false und die App startet dunkel,
 * also im gestalterischen Standard.
 */
const SYSTEM_ABFRAGE = '(prefers-color-scheme: light)'

/** Deckende Farben je Design; passend zu den Meta-Angaben in `index.html`. */
const THEME_FARBEN: Record<Theme, string> = {
  dark: '#070c15',
  light: '#eef2f7',
}

/** Fragt die aktuelle Systemeinstellung ab. */
export function systemIstDunkel(): boolean {
  return !window.matchMedia?.(SYSTEM_ABFRAGE).matches
}

/** Löst die gespeicherte Wahl gegen die Systemeinstellung auf. */
export function loeseThemeAuf(
  einstellung: ThemeEinstellung,
  systemDunkel: boolean,
): Theme {
  if (einstellung === 'system') return systemDunkel ? 'dark' : 'light'
  return einstellung
}

/**
 * Die Statusleiste des installierten iOS-Starts wird über dieses Meta gesteuert.
 * `black-translucent` schiebt den Inhalt unter die Uhr und erzwingt weiße Schrift —
 * im hellen Design unlesbar. Deshalb pro Design eine deckende Variante.
 */
function setzeStatusleistenStil(theme: Theme): void {
  const meta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
  meta?.setAttribute('content', theme === 'dark' ? 'black' : 'default')
}

/**
 * Spiegelt das aufgelöste Design in DOM und Browser-Chrome.
 *
 * Die Klasse `dark` steuert das CSS, `colorScheme` die nativen Formularelemente
 * und Scrollbalken. `theme-color` färbt die Adressleiste bzw. den Splash des
 * installierten Starts; die iOS-Statusleiste bekommt eine deckende Variante.
 */
export function spiegeleTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_FARBEN[theme])
  setzeStatusleistenStil(theme)
}

/**
 * Liest die Designwahl. Unbekannte oder fehlende Werte ergeben `system`, damit
 * eine ältere oder manipulierte Einstellung nie zu einem unsichtbaren Design
 * führt.
 */
export function leseThemeEinstellung(): ThemeEinstellung {
  const gespeichert = leseText(THEME_KEY)
  if (gespeichert === 'light' || gespeichert === 'dark' || gespeichert === 'system') {
    return gespeichert
  }
  return 'system'
}

/** Speichert die Designwahl; `system` bleibt als solches gemerkt. */
export function schreibeThemeEinstellung(einstellung: ThemeEinstellung): void {
  schreibeText(THEME_KEY, einstellung)
}

/** Designzustand, den der Provider in seinen Kontext übernimmt. */
export interface ThemeZustand {
  /** Das tatsächlich aktive Design, nach Auflösung von `themeEinstellung`. */
  theme: Theme
  themeEinstellung: ThemeEinstellung
  setzeTheme: (einstellung: ThemeEinstellung) => void
}

/**
 * Hält Designwahl und Systempräferenz und spiegelt beides ins Dokument.
 *
 * Lebenszyklus:
 * 1. Beim ersten Rendern wird die Wahl synchron aus `localStorage` gelesen und
 *    die Systempräferenz synchron abgefragt.
 * 2. Ein Effekt hängt sich an `prefers-color-scheme` und räumt den Zuhörer beim
 *    Unmount wieder ab. Der Listener hängt auch dann, wenn fest gewählt wurde —
 *    das ist billiger als ihn ab- und anzuhängen, und `theme` ignoriert die
 *    Systempräferenz in diesem Fall ohnehin.
 * 3. Ein zweiter Effekt spiegelt jede echte Änderung von `theme` in DOM und
 *    Browser-Chrome.
 */
export function useTheme(): ThemeZustand {
  const [themeEinstellung, setThemeEinstellung] = useState<ThemeEinstellung>(() =>
    leseThemeEinstellung(),
  )
  const [systemDunkel, setSystemDunkel] = useState(systemIstDunkel)
  const theme = loeseThemeAuf(themeEinstellung, systemDunkel)

  // Systemdesign live verfolgen.
  useEffect(() => {
    const abfrage = window.matchMedia?.(SYSTEM_ABFRAGE)
    if (!abfrage) return
    const reagiere = () => setSystemDunkel(!abfrage.matches)
    abfrage.addEventListener('change', reagiere)
    return () => abfrage.removeEventListener('change', reagiere)
  }, [])

  // Design in DOM und Browser-Chrome spiegeln. Läuft nur bei echter Änderung.
  useEffect(() => {
    spiegeleTheme(theme)
  }, [theme])

  /**
   * Speichert die Designwahl. `system` wird als solches gemerkt, nicht als
   * aufgelöstes Design — so folgt die App später einer Änderung des Systems.
   */
  const setzeTheme = useCallback((einstellung: ThemeEinstellung) => {
    setThemeEinstellung(einstellung)
    schreibeThemeEinstellung(einstellung)
  }, [])

  return { theme, themeEinstellung, setzeTheme }
}
