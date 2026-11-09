/**
 * Verlauf: Korrekturen, CSV-Export, Umbenennen und Löschen.
 *
 * Nutzerreise: Nach einer Messung fällt auf, dass der Zielanschlag zu früh
 * kam. Der Trainer öffnet den Lauf im Verlauf, korrigiert die Zeit, erkennt
 * die Korrektur am Kennzeichen „manuell“ und teilt den Lauf als CSV. Dazu
 * kommt das Aufräumen: ein Satz lässt sich umbenennen, ein einzelner Lauf
 * nach Rückfrage löschen.
 *
 * Vorbedingung: frischer Browser-Kontext je Test; `starteUndStoppe` erzeugt
 * den Lauf, den alle Tests brauchen. Standardkonfiguration: 50-m-Becken,
 * 100 m, 6 Bahnen — daher die Beschriftung „6 Bahnen · 100 m“.
 */

import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { oeffneApp, starteLauf, warteAufSatzbezeichnung, warteAufTagesbezeichnung } from './helfer'

/**
 * Legt einen vollständigen Lauf mit zwei Anschlägen an.
 *
 * @param page - Seite des Tests.
 * @returns Promise, das auflöst, sobald die Bahn im Ziel ist.
 *
 * Der Helfer startet den Standardlauf und setzt zwei Anschläge, sodass eine
 * Zielzeit mit zwei Längen im Verlauf liegt. Statt `tap()` wird
 * `dispatchEvent('click')` genutzt: Ein unter Last verzögerter Pointer-Up
 * würde als Long-Press gelten und den Start wieder zurücknehmen. Die 120 ms
 * dazwischen halten die beiden Anschläge auseinander, damit eine echte
 * Längenzeit entsteht.
 */
async function starteUndStoppe(page: import('@playwright/test').Page) {
  await oeffneApp(page)
  await starteLauf(page)

  // Klick statt Tap: Ein unter Last verzögerter Pointer-Up würde sonst als
  // Long-Press gelten und den Start wieder zurücknehmen.
  const bahn = () => page.getByRole('button', { name: /Bahn 1, läuft$/ })
  await expect(bahn()).toBeVisible()
  await bahn().dispatchEvent('click')
  await expect(bahn()).toHaveAttribute('data-anschlaege', '1')
  const laufzeitVorZweitem = Number(await page.locator('[data-laufzeit]').getAttribute('data-laufzeit'))
  await expect.poll(async () => Number(await page.locator('[data-laufzeit]').getAttribute('data-laufzeit'))).toBeGreaterThan(laufzeitVorZweitem)
  await bahn().dispatchEvent('click')
  await expect(page.getByRole('button', { name: /Bahn 1, im Ziel$/ })).toBeVisible()
}

// Nutzerreise: Eine falsche Zielzeit wird im Lauf-Detail korrigiert und bleibt
// als „manuell“ markiert erhalten.
test('korrigiert eine Zielzeit im Verlauf und behält sie nach einem Reload', async ({ page }) => {
  await starteUndStoppe(page)
  await page.getByRole('button', { name: 'Verlauf' }).tap()

  // Der Lauf wird über seine Kurzbeschreibung geöffnet; sie nennt Bahnen und
  // Strecke, weil ein Datum allein mehrere Läufe treffen würde.
  await page.getByRole('button', { name: /6 Bahnen · 100 m/ }).tap()
  await page.getByRole('button', { name: 'Anschlag 2 korrigieren' }).tap()
  // Zeit im Format der App eintippen; das Feld markiert den Anschlag nach dem
  // Bestätigen als „manuell“.
  await page.getByLabel('Zeit für Länge 2').fill('00:59,00')
  await page.getByRole('button', { name: 'OK', exact: true }).tap()

  // `span.tabular` schränkt auf die Zeitdarstellung ein; ein reiner Texttest
  // würde auch Eingabefelder oder Hinweise treffen.
  await expect(page.locator('span.tabular', { hasText: '00:59,00' })).toBeVisible()
  await expect(page.getByText('manuell', { exact: true })).toBeVisible()

  // Eine Korrektur, die vor dem vorherigen Anschlag liegt, wird abgelehnt:
  // sonst wäre die Längenzeit negativ. Der Fehler bleibt im Dialog,
  // „Abbrechen“ verwirft die Eingabe ohne Änderung.
  await page.getByRole('button', { name: 'Anschlag 2 korrigieren' }).tap()
  await page.getByLabel('Zeit für Länge 2').fill('00:00,01')
  await page.getByRole('button', { name: 'OK', exact: true }).tap()
  await expect(page.getByRole('alert')).toContainText('nach dem vorherigen Anschlag')
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).tap()

  // Persistenz: Die Korrektur liegt in IndexedDB und überlebt den Reload.
  await page.reload()
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await page.getByRole('button', { name: /6 Bahnen · 100 m/ }).tap()
  await expect(page.locator('span.tabular', { hasText: '00:59,00' })).toBeVisible()
  await expect(page.getByText('manuell', { exact: true })).toBeVisible()
})

