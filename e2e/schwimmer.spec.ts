/**
 * Schwimmer-Liste und Bestzeiten-Einstieg.
 *
 * Nutzerreise: Der Trainer legt vor dem Training Namen an, ordnet erst einen
 * davon einer Bahn zu und misst. Zurück im Schwimmer-Tab erwartet er beide
 * Personen: die gemessene mit Bestzeit und die noch nicht zugeordnete mit dem
 * Hinweis „noch keiner Bahn zugeordnet“. Ein Tipp auf eine Bestzeit öffnet den
 * Lauf, in dem sie gemessen wurde; der Rückweg führt zum selben aufgeklappten
 * Schwimmer. Das gilt für Training und Wettkampf.
 *
 * Die Listenregel weicht bewusst von #19 ab: Die Liste filtert nicht auf
 * Personen mit Bahnzuordnung, weil sich sonst ein gerade angelegter Name nicht
 * mehr bearbeiten oder später zuordnen ließe. Der Test hält beide Fälle fest.
 *
 * Vorbedingung: frischer Browser-Kontext je Test; Standardkonfiguration
 * (50-m-Becken, 100 m, Freistil, 6 Bahnen).
 */

import { expect, test, type Page } from '@playwright/test'
import { oeffneApp, starteLauf, warteAufSchwimmerzuordnung, warteAufZielzeiten } from './helfer'

/** Legt einen Schwimmer über das Formular an. */
async function legeSchwimmerAn(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Schwimmer hinzufügen' }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Speichern' }).click()
}

/**
 * Ordnet den ersten Schwimmer der Bahn 1 zu und schwimmt einen vollständigen
 * 100-m-Lauf. Die Anschläge kommen als `dispatchEvent('click')`: Ein unter Last
 * verzögerter Pointer-Up würde sonst als Langdruck gelten.
 */
async function ordneZuUndMesse(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Timer' }).tap()
  await page.getByRole('button', { name: /m ·/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Schwimmer für Reihe 1, Bahn 1').selectOption({ label: name })
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).click()

  await starteLauf(page)
  const bahn = page.getByRole('button', { name: new RegExp(`Bahn 1, ${name}, läuft$`) })
  await expect(bahn).toBeVisible()
  await bahn.dispatchEvent('click')
  await page.waitForTimeout(120)
  await bahn.dispatchEvent('click')
  await expect(
    page.getByRole('button', { name: new RegExp(`Bahn 1, ${name}, im Ziel$`) }),
  ).toBeVisible()
  await warteAufSchwimmerzuordnung(page)
}

test('behält Schwimmer ohne Bahnzuordnung und zeigt zugeordnete mit Bestzeit', async ({
  page,
}) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Schwimmer' }).tap()

  // Zwei Personen ohne Bahn: Beide stehen in der Liste, obwohl noch keine
  // Bahn auf sie verweist.
  await legeSchwimmerAn(page, 'Mia')
  await legeSchwimmerAn(page, 'Ben')
  await expect(page.getByText('2 Einträge')).toBeVisible()
  await expect(page.getByText('noch keiner Bahn zugeordnet')).toHaveCount(2)

  await ordneZuUndMesse(page, 'Mia')

  // Beide bleiben in der Liste: Mia nun mit Bestzeit, Ben weiter ohne Bahn.
  await page.getByRole('button', { name: 'Schwimmer' }).tap()
  const mia = page.locator('li', { hasText: 'Mia' })
  const ben = page.locator('li', { hasText: 'Ben' })
  await expect(mia).toContainText('1 Bestzeit')
  await expect(ben).toContainText('noch keiner Bahn zugeordnet')

  // Ein Reload ändert nichts: Die Liste leitet sich aus den persistierten
  // Schwimmern und Läufen ab, nicht aus einem flüchtigen Filter.
  await page.reload()
  await expect(page.locator('[data-tab-status="aktiv"]')).toBeVisible()
  await page.getByRole('button', { name: 'Schwimmer' }).tap()
  await expect(page.locator('li', { hasText: 'Mia' })).toContainText('1 Bestzeit')
  await expect(page.locator('li', { hasText: 'Ben' })).toContainText('noch keiner Bahn zugeordnet')
})

test('öffnet aus einer Trainings-Bestzeit den Lauf und kehrt zum selben Schwimmer zurück', async ({
  page,
}) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Schwimmer' }).tap()
  await legeSchwimmerAn(page, 'Mia')
  await ordneZuUndMesse(page, 'Mia')

  await page.getByRole('button', { name: 'Schwimmer' }).tap()
  const mia = page.locator('li', { hasText: 'Mia' })
  await mia.getByRole('button', { expanded: false }).click()

  // Der Vorlesetext der Bestzeit nennt Schwimmer, Datum und Zeit; das öffnet
  // das Lauf-Detail.
  const bestzeit = mia.getByRole('button', { name: /^Mia, \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2},\d{2}$/ })
  await expect(bestzeit).toBeVisible()
  await bestzeit.click()
  await expect(page.getByRole('button', { name: 'Zurück zu den Schwimmern' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Bahnen · 100 m/ })).toBeVisible()

  // Der Rückweg führt zum selben aufgeklappten Schwimmer.
  await page.getByRole('button', { name: 'Zurück zu den Schwimmern' }).click()
  await expect(mia.getByRole('button', { expanded: true })).toBeVisible()
  await expect(bestzeit).toBeVisible()
})

test('öffnet aus einer Wettkampf-Bestzeit den Heat', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Wettkampf', exact: true }).tap()
  await page.getByRole('button', { name: 'Meldeliste importieren' }).tap()

  await page.getByLabel('Name des Wettkampfs').fill('Herbstpokal')
  await page
    .getByRole('textbox', { name: 'Meldeliste' })
    .fill(
      [
        'disziplin;strecke_m;schwimmart;lauf;bahn;name',
        '50 m Brust;50;brust;1;1;Clara',
      ].join('\n'),
    )
  await page.getByRole('button', { name: 'Importieren', exact: true }).tap()

  await page.getByRole('button', { name: /50 m Brust/ }).tap()
  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  await page.getByRole('button', { name: /^Bahn 1, Clara, läuft$/ }).tap()
  await expect(
    page.getByRole('button', { name: /^Bahn 1, Clara, im Ziel, 1\. Platz$/ }),
  ).toBeVisible()
  await warteAufZielzeiten(page, 1)

  // Clara ist über den Import als Schwimmerin angelegt und hat eine
  // Wettkampf-Bestzeit. Der Eintrag öffnet denselben Lauf mit der Laufnummer.
  await page.getByRole('button', { name: 'Schwimmer' }).tap()
  const clara = page.locator('li', { hasText: 'Clara' })
  await clara.getByRole('button', { expanded: false }).click()
  await clara.getByRole('button', { name: /^Clara, \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2},\d{2}$/ }).click()
  await expect(page.getByRole('button', { name: 'Zurück zu den Schwimmern' })).toBeVisible()
  await expect(page.getByText(/^Lauf 1/)).toBeVisible()
  await page.getByRole('button', { name: 'Zurück zu den Schwimmern' }).click()
  await expect(clara.getByRole('button', { expanded: true })).toBeVisible()
})
