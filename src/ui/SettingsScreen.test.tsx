/**
 * Einstellungen: Import-Vorschau bei Konflikten.
 *
 * Die Datei sichert die Nutzerentscheidung ab: Die Vorschau nennt Zahl und Art
 * der Konflikte, ohne Häkchen bleibt der lokale Stand, mit Häkchen geht die
 * bewusste Ersetzen-Entscheidung an den Provider. Der Provider selbst wird hier
 * durch eine Attrappe ersetzt; Repository und Konflikterkennung prüfen eigene
 * Tests.
 */
// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, warteAuf } from '../test/render'
import { SettingsScreen } from './SettingsScreen'

const mocks = vi.hoisted(() => ({
  importiereBackup: vi.fn(),
  ermittleImportKonflikte: vi.fn(),
  pruefeBackupFuerImport: vi.fn(),
  zeigeToast: vi.fn(),
  waehleDatei: vi.fn(),
  speichereDatei: vi.fn(),
}))

// Minimales, bereits geprüftes Backup. Die Prüfung selbst ist hier ersetzt;
// der Test interessiert sich nur für die Vorschau und die Entscheidung.
const backup = {
  format: 'beckenrand-backup',
  version: 3,
  exportiertAm: '2026-10-29T10:00:00.000Z',
  schwimmer: [],
  satze: [],
  laeufe: [],
  trainings: [],
}

const konflikte = {
  eintraege: [{ bestand: 'laeufe', id: 'l1', art: 'lokalNeuer' }],
  gesamt: 1,
  neuereLokale: 1,
  text: '1 Konflikt: 1 Lauf. 1 davon ist lokal neuer.',
}

const app = {
  einstellungen: {
    konfiguration: { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' },
    bahnen: 6,
    reihen: 1,
    startversatzMs: 0,
    wiederholungen: 1,
    taktSek: 120,
    schwimmerProBahn: [],
  },
  speicherSchutz: 'unbekannt',
  themeEinstellung: 'system',
  setzeTheme: vi.fn(),
  setzeEinstellungen: vi.fn(),
  setzeKonfiguration: vi.fn(),
  setzeSchwimmer: vi.fn(),
  setzeSchwimmerSerie: vi.fn(),
  aktiverLauf: null,
  aktiverSatz: null,
  schwimmer: [],
  laeufe: [],
  tabAktiv: true,
  tabGesperrt: false,
  brauchtTakt: false,
  exportiereBackup: vi.fn(),
  pruefeBackupFuerImport: mocks.pruefeBackupFuerImport,
  ermittleImportKonflikte: mocks.ermittleImportKonflikte,
  importiereBackup: mocks.importiereBackup,
  zeigeToast: mocks.zeigeToast,
  fordereSpeicherSchutz: vi.fn(),
}

vi.mock('../app/AppProvider', () => ({ useApp: () => app }))

vi.mock('../app/pwa', () => ({
  useInstallPrompt: () => ({
    installiert: true,
    kannInstallieren: false,
    anleitung: '',
    installiere: vi.fn(),
  }),
}))

vi.mock('../export/datei', () => ({
  waehleDatei: mocks.waehleDatei,
  speichereDatei: mocks.speichereDatei,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.waehleDatei.mockResolvedValue({
    size: 128,
    text: async () => JSON.stringify(backup),
  })
  mocks.pruefeBackupFuerImport.mockReturnValue({
    ok: true,
    backup,
    text: '0 Schwimmer, 0 Wettkämpfe, 0 Trainings, 0 Sätze, 0 Läufe',
  })
  mocks.ermittleImportKonflikte.mockResolvedValue(konflikte)
  mocks.importiereBackup.mockResolvedValue({
    eintraege: konflikte.eintraege,
    gesamt: 1,
    neuereLokale: 1,
  })
  history.replaceState(null, '')
})

afterEach(() => {
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
})

/** Öffnet die Import-Vorschau über die Dateiauswahl. */
async function oeffneVorschau() {
  const ergebnis = render(<SettingsScreen />)
  const knopf = [...ergebnis.container.querySelectorAll('button')].find((kandidat) =>
    kandidat.textContent?.includes('Backup einlesen'),
  )
  if (!knopf) throw new Error('Knopf „Backup einlesen“ fehlt')
  await act(async () => knopf.click())
  await warteAuf(() => ergebnis.container.textContent?.includes('Backup importieren?') === true)
  return ergebnis
}

describe('SettingsScreen Import-Konflikte', () => {
  it('nennt Konflikte und behält ohne Häkchen den lokalen Stand', async () => {
    const ergebnis = await oeffneVorschau()

    expect(ergebnis.container.textContent).toContain(
      '1 Konflikt: 1 Lauf. 1 davon ist lokal neuer.',
    )
    const kaestchen = ergebnis.container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )
    expect(kaestchen).not.toBeNull()
    expect(kaestchen?.checked).toBe(false)

    const bestaetigen = [...ergebnis.container.querySelectorAll('button')].find(
      (kandidat) => kandidat.textContent?.trim() === 'Importieren',
    )
    await act(async () => bestaetigen?.click())

    expect(mocks.importiereBackup).toHaveBeenCalledWith(backup, 'lokalBehalten')
    ergebnis.unmount()
  })

  it('ersetzt Konflikte nur nach ausdrücklichem Anhaken', async () => {
    const ergebnis = await oeffneVorschau()

    const kaestchen = ergebnis.container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!
    await act(async () => kaestchen.click())
    expect(kaestchen.checked).toBe(true)

    const bestaetigen = [...ergebnis.container.querySelectorAll('button')].find(
      (kandidat) => kandidat.textContent?.trim() === 'Ersetzen und importieren',
    )
    await act(async () => bestaetigen?.click())

    expect(mocks.importiereBackup).toHaveBeenCalledWith(backup, 'backupErsetzen')
    ergebnis.unmount()
  })
})
