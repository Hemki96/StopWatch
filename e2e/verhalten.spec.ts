/**
 * Grundverhalten der Messung: Anschlag, Zurücknehmen, offene Strecke,
 * Schwimmerzuordnung und Aufräumen im Verlauf.
 *
 * Der Spec sichert die Bedienhandlungen ab, die am Beckenrand mit nassen
 * Fingern funktionieren müssen: Ein kurzer Tap zählt einen Anschlag, langes
 * Drücken nimmt ihn zurück, ein Klick ohne Pointer-Ereignisse (Screenreader)
 * zählt ebenfalls, und nach dem Ziel ändert kein weiterer Tap etwas. Dazu
 * kommen die Wege, die den Bestand verändern: Schwimmer anlegen und einer Bahn
 * zuordnen (übersteht einen Reload) sowie einen Satz samt Läufen löschen.
 *
 * Vorbedingung: frischer Browser-Kontext je Test, also leere IndexedDB und
 * Standardkonfiguration (50-m-Becken, 100 m, Freistil, 6 Bahnen). `oeffneApp`
 * überspringt das Onboarding und wartet auf die Tab-Abstimmung.
 */

import { expect, test, type Locator, type Page } from '@playwright/test'
import { oeffneApp, starteLauf, warteAufSchwimmerzuordnung } from './helfer'

const BAHN1 = /Bahn 1, läuft$/

/**
 * Hält eine Kachel per Maus länger als die Undo-Schwelle gedrückt.
 *
 * @param page - Seite mit geöffneter App.
 * @param ziel - Kachel oder Zeile, auf der gehalten wird.
 * @returns Promise, das nach dem Loslassen aufgelöst wird.
 *
 * `tap()` von Playwright ist zu kurz für den Long-Press (450 ms in
 * `LaneTile`/`SerieAnsicht`). Deshalb wird der Druck mit `mouse.down`/`up`
 * selbst gehalten. Zuerst wird auf das Overlay `data-haltend="true"`
 * gewartet: Es erscheint, sobald der Druck registriert ist, und markiert den
 * Beginn der Haltezeit. Danach kommen 550 ms dazu — die Schwelle plus Puffer
 * für langsame CI-Läufe —, bevor losgelassen wird.
 */
async function langdruck(page: Page, ziel: Locator): Promise<void> {
  const box = await ziel.boundingBox()
  if (!box) throw new Error('Kachel nicht sichtbar')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  // Der Statustext erscheint, bevor der Undo greift.
  await expect(ziel.locator('[data-haltend="true"]')).toBeVisible()
  await page.waitForTimeout(550)
  await page.mouse.up()
}

// Nutzerreise: Ein zu früh gesetzter Anschlag soll ohne Umweg über ein Menü
// zurückgenommen werden — durch langes Drücken auf der Kachel.
test('Long-Press nimmt den letzten Anschlag zurück', async ({ page }) => {
  await oeffneApp(page)
  await starteLauf(page)

  // Geprüft wird über Datenattribute: `data-anschlaege` zählt die Anschläge,
  // der Text nennt die nächste Länge. Beides zusammen belegt, dass der Tap als
  // Anschlag und nicht als Start gewertet wurde.
  const bahn = page.getByRole('button', { name: BAHN1 })
  await bahn.tap()
  await expect(bahn).toHaveAttribute('data-anschlaege', '1')
  await expect(bahn).toContainText('Länge 2/2')

  await langdruck(page, bahn)

  // Nach dem Undo steht die Bahn wieder vor Länge 1; der Lauf selbst läuft
  // weiter, deshalb bleibt der Locator über den Status „läuft“ gültig.
  await expect(bahn).toHaveAttribute('data-anschlaege', '0')
  await expect(bahn).toContainText('Länge 1/2')
})

// Nutzerreise: VoiceOver/TalkBack lösen einen Klick ohne Pointer-Ereignisse
// aus. Die Kachel muss das als Anschlag werten, sonst wäre die App für
// Screenreader-Nutzer unbedienbar.
test('Screenreader-Klick löst einen Anschlag aus', async ({ page }) => {
  await oeffneApp(page)
  await starteLauf(page)

  // `dispatchEvent('click')` erzeugt genau diesen Fall: kein pointerdown/up,
  // also kein Halte-Overlay und kein Doppelzählen.
  const bahn = page.getByRole('button', { name: BAHN1 })
  await bahn.dispatchEvent('click')

  await expect(bahn).toHaveAttribute('data-anschlaege', '1')
})

