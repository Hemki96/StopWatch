/**
 * Einheiten im Wettkampf: Anlegen, Disziplin, Ergebnis, CSV und Import.
 *
 * Nutzerreise: Ein Hallencup findet in einem 25-Yard-Becken statt. Der Trainer
 * legt den Wettkampf in Yards an, erfasst eine 100-yd-Disziplin, misst eine
 * Zeit und exportiert das Ergebnis als CSV. Danach importiert er eine
 * Meldeliste: Ein Meter-Eintrag wird mit Zeilennummer abgelehnt, ein
 * Yard-Eintrag übernommen.
 *
 * Vorbedingung: frischer Browser-Kontext je Test.
 */

import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { oeffneApp, warteAufZielzeiten } from './helfer'

test('legt einen Yard-Wettkampf an, misst, exportiert und importiert', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Wettkampf', exact: true }).tap()

  // Wettkampf in Yards: nur die 25-Yard-Beckenlänge steht bereit.
  await page.getByRole('button', { name: 'Neuer Wettkampf' }).tap()
  const anlegen = page.getByRole('dialog')
  await anlegen.getByLabel('Name des Wettkampfs').fill('Hallencup')
  await anlegen
    .locator('section', { hasText: 'Einheit' })
    .getByRole('button', { name: 'Yards' })
    .tap()
  await expect(anlegen.getByRole('button', { name: '25 yd' })).toHaveClass(/bg-accent/)
  await anlegen.getByRole('button', { name: 'Wettkampf anlegen' }).tap()

  await expect(page.getByText(/25 yd-Becken/)).toBeVisible()
  await page.getByRole('button', { name: 'Disziplin anlegen' }).tap()

  // Die Disziplin übernimmt die Einheit des Wettkampfs; 100 yd sind die
  // Vorgabe und passen als vier Längen zum 25-Yard-Becken.
  const disziplin = page.getByRole('dialog')
  await expect(disziplin.getByRole('button', { name: '100 yd', exact: true })).toHaveClass(/bg-accent/)
  await disziplin.getByRole('button', { name: '100 yd Freistil anlegen' }).tap()
  await expect(page.getByRole('heading', { name: '100 yd Freistil' })).toBeVisible()

  // Eine Bahn mit Namen, dann ein Tap als Ziel.
  await page.getByRole('button', { name: /Bahnen ohne Namen/ }).tap()
  await page.getByLabel('Name für Bahn 1').fill('Mia')
  await page.getByRole('button', { name: 'Namen speichern' }).tap()
  // Im Wettkampf startet der Knopf direkt; nur der Trainings-Timer zeigt die
  // Startübersicht.
  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  await page.getByRole('button', { name: /^Bahn 1, Mia, läuft$/ }).tap()
  await expect(
    page.getByRole('button', { name: /^Bahn 1, Mia, im Ziel, 1\. Platz$/ }),
  ).toBeVisible()
  await warteAufZielzeiten(page, 1)

  // CSV: Bezeichnung, kanonische Meter, Anzeige-Strecke und Einheit stehen
  // nebeneinander; die Disziplin heißt „100 yd Freistil“.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Disziplin als CSV exportieren' }).click(),
  ])
  const pfad = await download.path()
  const inhalt = await readFile(pfad!, 'utf8')
  expect(inhalt).toContain('disziplin;strecke_m;strecke;einheit;schwimmart')
  expect(inhalt).toContain('Hallencup;2026-10-29;100 yd Freistil;91.44;100;yd;freistil;')
  expect(inhalt).toContain(';1;1;1;Mia;')

  // Reload: Wettkampf, Einheit und Ergebnis bleiben erhalten.
  await page.reload()
  await expect(page.locator('[data-tab-status="aktiv"]')).toBeVisible()
  await page.getByRole('button', { name: 'Wettkampf', exact: true }).tap()
  await page.getByRole('button', { name: /Hallencup/ }).tap()
  await expect(page.getByText(/25 yd-Becken/)).toBeVisible()
  await page.getByRole('button', { name: /100 yd Freistil/ }).tap()
  await expect(page.getByRole('button', { name: /^Bahn 1, Mia, im Ziel, 1\. Platz$/ })).toBeVisible()

  // Meldeliste: Ein Meter-Eintrag passt nicht zum Yard-Wettkampf und nennt die
  // Zeile; ein Yard-Eintrag wird übernommen.
  await page.getByRole('button', { name: 'Zurück' }).tap()
  await page.getByRole('button', { name: 'Meldeliste hinzufügen' }).tap()
  const importSheet = page.getByRole('dialog')
  const meldeliste = importSheet.getByRole('textbox', { name: 'Meldeliste' })
  await meldeliste.fill(['disziplin;name', '100 m Freistil;Ben'].join('\n'))
  await expect(importSheet.getByRole('alert')).toContainText('Zeile 2')
  await expect(importSheet.getByRole('alert')).toContainText('25 yd')

  await meldeliste.fill(['disziplin;name', '100 yd Freistil;Ben'].join('\n'))
  await expect(importSheet.getByText('1 Disziplin, 1 Lauf, 1 Start')).toBeVisible()
  await importSheet.getByRole('button', { name: 'Meldeliste hinzufügen' }).tap()
  await expect(page.getByRole('button', { name: '100 yd Freistil' })).toHaveCount(2)
})
