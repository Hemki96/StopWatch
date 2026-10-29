import { expect, test } from '@playwright/test'
import { oeffneApp } from './helfer'

test('bereitet Sätze und Aktive vor, startet den ersten Satz und passt den Plan an', async ({
  page,
}) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Training' }).tap()

  await expect(page.getByText('Noch kein Training vorbereitet')).toBeVisible()
  await page.getByRole('button', { name: 'Neues Training' }).tap()

  await expect(page.getByRole('button', { name: /^Aktive/ })).toContainText('6 Bahnen')
  await expect(
    page.getByRole('button', { name: 'Satz 1: 100 m · Freistil, offen' }),
  ).toBeVisible()

  // Der erste Satz startet sofort im Timer.
  await page.getByRole('button', { name: 'Satz 1 starten' }).tap()
  await expect(page.getByRole('button', { name: /^Bahn 1, läuft$/ })).toBeVisible()

  // Zurück im Training ist der Satz als laufend markiert.
  await page.getByRole('button', { name: 'Training' }).tap()
  await expect(
    page.getByRole('button', { name: 'Satz 1: 100 m · Freistil, läuft' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zum laufenden Satz' })).toBeVisible()

  // Ein weiterer Satz lässt sich während des Trainings ergänzen und anpassen.
  await page.getByRole('button', { name: 'Satz hinzufügen' }).tap()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'Mehr Wiederholungen' }).tap()
  await sheet.getByRole('button', { name: 'Satz hinzufügen' }).tap()
  await expect(
    page.getByRole('button', { name: 'Satz 2: 2×100 m · Freistil, offen' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Satz 2: 2×100 m · Freistil, offen' }).tap()
  const bearbeiten = page.getByRole('dialog')
  await bearbeiten.getByRole('button', { name: 'Weniger Wiederholungen' }).tap()
  await bearbeiten.getByRole('button', { name: 'Satz speichern' }).tap()
  await expect(
    page.getByRole('button', { name: 'Satz 2: 100 m · Freistil, offen' }),
  ).toBeVisible()

  // Die Aktiven gelten für alle noch offenen Sätze.
  await page.getByRole('button', { name: /^Aktive/ }).tap()
  const aktive = page.getByRole('dialog')
  await aktive.getByRole('button', { name: 'Weniger Bahnen' }).tap()
  await aktive.getByRole('button', { name: 'Weniger Bahnen' }).tap()
  await aktive.getByRole('button', { name: 'Aktive übernehmen' }).tap()
  await expect(page.getByRole('button', { name: /^Aktive/ })).toContainText('4 Bahnen')
})
