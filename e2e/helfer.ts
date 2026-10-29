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
