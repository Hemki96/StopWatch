import { expect, test } from '@playwright/test'
import { oeffneApp } from './helfer'

test('führt beim ersten Start durch das Onboarding und merkt sich die Auswahl', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('Schritt 1 von 3')).toBeVisible()
  await expect(page.getByText('So funktioniert es')).toBeVisible()
  await page.getByRole('button', { name: 'Weiter' }).tap()

  await expect(page.getByText('Schritt 2 von 3')).toBeVisible()
  await page.locator('section', { hasText: 'Beckenlänge' }).getByRole('button', { name: '25 m' }).tap()
  await page.locator('section', { hasText: 'Strecke' }).getByRole('button', { name: '100 m' }).tap()
  await page.locator('section', { hasText: 'Schwimmart' }).getByRole('button', { name: 'Brust' }).tap()
  await page.getByRole('button', { name: 'Weiter' }).tap()

  await expect(page.getByText('Schritt 3 von 3')).toBeVisible()
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: 'Weniger Bahnen' }).click({ force: true })
  }
  await page.getByLabel('Schwimmer für Bahn 1').fill('Anna')
  await page.getByLabel('Schwimmer für Bahn 2').fill('Ben')
  await page.getByRole('button', { name: /Los geht/ }).tap()

  await expect(page.getByText('25 m · 100 m · Brust · 3 Bahnen')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()

  // Namen wurden als Schwimmer angelegt.
  await page.getByRole('button', { name: 'Schwimmer' }).tap()
  await expect(page.getByText('Anna')).toBeVisible()
  await expect(page.getByText('Ben')).toBeVisible()

  // Beim nächsten Start erscheint das Onboarding nicht erneut.
  await page.reload()
  await expect(page.getByText('Schritt 1 von 3')).toHaveCount(0)
  await expect(page.getByText('25 m · 100 m · Brust · 3 Bahnen')).toBeVisible()
})

test('wechselt das Design und behält die Wahl nach einem Reload', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Mehr' }).tap()

  await expect(page.getByRole('radio', { name: 'System' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await page.getByRole('radio', { name: 'Hell' }).tap()
  await expect(page.getByRole('radio', { name: 'Hell' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('html')).not.toHaveClass(/dark/)

  const gemerkt = await page.evaluate(() => localStorage.getItem('beckenrand.theme'))
  expect(gemerkt).toBe('light')

  await page.reload()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Mehr' }).tap()
  await expect(page.getByRole('radio', { name: 'Hell' })).toHaveAttribute('aria-checked', 'true')
})

test('ändert die Vorbereitung des nächsten Laufs dauerhaft', async ({ page }) => {
  await oeffneApp(page)
  await page
    .getByRole('button', { name: /50 m · 100 m · Freistil · 6 Bahnen/ })
    .tap()

  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: '200 m', exact: true }).tap()
  await sheet.getByRole('button', { name: 'Weniger Bahnen' }).tap()
  await sheet.getByRole('button', { name: 'Schließen' }).tap()

  await expect(page.getByText('50 m · 200 m · Freistil · 5 Bahnen')).toBeVisible()

  await page.reload()
  await expect(page.getByText('50 m · 200 m · Freistil · 5 Bahnen')).toBeVisible()
})

test('sperrt die Strecke nach dem ersten Anschlag auch in der Oberfläche', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  await page.getByRole('button', { name: /^Bahn 1, läuft$/ }).tap()

  await page
    .getByRole('button', { name: /50 m · 100 m · Freistil · 6 Bahnen/ })
    .tap()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('button', { name: '200 m', exact: true })).toBeDisabled()
  await expect(
    sheet.getByRole('button', { name: 'offen', exact: true }),
  ).toBeDisabled()
})