// Nutzerreise: Der Lauf geht als CSV an die Vereinsauswertung; die Korrektur
// muss im Export sichtbar bleiben.
test('exportiert einen Lauf als CSV mit der korrigierten Zeit', async ({ page }) => {
  await starteUndStoppe(page)
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await page.getByRole('button', { name: /6 Bahnen · 100 m/ }).tap()
  await page.getByRole('button', { name: 'Anschlag 2 korrigieren' }).tap()
  await page.getByLabel('Zeit für Länge 2').fill('00:59,00')
  await page.getByRole('button', { name: 'OK', exact: true }).tap()

  // Der Export läuft über die Format-Auswahl: erst öffnen, dann das Format
  // wählen. Das Download-Ereignis muss vor dem Klick abonniert sein, sonst ist
  // es vorbei, bevor der Listener existiert.
  await page.getByRole('button', { name: 'Exportieren' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Lauf als CSV' }).click(),
  ])
  // Der Dateiname trägt das Exportdatum; das Muster prüft die Form, nicht den
  // konkreten Tag.
  expect(download.suggestedFilename()).toMatch(/^beckenrand-\d{4}-\d{2}-\d{2}\.csv$/)

  // Inhaltliche Prüfung: Millisekunden, formatierte Zeit, Ziel-Flag und
  // `manuell = 1` stehen in derselben Zeile — die Korrektur ist im Export
  // erkennbar und entsteht nicht unbemerkt als Bestzeit.
  const pfad = await download.path()
  const inhalt = await readFile(pfad!, 'utf8')
  expect(inhalt).toContain('59000;00:59,00;1;1')
  // Das BOM davor hält Excel bei UTF-8; danach beginnt die stabile Kopfzeile
  // mit Satz, Datum und Beckenlänge.
  expect(inhalt).toContain('\uFEFFsatz;datum;beckenlaenge_m')
})

// Nutzerreise: Ein Satz bekommt einen sprechenden Namen („Abschlussserie“),
// damit er später im Verlauf wiedererkannt wird.
test('benennt einen Satz um und behält den Namen nach einem Reload', async ({ page }) => {
  await starteUndStoppe(page)
  await page.getByRole('button', { name: 'Verlauf' }).tap()

  // Der Satzname ist ein Knopf, der ein Eingabefeld einblendet.
  // `dispatchEvent('click')` wie oben: kein Halteverhalten, kein Delay.
  await page.getByRole('button', { name: '100 m', exact: true }).dispatchEvent('click')
  await page.getByLabel('Satzbezeichnung').fill('Abschlussserie')
  // Enter speichert (Blur täte es auch) und schließt das Feld wieder.
  await page.getByLabel('Satzbezeichnung').press('Enter')

  await expect(page.getByText('Abschlussserie')).toBeVisible()
  // Erst wenn der Name in IndexedDB liegt, ist der Reload verlustfrei: Die
  // Liste zeigt ihn sofort, geschrieben wird asynchron.
  await warteAufSatzbezeichnung(page, 'Abschlussserie')
  await page.reload()
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await expect(page.getByText('Abschlussserie')).toBeVisible()
})

