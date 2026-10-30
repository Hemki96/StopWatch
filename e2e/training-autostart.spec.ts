/**
 * Automatischer Satzwechsel im Training.
 *
 * Nutzerreise: Der Trainer legt zwei Sätze an, startet den ersten und beendet
 * ihn. Weil der Schalter „Sätze automatisch starten“ bei einem neuen Training
 * an ist, beginnt der zweite Satz direkt im Timer; der erste bleibt in der
 * Laufleiste erreichbar. Der Test prüft den Übergang und den Hinweis.
 *
 * Vorbedingung: frischer Browser-Kontext. Die Einstellungen werden per
 * `addInitScript` auf eine Bahn und 100 m verkürzt, damit der erste Satz mit
 * zwei Anschlägen im 50-m-Becken abgeschlossen ist.
 */

import { expect, test, type Page } from '@playwright/test'
import { oeffneApp } from './helfer'

/** Startet die App mit einer einzelnen Bahn auf 100 m. */
async function oeffneMitEinerBahn(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'beckenrand.v2.einstellungen',
        JSON.stringify({
          konfiguration: { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' },
          bahnen: 1,
          reihen: 1,
          schwimmerProBahn: [],
          startversatzMs: 0,
          wiederholungen: 1,
          taktSek: 120,
        }),
      )
    } catch {
      // Ohne localStorage gelten die Standardwerte; der Test scheitert dann
      // sichtbar an der Bahnzahl statt an einer falschen Annahme.
    }
  })
  await oeffneApp(page)
}

test('startet den nächsten Trainingssatz nach dem letzten Ziel automatisch', async ({ page }) => {
  await oeffneMitEinerBahn(page)
  await page.getByRole('button', { name: 'Training' }).tap()
  await page.getByRole('button', { name: 'Neues Training' }).tap()

  // Ein neues Training hat den automatischen Wechsel bereits eingeschaltet.
  const schalter = page.getByRole('switch', { name: /Sätze automatisch starten/ })
  await expect(schalter).toHaveAttribute('aria-checked', 'true')

  // Zweiten Satz anlegen; der erste bleibt der 100-m-Satz aus den Einstellungen.
  await page.getByRole('button', { name: 'Satz hinzufügen' }).tap()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'Satz hinzufügen' }).tap()
  await expect(
    page.getByRole('button', { name: 'Satz 2: 100 m, offen' }),
  ).toBeVisible()

  // Ersten Satz starten und im 50-m-Becken mit zwei Anschlägen beenden.
  await page.getByRole('button', { name: 'Satz 1 starten' }).tap()
  await page.getByRole('button', { name: 'Jetzt starten' }).tap()

  const bahn = page.getByRole('button', { name: /Bahn 1, läuft$/ })
  await bahn.tap()
  await page.waitForTimeout(150)
  await bahn.tap()

  // Der zweite Satz startet ohne Rückkehr in den Training-Tab. Der Hinweis
  // nennt den Satz; die Bahn des neuen Satzes läuft bereits.
  await expect(page.getByText(/Satz 2 gestartet/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Bahn 1, läuft$/ })).toBeVisible()

  // Der abgeschlossene Satz bleibt in der Laufleiste erreichbar.
  await expect(page.getByRole('button', { name: /100 m.*Ziel/ })).toBeVisible()
})
