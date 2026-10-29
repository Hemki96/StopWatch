/**
 * Einstellungen, die über die Sitzung hinaus gelten: Onboarding, Designwahl
 * und die Vorbereitung des nächsten Laufs.
 *
 * Nutzerreise: Beim ersten Start führt das Onboarding durch Beckenlänge,
 * Strecke, Schwimmart und Bahnen und legt dabei die Schwimmer an. Später
 * wechselt der Trainer das Design oder die Vorbereitung und erwartet beides
 * nach einem Neustart unverändert. Zuletzt darf eine laufende Messung ihre
 * Strecke nicht mehr ändern.
 *
 * Vorbedingung: frischer Browser-Kontext je Test. Test 1 öffnet die App
 * bewusst ohne `oeffneApp`, weil er das Onboarding sehen will; alle anderen
 * überspringen es über den Merker `beckenrand.onboarding` in `localStorage`.
 * Theme und Lauf-Vorbereitung liegen ebenfalls in `localStorage` und werden
 * beim Laden erneut gelesen — deshalb prüfen die Tests nach einem Reload.
 */

import { expect, test } from '@playwright/test'
import { oeffneApp } from './helfer'

// Nutzerreise: erster Start auf einem neuen Gerät — der Assistent erklärt die
// Grundbegriffe und sammelt die Konfiguration ein.
test('führt beim ersten Start durch das Onboarding und merkt sich die Auswahl', async ({ page }) => {
  // Kein `oeffneApp`: Ohne Onboarding-Merker startet die App im Assistenten
  // statt im Timer.
  await page.goto('/')

  await expect(page.getByText('Schritt 1 von 3')).toBeVisible()
  await expect(page.getByText('So funktioniert es')).toBeVisible()
  await page.getByRole('button', { name: 'Weiter' }).tap()

  await expect(page.getByText('Schritt 2 von 3')).toBeVisible()
  // „25 m“ und „100 m“ kommen in mehreren Abschnitten vor. `section` mit
  // `hasText` grenzt den richtigen Abschnitt ein, statt über die Reihenfolge
  // im DOM zu raten.
  await page.locator('section', { hasText: 'Beckenlänge' }).getByRole('button', { name: '25 m' }).tap()
  await page.locator('section', { hasText: 'Strecke' }).getByRole('button', { name: '100 m' }).tap()
  await page.locator('section', { hasText: 'Schwimmart' }).getByRole('button', { name: 'Brust' }).tap()
  await page.getByRole('button', { name: 'Weiter' }).tap()

  await expect(page.getByText('Schritt 3 von 3')).toBeVisible()
  // Standard sind 6 Bahnen, dreimal weniger ergibt 3. `force` überspringt
  // Playwrights Stabilitätsprüfung: Nach jedem Klick schrumpft die
  // Namensliste, das Layout verschiebt sich also zwischen den Klicks.
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: 'Weniger Bahnen' }).click({ force: true })
  }
  // Namen sind optional; sie werden beim Abschluss als Schwimmer angelegt.
  // Der Regex auf „Los geht“ umgeht das typografische Apostroph im Label.
  await page.getByLabel('Schwimmer für Bahn 1').fill('Anna')
  await page.getByLabel('Schwimmer für Bahn 2').fill('Ben')
  await page.getByRole('button', { name: /Los geht/ }).tap()

  // Die Kopfzeile fasst die gewählte Konfiguration zusammen — der sichtbare
  // Beweis, dass Onboarding-Werte und Bahnzahl übernommen wurden.
  await expect(page.getByText('25 m · 100 m · Brust · 3 Bahnen')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()

  // Namen wurden als Schwimmer angelegt.
  await page.getByRole('button', { name: 'Schwimmer' }).tap()
  await expect(page.getByText('Anna')).toBeVisible()
  await expect(page.getByText('Ben')).toBeVisible()

  // Beim nächsten Start erscheint das Onboarding nicht erneut: Der Merker
  // überlebt den Reload, die Konfiguration wird aus `localStorage` gelesen.
  await page.reload()
  await expect(page.getByText('Schritt 1 von 3')).toHaveCount(0)
  await expect(page.getByText('25 m · 100 m · Brust · 3 Bahnen')).toBeVisible()
})

