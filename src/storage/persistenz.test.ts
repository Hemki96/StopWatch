import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  leseSpeicherSchutz,
  schuetzeSpeicher,
  schuetzeSpeicherBeimStart,
  type SpeicherSchutz,
} from './persistenz'

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

describe('leseSpeicherSchutz', () => {
  it('meldet geschützt, wenn der Browser den Speicher hält', async () => {
    stelleStorage(async () => true)
    await expect(leseSpeicherSchutz()).resolves.toBe('geschuetzt')
  })

  it('meldet ungeschützt, wenn der Browser verwerfen darf', async () => {
    stelleStorage(async () => false)
    await expect(leseSpeicherSchutz()).resolves.toBe('ungeschuetzt')
  })

  it('bleibt unbekannt ohne Storage Manager', async () => {
    vi.stubGlobal('navigator', {})
    await expect(leseSpeicherSchutz()).resolves.toBe('unbekannt')
  })

  it('bleibt unbekannt, wenn die Abfrage wirft', async () => {
    stelleStorage(async () => {
      throw new Error('blockiert')
    })
    await expect(leseSpeicherSchutz()).resolves.toBe('unbekannt')
  })
})

describe('schuetzeSpeicher', () => {
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

  it('fordert ohne persist-Funktion nichts an', async () => {
    stelleStorage(async () => false)
    await expect(schuetzeSpeicher()).resolves.toBe('unbekannt')
  })

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

describe('schuetzeSpeicherBeimStart', () => {
  it('lässt bereits geschützten Speicher unangetastet', async () => {
    const persist = vi.fn(async () => true)
    stelleStorage(async () => true, persist)

    await expect(schuetzeSpeicherBeimStart()).resolves.toBe('geschuetzt')
    expect(persist).not.toHaveBeenCalled()
  })

  it('behandelt unbekannte Browser wie geschützt', async () => {
    vi.stubGlobal('navigator', {})
    const ergebnis: SpeicherSchutz = await schuetzeSpeicherBeimStart()
    expect(ergebnis).toBe('unbekannt')
  })

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
