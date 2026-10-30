/**
 * Gemeinsame Helfer der E2E-Specs.
 *
 * Alle Specs laufen gegen die echte App (Vite im Dev- bzw. Preview-Modus,
 * siehe `playwright.config.ts`) und wiederholen dieselben Vorbedingungen:
 * Onboarding überspringen, auf die Tab-Abstimmung warten, auf asynchrone
 * IndexedDB-Schreibvorgänge warten und bei Bedarf einen zweiten Tab öffnen.
 *
 * Playwright gibt jedem Test einen frischen Browser-Kontext. IndexedDB und
 * `localStorage` sind damit pro Test leer — genau das erwarten Specs, die
 * „Noch keine Messungen“ oder „0 Schwimmer“ prüfen. Seed-Daten setzen die
 * Specs selbst über `addInitScript` (etwa die Serien-Einstellungen), nicht
 * diese Helfer.
 *
 * Datenbank und Schlüssel tragen den Speicher-Namensraum aus
 * `src/storage/namensraum.ts` (`beckenrand.v2`). Die Literale stehen hier
 * bewusst, weil `page.evaluate` keine importierten Werte sieht.
 *
 * Die meisten Helfer bedienen die Oberfläche nicht, sondern schreiben nur den
 * Onboarding-Merker in `localStorage` und lesen IndexedDB. So bleiben sie
 * unabhängig von Layout und Beschriftungen. Eine Ausnahme ist `starteLauf`:
 * Die Startübersicht ist Teil jeder Messreise und wird deshalb an einer Stelle
 * bedient, damit eine Änderung der Beschriftung nicht durch alle Specs wandert.
 */

import { expect, type Page } from '@playwright/test'

/**
 * Überspringt das Onboarding und wartet, bis der Tab die Messung hält.
 *
 * @param page - Seite des Tests; der Aufruf muss vor dem ersten `goto`
 * erfolgen, damit das Init-Skript greift.
 * @returns Promise, das nach der Tab-Abstimmung aufgelöst wird.
 *
 * Der Merker wird per `addInitScript` gesetzt: Das Skript läuft vor jedem
 * Dokumentaufbau, also auch nach einem `page.reload()` im selben Test. Dadurch
 * erscheint das Onboarding nie, ohne dass es durchgeklickt werden muss.
 *
 * Der erste Tab wird erst nach der kurzen Abstimmung mit anderen Tabs aktiv
 * (`BroadcastChannel`). Aktionen sind nur dort wirksam; deshalb wartet der
 * Helfer auf `data-tab-status="aktiv"` statt auf einen sichtbaren Screen.
 * Dieses Attribut ist in `src/App.tsx` eigens als Bereitschaftsanzeige für
 * die E2E-Tests vorgesehen.
 */
export async function oeffneApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('beckenrand.v2.onboarding', 'fertig')
    } catch {
      // Ohne localStorage erscheint das Onboarding; die Tests brauchen es nicht.
    }
  })
  await page.goto('/')
  await expect(page.locator('[data-tab-status="aktiv"]')).toBeVisible()
}

/**
 * Startet den nächsten Lauf über die Startübersicht.
 *
 * „Start“ auf der Karte „Nächster Lauf“ öffnet seit der Startübersicht zuerst
 * ein Sheet mit allen Einstellungen; erst „Jetzt starten“ setzt den
 * Startzeitstempel. Beide Schritte gehören zur Nutzerreise, deshalb tippt der
 * Helfer sie zusammen.
 *
 * @param page - Seite mit geöffneter App im Timer-Tab.
 */
export async function starteLauf(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  // Erst wenn die Übersicht sichtbar ist, ist der Startknopf auch wirklich
  // antippbar; ein Tap während der Einblendung träfe sonst den Hintergrund und
  // würde das Sheet nur schließen.
  const starten = page.getByRole('button', { name: 'Jetzt starten', exact: true })
  await expect(starten).toBeVisible()
  await starten.tap()
}

