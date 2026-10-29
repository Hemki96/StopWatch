/**
 * Wettkampfmodus: Wettkampf, Disziplin, Heats, Meldeliste und CSV-Ergebnis.
 *
 * Nutzerreise: Ein Trainer legt für den Herbstpokal die Disziplin 100 m
 * Freistil an, trägt Namen ein und stoppt die Bahnen per Tap (ein Tap = eine
 * Zielzeit, keine Splits). Alternativ importiert er eine Meldeliste als CSV,
 * startet den importierten Heat und korrigiert eine Zielzeit von Hand, um die
 * Ergebnisse als CSV zu teilen.
 *
 * Vorbedingung: frischer Browser-Kontext je Test, also leere IndexedDB. Die
 * Wettkampfnamen sind bewusst unterschiedlich, damit `getByText` eindeutig
 * bleibt. Vor einem Reload wird auf die persistierten Zielzeiten gewartet —
 * die Anzeige ist sofort, das Schreiben läuft asynchron.
 */

import { expect, test } from '@playwright/test'
import { oeffneApp, warteAufZielzeiten } from './helfer'

// Nutzerreise: Wettkampf von Hand anlegen statt Meldeliste importieren.
test('Wettkampf anlegen, Namen erfassen und Zeiten direkt stoppen', async ({ page }) => {
  await oeffneApp(page)

  await page.getByRole('button', { name: 'Wettkampf', exact: true }).tap()
  // Leerer Zustand als Ausgangspunkt; `exact` grenzt die Tab-Beschriftung von
  // „Neuer Wettkampf“ ab.
  await expect(page.getByText('Noch kein Wettkampf')).toBeVisible()

  await page.getByRole('button', { name: 'Neuer Wettkampf' }).tap()
  await page.getByLabel('Name des Wettkampfs').fill('Herbstpokal')
  await page.getByRole('button', { name: 'Wettkampf anlegen' }).tap()

  await expect(page.getByText('Herbstpokal')).toBeVisible()
  await expect(page.getByText('Noch keine Disziplin')).toBeVisible()

  // Disziplin und erster Heat entstehen zusammen: „100 m Freistil anlegen“
  // legt die Disziplin mit einem Lauf über die voreingestellten Bahnen an.
  await page.getByRole('button', { name: 'Disziplin anlegen' }).tap()
  await page.getByRole('button', { name: '100 m Freistil anlegen' }).tap()

  // Sechs Bahnen sind voreingestellt; Namen sind optional und werden im Sheet
  // nachgetragen. Die Bahn-Kachel übernimmt den Namen sofort ins `aria-label`.
  await expect(page.getByText('6 Bahnen ohne Namen · Namen eintragen')).toBeVisible()
  await page.getByRole('button', { name: /Bahnen ohne Namen/ }).tap()
  await page.getByLabel('Name für Bahn 1').fill('Anna')
  await page.getByLabel('Name für Bahn 2').fill('Ben')
  await page.getByRole('button', { name: 'Namen speichern' }).tap()

  await expect(page.getByRole('button', { name: /^Bahn 1, Anna, bereit$/ })).toBeVisible()

  // Im Wettkampf ist ein Tap das Ziel; der Platz entsteht aus der Reihenfolge
  // der Ziele, Anna ist zuerst dran und damit Erste.
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

  // Der Wettkampf überlebt einen Reload. Vorher sicherstellen, dass beide
  // Zielzeiten in IndexedDB liegen; sonst wären sie nach dem Neuladen weg.
  await warteAufZielzeiten(page, 2)
  await page.reload()
  // Kein erneutes `oeffneApp`: Der Onboarding-Merker aus dem ersten Aufruf
  // liegt weiterhin im `localStorage` dieses Kontexts.
  await page.getByRole('button', { name: 'Wettkampf', exact: true }).tap()
  await expect(page.getByText('Herbstpokal')).toBeVisible()
  await page.getByRole('button', { name: /Herbstpokal/ }).tap()
  await expect(page.getByText('100 m Freistil')).toBeVisible()
  // Die Zählung belegt, dass die Zeiten und nicht nur der Wettkampf
  // gespeichert wurden.
  await expect(page.getByText('2/6 Zeiten')).toBeVisible()
})