// Nutzerreise: Ein Lauf ohne feste Strecke (etwa Technik) endet erst auf
// „Ziel“; danach darf kein weiterer Tap die Zeit verändern.
test('Offene Strecke: Ziel beendet die Bahn, weitere Taps ändern nichts', async ({ page }) => {
  await oeffneApp(page)

  // Vor dem Start öffnet die Kopfzeile das Konfigurations-Sheet. Der Locator
  // nennt beide möglichen Beschriftungen („Nächster Lauf“ und die
  // Kurzfassung „50 m · …“) und nimmt den ersten Treffer, weil beide dasselbe
  // Sheet öffnen — so bricht der Test nicht, wenn eine Karte umbenannt wird.
  await page.getByRole('button', { name: /Nächster Lauf|m ·/ }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'offen', exact: true }).click()
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).click()

  // Bei offener Strecke gibt es keinen automatischen Finish: Der Zielknopf
  // sitzt in der Kachel und stoppt Pointer- und Klickweitergabe, damit das
  // Ziel nicht zusätzlich als Anschlag zählt.
  await starteLauf(page)
  const bahn = page.getByRole('button', { name: BAHN1 })
  await bahn.tap()
  await expect(bahn).toHaveAttribute('data-anschlaege', '1')

  await bahn.getByRole('button', { name: 'Ziel', exact: true }).click()
  // Der Locator richtet sich nach dem `aria-label`; nach dem Ziel heißt die
  // Kachel anders, deshalb ein eigener Locator statt Wiederverwendung.
  const beendet = page.getByRole('button', { name: /Bahn 1, im Ziel$/ })
  await expect(beendet).toHaveAttribute('data-anschlaege', '2')

  // Ein weiterer Tap auf die beendete Bahn ist wirkungslos: Anschlagzahl und
  // Status bleiben unverändert.
  await beendet.tap()
  await expect(beendet).toHaveAttribute('data-anschlaege', '2')
  await expect(beendet).toHaveAttribute('data-status', 'beendet')
})

// Nutzerreise: Namen vorab anlegen, einer Bahn zuordnen, starten — und nach
// einem versehentlichen Reload ist die Zuordnung noch da (nur der Lauf
// beginnt neu, weil `performance.now()` den Neustart nicht überlebt).
test('Schwimmer anlegen, Bahn zuordnen und Reload überstehen', async ({ page }) => {
  await oeffneApp(page)

  await page.getByRole('button', { name: 'Schwimmer' }).tap()
  await page.getByRole('button', { name: 'Schwimmer hinzufügen' }).click()
  // `getByLabel` statt Platzhalter: Das Feld ist über sein Label eindeutig,
  // auch wenn im selben Dialog weitere Eingaben dazukommen.
  await page.getByLabel('Name').fill('Mia')
  await page.getByRole('button', { name: 'Speichern' }).click()

  // Zuordnung im Konfigurations-Sheet der Bahn; `selectOption` löst das
  // change-Ereignis aus, das die App speichert.
  await page.getByRole('button', { name: 'Timer' }).tap()
  await page.getByRole('button', { name: /m ·/ }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Schwimmer für Reihe 1, Bahn 1').selectOption({ label: 'Mia' })
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).click()

  await starteLauf(page)
  await expect(page.getByRole('button', { name: /Bahn 1, Mia, läuft$/ })).toBeVisible()
  // Erst wenn die Zuordnung in IndexedDB liegt, ist der Reload verlustfrei:
  // Die Anzeige ist sofort da, das Schreiben läuft asynchron.
  await warteAufSchwimmerzuordnung(page)

  // Nach dem Reload wird die laufende Bahn auf „bereit“ zurückgesetzt, der
  // Name bleibt. Auf die Tab-Bereitschaft erneut warten, weil die Abstimmung
  // nach jedem Laden neu läuft.
  await page.reload()
  await expect(page.locator('[data-tab-status="aktiv"]')).toBeVisible()
  await expect(page.getByRole('button', { name: /Bahn 1, Mia, bereit$/ })).toBeVisible()
})

// Nutzerreise: Ein versehentlich gestarteter Lauf wird im Verlauf über seinen
// Satz gelöscht; die Rückfrage nennt vorher, wie viele Läufe mitgehen.
test('Satz löschen entfernt den Satz samt Läufen', async ({ page }) => {
  await oeffneApp(page)
  await starteLauf(page)
  // „Start“ allein legt den Satz samt einem Lauf an; der Verlauf zählt ihn
  // schon, obwohl noch kein Anschlag gesetzt ist.
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await expect(page.getByText('1 Lauf')).toBeVisible()

  // Der Papierkorb am Satz öffnet die Rückfrage mit der Anzahl der Läufe.
  await page.getByRole('button', { name: /^Satz löschen, 1 Läufe$/ }).click()
  await expect(page.getByText('1 Lauf wird mitgelöscht.')).toBeVisible()
  await page.getByRole('button', { name: 'Satz löschen', exact: true }).click()

  // Ohne Sätze bleibt der leere Zustand stehen: Die Liste leitet sich aus dem
  // App-Kontext ab und verschwindet mit dem letzten Satz.
  await expect(page.getByText('Noch keine Messungen.')).toBeVisible()
})

// Nutzerreise: In einem Dialog (Schwimmer bearbeiten) öffnet sich eine
// Löschbestätigung. Escape darf nur die oberste Ebene schließen, damit die
// Eingaben darunter nicht verloren gehen.
test('Escape schließt bei gestapelten Dialogen nur den obersten', async ({ page }) => {
  await oeffneApp(page)

  await page.getByRole('button', { name: 'Schwimmer' }).tap()
  await page.getByRole('button', { name: 'Schwimmer hinzufügen' }).click()
  await page.getByLabel('Name').fill('Mia')
  await page.getByRole('button', { name: 'Speichern' }).click()

  await page.getByRole('button', { name: 'Mia bearbeiten' }).click()
  await page.getByRole('button', { name: 'Schwimmer löschen' }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()

  // Die Bestätigung ist ein `alertdialog`, der Bearbeiten-Dialog darunter ein
  // `dialog`; beide bleiben im DOM, damit der Fokus zurückkehren kann. Das
  // erste Escape schließt nur die Bestätigung.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('alertdialog')).toBeHidden()
  await expect(page.getByRole('dialog')).toBeVisible()

  // Das zweite Escape schließt dann den Bearbeiten-Dialog.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})
