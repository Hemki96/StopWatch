import { expect, test, type Locator, type Page } from '@playwright/test'
import { oeffneApp } from './helfer'

async function oeffneMitEinstellungen(
  page: Page,
  einstellungen: {
    bahnen: number
    streckeM: number | null
    startversatzMs: number
    wiederholungen: number
    taktSek: number
  },
): Promise<void> {
  await page.addInitScript((werte) => {
    try {
      localStorage.setItem(
        'beckenrand.einstellungen',
        JSON.stringify({
          konfiguration: {
            beckenlaengeM: 50,
            streckeM: werte.streckeM,
            schwimmart: 'freistil',
          },
          bahnen: werte.bahnen,
          schwimmerProBahn: [],
          startversatzMs: werte.startversatzMs,
          wiederholungen: werte.wiederholungen,
          taktSek: werte.taktSek,
        }),
      )
    } catch {
      // Ohne localStorage nutzt der Test die Standardeinstellungen.
    }
  }, einstellungen)
  await oeffneApp(page)
}

async function langdruck(page: Page, ziel: Locator): Promise<void> {
  const box = await ziel.boundingBox()
  if (!box) throw new Error('Zeile nicht sichtbar')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(ziel.locator('[data-haltend="true"]')).toBeVisible()
  await page.waitForTimeout(550)
  await page.mouse.up()
}

test('Startversatz hält spätere Bahnen im Countdown und mehrere Läufe bleiben erreichbar', async ({
  page,
}) => {
  await oeffneMitEinstellungen(page, {
    bahnen: 3,
    streckeM: 100,
    startversatzMs: 30_000,
    wiederholungen: 1,
    taktSek: 60,
  })

  await page.getByRole('button', { name: 'Start', exact: true }).tap()

  await expect(page.getByRole('button', { name: /^Bahn 1, läuft$/ })).toHaveAttribute(
    'data-status',
    'laeuft',
  )
  const wartend = page.getByRole('button', { name: /^Bahn 2, geplant$/ })
  await expect(wartend).toHaveAttribute('data-status', 'geplant')
  await expect(wartend).toContainText('Start in')

  await page.getByRole('button', { name: 'Weiteren Lauf anlegen' }).tap()
  const chips = page.getByRole('button', { name: /^100 m · Freistil/ })
  await expect(chips).toHaveCount(2)

  // Der neue Lauf ist vorbereitet; der alte läuft im Hintergrund weiter.
  await expect(page.getByRole('button', { name: 'Start alle', exact: true })).toBeVisible()
  await chips.nth(1).tap()
  await expect(page.getByRole('button', { name: /^Bahn 1, läuft$/ })).toHaveAttribute(
    'data-status',
    'laeuft',
  )
  await expect(page.getByRole('button', { name: /^Bahn 2, geplant$/ })).toBeVisible()
})

test('nimmt nach einem Reload fehlende Starts einer angefangenen Runde wieder auf', async ({
  page,
}) => {
  await oeffneMitEinstellungen(page, {
    bahnen: 2,
    streckeM: 100,
    startversatzMs: 0,
    wiederholungen: 2,
    taktSek: 60,
  })

  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  const bahn1 = page.getByRole('button', { name: /^Bahn 1, Runde 1 von 2, läuft$/ })
  // Klick statt Tap: Zwei sehr schnelle Taps können unter Last als Geste
  // abgebrochen werden und dann keine Anschläge erzeugen.
  await bahn1.dispatchEvent('click')
  await bahn1.dispatchEvent('click')
  await expect(
    page.getByRole('button', { name: /^Bahn 2, Runde 1 von 2, läuft$/ }),
  ).toBeVisible()

  // Beim Neuladen verliert Bahn 2 ihre Startzeit, Runde 1 bleibt teilweise
  // gefüllt. „Weiter“ muss genau diese Bahn wieder aufnehmen.
  await page.reload()
  await expect(page.locator('[data-tab-status="aktiv"]')).toBeVisible()
  await expect(page.getByText(/Serie ·/)).toBeVisible()
  await page.getByRole('button', { name: 'Weiter', exact: true }).tap()

  await expect(
    page.getByRole('button', { name: /^Bahn 2, Runde 1 von 2, läuft$/ }),
  ).toBeVisible()
})

test('Serie zeigt Runden pro Schwimmer, zählt sie und nimmt den letzten Anschlag zurück', async ({
  page,
}) => {
  await oeffneMitEinstellungen(page, {
    bahnen: 2,
    streckeM: 100,
    startversatzMs: 0,
    wiederholungen: 3,
    taktSek: 60,
  })

  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  await expect(page.getByText(/Serie ·/)).toBeVisible()

  const bahn1 = page.getByRole('button', { name: /^Bahn 1, Runde 1 von 3, läuft$/ })
  await expect(bahn1).toBeVisible()
  await bahn1.tap()
  await bahn1.tap()

  const bahn2 = page.getByRole('button', { name: /^Bahn 2, Runde 1 von 3, läuft$/ })
  await bahn2.tap()
  await bahn2.tap()

  const wartet = page.getByRole('button', { name: /^Bahn 1, Runde 2 von 3, wartet auf Start$/ })
  await expect(wartet).toBeVisible()
  await expect(page.getByText('1 von 3 Runden vollständig')).toBeVisible()

  await langdruck(page, wartet)
  await expect(page.getByRole('button', { name: /^Bahn 1, Runde 1 von 3, läuft$/ })).toBeVisible()
  await expect(page.getByText('0 von 3 Runden vollständig')).toBeVisible()

  // Geplante Wiederholungen bleiben aus dem Verlauf, bis sie Daten haben.
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await expect(page.getByText('1 Lauf')).toBeVisible()
  await expect(page.getByText(/^R1 · /)).toBeVisible()
  await expect(page.getByText(/^R2 · /)).toHaveCount(0)
})
