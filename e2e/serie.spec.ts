/**
 * Serien: ein Satz mit festem Takt über mehrere Runden.
 *
 * Nutzerreise: Der Trainer plant 3×100 m im 1:00-Takt für zwei Bahnen, startet
 * die Runde, tippt jeden Anschlag und sieht pro Schwimmer eine Zeile mit der
 * aktuellen Runde. Nach einem Reload setzt er die angefangene Runde mit
 * „Weiter“ fort. Zusätzlich geprüft: Startversatz und mehrere gleichzeitig
 * aktive Läufe.
 *
 * Vorbedingung: frischer Browser-Kontext je Test. Die Einstellungen (Bahnen,
 * Strecke, Startversatz, Wiederholungen, Takt) werden per `addInitScript` vor
 * dem Laden in `localStorage` gesetzt — schneller und deterministischer als
 * mehrere Sheets durchzuklicken, und der Reload-Test behält dieselbe
 * Ausgangslage.
 */

import { expect, test, type Locator, type Page } from '@playwright/test'
import { oeffneApp, starteLauf } from './helfer'

/**
 * Startet die App mit vorbereiteten Serien-Einstellungen.
 *
 * @param page - Seite des Tests.
 * @param einstellungen - Bahnen, Strecke (`null` = offen), Startversatz in ms,
 * Wiederholungen und Takt in Sekunden.
 * @returns Promise, das nach dem Laden und der Tab-Abstimmung auflöst.
 *
 * Das Skript schreibt den vollständigen Block `beckenrand.einstellungen`, den
 * die App beim Laden validiert und begrenzt (Startversatz 0…120 s, Takt
 * 10…3600 s, Wiederholungen 1…20). `wiederholungen: 1` bedeutet „kein Plan“,
 * also einen normalen Lauf. `addInitScript` läuft auch nach einem Reload,
 * dadurch startet jede Navigation mit derselben Konfiguration.
 */
async function oeffneMitEinstellungen(
  page: Page,
  einstellungen: {
    bahnen: number
    /** Reihen; fehlt sie, startet alles in einer Reihe. */
    reihen?: number
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
          reihen: werte.reihen ?? 1,
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

/**
 * Hält eine Serienzeile länger als die Undo-Schwelle gedrückt.
 *
 * @param page - Seite mit geöffneter App.
 * @param ziel - Zeile, auf der gehalten wird.
 *
 * Wie in `verhalten.spec.ts`: `tap()` ist zu kurz für die 450 ms lange
 * Long-Press-Schwelle. Zuerst wird auf das Overlay `data-haltend="true"`
 * gewartet (der Druck ist registriert), dann 550 ms gehalten und losgelassen.
 */
async function langdruck(page: Page, ziel: Locator): Promise<void> {
  const box = await ziel.boundingBox()
  if (!box) throw new Error('Zeile nicht sichtbar')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(ziel.locator('[data-haltend="true"]')).toBeVisible()
  await page.waitForTimeout(550)
  await page.mouse.up()
}

// Nutzerreise: Zwei Reihen à drei Bahnen starten mit 30 s Versatz. Reihe 1
// läuft sofort, Reihe 2 zählt sichtbar herunter. Währenddessen wird ein zweiter
// Lauf vorbereitet; der erste läuft im Hintergrund weiter und bleibt erreichbar.
test('Startversatz hält spätere Reihen im Countdown und mehrere Läufe bleiben erreichbar', async ({
  page,
}) => {
  await oeffneMitEinstellungen(page, {
    bahnen: 3,
    reihen: 2,
    streckeM: 100,
    startversatzMs: 30_000,
    wiederholungen: 1,
    taktSek: 60,
  })

  await starteLauf(page)

  // Bei 30 s Versatz startet nur Reihe 1; die zweite Reihe ist „geplant“
  // und zeigt statt der laufenden Zeit einen Countdown („Start in“).
  // Bewusst ohne Warten auf den Countdown: 30 s wären im Test unvertretbar
  // lang, geprüft wird der Zustand, den der Versatz erzeugt.
  await expect(
    page.getByRole('button', { name: /Reihe 1, Bahn 1, läuft$/ }),
  ).toHaveAttribute('data-status', 'laeuft')
  const wartend = page.getByRole('button', { name: /Reihe 2, Bahn 1, geplant$/ })
  await expect(wartend).toHaveAttribute('data-status', 'geplant')
  await expect(wartend).toContainText('Start in')

  await page.getByRole('button', { name: 'Weiteren Lauf anlegen' }).tap()
  const chips = page.getByRole('button', { name: /^100 m · Freistil/ })
  await expect(chips).toHaveCount(2)

  // Der neue Lauf ist vorbereitet; der alte läuft im Hintergrund weiter. Die
  // Leiste stellt den zuletzt angelegten Lauf nach vorn, deshalb ist `nth(1)`
  // der zuvor gestartete Lauf — mit laufender Reihe 1 und geplanter Reihe 2.
  await expect(page.getByRole('button', { name: 'Start alle', exact: true })).toBeVisible()
  await chips.nth(1).tap()
  await expect(
    page.getByRole('button', { name: /Reihe 1, Bahn 1, läuft$/ }),
  ).toHaveAttribute('data-status', 'laeuft')
  await expect(page.getByRole('button', { name: /Reihe 2, Bahn 1, geplant$/ })).toBeVisible()
})

// Nutzerreise: Mitten in einer Serie wird die Seite neu geladen. Die
// angefangene Runde soll danach fortsetzbar sein, ohne gemessene Zeiten zu
// verlieren.
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

  await starteLauf(page)
  const bahn1 = page.getByRole('button', { name: /Bahn 1, Runde 1 von 2, läuft$/ })
  // Klick statt Tap: Zwei sehr schnelle Taps können unter Last als Geste
  // abgebrochen werden und dann keine Anschläge erzeugen. Zwei Anschläge
  // schließen Runde 1 ab (100 m im 50-m-Becken).
  await bahn1.dispatchEvent('click')
  await bahn1.dispatchEvent('click')
  await expect(
    page.getByRole('button', { name: /Bahn 2, Runde 1 von 2, läuft$/ }),
  ).toBeVisible()

  // Beim Neuladen verliert Bahn 2 ihre Startzeit, Runde 1 bleibt teilweise
  // gefüllt. „Weiter“ muss genau diese Bahn wieder aufnehmen; die Aktion
  // ergänzt nur fehlende Starts und tastet vorhandene Zeiten nicht an.
  await page.reload()
  await expect(page.locator('[data-tab-status="aktiv"]')).toBeVisible()
  await expect(page.getByText(/Serie ·/)).toBeVisible()
  await page.getByRole('button', { name: 'Weiter', exact: true }).tap()

  await expect(
    page.getByRole('button', { name: /Bahn 2, Runde 1 von 2, läuft$/ }),
  ).toBeVisible()
})

