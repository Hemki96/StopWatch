/**
 * Datensicherung als Rundreise: sichern, löschen, wieder einlesen.
 *
 * Nutzerreise: Ein Trainer hat einen Lauf gemessen und will seine Daten nach
 * einem Gerätewechsel oder einem versehentlichen Löschen zurückholen. Der
 * Spec prüft die vollständige Kette Export → Löschen → Import samt
 * Vorschau-Zusammenfassung und stellt sicher, dass ein Backup mit unbekannter
 * Version abgelehnt wird, ohne den vorhandenen Bestand anzutasten.
 *
 * Vorbedingung: Jeder Test startet in einem frischen Browser-Kontext, also mit
 * leerer IndexedDB. „0 Schwimmer, 0 Trainings“ ist deshalb
 * eindeutig. Das Onboarding überspringt `oeffneApp`.
 *
 * Downloads und Dateiauswahl laufen über Playwright-Ereignisse
 * (`waitForEvent`), weil die App echte Blob-Downloads und ein verstecktes
 * Dateifeld nutzt — beides ist sonst nicht beobachtbar.
 */

import { expect, test } from '@playwright/test'
import { oeffneApp, starteLauf } from './helfer'

// Nutzerreise: messen, Backup herunterladen, alles löschen, dasselbe Backup
// wieder einlesen und den Lauf im Verlauf wiederfinden.
test('Backup exportieren, alles löschen und wieder einlesen', async ({ page }) => {
  await oeffneApp(page)
  // Zwei Taps reichen für einen vollständigen Lauf: Standard sind 100 m im
  // 50-m-Becken, also zwei Längen; der zweite Anschlag ist das Ziel.
  await starteLauf(page)
  const bahn = page.getByRole('button', { name: /Bahn 1, läuft$/ })
  await bahn.tap()
  await bahn.tap()
  await expect(page.getByRole('button', { name: /Bahn 1, im Ziel$/ })).toBeVisible()

  await page.getByRole('button', { name: 'Mehr' }).tap()
  // Das Download-Ereignis vor dem Klick abonnieren: Der Download startet
  // unmittelbar beim Klick, ein später registrierter Listener würde ihn
  // verpassen. `click` genügt hier, weil kein Halteverhalten im Spiel ist.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /^Backup sichern/ }).click(),
  ])
  const pfad = await download.path()
  expect(pfad).not.toBeNull()

  // Löschen ist zweistufig: Der Eintrag öffnet die Rückfrage, erst „Alles
  // löschen“ entfernt die Daten. Der Toast bestätigt den Abschluss; ohne ihn
  // wäre unklar, ob die Datenbank vor dem Import wirklich leer ist.
  await page.getByRole('button', { name: /^Alle Daten löschen/ }).click()
  await page.getByRole('button', { name: 'Alles löschen' }).click()
  await expect(page.getByText('Alle Daten gelöscht.')).toBeVisible()

  // Auch hier zuerst auf das Ereignis warten. `setFiles` übernimmt den Pfad
  // des eben geladenen Backups als Dateiinhalt.
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: /^Backup einlesen/ }).click(),
  ])
  await chooser.setFiles(pfad!)

  // Vorschau vor dem Übernehmen: Sie nennt die Zahlen des Backups, hier genau
  // den einen gemessenen Lauf und den implizit angelegten Satz. Erst danach
  // schreibt der Import.
  await expect(page.getByText('Backup importieren?')).toBeVisible()
  await expect(
    page.getByText(/0 Schwimmer, 0 Trainings, 1 Satz, 1 Lauf/),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Importieren', exact: true }).click()
  await expect(
    page.getByText(/Übernommen: 0 Schwimmer, 0 Trainings, 1 Satz, 1 Lauf/),
  ).toBeVisible()

  // Gegenprobe in der Oberfläche: Der Verlauf zählt den wiederhergestellten
  // Lauf, das Backup enthält also Daten und nicht nur Metadaten.
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await expect(page.getByText('1 Lauf', { exact: true })).toBeVisible()
})

// Nutzerreise: Ein Backup aus einer neueren App-Version oder eine fremde Datei
// wird abgelehnt; die bereits gemessenen Daten bleiben unverändert.
test('Ungültiges Backup wird abgelehnt, ohne den Bestand zu ändern', async ({ page }) => {
  await oeffneApp(page)
  // Bestand anlegen, an dem sich zeigen lässt, dass der Import nichts ändert.
  await starteLauf(page)
  await page.getByRole('button', { name: 'Mehr' }).tap()

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: /^Backup einlesen/ }).click(),
  ])
  // Datei im Speicher statt auf der Platte: Die Form entspricht dem
  // Backup-Format, die Version ist aber absichtlich unbekannt (99). So
  // scheitert die Prüfung an der Version und nicht am Format.
  await chooser.setFiles({
    name: 'kaputt.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'beckenrand-backup',
        version: 99,
        exportiertAm: '2026-10-29T10:00:00.000Z',
        schwimmer: [],
        satze: [],
        laeufe: [],
      }),
    ),
  })

  // Die App nennt Grund und erwartete Version (aktuell 3) und schreibt nichts.
  // `.last()`: Der Fehlerdialog ist ein Sheet mit Hintergrund-, Kopf- und
  // Fußschließen; der letzte Treffer ist der sichtbare Abschlussknopf.
  await expect(page.getByText('Import nicht möglich')).toBeVisible()
  await expect(page.getByText(/Erwartet wird Version 3/)).toBeVisible()
  await page.getByRole('button', { name: 'Schließen', exact: true }).last().click()

  // Gegenprobe: Der vor dem Import gemessene Lauf existiert weiter.
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await expect(page.getByText('1 Lauf', { exact: true })).toBeVisible()
})
