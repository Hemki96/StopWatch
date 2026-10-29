import { expect, test, type Locator, type Page } from '@playwright/test'
import { oeffneApp, warteAufSchwimmerzuordnung } from './helfer'

const BAHN1 = /^Bahn 1, läuft$/

async function langdruck(page: Page, ziel: Locator): Promise<void> {
  const box = await ziel.boundingBox()
  if (!box) throw new Error('Kachel nicht sichtbar')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  // Der Statustext erscheint, bevor der Undo greift.
  await expect(ziel.locator('[data-haltend="true"]')).toBeVisible()
  await page.waitForTimeout(550)
  await page.mouse.up()
}

test('Long-Press nimmt den letzten Anschlag zurück', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Start', exact: true }).tap()

  const bahn = page.getByRole('button', { name: BAHN1 })
  await bahn.tap()
  await expect(bahn).toHaveAttribute('data-anschlaege', '1')
  await expect(bahn).toContainText('Länge 2/2')

  await langdruck(page, bahn)

  await expect(bahn).toHaveAttribute('data-anschlaege', '0')
  await expect(bahn).toContainText('Länge 1/2')
})

test('Offene Strecke: Ziel beendet die Bahn, weitere Taps ändern nichts', async ({ page }) => {
  await oeffneApp(page)

  await page.getByRole('button', { name: /Nächster Lauf|m ·/ }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'offen', exact: true }).click()
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).click()

  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  const bahn = page.getByRole('button', { name: BAHN1 })
  await bahn.tap()
  await expect(bahn).toHaveAttribute('data-anschlaege', '1')

  await bahn.getByRole('button', { name: 'Ziel', exact: true }).click()
  const beendet = page.getByRole('button', { name: /^Bahn 1, im Ziel$/ })
  await expect(beendet).toHaveAttribute('data-anschlaege', '2')

  await beendet.tap()
  await expect(beendet).toHaveAttribute('data-anschlaege', '2')
  await expect(beendet).toHaveAttribute('data-status', 'beendet')
})

test('Schwimmer anlegen, Bahn zuordnen und Reload überstehen', async ({ page }) => {
  await oeffneApp(page)

  await page.getByRole('button', { name: 'Schwimmer' }).tap()
  await page.getByRole('button', { name: 'Schwimmer hinzufügen' }).click()
  await page.getByLabel('Name').fill('Mia')
  await page.getByRole('button', { name: 'Speichern' }).click()

  await page.getByRole('button', { name: 'Timer' }).tap()
  await page.getByRole('button', { name: /m ·/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Schwimmer für Bahn 1').selectOption({ label: 'Mia' })
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).click()

  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  await expect(page.getByRole('button', { name: /^Bahn 1, Mia, läuft$/ })).toBeVisible()
  await warteAufSchwimmerzuordnung(page)

  await page.reload()
  await expect(page.locator('[data-tab-status="aktiv"]')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Bahn 1, Mia, bereit$/ })).toBeVisible()
})

test('Satz löschen entfernt den Satz samt Läufen', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await expect(page.getByText('1 Lauf')).toBeVisible()

  await page.getByRole('button', { name: /^Satz löschen, 1 Läufe$/ }).click()
  await expect(page.getByText('1 Lauf wird mitgelöscht.')).toBeVisible()
  await page.getByRole('button', { name: 'Satz löschen', exact: true }).click()

  await expect(page.getByText('Noch keine Messungen.')).toBeVisible()
})

test('Escape schließt bei gestapelten Dialogen nur den obersten', async ({ page }) => {
  await oeffneApp(page)

  await page.getByRole('button', { name: 'Schwimmer' }).tap()
  await page.getByRole('button', { name: 'Schwimmer hinzufügen' }).click()
  await page.getByLabel('Name').fill('Mia')
  await page.getByRole('button', { name: 'Speichern' }).click()

  await page.getByRole('button', { name: 'Mia bearbeiten' }).click()
  await page.getByRole('button', { name: 'Schwimmer löschen' }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('alertdialog')).toBeHidden()
  await expect(page.getByRole('dialog')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})