/**
 * Wartet, bis eine Schwimmerzuordnung wirklich in IndexedDB liegt.
 *
 * @param page - Seite mit geöffneter App.
 * @returns Promise, das auflöst, sobald irgendeine Bahn eine `schwimmerId`
 * trägt.
 *
 * Die Oberfläche aktualisiert sofort, das Schreiben läuft aber asynchron. Ein
 * `reload()` direkt nach dem Zuordnen würde die Änderung sonst verlieren.
 * `waitForFunction` fragt den Object-Store `lauf` so lange ab, bis die
 * Bedingung stimmt; die Verbindung wird in jedem Fall geschlossen, damit kein
 * offenes Upgrade spätere Zugriffe blockiert.
 */
export async function warteAufSchwimmerzuordnung(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const anfrage = indexedDB.open('beckenrand.v2')
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

/**
 * Wartet, bis die Zielzeiten wirklich in IndexedDB liegen.
 *
 * @param page - Seite mit geöffneter App.
 * @param anzahl - Mindestzahl an Bahnen mit einem Anschlag `istFinish`.
 * @returns Promise, das auflöst, sobald genug Zielanschläge gespeichert sind.
 *
 * Gezählt wird über alle Läufe hinweg. Gleiche Begründung wie oben: Die Anzeige
 * ist sofort, die Persistenz asynchron; erst nach diesem Warten ist ein
 * Reload verlustfrei.
 */
export async function warteAufZielzeiten(page: Page, anzahl: number): Promise<void> {
  await page.waitForFunction(async (erwartet) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const anfrage = indexedDB.open('beckenrand.v2')
      anfrage.onsuccess = () => resolve(anfrage.result)
      anfrage.onerror = () => reject(anfrage.error)
    })
    try {
      const laeufe = await new Promise<
        Array<{ bahnen?: Array<{ anschlaege?: Array<{ istFinish?: boolean }> }> }>
      >((resolve, reject) => {
        const tx = db.transaction('lauf', 'readonly')
        const anfrage = tx.objectStore('lauf').getAll()
        anfrage.onsuccess = () => resolve(anfrage.result)
        anfrage.onerror = () => reject(anfrage.error)
      })
      const fertig = laeufe.reduce(
        (summe, lauf) =>
          summe +
          (lauf.bahnen ?? []).filter((bahn) =>
            (bahn.anschlaege ?? []).some((anschlag) => anschlag.istFinish),
          ).length,
        0,
      )
      return fertig >= erwartet
    } finally {
      db.close()
    }
  }, anzahl)
}

/**
 * Wartet, bis mindestens so viele Anschläge wie erwartet in IndexedDB liegen.
 *
 * @param page - Seite mit geöffneter App.
 * @param anzahl - Mindestzahl an Anschlägen über alle Läufe.
 * @returns Promise, das auflöst, sobald der Bestand persistiert ist.
 *
 * Die Anzeige ist optimistisch; vor einem Tab-Schließen oder Reload muss der
 * Schreibvorgang abgeschlossen sein, sonst fehlt der letzte Tap.
 */
export async function warteAufAnschlaege(page: Page, anzahl: number): Promise<void> {
  await page.waitForFunction(async (erwartet) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const anfrage = indexedDB.open('beckenrand.v2')
      anfrage.onsuccess = () => resolve(anfrage.result)
      anfrage.onerror = () => reject(anfrage.error)
    })
    try {
      const laeufe = await new Promise<Array<{ bahnen?: Array<{ anschlaege?: unknown[] }> }>>(
        (resolve, reject) => {
          const tx = db.transaction('lauf', 'readonly')
          const anfrage = tx.objectStore('lauf').getAll()
          anfrage.onsuccess = () => resolve(anfrage.result)
          anfrage.onerror = () => reject(anfrage.error)
        },
      )
      const gesamt = laeufe.reduce(
        (summe, lauf) =>
          summe + (lauf.bahnen ?? []).reduce((n, bahn) => n + (bahn.anschlaege?.length ?? 0), 0),
        0,
      )
      return gesamt >= erwartet
    } finally {
      db.close()
    }
  }, anzahl)
}

