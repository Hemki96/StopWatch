import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { oeffneApp, warteAufSatzbezeichnung } from './helfer'

async function starteUndStoppe(page: import('@playwright/test').Page) {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Start', exact: true }).tap()

  // Klick statt Tap: Ein unter Last verzögerter Pointer-Up würde sonst als
  // Long-Press gelten und den Start wieder zurücknehmen.
  const bahn = () => page.getByRole('button', { name: /^Bahn 1, läuft$/ })
  await expect(bahn()).toBeVisible()
  await bahn().dispatchEvent('click')
  await expect(bahn()).toHaveAttribute('data-anschlaege', '1')
  await page.waitForTimeout(120)
  await bahn().dispatchEvent('click')
  await expect(page.getByRole('button', { name: /^Bahn 1, im Ziel$/ })).toBeVisible()
}

test('korrigiert eine Zielzeit im Verlauf und behält sie nach einem Reload', async ({ page }) => {
  await starteUndStoppe(page)
  await page.getByRole('button', { name: 'Verlauf' }).tap()

  await page.getByRole('button', { name: /6 Bahnen · 100 m/ }).tap()
  await page.getByRole('button', { name: 'Anschlag 2 korrigieren' }).tap()
  await page.getByLabel('Zeit für Länge 2').fill('00:59,00')
  await page.getByRole('button', { name: 'OK', exact: true }).tap()

  await expect(page.locator('span.tabular', { hasText: '00:59,00' }).first()).toBeVisible()
  await expect(page.getByText('manuell', { exact: true })).toBeVisible()

  // Eine Korrektur, die vor dem vorherigen Anschlag liegt, wird abgelehnt.
  await page.getByRole('button', { name: 'Anschlag 2 korrigieren' }).tap()
  await page.getByLabel('Zeit für Länge 2').fill('00:00,00')
  await page.getByRole('button', { name: 'OK', exact: true }).tap()
  await expect(page.getByRole('alert')).toContainText('nach dem vorherigen Anschlag')
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).tap()

  await page.reload()
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await page.getByRole('button', { name: /6 Bahnen · 100 m/ }).tap()
  await expect(page.locator('span.tabular', { hasText: '00:59,00' }).first()).toBeVisible()
  await expect(page.getByText('manuell', { exact: true })).toBeVisible()
})

test('exportiert einen Lauf als CSV mit der korrigierten Zeit', async ({ page }) => {
  await starteUndStoppe(page)
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await page.getByRole('button', { name: /6 Bahnen · 100 m/ }).tap()
  await page.getByRole('button', { name: 'Anschlag 2 korrigieren' }).tap()
  await page.getByLabel('Zeit für Länge 2').fill('00:59,00')
  await page.getByRole('button', { name: 'OK', exact: true }).tap()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Als CSV exportieren' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^beckenrand-\d{4}-\d{2}-\d{2}\.csv$/)

  const pfad = await download.path()
  const inhalt = await readFile(pfad!, 'utf8')
  expect(inhalt).toContain('59000;00:59,00;1;1')
  expect(inhalt).toContain('\uFEFFsatz;datum;beckenlaenge_m')
})

test('benennt einen Satz um und behält den Namen nach einem Reload', async ({ page }) => {
  await starteUndStoppe(page)
  await page.getByRole('button', { name: 'Verlauf' }).tap()

  await page.getByRole('button', { name: '100 m · Freistil', exact: true }).dispatchEvent('click')
  await page.getByLabel('Satzbezeichnung').fill('Abschlussserie')
  await page.getByLabel('Satzbezeichnung').press('Enter')

  await expect(page.getByText('Abschlussserie')).toBeVisible()
  await warteAufSatzbezeichnung(page, 'Abschlussserie')
  await page.reload()
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await expect(page.getByText('Abschlussserie')).toBeVisible()
})

test('löscht einen einzelnen Lauf nach Rückfrage', async ({ page }) => {
  await starteUndStoppe(page)
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await page.getByRole('button', { name: /6 Bahnen · 100 m/ }).tap()

  await page.getByRole('button', { name: 'Lauf löschen' }).tap()
  await expect(page.getByRole('alertdialog')).toContainText('Lauf löschen?')
  await page.getByRole('button', { name: 'Löschen', exact: true }).tap()

  await expect(page.getByText('Noch keine Messungen.')).toBeVisible()
})
