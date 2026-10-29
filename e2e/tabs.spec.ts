import { expect, test } from '@playwright/test'
import { oeffneApp, oeffneZweitenTab } from './helfer'

test('zweiter Tab ist lesend, übernimmt auf Wunsch und gibt nach dem Schließen frei', async ({
  page,
}) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  await page.getByRole('button', { name: /^Bahn 1, läuft$/ }).tap()
  await expect(page.locator('[data-anschlaege="1"]')).toBeVisible()

  const zweiter = await oeffneZweitenTab(page)
  await expect(zweiter.locator('[data-tab-status="gesperrt"]')).toBeVisible()
  await expect(zweiter.getByText('Messung läuft in einem anderen Tab')).toBeVisible()
  await expect(zweiter.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0)

  await zweiter.getByRole('button', { name: 'Hier weiterarbeiten' }).click()
  await expect(zweiter.locator('[data-tab-status="aktiv"]')).toBeVisible()
  await expect(page.locator('[data-tab-status="gesperrt"]')).toBeVisible()

  // Der aktive Lauf samt Anschlag ist im übernehmenden Tab vorhanden.
  await expect(zweiter.locator('[data-anschlaege="1"]')).toBeVisible()

  await zweiter.close()
  await expect(page.locator('[data-tab-status="aktiv"]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-anschlaege="1"]')).toBeVisible()
})

test('der lesende Tab zeigt den Verlauf weiterhin an', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  await page.getByRole('button', { name: 'Verlauf' }).tap()

  const zweiter = await oeffneZweitenTab(page)
  await expect(zweiter.locator('[data-tab-status="gesperrt"]')).toBeVisible()
  await zweiter.getByRole('button', { name: 'Verlauf' }).tap()
  await expect(zweiter.getByText('1 Lauf')).toBeVisible()
})
