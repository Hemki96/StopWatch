import { useCallback, useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/** Wird gerufen, sobald eine neue Version bereitsteht. */
type UpdateListener = () => void

const updateListener = new Set<UpdateListener>()

let registrierungGestartet = false
let aktualisiereServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null

/**
 * Der Service Worker wird bewusst nur einmal registriert: `immediate` startet die
 * Prüfung sofort, `registerType: 'prompt'` verhindert, dass sich die App mitten in
 * einem Lauf selbst neu lädt.
 */
function starteServiceWorker(): void {
  if (registrierungGestartet) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  registrierungGestartet = true

  try {
    aktualisiereServiceWorker = registerSW({
      immediate: true,
      onNeedRefresh() {
        for (const listener of updateListener) listener()
      },
      onRegisterError(error) {
        // Ohne Service Worker läuft die App weiter, ist aber nicht offline
        // verfügbar. Die Ursache muss deshalb in der Konsole auffindbar sein.
        console.error('Service-Worker-Registrierung fehlgeschlagen:', error)
      },
    })
  } catch (error) {
    console.error('Service-Worker-Registrierung fehlgeschlagen:', error)
  }
}

export interface UpdateState {
  /** Eine neue Version liegt bereit und wartet auf Aktivierung. */
  verfuegbar: boolean
  /** Aktiviert die neue Version und lädt die App neu. */
  neuLaden: () => void
  /** Blendet den Hinweis aus, ohne zu aktualisieren. */
  spaeter: () => void
}

export function useServiceWorkerUpdate(): UpdateState {
  const [verfuegbar, setVerfuegbar] = useState(false)

  useEffect(() => {
    starteServiceWorker()
    const listener: UpdateListener = () => setVerfuegbar(true)
    updateListener.add(listener)

    // Am Beckenrand bleibt die App lange offen. Beim Zurückkehren in den
    // Vordergrund deshalb aktiv nach einer neuen Version suchen.
    const beiSichtbarkeit = () => {
      if (document.visibilityState !== 'visible') return
      void navigator.serviceWorker.getRegistration().then((registration) => registration?.update())
    }
    document.addEventListener('visibilitychange', beiSichtbarkeit)

    return () => {
      updateListener.delete(listener)
      document.removeEventListener('visibilitychange', beiSichtbarkeit)
    }
  }, [])

  const neuLaden = useCallback(() => {
    void aktualisiereServiceWorker?.(true)
  }, [])

  const spaeter = useCallback(() => setVerfuegbar(false), [])

  return { verfuegbar, neuLaden, spaeter }
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const an = () => setOnline(true)
    const aus = () => setOnline(false)
    window.addEventListener('online', an)
    window.addEventListener('offline', aus)
    return () => {
      window.removeEventListener('online', an)
      window.removeEventListener('offline', aus)
    }
  }, [])

  return online
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function laeuftAlsApp(): boolean {
  if (typeof window === 'undefined') return false
  const eigenstaendig = (window.navigator as Navigator & { standalone?: boolean }).standalone
  return window.matchMedia('(display-mode: standalone)').matches || eigenstaendig === true
}

/** iPadOS meldet sich als Mac — erkennbar an den Touch-Punkten. */
function istAppleMobil(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return true
  return /macintosh/i.test(ua) && navigator.maxTouchPoints > 1
}

export interface InstallState {
  /** App läuft bereits als installierte App (eigener Fensterrahmen). */
  installiert: boolean
  /** Der Browser bietet einen echten Installationsdialog an. */
  kannInstallieren: boolean
  installiere: () => Promise<void>
  /** Kurzanleitung für Browser ohne Installationsdialog (v. a. iOS). */
  anleitung: string
}

export function useInstallPrompt(): InstallState {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [installiert, setInstalliert] = useState(laeuftAlsApp)
  const [appleMobil] = useState(istAppleMobil)

  useEffect(() => {
    const beiPrompt = (event: Event) => {
      event.preventDefault()
      setPrompt(event as InstallPromptEvent)
    }
    const beiInstalliert = () => {
      setPrompt(null)
      setInstalliert(true)
    }
    const medien = window.matchMedia('(display-mode: standalone)')
    const beiAnzeigeart = () => setInstalliert(laeuftAlsApp())

    window.addEventListener('beforeinstallprompt', beiPrompt)
    window.addEventListener('appinstalled', beiInstalliert)
    medien.addEventListener('change', beiAnzeigeart)

    return () => {
      window.removeEventListener('beforeinstallprompt', beiPrompt)
      window.removeEventListener('appinstalled', beiInstalliert)
      medien.removeEventListener('change', beiAnzeigeart)
    }
  }, [])

  const installiere = useCallback(async () => {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    // Der Prompt ist danach verbraucht, auch wenn abgelehnt wurde.
    setPrompt(null)
    if (outcome === 'accepted') setInstalliert(true)
  }, [prompt])

  const anleitung = appleMobil
    ? 'Teilen-Symbol in Safari → „Zum Home-Bildschirm“. Danach startet die App im Vollbild und funktioniert offline.'
    : 'Browsermenü → „App installieren“ (oder das Symbol rechts in der Adressleiste). Danach startet die App im Vollbild und funktioniert offline.'

  return { installiert, kannInstallieren: prompt !== null, installiere, anleitung }
}
