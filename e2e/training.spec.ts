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
 * Standardkonfiguration (50-m-Becken, 100 m, Freistil, 6 Bahnen). Aus diesen
 * Werten entstehen die Vorgaben für einen neuen Trainingssatz („100 m ·
 * Freistil“) und die sechs Aktiven. `oeffneApp` überspringt das Onboarding.
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
    page.getByRole('button', { name: 'Satz 1: 100 m · Freistil, offen' }),
  ).toBeVisible()

  // Der erste Satz startet sofort im Timer: Erst beim Start entstehen aus dem
  // Trainingssatz ein Satz und seine Läufe, deshalb wechselt die App dorthin.
  await page.getByRole('button', { name: 'Satz 1 starten' }).tap()
  await expect(page.getByRole('button', { name: /^Bahn 1, läuft$/ })).toBeVisible()

  // Zurück im Training ist der Satz als laufend markiert. Ein gestarteter
  // Satz ist fest; der Plan ändert nur noch die kommenden Sätze.
  await page.getByRole('button', { name: 'Training' }).tap()
  await expect(
    page.getByRole('button', { name: 'Satz 1: 100 m · Freistil, läuft' }),
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
    page.getByRole('button', { name: 'Satz 2: 2×100 m · Freistil, offen' }),
  ).toBeVisible()

  // Bearbeiten des offenen Satzes: eine Wiederholung weniger, dann speichern.
  // Die Beschriftung fällt dadurch auf „100 m“ zurück (1× wird nicht
  // ausgeschrieben).
  await page.getByRole('button', { name: 'Satz 2: 2×100 m · Freistil, offen' }).tap()
  const bearbeiten = page.getByRole('dialog')
  await bearbeiten.getByRole('button', { name: 'Weniger Wiederholungen' }).tap()
  await bearbeiten.getByRole('button', { name: 'Satz speichern' }).tap()
  await expect(
    page.getByRole('button', { name: 'Satz 2: 100 m · Freistil, offen' }),
  ).toBeVisible()

  // Die Aktiven gelten für alle noch offenen Sätze: zweimal weniger Bahn
  // ergibt vier, die Änderung wird mit „Aktive übernehmen“ gespeichert.
  await page.getByRole('button', { name: /^Aktive/ }).tap()
  const aktive = page.getByRole('dialog')
  await aktive.getByRole('button', { name: 'Weniger Bahnen' }).tap()
  await aktive.getByRole('button', { name: 'Weniger Bahnen' }).tap()
  await aktive.getByRole('button', { name: 'Aktive übernehmen' }).tap()
  await expect(page.getByRole('button', { name: /^Aktive/ })).toContainText('4 Bahnen')
})
