/**
 * Einheiten im Messfluss: Onboarding, Konfiguration, Timer und Neustart.
 *
 * Nutzerreise: Der Trainer richtet ein 25-Yard-Becken ein, wählt 100 yd und
 * prüft am Timer, dass daraus vier Längen werden. Nach einem Reload stehen
 * Einheit und Strecke unverändert da.
 *
 * Vorbedingung: frischer Browser-Kontext je Test. Der Onboarding-Test öffnet
 * die App ohne Merker; der zweite Test nutzt die Standard-Meter-Einstellungen
 * und wechselt die Einheit im Konfigurations-Sheet.
 */

import { expect, test } from '@playwright/test'
import { oeffneApp, starteLauf, warteAufZielzeiten } from './helfer'

/** Tippt drei Längen an und prüft, dass die vierte Länge ansteht. */
async function pruefeVierLaengen(page: import('@playwright/test').Page): Promise<void> {
  await starteLauf(page)
  const bahn = page.getByRole('button', { name: /Bahn 1, läuft$/ })
  await expect(bahn).toBeVisible()
  for (let i = 0; i < 3; i += 1) {
    await bahn.dispatchEvent('click')
    await expect(bahn).toHaveAttribute('data-anschlaege', String(i + 1))
  }
  // 100 yd im 25-Yard-Becken sind vier Längen; nach drei Anschlägen steht die
  // vierte an.
  await expect(bahn).toContainText('Länge 4/4')
}

