/**
 * Rauchtest der wichtigsten Nutzerreise.
 *
 * Prüft in einem Durchlauf, dass ein Lauf gestartet, eine Bahn zweimal
 * angeschlagen (zwei Längen bei 100 m im 50-m-Becken) und das Ergebnis nach
 * einem Reload aus IndexedDB wieder im Verlauf erscheint. Der zweite Fall
 * sichert die Rückfrage vor dem Verwerfen eines Laufs ab. Die Specs laufen
 * gegen den Dev- oder Preview-Server aus `playwright.config.ts`; jeder Test
 * bekommt einen frischen Browser-Kontext und damit eine leere Datenbank.
 */
import { expect, test } from '@playwright/test'
import { oeffneApp, starteLauf } from './helfer'

// Kernreise: Start → zwei Anschläge → Verlauf → Reload. Der Reload ist der
// eigentliche Prüfpunkt, weil er die gemessenen Zeiten aus IndexedDB neu lädt.
test('startet einen Lauf, stoppt eine Bahn und behält den Verlauf nach Reload', async ({ page }) => {
  await oeffneApp(page)

  await expect(page.getByText('Nächster Lauf')).toBeVisible()
  await starteLauf(page)

  const bahn1 = page.getByRole('button', { name: /Bahn 1, läuft$/ })
  await expect(bahn1).toBeVisible()

  await bahn1.tap()
  await expect(page.getByRole('button', { name: /Bahn 1, läuft$/ })).toBeVisible()

  await page.getByRole('button', { name: /Bahn 1, läuft$/ }).tap()
  await expect(page.getByRole('button', { name: /Bahn 1, im Ziel$/ })).toBeVisible()

  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await expect(page.getByText('1 Lauf')).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await expect(page.getByText('1 Lauf')).toBeVisible()
})

// Destruktive Aktion: Der Lauf darf nicht ohne Bestätigung verschwinden.
test('verwirft einen Lauf nach Rückfrage', async ({ page }) => {
  await oeffneApp(page)
  await starteLauf(page)

  await page.getByRole('button', { name: 'Lauf verwerfen' }).tap()
  await expect(page.getByText('Lauf verwerfen?')).toBeVisible()
  await page.getByRole('button', { name: 'Verwerfen', exact: true }).tap()

  await expect(page.getByText('Nächster Lauf')).toBeVisible()
})
