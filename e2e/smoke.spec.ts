import { expect, test } from '@playwright/test'

test('startet einen Lauf, stoppt eine Bahn und behält den Verlauf nach Reload', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('Nächster Lauf')).toBeVisible()
  await page.getByRole('button', { name: 'Start', exact: true }).tap()

  const bahn1 = page.getByRole('button', { name: /^Bahn 1, laeuft$/ })
  await expect(bahn1).toBeVisible()

  await bahn1.tap()
  await expect(page.getByRole('button', { name: /^Bahn 1, laeuft$/ })).toBeVisible()

  await page.getByRole('button', { name: /^Bahn 1, laeuft$/ }).tap()
  await expect(page.getByRole('button', { name: /^Bahn 1, beendet$/ })).toBeVisible()

  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await expect(page.getByText('1 Lauf')).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await expect(page.getByText('1 Lauf')).toBeVisible()
})

test('verwirft einen Lauf nach Rückfrage', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start', exact: true }).tap()

  await page.getByRole('button', { name: 'Lauf verwerfen' }).tap()
  await expect(page.getByText('Lauf verwerfen?')).toBeVisible()
  await page.getByRole('button', { name: 'Verwerfen', exact: true }).tap()

  await expect(page.getByText('Nächster Lauf')).toBeVisible()
})
