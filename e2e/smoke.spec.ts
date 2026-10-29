import { expect, test } from '@playwright/test'
import { oeffneApp } from './helfer'

test('startet einen Lauf, stoppt eine Bahn und behält den Verlauf nach Reload', async ({ page }) => {
  await oeffneApp(page)

  await expect(page.getByText('Nächster Lauf')).toBeVisible()
  await page.getByRole('button', { name: 'Start', exact: true }).tap()

  const bahn1 = page.getByRole('button', { name: /^Bahn 1, läuft$/ })
  await expect(bahn1).toBeVisible()

  await bahn1.tap()
  await expect(page.getByRole('button', { name: /^Bahn 1, läuft$/ })).toBeVisible()

  await page.getByRole('button', { name: /^Bahn 1, läuft$/ }).tap()
  await expect(page.getByRole('button', { name: /^Bahn 1, im Ziel$/ })).toBeVisible()

  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await expect(page.getByText('1 Lauf')).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await expect(page.getByText('1 Lauf')).toBeVisible()
})

test('verwirft einen Lauf nach Rückfrage', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Start', exact: true }).tap()

  await page.getByRole('button', { name: 'Lauf verwerfen' }).tap()
  await expect(page.getByText('Lauf verwerfen?')).toBeVisible()
  await page.getByRole('button', { name: 'Verwerfen', exact: true }).tap()

  await expect(page.getByText('Nächster Lauf')).toBeVisible()
})