// Nutzerreise: Meldeliste als CSV einfügen — daraus entstehen Disziplinen,
// Heats, Bahnen und Schwimmer, ohne sie einzeln einzutippen.
test('Meldeliste per CSV importieren und im importierten Lauf starten', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Wettkampf', exact: true }).tap()
  await page.getByRole('button', { name: 'Meldeliste importieren' }).tap()

  await page.getByLabel('Name des Wettkampfs').fill('Winterpokal')
  // Semikolon-getrennte CSV inklusive Kopfzeile. `getByRole('textbox')` mit
  // Namen trifft das mehrzeilige Feld und nicht das Wettkampfnamensfeld.
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

  // Vorschau vor dem Import: zwei Disziplinen, drei Heats und vier Starts —
  // 50 m Brust passt in einen Heat, 100 m Freistil verteilt sich auf zwei.
  await expect(page.getByText('2 Disziplinen, 3 Läufe, 4 Starts')).toBeVisible()
  await page.getByRole('button', { name: 'Importieren', exact: true }).tap()

  // Nach dem Import steht der Wettkampf mit noch keiner erfassten Zeit da.
  await expect(page.getByText('Winterpokal')).toBeVisible()
  await expect(page.getByText('0 von 4 Zeiten erfasst')).toBeVisible()

  // Die Disziplin öffnet ihren Heat; die importierten Namen stehen bereits auf
  // den Bahnen.
  await page.getByRole('button', { name: /50 m Brust/ }).tap()
  await expect(page.getByRole('button', { name: /^Bahn 1, Clara, bereit$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Bahn 2, Dana, bereit$/ })).toBeVisible()

  // Auch im Wettkampf ist ein Tap die Zielzeit; der Platz ergibt sich aus dem
  // einzigen Starter dieses Heats.
  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  await page.getByRole('button', { name: /^Bahn 1, Clara, läuft$/ }).tap()
  await expect(
    page.getByRole('button', { name: /^Bahn 1, Clara, im Ziel, 1\. Platz$/ }),
  ).toBeVisible()
})

// Nutzerreise: Eine Zielzeit wurde nicht gestoppt oder falsch gestoppt; sie
// wird über den Stift als Handzeit nachgetragen und als CSV exportiert.
test('korrigiert eine Zielzeit von Hand und exportiert die Ergebnisse als CSV', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Wettkampf', exact: true }).tap()
  await page.getByRole('button', { name: 'Meldeliste importieren' }).tap()
  await page.getByLabel('Name des Wettkampfs').fill('Handzeit-Pokal')
  // Eine Zeile genügt: ein Heat, eine Bahn, eine Schwimmerin.
  await page
    .getByRole('textbox', { name: 'Meldeliste' })
    .fill(['disziplin;strecke_m;schwimmart;lauf;bahn;name', '50 m Brust;50;brust;1;1;Clara'].join('\n'))
  await page.getByRole('button', { name: 'Importieren', exact: true }).tap()

  await page.getByRole('button', { name: /50 m Brust/ }).tap()
  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  await page.getByRole('button', { name: /^Bahn 1, Clara, läuft$/ }).tap()
  await expect(page.getByRole('button', { name: /^Bahn 1, Clara, im Ziel, 1\. Platz$/ })).toBeVisible()

  // Handzeit über den Stift: Das Feld erwartet das App-Zeitformat; der
  // Anschlag wird dadurch als „manuell“ gekennzeichnet.
  await page.getByRole('button', { name: 'Zeit für Clara eingeben' }).tap()
  await page.getByRole('textbox', { name: 'Zielzeit' }).fill('00:58,00')
  await page.getByRole('button', { name: 'Zeit speichern' }).tap()

  // Zeit und Kennzeichen stehen auf der Bahn; der Platz bleibt Platz 1.
  await expect(page.getByRole('button', { name: /^Bahn 1, Clara, im Ziel, 1\. Platz/ })).toContainText(
    '00:58,00',
  )
  await expect(page.getByRole('button', { name: /^Bahn 1, Clara, im Ziel/ })).toContainText(
    'manuell',
  )

  // CSV-Export als Download: Ereignis zuerst abonnieren, dann klicken. Der
  // Dateiname trägt das Exportdatum; geprüft wird das Muster.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Disziplin als CSV exportieren' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^beckenrand-wettkampf-\d{4}-\d{2}-\d{2}\.csv$/)

  // `readFile` wird erst hier dynamisch geladen: Nur diese Prüfung braucht
  // Node-Dateizugriff.
  const { readFile } = await import('node:fs/promises')
  const inhalt = await readFile((await download.path())!, 'utf8')
  // Wettkampfname und Schwimmerin identifizieren die Zeile;
  // `58000;00:58,00;Ziel;1` belegt Zeit, Format, Status und `manuell`.
  expect(inhalt).toContain('Handzeit-Pokal')
  expect(inhalt).toContain('Clara')
  expect(inhalt).toContain('58000;00:58,00;Ziel;1')
})
