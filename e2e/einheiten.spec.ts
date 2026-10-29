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
import { oeffneApp } from './helfer'

/** Tippt drei Längen an und prüft, dass die vierte Länge ansteht. */
async function pruefeVierLaengen(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Start', exact: true }).tap()
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
