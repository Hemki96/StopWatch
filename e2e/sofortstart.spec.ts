/**
 * Sofortstart: ohne konfigurierten Lauf messen, beliebig viele Zwischenzeiten
 * nehmen und während der laufenden Uhr weitere Personen hinzufügen.
 *
 * Nutzerreise: Am Beckenrand steht eine Gruppe ohne festen Plan. Der Trainer
 * tippt „Sofort starten“, misst eine offene Strecke und ergänzt Personen,
 * sobald sie ins Wasser gehen. Jede nachgetragene Person startet in dem
 * Moment, in dem sie hinzugefügt wird.
 *
 * Vorbedingung: frischer Browser-Kontext; die Standardwerte reichen, weil der
 * Sofortstart bewusst ohne Konfiguration auskommt.
 */

import { expect, test } from '@playwright/test'
import { oeffneApp } from './helfer'

test('Sofortstart misst offen, nimmt beliebig viele Splits und neue Personen', async ({
  page,
}) => {
  await oeffneApp(page)

  await page.getByRole('button', { name: 'Sofort starten' }).tap()

  // Eine Bahn läuft sofort; die Strecke ist offen, deshalb gibt es kein
  // automatisches Ziel nach einer festen Länge.
  const bahnEins = page.getByRole('button', { name: /Bahn 1, läuft$/ })
  await expect(bahnEins).toBeVisible()
  // Der Start ist offen; die Laufleiste und die Kopfzeile nennen das beide.
  await expect(page.getByText(/offene Strecke/)).toHaveCount(2)

  // Drei Taps sind drei Zwischenzeiten, kein Ziel.
  await bahnEins.tap()
  await bahnEins.tap()
  await bahnEins.tap()
  await expect(bahnEins).toHaveAttribute('data-anschlaege', '3')
  await expect(bahnEins).toContainText('3 Zwischenzeiten')

  // Weitere Person während der laufenden Uhr: Sie startet sofort mit.
  await page.getByRole('button', { name: 'Person hinzufügen' }).tap()
  const bahnZwei = page.getByRole('button', { name: /Bahn 2, läuft$/ })
  await expect(bahnZwei).toBeVisible()
  await bahnZwei.tap()
  await expect(bahnZwei).toHaveAttribute('data-anschlaege', '1')

  // Die erste Bahn läuft weiter und nimmt weitere Splits an.
  await bahnEins.tap()
  await expect(bahnEins).toHaveAttribute('data-anschlaege', '4')

  // Das Ziel setzt nur die zweite Bahn; die erste bleibt offen.
  await page
    .locator('[data-reihe="1"][data-bahn="2"]')
    .getByRole('button', { name: 'Ziel', exact: true })
    .click()
  await expect(page.getByRole('button', { name: /Bahn 2, im Ziel$/ })).toBeVisible()
  await expect(bahnEins).toHaveAttribute('data-status', 'laeuft')
})
