/**
 * Training: Plan vorbereiten, Satz für Satz abarbeiten, Plan währenddessen
 * anpassen.
 *
 * Nutzerreise: Der Trainer legt am Vorabend ein Training an, prüft die
 * Aktiven auf sechs Bahnen und startet am Beckenrand den ersten Satz. Zurück
 * im Training ist der Satz als laufend markiert; weitere Sätze lassen sich
 * ergänzen und ändern, die Aktiven gelten für alle noch offenen Sätze.
 *
 * Vorbedingung: frischer Browser-Kontext je Test, also leere IndexedDB und
 * Standardkonfiguration (50-m-Becken, 100 m, 6 Bahnen). Aus diesen
 * Werten entstehen die Vorgaben für einen neuen Trainingssatz („100 m“) und
 * die sechs Aktiven. `oeffneApp` überspringt das Onboarding.
 */

import { expect, test } from '@playwright/test'
import { oeffneApp } from './helfer'

// Nutzerreise: Ein neues Training entsteht aus den aktuellen Einstellungen und
// wird direkt am Beckenrand begonnen.
test('bereitet Sätze und Aktive vor, startet den ersten Satz und passt den Plan an', async ({
  page,
}) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Training' }).tap()

  await expect(page.getByText('Noch kein Training vorbereitet')).toBeVisible()
  await page.getByRole('button', { name: 'Neues Training' }).tap()

  // Ein neues Training übernimmt Aktive und ersten Satz aus den
  // Einstellungen; beides steht als Knopf mit Kurzfassung in der Liste.
  await expect(page.getByRole('button', { name: /^Aktive/ })).toContainText('6 Bahnen')
  await expect(
    page.getByRole('button', { name: 'Satz 1: 100 m, offen' }),
  ).toBeVisible()

  // Der erste Satz zeigt zuerst die Startübersicht: Aktive, Sätze und die
  // Reihenfolge stehen dort; erst „Jetzt starten“ legt Satz und Läufe an und
  // wechselt in den Timer.
  await page.getByRole('button', { name: 'Satz 1 starten' }).tap()
  const uebersicht = page.getByRole('dialog')
  await expect(uebersicht.getByText('Training starten?')).toBeVisible()
  await expect(uebersicht.getByText('6 in 1 Reihe')).toBeVisible()
  await expect(uebersicht.getByText('100 m')).toBeVisible()
  await expect(uebersicht.getByText('startet jetzt')).toBeVisible()
  await uebersicht.getByRole('button', { name: 'Jetzt starten' }).tap()
  await expect(page.getByRole('button', { name: /Bahn 1, läuft$/ })).toBeVisible()

  // Zurück im Training ist der Satz als laufend markiert. Ein gestarteter
  // Satz ist fest; der Plan ändert nur noch die kommenden Sätze.
  await page.getByRole('button', { name: 'Training' }).tap()
  await expect(
    page.getByRole('button', { name: 'Satz 1: 100 m, läuft' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zum laufenden Satz' })).toBeVisible()

  // Ein weiterer Satz lässt sich während des Trainings ergänzen und anpassen:
  // das Sheet startet mit einer Wiederholung, „Mehr Wiederholungen“ macht
  // daraus 2×100 m.
  await page.getByRole('button', { name: 'Satz hinzufügen' }).tap()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'Mehr Wiederholungen' }).tap()
  await sheet.getByRole('button', { name: 'Satz hinzufügen' }).tap()
  await expect(
    page.getByRole('button', { name: 'Satz 2: 2×100 m, offen' }),
  ).toBeVisible()

  // Bearbeiten des offenen Satzes: eine Wiederholung weniger, dann speichern.
  // Die Beschriftung fällt dadurch auf „100 m“ zurück (1× wird nicht
  // ausgeschrieben).
  await page.getByRole('button', { name: 'Satz 2: 2×100 m, offen' }).tap()
  const bearbeiten = page.getByRole('dialog')
  await bearbeiten.getByRole('button', { name: 'Weniger Wiederholungen' }).tap()
  await bearbeiten.getByRole('button', { name: 'Satz speichern' }).tap()
  await expect(
    page.getByRole('button', { name: 'Satz 2: 100 m, offen' }),
  ).toBeVisible()

  // Die Aktiven gelten für alle noch offenen Sätze: zweimal weniger Bahn
  // ergibt vier, die Änderung wird mit „Aktive übernehmen“ gespeichert.
  await page.getByRole('button', { name: /^Aktive/ }).tap()
  const aktive = page.getByRole('dialog')
  await aktive.getByRole('button', { name: 'Weniger Bahnen pro Reihe' }).tap()
  await aktive.getByRole('button', { name: 'Weniger Bahnen pro Reihe' }).tap()
  await aktive.getByRole('button', { name: 'Aktive übernehmen' }).tap()
  await expect(page.getByRole('button', { name: /^Aktive/ })).toContainText('4 Bahnen')
})

