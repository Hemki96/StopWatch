import { expect, test } from '@playwright/test'
import { oeffneApp } from './helfer'

test('Backup exportieren, alles löschen und wieder einlesen', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  const bahn = page.getByRole('button', { name: /^Bahn 1, läuft$/ })
  await bahn.tap()
  await bahn.tap()
  await expect(page.getByRole('button', { name: /^Bahn 1, im Ziel$/ })).toBeVisible()

  await page.getByRole('button', { name: 'Mehr' }).tap()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /^Backup sichern/ }).click(),
  ])
  const pfad = await download.path()
  expect(pfad).not.toBeNull()

  await page.getByRole('button', { name: /^Alle Daten löschen/ }).click()
  await page.getByRole('button', { name: 'Alles löschen' }).click()
  await expect(page.getByText('Alle Daten gelöscht.')).toBeVisible()

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: /^Backup einlesen/ }).click(),
  ])
  await chooser.setFiles(pfad!)

  await expect(page.getByText('Backup importieren?')).toBeVisible()
  await expect(
    page.getByText(/0 Schwimmer, 0 Wettkämpfe, 0 Trainings, 1 Satz, 1 Lauf/),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Importieren', exact: true }).click()
  await expect(
    page.getByText(/Übernommen: 0 Schwimmer, 0 Wettkämpfe, 0 Trainings, 1 Satz, 1 Lauf/),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await expect(page.getByText('1 Lauf', { exact: true })).toBeVisible()
})

test('Ungültiges Backup wird abgelehnt, ohne den Bestand zu ändern', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  await page.getByRole('button', { name: 'Mehr' }).tap()

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: /^Backup einlesen/ }).click(),
  ])
  await chooser.setFiles({
    name: 'kaputt.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'beckenrand-backup',
        version: 99,
        exportiertAm: '2026-10-29T10:00:00.000Z',
        schwimmer: [],
        satze: [],
        laeufe: [],
      }),
    ),
  })

  await expect(page.getByText('Import nicht möglich')).toBeVisible()
  await expect(page.getByText(/Erwartet wird Version 3/)).toBeVisible()
  await page.getByRole('button', { name: 'Schließen', exact: true }).last().click()

  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await expect(page.getByText('1 Lauf', { exact: true })).toBeVisible()
})
