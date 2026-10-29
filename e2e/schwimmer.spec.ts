/**
 * Schwimmer-Liste: alle Personen bleiben sichtbar.
 *
 * Nutzerreise: Der Trainer legt vor dem Training Namen an, ordnet erst einen
 * davon einer Bahn zu und misst. Zurück im Schwimmer-Tab erwartet er beide
 * Personen: die gemessene mit Bestzeit und die noch nicht zugeordnete mit dem
 * Hinweis „noch keiner Bahn zugeordnet“.
 *
 * Diese Regel weicht bewusst von #19 ab: Die Liste filtert nicht auf Personen
 * mit Bahnzuordnung, weil sich sonst ein gerade angelegter Name nicht mehr
 * bearbeiten oder später zuordnen ließe. Der Test hält beide Fälle fest.
 *
 * Vorbedingung: frischer Browser-Kontext je Test; Standardkonfiguration
 * (50-m-Becken, 100 m, Freistil, 6 Bahnen).
 */

import { expect, test } from '@playwright/test'
import { oeffneApp, warteAufSchwimmerzuordnung } from './helfer'

test('behält Schwimmer ohne Bahnzuordnung und zeigt zugeordnete mit Bestzeit', async ({
  page,
}) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Schwimmer' }).tap()

  // Zwei Personen ohne Bahn: Beide stehen in der Liste, obwohl noch keine
  // Bahn auf sie verweist.
  for (const name of ['Mia', 'Ben']) {
    await page.getByRole('button', { name: 'Schwimmer hinzufügen' }).click()
    await page.getByLabel('Name').fill(name)
    await page.getByRole('button', { name: 'Speichern' }).click()
  }
  await expect(page.getByText('2 Einträge')).toBeVisible()
  await expect(page.getByText('noch keiner Bahn zugeordnet')).toHaveCount(2)

  // Mia wird einer Bahn zugeordnet und schwimmt einen vollständigen Lauf.
  await page.getByRole('button', { name: 'Timer' }).tap()
  await page.getByRole('button', { name: /m ·/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Schwimmer für Reihe 1, Bahn 1').selectOption({ label: 'Mia' })
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).click()

  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  const bahn = page.getByRole('button', { name: /Bahn 1, Mia, läuft$/ })
  await expect(bahn).toBeVisible()
  // `dispatchEvent('click')` wie im Verlauf-Test: ein verzögerter Pointer-Up
  // würde sonst als Langdruck gelten und den Anschlag zurücknehmen.
  await bahn.dispatchEvent('click')
  await page.waitForTimeout(120)
  await bahn.dispatchEvent('click')
  await expect(page.getByRole('button', { name: /Bahn 1, Mia, im Ziel$/ })).toBeVisible()
  // Persistenz abwarten, damit der folgende Tab-Wechsel denselben Bestand sieht.
  await warteAufSchwimmerzuordnung(page)

  // Beide bleiben in der Liste: Mia nun mit Bestzeit, Ben weiter ohne Bahn.
  await page.getByRole('button', { name: 'Schwimmer' }).tap()
  const mia = page.locator('li', { hasText: 'Mia' })
  const ben = page.locator('li', { hasText: 'Ben' })
  await expect(mia).toContainText('1 Bestzeit')
  await expect(ben).toContainText('noch keiner Bahn zugeordnet')

  // Ein Reload ändert nichts: Die Liste leitet sich aus den persistierten
  // Schwimmern und Läufen ab, nicht aus einem flüchtigen Filter.
  await page.reload()
  await expect(page.locator('[data-tab-status="aktiv"]')).toBeVisible()
  await page.getByRole('button', { name: 'Schwimmer' }).tap()
  await expect(page.locator('li', { hasText: 'Mia' })).toContainText('1 Bestzeit')
  await expect(page.locator('li', { hasText: 'Ben' })).toContainText('noch keiner Bahn zugeordnet')
})