// Export: Der Download-Knopf bietet das ganze Training als PDF und Markdown an.
// Beide Formate laufen über denselben Bericht; der Test prüft die Auswahl und
// die vorgeschlagenen Dateinamen.
test('exportiert das ganze Training als PDF und Markdown', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Training' }).tap()
  await page.getByRole('button', { name: 'Neues Training' }).tap()

  const pdf = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Training exportieren' }).tap()
  await page.getByRole('button', { name: /^Als PDF/ }).tap()
  await expect((await pdf).suggestedFilename()).toMatch(
    /^beckenrand-training-\d{4}-\d{2}-\d{2}\.pdf$/,
  )

  const markdown = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Training exportieren' }).tap()
  await page.getByRole('button', { name: /^Als Markdown/ }).tap()
  await expect((await markdown).suggestedFilename()).toMatch(
    /^beckenrand-training-\d{4}-\d{2}-\d{2}\.md$/,
  )
})

// Nutzerreise: Mit vorhandenen Trainings sitzt das Anlegen im Listenkopf und
// ist ohne Scrollen erreichbar.
test('legt aus dem Listenkopf ein weiteres Training an', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Training' }).tap()
  await page.getByRole('button', { name: 'Neues Training' }).tap()
  await page.getByRole('button', { name: 'Zurück zu den Trainings' }).tap()

  await expect(page.getByText('1 Training vorbereitet')).toBeVisible()
  await page.getByRole('button', { name: 'Neues Training anlegen' }).tap()
  await expect(page.getByRole('button', { name: 'Satz 1 starten' })).toBeVisible()

  await page.getByRole('button', { name: 'Zurück zu den Trainings' }).tap()
  await expect(page.getByText('2 Trainings vorbereitet')).toBeVisible()
})

// Nutzerreise: Vor dem Training stehen sechs Namen zur Auswahl. Statt sechs
// Auswahlmenüs zu öffnen, tippt der Trainer die Personen einmal an.
test('ordnet Aktive mit einem Tipp je Person zu', async ({ page }) => {
  await oeffneApp(page)

  // Zwei Schwimmer anlegen.
  for (const name of ['Anna', 'Ben']) {
    await page.getByRole('button', { name: 'Schwimmer', exact: true }).tap()
    await page.getByRole('button', { name: 'Schwimmer hinzufügen' }).click()
    await page.getByLabel('Name').fill(name)
    await page.getByRole('button', { name: 'Speichern' }).click()
  }

  await page.getByRole('button', { name: 'Training' }).tap()
  await page.getByRole('button', { name: 'Neues Training' }).tap()
  await page.getByRole('button', { name: /^Aktive/ }).tap()

  const aktive = page.getByRole('dialog')
  await aktive.getByRole('button', { name: 'Anna', exact: true }).tap()
  await aktive.getByRole('button', { name: 'Ben', exact: true }).tap()

  // Die Schnellwahl schreibt in dieselbe Zuordnung wie die Auswahlfelder.
  await expect(
    aktive.getByLabel('Schwimmer für Reihe 1, Bahn 1').locator('option:checked'),
  ).toHaveText('Anna')
  await expect(
    aktive.getByLabel('Schwimmer für Reihe 1, Bahn 2').locator('option:checked'),
  ).toHaveText('Ben')

  // Erneutes Tippen entfernt die Person wieder.
  await aktive.getByRole('button', { name: 'Anna', exact: true }).tap()
  await expect(
    aktive.getByLabel('Schwimmer für Reihe 1, Bahn 1').locator('option:checked'),
  ).toHaveText('— kein Schwimmer —')

  await aktive.getByRole('button', { name: 'Anna', exact: true }).tap()
  await aktive.getByRole('button', { name: 'Aktive übernehmen' }).tap()
  await expect(page.getByRole('button', { name: /^Aktive/ })).toContainText('Anna, Ben')
})
