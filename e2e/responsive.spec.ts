/**
 * Responsive Grenzen der Oberfläche.
 *
 * Geprüft werden die beiden Umschaltpunkte aus `src/index.css`: seitliche
 * Navigation und zentrierte Sheets ab genügend Breite (`rail`) sowie die flache
 * untere Leiste bei wenig Höhe (`short`). Die Tests messen Geometrie
 * (Bounding-Boxes, Scrollbreite), nicht einzelne Tailwind-Klassen, damit ein
 * Umbau der Klassen nicht unnötig fehlschlägt.
 */
import { expect, test } from '@playwright/test'
import { oeffneApp, starteLauf } from './helfer'

/**
 * Die Oberfläche wechselt an zwei Stellen ihr Layout: seitliche Navigation auf
 * genug Fläche (`rail`) und eine flache Leiste bei wenig Höhe (`short`). Diese
 * Tests prüfen die beiden Grenzen, statt einzelne Klassennamen zu prüfen.
 */
test.describe('Tablet', () => {
  test.use({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true })

  test('nutzt die seitliche Navigation, große Bahnen und ein zentriertes Sheet', async ({
    page,
  }) => {
    await oeffneApp(page)

    const nav = page.getByRole('navigation', { name: 'Bereiche' })
    const main = page.locator('main').first()
    const navBox = await nav.boundingBox()
    const mainBox = await main.boundingBox()
    expect(navBox).not.toBeNull()
    expect(mainBox).not.toBeNull()
    // Hochkant links statt breit unten.
    expect(navBox!.height).toBeGreaterThan(navBox!.width)
    expect(navBox!.x).toBeLessThan(mainBox!.x)

    // Formulare werden zum zentrierten Fenster statt zum breiten Bottom Sheet.
    await page.getByRole('button', { name: /50 m · 100 m · 6 Bahnen/ }).tap()
    const sheetBox = await page.getByRole('dialog').boundingBox()
    expect(sheetBox).not.toBeNull()
    expect(sheetBox!.width).toBeLessThanOrEqual(600)
    expect(sheetBox!.x).toBeGreaterThan(80)
    await page.keyboard.press('Escape')

    await starteLauf(page)
    const bahnBox = await page.getByRole('button', { name: /Bahn 1, läuft$/ }).boundingBox()
    expect(bahnBox).not.toBeNull()
    // Drei Spalten auf dem Tablet; die Kachel bleibt groß genug zum Treffen.
    expect(bahnBox!.width).toBeGreaterThan(200)

    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(ueberlauf).toBeLessThanOrEqual(0)
  })
})

test.describe('Handy quer', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })

  test('bleibt bei wenig Höhe bei der flachen unteren Leiste', async ({ page }) => {
    await oeffneApp(page)

    const navBox = await page.getByRole('navigation', { name: 'Bereiche' }).boundingBox()
    expect(navBox).not.toBeNull()
    // Breit und flach: fünf Einträge nebeneinander statt untereinander.
    expect(navBox!.width).toBeGreaterThan(navBox!.height)

    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(ueberlauf).toBeLessThanOrEqual(0)
  })
})
