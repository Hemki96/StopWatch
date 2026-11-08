/**
 * Startübersicht vor dem Start der Uhr.
 *
 * Nutzerreise: Der Trainer richtet den nächsten Lauf ein und tippt **Start**.
 * Statt sofort zu messen, zeigt die App Becken, Strecke, Bahnen, Schwimmer und
 * Startzeiten noch einmal. Erst **Jetzt starten** setzt den ersten
 * Startzeitstempel; **Einstellungen ändern** führt zurück in die Konfiguration,
 * ohne dass eine Uhr läuft.
 *
 * Vorbedingung: frischer Browser-Kontext je Test, also leere IndexedDB und
 * Standardkonfiguration (50-m-Becken, 100 m, 6 Bahnen).
 */
import { expect, test } from '@playwright/test'
import { oeffneApp } from './helfer'

// Nutzerreise: Auf einem kleinen Handy und im Querformat muss die Bestätigung
// ohne Scrollen erreichbar sein. Vorher lag „Jetzt starten“ unterhalb des
// sichtbaren Bereichs; der Start wirkte wie eine Sackgasse.
for (const groesse of [
  { width: 375, height: 667 },
  { width: 844, height: 390 },
]) {
  test(`hält „Jetzt starten“ bei ${groesse.width}×${groesse.height} im Sichtfeld`, async ({
    page,
  }) => {
    await page.setViewportSize(groesse)
    await oeffneApp(page)
    await page.getByRole('button', { name: 'Start', exact: true }).tap()

    const starten = page.getByRole('button', { name: 'Jetzt starten', exact: true })
    await expect(starten).toBeVisible()
    const box = await starten.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(groesse.height)
  })
}

test('zeigt die Einstellungen des nächsten Laufs und startet erst auf Bestätigung', async ({
  page,
}) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Start', exact: true }).tap()

  const uebersicht = page.getByRole('dialog')
  await expect(uebersicht.getByText('Start prüfen')).toBeVisible()
  await expect(uebersicht.getByText('50 m', { exact: true })).toBeVisible()
  await expect(uebersicht.getByText('100 m', { exact: true })).toBeVisible()
  await expect(uebersicht.getByText('Zwischenzeiten', { exact: true })).toBeVisible()
  await expect(
    uebersicht.getByText('1 Zwischenzeit, dann das Ziel', { exact: true }),
  ).toBeVisible()
  await expect(uebersicht.getByText('6 Bahnen', { exact: true })).toBeVisible()
  // Jede Bahn ohne Zuordnung steht ausdrücklich als „frei“ da.
  await expect(uebersicht.getByText('frei', { exact: true })).toHaveCount(6)

  // Vor der Bestätigung läuft keine Uhr.
  await expect(page.getByRole('button', { name: /Bahn 1, läuft$/ })).toHaveCount(0)
  await expect(uebersicht.getByRole('button', { name: 'Jetzt starten' })).toBeVisible()

  await uebersicht.getByRole('button', { name: 'Jetzt starten' }).tap()
  await expect(page.getByRole('button', { name: /Bahn 1, läuft$/ })).toBeVisible()
})

test('führt über „Einstellungen ändern“ zurück in die Konfiguration, ohne zu starten', async ({
  page,
}) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Start', exact: true }).tap()

  const uebersicht = page.getByRole('dialog')
  await uebersicht.getByRole('button', { name: 'Einstellungen ändern' }).tap()

  // Das Konfigurations-Sheet steht an derselben Stelle; die Uhr bleibt aus.
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Beckenlänge' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Bahn 1, läuft$/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Bahn 1, bereit$/ })).toHaveCount(0)
})