/**
 * Öffnet einen zweiten Tab mit derselben Herkunft.
 *
 * @param page - Seite des ersten Tabs; sie liefert den Browser-Kontext für
 * den neuen Tab.
 * @returns Die neue Seite. Sie ist noch nicht aktiv; die Tab-Tests warten
 * selbst auf den Zustand, den sie prüfen wollen.
 *
 * Beide Tabs teilen sich den Kontext, also `localStorage` und IndexedDB — nur
 * so greift die Tab-Abstimmung über `BroadcastChannel`. Der Onboarding-Merker
 * wird erneut per `addInitScript` gesetzt, weil das Skript an die Seite
 * gebunden ist und nicht an den Kontext.
 */
export async function oeffneZweitenTab(page: Page): Promise<Page> {
  const zweiter = await page.context().newPage()
  await zweiter.addInitScript(() => {
    try {
      localStorage.setItem('beckenrand.v2.onboarding', 'fertig')
    } catch {
      // siehe oben
    }
  })
  await zweiter.goto('/')
  return zweiter
}

/**
 * Wartet, bis eine Satzbezeichnung wirklich in IndexedDB liegt.
 *
 * @param page - Seite mit geöffneter App.
 * @param bezeichnung - Erwarteter Wert im Feld `bezeichnung` des Satzes.
 *
 * Das Umbenennen im Verlauf ist optimistisch: Die Liste zeigt den neuen Namen
 * sofort, der Schreibvorgang folgt. Ohne dieses Warten würde ein Reload die
 * alte Bezeichnung zurückbringen.
 */
export async function warteAufSatzbezeichnung(page: Page, bezeichnung: string): Promise<void> {
  await page.waitForFunction(async (erwartet) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const anfrage = indexedDB.open('beckenrand.v2')
      anfrage.onsuccess = () => resolve(anfrage.result)
      anfrage.onerror = () => reject(anfrage.error)
    })
    try {
      const satze = await new Promise<Array<{ bezeichnung?: string }>>((resolve, reject) => {
        const tx = db.transaction('satz', 'readonly')
        const anfrage = tx.objectStore('satz').getAll()
        anfrage.onsuccess = () => resolve(anfrage.result)
        anfrage.onerror = () => reject(anfrage.error)
      })
      return satze.some((satz) => satz.bezeichnung === erwartet)
    } finally {
      db.close()
    }
  }, bezeichnung)
}

/**
 * Wartet, bis ein Tagesname wirklich in IndexedDB liegt.
 *
 * @param page - Seite mit geöffneter App.
 * @param bezeichnung - Erwarteter Wert im Feld `tagesbezeichnung` mindestens
 *   eines Satzes. Der Name wird beim Speichern auf alle Sätze des Tages
 *   geschrieben; ein Treffer genügt als Beleg für den abgeschlossenen Schreibvorgang.
 */
export async function warteAufTagesbezeichnung(
  page: Page,
  bezeichnung: string,
): Promise<void> {
  await page.waitForFunction(async (erwartet) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const anfrage = indexedDB.open('beckenrand.v2')
      anfrage.onsuccess = () => resolve(anfrage.result)
      anfrage.onerror = () => reject(anfrage.error)
    })
    try {
      const satze = await new Promise<Array<{ tagesbezeichnung?: string }>>(
        (resolve, reject) => {
          const tx = db.transaction('satz', 'readonly')
          const anfrage = tx.objectStore('satz').getAll()
          anfrage.onsuccess = () => resolve(anfrage.result)
          anfrage.onerror = () => reject(anfrage.error)
        },
      )
      return satze.some((satz) => satz.tagesbezeichnung === erwartet)
    } finally {
      db.close()
    }
  }, bezeichnung)
}
