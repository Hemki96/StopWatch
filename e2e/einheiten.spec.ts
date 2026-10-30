/**
 * Einheit: Die App rechnet und beschriftet immer in Metern.
 *
 * Nutzerreise: Beim ersten Start und beim nächsten Lauf gibt es keine Auswahl
 * zwischen Meter und Yards mehr. Eine alte Yard-Einstellung im Speicher wird
 * beim Laden auf die entsprechende Meter-Konfiguration gebracht, damit keine
 * unsichtbare Einheit zurückbleibt.
 *
 * Vorbedingung: frischer Browser-Kontext je Test. Der erste Test öffnet die App
 * ohne Onboarding-Merker; der zweite setzt eine alte Einstellung direkt in
 * `localStorage` und lädt neu.
 */

import { expect, test } from '@playwright/test'
import { oeffneApp, starteLauf } from './helfer'

test('bietet im Onboarding und im Konfigurations-Sheet keine Einheitenwahl an', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Weiter' }).tap()

  // Schritt 2 kennt nur noch Beckenlänge und Strecke.
  await expect(page.locator('section', { hasText: 'Einheit' })).toHaveCount(0)
  await page
    .locator('section', { hasText: 'Beckenlänge' })
    .getByRole('button', { name: '25 m' })
    .tap()
  await page
    .locator('section', { hasText: 'Strecke' })
    .getByRole('button', { name: '100 m' })
    .tap()
  await expect(page.getByText('4 Längen')).toBeVisible()

  await page.getByRole('button', { name: 'Weiter' }).tap()
  await page.getByRole('button', { name: /Los geht/ }).tap()
  await expect(page.getByText('25 m · 100 m · 6 Bahnen')).toBeVisible()

  // Auch das spätere Konfigurations-Sheet beginnt direkt mit der Beckenlänge.
  await page.getByRole('button', { name: /25 m · 100 m · 6 Bahnen/ }).tap()
  const sheet = page.getByRole('dialog')
  await expect(sheet.locator('section', { hasText: 'Einheit' })).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: 'Yards' })).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Schließen', exact: true }).click()

  await starteLauf(page)
  await expect(page.getByRole('button', { name: /Bahn 1, läuft$/ })).toBeVisible()
})

test('übernimmt eine alte Yard-Einstellung als Meter', async ({ page }) => {
  await oeffneApp(page)

  // Eine Einstellung aus der Zeit vor der Meter-only-Oberfläche: 25 yd sind
  // kanonisch 22,86 m, 100 yd sind 91,44 m. Beim Laden wird daraus 25 m/100 m.
  await page.evaluate(() => {
    localStorage.setItem(
      'beckenrand.v2.einstellungen',
      JSON.stringify({
        konfiguration: {
          beckenlaengeM: 22.86,
          streckeM: 91.44,
          schwimmart: 'freistil',
          einheit: 'yd',
        },
        bahnen: 6,
        reihen: 1,
        schwimmerProBahn: Array.from({ length: 6 }, () => null),
        startversatzMs: 0,
        wiederholungen: 1,
        taktSek: 120,
      }),
    )
  })
  await page.reload()

  await expect(page.getByText('25 m · 100 m · 6 Bahnen')).toBeVisible()
  await page.getByRole('button', { name: /25 m · 100 m · 6 Bahnen/ }).tap()
  const sheet = page.getByRole('dialog')
  await expect(
    sheet.locator('section', { hasText: 'Beckenlänge' }).getByRole('button', { name: '25 m' }),
  ).toHaveClass(/bg-accent/)
  await expect(sheet.getByRole('button', { name: 'Yards' })).toHaveCount(0)
})
