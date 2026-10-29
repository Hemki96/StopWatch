/**
 * Analyse: Satzliste, Matrix Person × Runde, Drill-down und Live-Abweichung.
 *
 * Der erste Test seedet zwei vergleichbare Serien direkt in IndexedDB. So sind
 * Rundenzeiten, Abweichungen und die Referenz „zuletzt“ exakt prüfbar, ohne die
 * echte Uhr abzuwarten. Der zweite Test misst eine kurze Serie live und prüft
 * die Abweichung zur Vorrunde in der Serien-Ansicht.
 *
 * Vorbedingung: frischer Browser-Kontext je Test.
 */

import { expect, test } from '@playwright/test'
import { oeffneApp, starteLauf } from './helfer'

const KONFIGURATION = { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' }

/** Ein Anschlag mit fester Länge und kumulierter Zeit. */
function anschlag(laengeNr: number, splitMs: number, istFinish: boolean) {
  return { laengeNr, splitMs, erfasstAt: 1000 + splitMs, istFinish }
}

/**
 * Baut einen Lauf mit zwei Bahnen: Anna (a) auf Bahn 1, Ben (b) auf Bahn 2.
 * `zeiten` enthält je Bahn die beiden kumulierten Splits.
 */
function lauf(
  id: string,
  satzId: string,
  wiederholung: number,
  startWallMs: number,
  zeiten: [number[], number[]],
) {
  const bahn = (nummer: number, schwimmerId: string, splits: number[]) => ({
    id: `${id}-b${nummer}`,
    nummer,
    reihe: 1,
    schwimmerId,
    startMs: 0,
    anschlaege: [
      anschlag(1, splits[0]!, false),
      anschlag(2, splits[1]!, true),
    ],
  })
  return {
    id,
    satzId,
    konfiguration: KONFIGURATION,
    startWallMs,
    startversatzMs: 0,
    wiederholung,
    modus: 'training',
    bahnen: [bahn(1, 'a', zeiten[0]), bahn(2, 'b', zeiten[1])],
  }
}

const SEED = {
  schwimmer: [
    { id: 'a', name: 'Anna', jahrgang: 2010, notiz: '', erstelltAm: 1 },
    { id: 'b', name: 'Ben', jahrgang: 2011, notiz: '', erstelltAm: 2 },
  ],
  satze: [
    {
      id: 'alt',
      datum: '2026-10-22',
      bezeichnung: 'Serie KW 43',
      konfiguration: KONFIGURATION,
      plan: { wiederholungen: 2, taktSek: 60, startversatzMs: 0 },
      erstelltAm: 100,
    },
    {
      id: 'neu',
      datum: '2026-10-29',
      bezeichnung: 'Serie KW 44',
      konfiguration: KONFIGURATION,
      plan: { wiederholungen: 2, taktSek: 60, startversatzMs: 0 },
      erstelltAm: 200,
    },
  ],
  laeufe: [
    // Referenzsatz: Anna 61/60, Ben 63/64.
    lauf('alt-1', 'alt', 1, 1000, [
      [31_000, 61_000],
      [32_000, 63_000],
    ]),
    lauf('alt-2', 'alt', 2, 2000, [
      [30_000, 60_000],
      [33_000, 64_000],
    ]),
    // Aktueller Satz: Anna 60/58 (schneller), Ben 62/65 (langsamer).
    lauf('neu-1', 'neu', 1, 3000, [
      [31_000, 60_000],
      [32_000, 62_000],
    ]),
    lauf('neu-2', 'neu', 2, 4000, [
      [29_000, 58_000],
      [33_000, 65_000],
    ]),
  ],
}

/**
 * Schreibt die Fixtures vor dem App-Start in IndexedDB. Das Schema entspricht
 * `src/storage/db.ts` (Version 3); die App öffnet danach dieselbe Datenbank.
 */
async function seedeAnalyse(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript((daten) => {
    return new Promise<void>((resolve, reject) => {
      const anfrage = indexedDB.open('beckenrand', 3)
      anfrage.onupgradeneeded = () => {
        const db = anfrage.result
        const schwimmer = db.createObjectStore('schwimmer', { keyPath: 'id' })
        schwimmer.createIndex('by-name', 'name')
        const satz = db.createObjectStore('satz', { keyPath: 'id' })
        satz.createIndex('by-datum', 'datum')
        satz.createIndex('by-wettkampf', 'wettkampfId')
        const laufStore = db.createObjectStore('lauf', { keyPath: 'id' })
        laufStore.createIndex('by-satz', 'satzId')
        const wettkampf = db.createObjectStore('wettkampf', { keyPath: 'id' })
        wettkampf.createIndex('by-datum', 'datum')
        const training = db.createObjectStore('training', { keyPath: 'id' })
        training.createIndex('by-datum', 'datum')
      }
      anfrage.onerror = () => reject(anfrage.error)
      anfrage.onsuccess = () => {
        const db = anfrage.result
        const tx = db.transaction(['schwimmer', 'satz', 'lauf'], 'readwrite')
        for (const eintrag of daten.schwimmer) tx.objectStore('schwimmer').put(eintrag)
        for (const eintrag of daten.satze) tx.objectStore('satz').put(eintrag)
        for (const eintrag of daten.laeufe) tx.objectStore('lauf').put(eintrag)
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
    })
  }, SEED)
}

test('zeigt Satzliste, Matrix mit Referenz und Längenzeiten der Person', async ({ page }) => {
  await seedeAnalyse(page)
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Verlauf' }).tap()

  // Umschalter: Der Verlauf bleibt erreichbar, die Analyse listet nur
  // auswertbare Sätze (kein Wettkampf).
  await page
    .getByRole('group', { name: 'Ansicht' })
    .getByRole('button', { name: 'Analyse' })
    .tap()
  await expect(page.getByRole('button', { name: /Serie KW 44/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Serie KW 43/ })).toBeVisible()

  await page.getByRole('button', { name: /Serie KW 44/ }).tap()

  // Referenzzeile nennt Datum und Takt des letzten gleichen Satzes.
  await expect(page.getByText('zuletzt: 22.10. · Takt 01:00')).toBeVisible()
  // Zwei Runden, zwei Personen, Referenzspalte.
  await expect(page.getByRole('columnheader', { name: 'R1' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'R2' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'zuletzt' })).toBeVisible()

  // Anna ist in beiden Runden die Schnellste; die Abweichungen tragen das
  // Vorzeichen, die Zeiten selbst bleiben ungefärbt.
  await expect(page.locator('[data-schnellste="true"]')).toHaveCount(2)
  await expect(page.locator('[data-abweichung="-2000"]')).toBeVisible()
  await expect(page.locator('[data-abweichung="3000"]')).toBeVisible()
  await expect(page.getByText(/\+03,00/).first()).toBeVisible()

  // Drill-down über die Personen-Zeile: Längenzeiten je Runde und Abweichung.
  await page.getByRole('button', { name: 'Anna, Bahn 1, Längenzeiten' }).tap()
  await expect(page.getByRole('heading', { name: 'Anna' })).toBeVisible()
  await expect(page.getByText('50 m', { exact: true })).toBeVisible()
  await expect(page.getByText('100 m', { exact: true })).toBeVisible()
  // Länge 1: 31 s → 29 s (−2 s); Länge 2: 29 s → 29 s (0).
  await expect(page.locator('[data-abweichung="-2000"]')).toBeVisible()
  await expect(page.locator('[data-abweichung="0"]')).toBeVisible()

  // Rückweg über die Matrix zur Liste und zurück in den Verlauf.
  await page.getByRole('button', { name: 'Matrix' }).tap()
  await expect(page.getByRole('columnheader', { name: 'R2' })).toBeVisible()
  await page.getByRole('button', { name: 'Satzliste' }).tap()
  await page
    .getByRole('group', { name: 'Ansicht' })
    .getByRole('button', { name: 'Verlauf' })
    .tap()
  await expect(page.getByText('4 Läufe')).toBeVisible()
})

test('zeigt die Abweichung zur Vorrunde in der Serien-Ansicht erst ab Runde 2', async ({
  page,
}) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'beckenrand.einstellungen',
        JSON.stringify({
          konfiguration: { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' },
          bahnen: 1,
          reihen: 1,
          schwimmerProBahn: [],
          startversatzMs: 0,
          wiederholungen: 2,
          taktSek: 10,
        }),
      )
    } catch {
      // Ohne localStorage gelten die Standardwerte.
    }
  })
  await oeffneApp(page)
  await starteLauf(page)

  const runde1 = page.getByRole('button', { name: /Bahn 1, Runde 1 von 2, läuft$/ })
  await expect(runde1).toBeVisible()
  await runde1.tap()
  await runde1.tap()

  // Runde 1 hat keine Vorrunde; die Abweichung erscheint erst später.
  await expect(page.getByText(/zur Vorrunde/)).toHaveCount(0)

  const runde2 = page.getByRole('button', { name: /Bahn 1, Runde 2 von 2, läuft$/ })
  await expect(runde2).toBeVisible({ timeout: 15_000 })
  await runde2.tap()
  await runde2.tap()

  // Nach dem letzten Ziel steht die Abweichung zur Vorrunde unter der Zeit.
  await expect(page.getByRole('button', { name: /Bahn 1, Runde 2 von 2, im Ziel$/ })).toBeVisible()
  await expect(page.getByText(/zur Vorrunde/)).toBeVisible()
})
