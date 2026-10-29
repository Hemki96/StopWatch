import { expect, test } from '@playwright/test'
import { oeffneApp, warteAufZielzeiten } from './helfer'

test('Wettkampf anlegen, Namen erfassen und Zeiten direkt stoppen', async ({ page }) => {
  await oeffneApp(page)

  await page.getByRole('button', { name: 'Wettkampf', exact: true }).tap()
  await expect(page.getByText('Noch kein Wettkampf')).toBeVisible()

  await page.getByRole('button', { name: 'Neuer Wettkampf' }).tap()
  await page.getByLabel('Name des Wettkampfs').fill('Herbstpokal')
  await page.getByRole('button', { name: 'Wettkampf anlegen' }).tap()

  await expect(page.getByText('Herbstpokal')).toBeVisible()
  await expect(page.getByText('Noch keine Disziplin')).toBeVisible()

  await page.getByRole('button', { name: 'Disziplin anlegen' }).tap()
  await page.getByRole('button', { name: '100 m Freistil anlegen' }).tap()

  await expect(page.getByText('6 Bahnen ohne Namen · Namen eintragen')).toBeVisible()
  await page.getByRole('button', { name: /Bahnen ohne Namen/ }).tap()
  await page.getByLabel('Name für Bahn 1').fill('Anna')
  await page.getByLabel('Name für Bahn 2').fill('Ben')
  await page.getByRole('button', { name: 'Namen speichern' }).tap()

  await expect(page.getByRole('button', { name: /^Bahn 1, Anna, bereit$/ })).toBeVisible()

  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  const anna = page.getByRole('button', { name: /^Bahn 1, Anna, läuft$/ })
  await expect(anna).toBeVisible()
  await anna.tap()
  await expect(
    page.getByRole('button', { name: /^Bahn 1, Anna, im Ziel, 1\. Platz$/ }),
  ).toBeVisible()

  await page.getByRole('button', { name: /^Bahn 2, Ben, läuft$/ }).tap()
  await expect(
    page.getByRole('button', { name: /^Bahn 2, Ben, im Ziel, 2\. Platz$/ }),
  ).toBeVisible()

  // Der Wettkampf überlebt einen Reload.
  await warteAufZielzeiten(page, 2)
  await page.reload()
  await page.getByRole('button', { name: 'Wettkampf', exact: true }).tap()
  await expect(page.getByText('Herbstpokal')).toBeVisible()
  await page.getByRole('button', { name: /Herbstpokal/ }).tap()
  await expect(page.getByText('100 m Freistil')).toBeVisible()
  await expect(page.getByText('2/6 Zeiten')).toBeVisible()
})

test('Meldeliste per CSV importieren und im importierten Lauf starten', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Wettkampf', exact: true }).tap()
  await page.getByRole('button', { name: 'Meldeliste importieren' }).tap()

  await page.getByLabel('Name des Wettkampfs').fill('Winterpokal')
  await page
    .getByRole('textbox', { name: 'Meldeliste' })
    .fill(
      [
        'disziplin;strecke_m;schwimmart;lauf;bahn;name',
        '50 m Brust;50;brust;1;1;Clara',
        '50 m Brust;50;brust;1;2;Dana',
        '100 m Freistil;100;freistil;1;3;Emil',
        '100 m Freistil;100;freistil;2;3;Frida',
      ].join('\n'),
    )

  await expect(page.getByText('2 Disziplinen, 3 Läufe, 4 Starts')).toBeVisible()
  await page.getByRole('button', { name: 'Importieren', exact: true }).tap()

  await expect(page.getByText('Winterpokal')).toBeVisible()
  await expect(page.getByText('0 von 4 Zeiten erfasst')).toBeVisible()

  await page.getByRole('button', { name: /50 m Brust/ }).tap()
  await expect(page.getByRole('button', { name: /^Bahn 1, Clara, bereit$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Bahn 2, Dana, bereit$/ })).toBeVisible()

  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  await page.getByRole('button', { name: /^Bahn 1, Clara, läuft$/ }).tap()
  await expect(
    page.getByRole('button', { name: /^Bahn 1, Clara, im Ziel, 1\. Platz$/ }),
  ).toBeVisible()
})

test('korrigiert eine Zielzeit von Hand und exportiert die Ergebnisse als CSV', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Wettkampf', exact: true }).tap()
  await page.getByRole('button', { name: 'Meldeliste importieren' }).tap()
  await page.getByLabel('Name des Wettkampfs').fill('Handzeit-Pokal')
  await page
    .getByRole('textbox', { name: 'Meldeliste' })
    .fill(['disziplin;strecke_m;schwimmart;lauf;bahn;name', '50 m Brust;50;brust;1;1;Clara'].join('\n'))
  await page.getByRole('button', { name: 'Importieren', exact: true }).tap()

  await page.getByRole('button', { name: /50 m Brust/ }).tap()
  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  await page.getByRole('button', { name: /^Bahn 1, Clara, läuft$/ }).tap()
  await expect(page.getByRole('button', { name: /^Bahn 1, Clara, im Ziel, 1\. Platz$/ })).toBeVisible()

  await page.getByRole('button', { name: 'Zeit für Clara eingeben' }).tap()
  await page.getByRole('textbox', { name: 'Zielzeit' }).fill('00:58,00')
  await page.getByRole('button', { name: 'Zeit speichern' }).tap()

  await expect(page.getByRole('button', { name: /^Bahn 1, Clara, im Ziel, 1\. Platz/ })).toContainText(
    '00:58,00',
  )
  await expect(page.getByRole('button', { name: /^Bahn 1, Clara, im Ziel/ })).toContainText(
    'manuell',
  )

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Disziplin als CSV exportieren' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^beckenrand-wettkampf-\d{4}-\d{2}-\d{2}\.csv$/)

  const { readFile } = await import('node:fs/promises')
  const inhalt = await readFile((await download.path())!, 'utf8')
  expect(inhalt).toContain('Handzeit-Pokal')
  expect(inhalt).toContain('Clara')
  expect(inhalt).toContain('58000;00:58,00;Ziel;1')
})