// Nutzerreise: Der Trainingstag bekommt einen Namen, damit im Verlauf nicht nur
// das Datum steht, sondern auch die Einheit wiedererkennbar ist.
test('benennt einen Tag und behält den Namen nach einem Reload', async ({ page }) => {
  await starteUndStoppe(page)
  await page.getByRole('button', { name: 'Verlauf' }).tap()

  await page.getByRole('button', { name: 'Tag benennen' }).dispatchEvent('click')
  await page.getByLabel('Tagesbezeichnung').fill('Kader A')
  await page.getByLabel('Tagesbezeichnung').press('Enter')

  await expect(page.getByText('Kader A')).toBeVisible()
  await warteAufTagesbezeichnung(page, 'Kader A')
  await page.reload()
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await expect(page.getByText('Kader A')).toBeVisible()
})

// Nutzerreise: Ein einzelner Lauf wird entfernt, ohne den ganzen Satz zu
// löschen.
test('löscht einen einzelnen Lauf nach Rückfrage', async ({ page }) => {
  await starteUndStoppe(page)
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await page.getByRole('button', { name: /6 Bahnen · 100 m/ }).tap()

  // Löschen fragt nach; die Bestätigung ist ein `alertdialog`, weil sie eine
  // Entscheidung mit Folgen verlangt.
  await page.getByRole('button', { name: 'Lauf löschen' }).tap()
  await expect(page.getByRole('alertdialog')).toContainText('Lauf löschen?')
  await page.getByRole('button', { name: 'Löschen', exact: true }).tap()

  // Ohne Läufe bleibt kein Satz übrig; der Verlauf zeigt den leeren Zustand.
  await expect(page.getByText('Noch keine Messungen.')).toBeVisible()
})

// Nutzerreise: Der leere Verlauf nennt nicht nur den Timer, sondern führt mit
// einem Tipp dorthin — ohne Tab-Wechsel und ohne Suchschritt.
test('führt aus dem leeren Verlauf direkt zum Timer', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await expect(page.getByText('Noch keine Messungen.')).toBeVisible()

  await page.getByRole('button', { name: 'Zum Timer' }).tap()

  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
})

// Nutzerreise: Auch die leere Analyse ist kein Sackgassen-Text, sondern führt
// zum Ort, an dem Splits entstehen.
test('führt aus der leeren Analyse direkt zum Timer', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await page.getByRole('radio', { name: 'Analyse' }).tap()

  await expect(page.getByText('Noch keine auswertbaren Sätze.')).toBeVisible()
  await page.getByRole('button', { name: 'Zum Timer' }).tap()

  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
})

// Nutzerreise: Nach dem letzten Ziel will der Trainer die Splits sehen. Der
// Ergebnis-Screen führt direkt in das Lauf-Detail, ohne den Lauf im Verlauf zu
// suchen.
test('öffnet aus dem Ergebnis das Lauf-Detail im Verlauf', async ({ page }) => {
  // Einzelne Bahn, damit der Lauf mit zwei Anschlägen vollständig ist.
  await page.addInitScript(() => {
    localStorage.setItem(
      'beckenrand.v2.einstellungen',
      JSON.stringify({
        konfiguration: { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' },
        bahnen: 1,
        reihen: 1,
        schwimmerProBahn: [],
        startversatzMs: 0,
        wiederholungen: 1,
        taktSek: 120,
      }),
    )
  })
  await oeffneApp(page)
  await starteLauf(page)

  const bahn = page.getByRole('button', { name: /Bahn 1, läuft$/ })
  await bahn.tap()
  await bahn.tap()
  await expect(page.getByText('Ergebnis')).toBeVisible()

  await page.getByRole('button', { name: 'Im Verlauf ansehen' }).tap()

  await expect(page.getByRole('button', { name: 'Zurück zum Verlauf' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '1 Bahn · 100 m' })).toBeVisible()

  await page.getByRole('button', { name: 'Zurück zum Verlauf' }).tap()
  await expect(page.getByRole('button', { name: /1 Bahn · 100 m/ })).toBeVisible()
})
