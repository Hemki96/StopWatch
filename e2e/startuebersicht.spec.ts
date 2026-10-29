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
 * Standardkonfiguration (50-m-Becken, 100 m, Freistil, 6 Bahnen).
 */
import { expect, test } from '@playwright/test'
import { oeffneApp } from './helfer'

test('zeigt die Einstellungen des nächsten Laufs und startet erst auf Bestätigung', async ({
  page,
}) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Start', exact: true }).tap()

  const uebersicht = page.getByRole('dialog')
  await expect(uebersicht.getByText('Start prüfen')).toBeVisible()
  await expect(uebersicht.getByText('50 m', { exact: true })).toBeVisible()
  await expect(uebersicht.getByText('100 m', { exact: true })).toBeVisible()
  await expect(uebersicht.getByText('Freistil', { exact: true })).toBeVisible()
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
  await expect(page.getByRole('dialog').getByText('Beckenlänge')).toBeVisible()
  await expect(page.getByRole('button', { name: /Bahn 1, läuft$/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Bahn 1, bereit$/ })).toHaveCount(0)
})
