/**
 * Dauerhafter Speicher (StorageManager).
 *
 * Sichert ab, dass die App den Schutzstatus nur meldet und nie eine Ausnahme
 * nach außen gibt: Fehlt die API, wirft sie, oder lehnt der Browser ab, lautet
 * das Ergebnis `unbekannt` bzw. `ungeschuetzt` und die App läuft weiter. Beim
 * Start darf höchstens eine `persist()`-Anfrage entstehen, und ein bereits
 * geschützter Speicher wird nicht erneut angefragt.
 *
 * Die Tests ersetzen `navigator` per `vi.stubGlobal` durch ein partielles
 * `StorageManager`-Objekt; `afterEach` macht das rückgängig. Es gibt keine echte
 * Browser-API und keinen dauerhaften Speicher — geprüft wird nur das Verhalten
 * der Funktionen bei vorhandenen, fehlenden und werfenden Methoden.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  leseSpeicherSchutz,
  schuetzeSpeicher,
  schuetzeSpeicherBeimStart,
  type SpeicherSchutz,
} from './persistenz'

// Baut einen minimalen `navigator.storage` mit genau den Methoden, die der Test
// braucht. Fehlende Methoden lassen sich so gezielt prüfen, ohne die echte
// Browser-Umgebung nachzubauen.
function stelleStorage(
  persisted: (() => Promise<boolean>) | undefined,
  persist?: () => Promise<boolean>,
) {
  const storage: Partial<StorageManager> = {}
  if (persisted) storage.persisted = persisted
  if (persist) storage.persist = persist
  vi.stubGlobal('navigator', { storage })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// `leseSpeicherSchutz` fragt nur ab und fordert nichts an; jeder Ausnahmefall
// endet bei `unbekannt`.
describe('leseSpeicherSchutz', () => {
  it('meldet geschützt, wenn der Browser den Speicher hält', async () => {
    stelleStorage(async () => true)
    await expect(leseSpeicherSchutz()).resolves.toBe('geschuetzt')
  })

  it('meldet ungeschützt, wenn der Browser verwerfen darf', async () => {
    stelleStorage(async () => false)
    await expect(leseSpeicherSchutz()).resolves.toBe('ungeschuetzt')
  })

  // Ohne `navigator.storage.persisted` gibt es nichts zu lesen; die App nimmt
  // keinen Schutz an.
  it('bleibt unbekannt ohne Storage Manager', async () => {
    vi.stubGlobal('navigator', {})
    await expect(leseSpeicherSchutz()).resolves.toBe('unbekannt')
  })

  // Manche Browser verweigern die Abfrage (z. B. im privaten Modus); der Fehler
  // wird geschluckt.
  it('bleibt unbekannt, wenn die Abfrage wirft', async () => {
    stelleStorage(async () => {
      throw new Error('blockiert')
    })
    await expect(leseSpeicherSchutz()).resolves.toBe('unbekannt')
  })
})

// `schuetzeSpeicher` fordert den Schutz an und liefert anschließend den
// tatsächlichen Zustand aus `persisted()`.
describe('schuetzeSpeicher', () => {
  // Der Rückgabewert von `persist()` zählt nicht; maßgeblich ist, dass
  // `persisted()` danach `true` liefert. Der Stub schaltet den Zustand um.
  it('fordert Schutz an und liest das Ergebnis', async () => {
    const persist = vi.fn(async () => true)
    let geschuetzt = false
    stelleStorage(async () => geschuetzt, async () => {
      geschuetzt = true
      return persist()
    })

    await expect(schuetzeSpeicher()).resolves.toBe('geschuetzt')
    expect(persist).toHaveBeenCalledOnce()
  })

  // Ohne `persist()` gibt es keine Anfrage; das Ergebnis bleibt `unbekannt`,
  // auch wenn `persisted()` bereits `false` liefern würde.
  it('fordert ohne persist-Funktion nichts an', async () => {
    stelleStorage(async () => false)
    await expect(schuetzeSpeicher()).resolves.toBe('unbekannt')
  })

  // Wirft die Anfrage, bleibt es bei `unbekannt`; die App darf daran nicht
  // scheitern.
  it('bleibt unbekannt, wenn die Anfrage wirft', async () => {
    stelleStorage(
      async () => false,
      async () => {
        throw new Error('abgelehnt')
      },
    )
    await expect(schuetzeSpeicher()).resolves.toBe('unbekannt')
  })
})

// Beim App-Start wird höchstens einmal angefragt: Nur `ungeschuetzt` löst
// `persist()` aus.
describe('schuetzeSpeicherBeimStart', () => {
  // Ein bereits erteilter Schutz wird nicht erneut angefragt; der Browser kann
  // sonst bei jedem Start nachfragen.
  it('lässt bereits geschützten Speicher unangetastet', async () => {
    const persist = vi.fn(async () => true)
    stelleStorage(async () => true, persist)

    await expect(schuetzeSpeicherBeimStart()).resolves.toBe('geschuetzt')
    expect(persist).not.toHaveBeenCalled()
  })

  // Fehlt die API, bleibt es bei `unbekannt`; es wird nichts angefragt.
  it('behandelt unbekannte Browser wie geschützt', async () => {
    vi.stubGlobal('navigator', {})
    const ergebnis: SpeicherSchutz = await schuetzeSpeicherBeimStart()
    expect(ergebnis).toBe('unbekannt')
  })

  // Bei ungeschütztem Speicher läuft genau eine Anfrage; danach ist der neue
  // Zustand geschützt.
  it('fragt bei ungeschütztem Speicher einmal an', async () => {
    const persist = vi.fn(async () => true)
    let geschuetzt = false
    stelleStorage(async () => geschuetzt, async () => {
      geschuetzt = true
      return persist()
    })

    await expect(schuetzeSpeicherBeimStart()).resolves.toBe('geschuetzt')
    expect(persist).toHaveBeenCalledOnce()
  })
})