test('richtet im Onboarding ein Yard-Becken ein', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Weiter' }).tap()

  const einheit = page.locator('section', { hasText: 'Einheit' })
  await einheit.getByRole('button', { name: 'Yards' }).tap()

  // Nur 25 yd steht als Beckenlänge bereit; die Strecke wird in Yards
  // angeboten. 100 yd ergeben vier Längen.
  const becken = page.locator('section', { hasText: 'Beckenlänge' })
  await expect(becken.getByRole('button', { name: '25 yd' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.locator('section', { hasText: 'Strecke' }).getByRole('button', { name: '100 yd' }).tap()
  await expect(page.getByText('4 Längen')).toBeVisible()

  await page.getByRole('button', { name: 'Weiter' }).tap()
  await page.getByRole('button', { name: /Los geht/ }).tap()

  // Die Kopfzeile des Timers nennt beide Einheiten.
  await expect(page.getByText('25 yd · 100 yd · Freistil · 6 Bahnen')).toBeVisible()
  await pruefeVierLaengen(page)

  // Einheit und Strecke überleben den Neustart (localStorage-Einstellungen).
  await page.reload()
  await expect(page.locator('[data-tab-status="aktiv"]')).toBeVisible()
  await expect(page.getByText('25 yd · 100 yd · Freistil · 6 Bahnen')).toBeVisible()
})

test('wechselt im Konfigurations-Sheet von Meter auf Yards', async ({ page }) => {
  await oeffneApp(page)
  await expect(page.getByText('50 m · 100 m · Freistil · 6 Bahnen')).toBeVisible()

  // Die Karte öffnet das Sheet; die Einheit sitzt über der Beckenlänge.
  await page.getByRole('button', { name: /m ·/ }).first().click()
  const sheet = page.getByRole('dialog')
  await sheet
    .locator('section', { hasText: 'Einheit' })
    .getByRole('button', { name: 'Yards' })
    .tap()

  // Der angezeigte Wert bleibt 100; kanonisch wird daraus 91,44 m. Die
  // Beckenlänge wechselt auf das einzige Yard-Maß.
  // Die Chips im Sheet markieren den aktiven Wert über die Akzentfarbe;
  // `aria-pressed` gehört im Onboarding zur eigenen Auswahl-Komponente.
  await expect(
    sheet.locator('section', { hasText: 'Beckenlänge' }).getByRole('button', { name: '25 yd' }),
  ).toHaveClass(/bg-accent/)
  await expect(
    sheet.locator('section', { hasText: 'Strecke' }).getByRole('button', { name: '100 yd' }),
  ).toHaveClass(/bg-accent/)
  await sheet.getByRole('button', { name: 'Schließen', exact: true }).click()

  await expect(page.getByText('25 yd · 100 yd · Freistil · 6 Bahnen')).toBeVisible()
  await pruefeVierLaengen(page)

  await page.reload()
  await expect(page.locator('[data-tab-status="aktiv"]')).toBeVisible()
  await expect(page.getByText('25 yd · 100 yd · Freistil · 6 Bahnen')).toBeVisible()
})

test('zeigt einen Yard-Lauf in Verlauf, Detail und getrennten Bestzeiten', async ({ page }) => {
  await oeffneApp(page)

  // Mia wird angelegt und der ersten Bahn zugeordnet.
  await page.getByRole('button', { name: 'Schwimmer' }).tap()
  await page.getByRole('button', { name: 'Schwimmer hinzufügen' }).click()
  await page.getByLabel('Name').fill('Mia')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await page.getByRole('button', { name: 'Timer' }).tap()
  await page.getByRole('button', { name: /m ·/ }).first().click()
  const konfiguration = page.getByRole('dialog')
  await konfiguration.getByLabel('Schwimmer für Reihe 1, Bahn 1').selectOption({ label: 'Mia' })
  await konfiguration.getByRole('button', { name: 'Schließen', exact: true }).click()

  // Erster Lauf: 100 m im 50-m-Becken, zwei Längen.
  await starteLauf(page)
  const meterBahn = page.getByRole('button', { name: /Bahn 1, Mia, läuft$/ })
  await expect(meterBahn).toBeVisible()
  await meterBahn.dispatchEvent('click')
  await page.waitForTimeout(100)
  await meterBahn.dispatchEvent('click')
  await expect(page.getByRole('button', { name: /Bahn 1, Mia, im Ziel$/ })).toBeVisible()

  // Nächster Lauf auf Yards umstellen; der laufende Meter-Lauf bleibt bestehen.
  await page.getByRole('button', { name: 'Mehr' }).tap()
  await page.getByRole('button', { name: /50 m-Becken/ }).click()
  const einstellungen = page.getByRole('dialog')
  await einstellungen
    .locator('section', { hasText: 'Einheit' })
    .getByRole('button', { name: 'Yards' })
    .tap()
  await einstellungen.getByRole('button', { name: 'Schließen', exact: true }).click()
  await page.getByRole('button', { name: 'Timer' }).tap()

  // „+“ legt den nächsten Lauf mit den neuen Einstellungen an.
  await page.getByRole('button', { name: 'Weiteren Lauf anlegen' }).tap()
  await expect(page.getByText('25 yd · 100 yd · Freistil · 6 Bahnen')).toBeVisible()
  await page.getByRole('button', { name: 'Start alle', exact: true }).tap()
  await page.getByRole('button', { name: 'Jetzt starten', exact: true }).tap()
  const yardBahn = page.getByRole('button', { name: /Bahn 1, Mia, läuft$/ })
  // Die ersten drei Anschläge lassen die vierte Länge offen; der vierte Tap
  // beendet die Bahn und ändert das `aria-label` auf „im Ziel“.
  for (let i = 0; i < 3; i += 1) {
    await yardBahn.dispatchEvent('click')
    await expect(yardBahn).toHaveAttribute('data-anschlaege', String(i + 1))
    if (i < 2) await page.waitForTimeout(60)
  }
  await yardBahn.dispatchEvent('click')
  await expect(page.getByRole('button', { name: /Bahn 1, Mia, im Ziel$/ })).toBeVisible()
  await warteAufZielzeiten(page, 2)

  // Schwimmer-Tab: Meter- und Yard-Becken erzeugen getrennte Bestzeiten.
  await page.getByRole('button', { name: 'Schwimmer' }).tap()
  const mia = page.locator('li', { hasText: 'Mia' })
  await mia.getByRole('button', { expanded: false }).click()
  await expect(page.getByText('100 m · Freistil · 50 m', { exact: true })).toBeVisible()
  await expect(page.getByText('100 yd · Freistil · 25 yd', { exact: true })).toBeVisible()

  // Verlauf und Detail nennen Strecke, Becken, Längen und Pace in Yards.
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await page.getByRole('button', { name: /6 Bahnen · 100 yd/ }).tap()
  await expect(page.getByRole('heading', { name: /6 Bahnen · 100 yd/ })).toBeVisible()
  await expect(page.getByText(/25 yd-Becken/)).toBeVisible()
  await expect(page.getByText('25 yd', { exact: true })).toBeVisible()
  await expect(page.getByText(/Pace .*\/ 100 yd/)).toBeVisible()

  // Nach einem Reload bleiben Anzeige und Bestzeiten-Gruppen erhalten. Die
  // Reihenfolge prüft zuerst den Schwimmer-Tab, weil das Lauf-Detail als
  // Vollbild über der Navigation liegt.
  await page.reload()
  await expect(page.locator('[data-tab-status="aktiv"]')).toBeVisible()
  await page.getByRole('button', { name: 'Schwimmer' }).tap()
  await page.locator('li', { hasText: 'Mia' }).getByRole('button', { expanded: false }).click()
  await expect(page.getByText('100 yd · Freistil · 25 yd', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await page.getByRole('button', { name: /6 Bahnen · 100 yd/ }).tap()
  await expect(page.getByRole('heading', { name: /6 Bahnen · 100 yd/ })).toBeVisible()
})

test('legt einen Trainingssatz in Yards an und startet ihn im Timer', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Training' }).tap()
  await page.getByRole('button', { name: 'Neues Training' }).tap()

  // Der erste Satz übernimmt die Meter-Vorgabe; im Satz-Sheet wird er auf
  // Yards umgestellt. Die angezeigte Streckenzahl bleibt 100.
  await page.getByRole('button', { name: 'Satz 1: 100 m · Freistil, offen' }).tap()
  const sheet = page.getByRole('dialog')
  await sheet
    .locator('section', { hasText: 'Einheit' })
    .getByRole('button', { name: 'Yards' })
    .tap()
  await sheet.getByRole('button', { name: '100 yd' }).tap()
  await sheet.getByRole('button', { name: 'Satz speichern' }).tap()

  await expect(
    page.getByRole('button', { name: 'Satz 1: 100 yd · Freistil, offen' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Satz 1 starten' }).tap()
  await page.getByRole('dialog').getByRole('button', { name: 'Jetzt starten' }).tap()
  await expect(page.getByText('25 yd · 100 yd · Freistil · 6 Bahnen')).toBeVisible()
  await expect(page.getByRole('button', { name: /Bahn 1, läuft$/ })).toBeVisible()
})