// Nutzerreise: Drei Runden im Takt — die Serien-Ansicht zählt pro Schwimmer
// die Runde, zeigt den Fortschritt und nimmt einen zu frühen Anschlag zurück.
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

  await starteLauf(page)
  await expect(page.getByText(/Serie ·/)).toBeVisible()

  // Zwei Taps pro Bahn schließen Runde 1 ab; der Tap bezieht sich immer auf
  // die älteste offene Runde, nicht auf die zuletzt gestartete.
  const bahn1 = page.getByRole('button', { name: /Bahn 1, Runde 1 von 3, läuft$/ })
  await expect(bahn1).toBeVisible()
  await bahn1.tap()
  await bahn1.tap()

  const bahn2 = page.getByRole('button', { name: /Bahn 2, Runde 1 von 3, läuft$/ })
  await bahn2.tap()
  await bahn2.tap()

  // Runde 2 ist beim Start der Serie schon vorgemerkt, beginnt aber erst nach
  // dem Takt von 60 s; bis dahin steht sie als „wartet auf Start“.
  const wartet = page.getByRole('button', { name: /Bahn 1, Runde 2 von 3, wartet auf Start$/ })
  await expect(wartet).toBeVisible()
  await expect(page.getByText('1 von 3 Runden vollständig')).toBeVisible()

  // Halten nimmt den letzten Anschlag dieser Bahn zurück — hier den
  // Zielanschlag von Runde 1. Die Zeile zeigt danach wieder Runde 1 als
  // laufend, der Fortschritt fällt auf 0 zurück.
  await langdruck(page, wartet)
  await expect(page.getByRole('button', { name: /Bahn 1, Runde 1 von 3, läuft$/ })).toBeVisible()
  await expect(page.getByText('0 von 3 Runden vollständig')).toBeVisible()

  // Geplante Wiederholungen bleiben aus dem Verlauf, bis sie Daten haben:
  // gezählt wird nur die begonnene Runde 1, R2 taucht nicht auf.
  await page.getByRole('button', { name: 'Verlauf' }).tap()
  await expect(page.getByText('1 Lauf')).toBeVisible()
  await expect(page.getByText(/^R1 · /)).toBeVisible()
  await expect(page.getByText(/^R2 · /)).toHaveCount(0)
})
