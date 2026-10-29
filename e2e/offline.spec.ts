/**
 * Offline-Fähigkeit der installierten PWA.
 *
 * Der Test lädt die App einmal mit Netz, wartet auf einen aktiven Service
 * Worker und prüft, dass der Cache gefüllt ist. Danach wird der Kontext offline
 * geschaltet und neu geladen: Die Oberfläche muss aus dem Cache starten und der
 * zuvor angelegte Lauf weiterhin sichtbar sein. Voraussetzung ist ein
 * Produktions-Build, weil der Dev-Server keinen Service Worker registriert.
 */
import { expect, test } from '@playwright/test'
import { oeffneApp, starteLauf, warteAufAnschlaege } from './helfer'

/**
 * Läuft gegen den gebauten Stand (`npm run build` + `npm run preview`).
 * Der Dev-Server registriert keinen Service Worker und kann das nicht prüfen.
 */
test('App lädt offline aus dem Service-Worker-Cache, der Lauf bleibt sichtbar', async ({
  page,
  context,
}) => {
  await oeffneApp(page)

  // Ohne aktiven Service Worker ist der Test wertlos.
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false
    const registrierung = await navigator.serviceWorker.getRegistration()
    return registrierung?.active !== null && registrierung?.active !== undefined
  })

  const cachesGefuellt = await page.evaluate(async () => {
    const namen = await caches.keys()
    let eintraege = 0
    for (const name of namen) {
      const cache = await caches.open(name)
      eintraege += (await cache.keys()).length
    }
    return eintraege
  })
  expect(cachesGefuellt).toBeGreaterThan(0)

  await starteLauf(page)
  await page.getByRole('button', { name: /Bahn 1, läuft$/ }).tap()
  await expect(page.locator('[data-anschlaege="1"]')).toBeVisible()
  await warteAufAnschlaege(page, 1)

  await context.setOffline(true)
  await page.reload()

  // Die App rendert aus dem Cache; der angelegte Lauf ist weiterhin da. Die
  // Bahn ist nach dem Reload unterbrochen: Der monotone Start fehlt, die
  // gemessene Zeit bleibt. Ein Tap darf sie nicht neu starten und damit einen
  // Split vor dem bereits erfassten erzeugen.
  await expect(page.getByRole('button', { name: /Bahn 1, unterbrochen$/ })).toBeVisible()
  await page.getByRole('button', { name: /Bahn 1, unterbrochen$/ }).tap()
  await expect(page.locator('[data-anschlaege="1"]')).toBeVisible()
  await expect(page.getByText('Nächster Lauf')).toHaveCount(0)
})
