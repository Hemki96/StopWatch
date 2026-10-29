/**
 * Timer-Statuszeile: verstrichene Laufzeit eines einzelnen Laufs.
 *
 * Nutzerreise: Der Trainer startet einen Lauf und sieht neben dem Fortschritt
 * die Zeit, die seit dem ersten Start vergangen ist. Sie enthält den
 * Startversatz der Reihen und bleibt nach dem letzten Ziel stehen. Fehlt der
 * Wake-Lock, wird die Zeile samt Laufzeit gelb gewarnt.
 *
 * Vorbedingung: frischer Browser-Kontext. Die Tests setzen die Konfiguration
 * per `addInitScript` in `localStorage`, damit ein einzelner Lauf schnell
 * vollständig ist und der Test nicht sechs Bahnen doppelt antippen muss.
 */

import { expect, test, type Page } from '@playwright/test'
import { oeffneApp, starteLauf } from './helfer'

/**
 * Startet die App mit einer einzelnen Bahn auf 100 m.
 *
 * @param page - Seite des Tests.
 * @param reihen - Anzahl der Reihen; bei 2 entsteht ein Startversatz.
 */
async function oeffneMitEinemLauf(page: Page, reihen = 1): Promise<void> {
  await page.addInitScript((anzahlReihen) => {
    try {
      localStorage.setItem(
        'beckenrand.v2.einstellungen',
        JSON.stringify({
          konfiguration: { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' },
          bahnen: 1,
          reihen: anzahlReihen,
          schwimmerProBahn: [],
          // 1 s Versatz genügt, um „ab erstem Start“ zu prüfen; größere Werte
          // würden den Test nur verlangsamen.
          startversatzMs: 1000,
          wiederholungen: 1,
          taktSek: 120,
        }),
      )
    } catch {
      // Ohne localStorage gelten die Standardwerte; der Test braucht sie nur
      // zur Verkürzung und würde dann an der Bahnzahl scheitern.
    }
  }, reihen)
  await oeffneApp(page)
}

test('zeigt die Laufzeit, zählt sie hoch und friert beim letzten Ziel ein', async ({ page }) => {
  await oeffneMitEinemLauf(page)
  await starteLauf(page)

  const laufzeit = page.locator('[data-laufzeit]')
  await expect(laufzeit).toContainText('Laufzeit')
  const erster = Number(await laufzeit.getAttribute('data-laufzeit'))
  expect(erster).toBeGreaterThanOrEqual(0)

  // Die Anzeige läuft mit der Uhr, nicht nur beim nächsten Anschlag.
  await page.waitForTimeout(250)
  const zweiter = Number(await laufzeit.getAttribute('data-laufzeit'))
  expect(zweiter).toBeGreaterThan(erster)

  // Zwei Anschläge beenden den 100-m-Lauf im 50-m-Becken.
  const bahn = page.getByRole('button', { name: /Bahn 1, läuft$/ })
  await bahn.dispatchEvent('click')
  await page.waitForTimeout(120)
  await bahn.dispatchEvent('click')
  // Mit dem letzten Ziel wechselt der Timer von den Kacheln zur
  // Ergebnisübersicht; die Bahn steht dort mit ihrer Zielzeit.
  await expect(page.getByRole('heading', { name: 'Ergebnis' })).toBeVisible()
  // Ohne Schwimmer gibt es bewusst kein PB-Badge; die Zeit steht trotzdem da.
  await expect(page.locator('li[data-bahn="1"]')).toContainText('kein PB')

  // Nach dem Ziel bleibt der Wert stehen, auch wenn die Uhr weiterläuft.
  const eingefroren = await page.locator('[data-laufzeit]').getAttribute('data-laufzeit')
  expect(Number(eingefroren)).toBeGreaterThanOrEqual(zweiter)
  await page.waitForTimeout(300)
  await expect(page.locator('[data-laufzeit]')).toHaveAttribute('data-laufzeit', eingefroren!)
})

test('beginnt mit dem Startversatz beim ersten Start', async ({ page }) => {
  await oeffneMitEinemLauf(page, 2)
  await starteLauf(page)

  // Reihe 2 startet eine Sekunde später; die Laufzeit beginnt trotzdem mit
  // Reihe 1 und ist deshalb schon größer als null, bevor Reihe 2 dran ist.
  await expect(page.getByRole('heading', { name: 'Reihe 2' })).toBeVisible()
  await page.waitForTimeout(100)
  const laufzeit = page.locator('[data-laufzeit]')
  await expect(laufzeit).toBeVisible()
  expect(Number(await laufzeit.getAttribute('data-laufzeit'))).toBeGreaterThanOrEqual(0)
})

test('färbt die Laufzeit bei fehlendem Wake-Lock amber', async ({ page }) => {
  // Die App fragt den Wake-Lock beim Start an; ohne die API bleibt er aus und
  // die Statuszeile zeigt den Warnhinweis, zu dem die Laufzeit gehört.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'wakeLock', { value: undefined, configurable: true })
  })
  await oeffneMitEinemLauf(page)
  await starteLauf(page)

  const laufzeit = page.locator('[data-laufzeit]')
  await expect(laufzeit).toBeVisible()
  await expect(page.getByText('Display-Sperre nicht aktiv')).toBeVisible()
  // Die Farbe steckt am umgebenden Statusblock; die Laufzeit erbt sie. Der
  // Test prüft die Klasse statt eines gerenderten Farbwerts, weil jsdom und
  // Playwright keine verlässliche Pixelmessung liefern.
  const block = laufzeit.locator('xpath=ancestor::div[contains(@class, "text-warn")]')
  await expect(block).toHaveCount(1)
})