// Nutzerreise: Design umschalten und die Wahl beim nächsten Öffnen wiederfinden.
test('wechselt das Design und behält die Wahl nach einem Reload', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Mehr' }).tap()

  // Die Auswahl ist eine Radiogruppe; `aria-checked` ist der geprüfte
  // Zustand, unabhängig von Farben und Rahmen. Standard ist „System“.
  await expect(page.getByRole('radio', { name: 'System' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await page.getByRole('radio', { name: 'Hell' }).tap()
  await expect(page.getByRole('radio', { name: 'Hell' })).toHaveAttribute('aria-checked', 'true')
  // Die Klasse am `html`-Element steuert das Tailwind-Design; „Hell“ entfernt
  // `dark`, statt eine eigene Klasse zu setzen.
  await expect(page.locator('html')).not.toHaveClass(/dark/)

  // Zusätzlich der gespeicherte Wert: So fällt auf, wenn nur die Anzeige
  // umschaltet, die Wahl aber nicht gemerkt wird.
  const gemerkt = await page.evaluate(() => localStorage.getItem('beckenrand.theme'))
  expect(gemerkt).toBe('light')

  // Nach dem Reload liest die App das Design aus `localStorage`; der Wechsel
  // in den Tab „Mehr“ zeigt die Radiogruppe erneut mit „Hell“.
  await page.reload()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Mehr' }).tap()
  await expect(page.getByRole('radio', { name: 'Hell' })).toHaveAttribute('aria-checked', 'true')
})

// Nutzerreise: Die Vorbereitung des nächsten Laufs (Strecke, Bahnen) wird
// einmal eingestellt und gilt danach dauerhaft.
test('ändert die Vorbereitung des nächsten Laufs dauerhaft', async ({ page }) => {
  await oeffneApp(page)
  // Die Kopfzeile zeigt die aktuelle Vorbereitung und öffnet beim Tippen das
  // Sheet; der ganze Name dient als eindeutiger Locator.
  await page
    .getByRole('button', { name: /50 m · 100 m · Freistil · 6 Bahnen/ })
    .tap()

  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: '200 m', exact: true }).tap()
  await sheet.getByRole('button', { name: 'Weniger Bahnen' }).tap()
  await sheet.getByRole('button', { name: 'Schließen' }).tap()

  // Die Zusammenfassung in der Kopfzeile spiegelt die Änderung sofort.
  await expect(page.getByText('50 m · 200 m · Freistil · 5 Bahnen')).toBeVisible()

  // Der Reload prüft die Persistenz: Die Vorbereitung liegt in
  // `localStorage` (`beckenrand.einstellungen`), nicht nur im React-State.
  await page.reload()
  await expect(page.getByText('50 m · 200 m · Freistil · 5 Bahnen')).toBeVisible()
})

// Nutzerreise: Nach dem ersten Anschlag lässt sich die Strecke nicht mehr
// ändern — sonst wären bereits erfasste Splits ungültig.
test('sperrt die Strecke nach dem ersten Anschlag auch in der Oberfläche', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  // Ein Anschlag genügt, um die Strecke zu sperren.
  await page.getByRole('button', { name: /^Bahn 1, läuft$/ }).tap()

  await page
    .getByRole('button', { name: /50 m · 100 m · Freistil · 6 Bahnen/ })
    .tap()
  const sheet = page.getByRole('dialog')
  // Die Sperre wirkt nicht nur im Domänenmodell, sondern ist sichtbar:
  // Strecken- und „offen“-Knopf sind deaktiviert, damit die Grenze nicht erst
  // beim Bestätigen erklärt werden muss.
  await expect(sheet.getByRole('button', { name: '200 m', exact: true })).toBeDisabled()
  await expect(
    sheet.getByRole('button', { name: 'offen', exact: true }),
  ).toBeDisabled()
})
