import { expect, type Page } from '@playwright/test'

/**
 * Onboarding überspringen und warten, bis der Tab die Messung hält. Der erste
 * Tab wird erst nach der kurzen Abstimmung mit anderen Tabs aktiv.
 */
export async function oeffneApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('beckenrand.onboarding', 'fertig')
    } catch {
      // Ohne localStorage erscheint das Onboarding; die Tests brauchen es nicht.
    }
  })
  await page.goto('/')
  await expect(page.locator('[data-tab-status="aktiv"]')).toBeVisible()
}

/**
 * Wartet, bis eine Schwimmerzuordnung wirklich in IndexedDB liegt. Die
 * Oberfläche aktualisiert sofort, das Schreiben läuft aber asynchron.
 */
export async function warteAufSchwimmerzuordnung(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const anfrage = indexedDB.open('beckenrand')
      anfrage.onsuccess = () => resolve(anfrage.result)
      anfrage.onerror = () => reject(anfrage.error)
    })
    try {
      const laeufe = await new Promise<Array<{ bahnen?: Array<{ schwimmerId?: string | null }> }>>(
        (resolve, reject) => {
          const tx = db.transaction('lauf', 'readonly')
          const anfrage = tx.objectStore('lauf').getAll()
          anfrage.onsuccess = () => resolve(anfrage.result)
          anfrage.onerror = () => reject(anfrage.error)
        },
      )
      return laeufe.some((lauf) => lauf.bahnen?.some((bahn) => bahn.schwimmerId))
    } finally {
      db.close()
    }
  })
}

/** Öffnet einen zweiten Tab mit derselben Herkunft. */
export async function oeffneZweitenTab(page: Page): Promise<Page> {
  const zweiter = await page.context().newPage()
  await zweiter.addInitScript(() => {
    try {
      localStorage.setItem('beckenrand.onboarding', 'fertig')
    } catch {
      // siehe oben
    }
  })
  await zweiter.goto('/')
  return zweiter
}
