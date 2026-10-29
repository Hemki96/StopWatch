/**
 * PWA-Schicht: Service Worker, Update-Hinweis, Online-Status und Installation.
 *
 * Die Hooks enthalten keine Fachlogik. Sie kapseln Browser-Eigenheiten:
 * - Der Service Worker wird pro Seitenaufruf genau einmal registriert; neue
 *   Versionen melden sich über ein Listener-Set, weil mehrere Stellen den
 *   Update-Zustand lesen können.
 * - Updates werden nur angekündigt, nie selbst eingespielt, damit sich die App
 *   nicht mitten in einer Messung neu lädt.
 * - Einen Installationsdialog bieten nur manche Browser an; iOS braucht eine
 *   Anleitung. Beides wird hier einheitlich als `InstallState` angeboten.
 */
import { useCallback, useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/** Wird gerufen, sobald eine neue Version bereitsteht. */
type UpdateListener = () => void

// Modulzustand, bewusst außerhalb von React: Er überlebt ein erneutes Mounten
// (StrictMode) und verhindert eine zweite Registrierung. Das Set entkoppelt den
// einzelnen Service-Worker-Callback von den Hooks, die ihn abfragen.
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

/**
 * Rückgabe von `useServiceWorkerUpdate`: ob eine Version wartet und wie man
 * damit umgeht. `spaeter` blendet nur den Hinweis aus; die wartende Version
 * bleibt installiert, bis der Nutzer neu lädt.
 */
export interface UpdateState {
  /** Eine neue Version liegt bereit und wartet auf Aktivierung. */
  verfuegbar: boolean
  /** Aktiviert die neue Version und lädt die App neu. */
  neuLaden: () => void
  /** Blendet den Hinweis aus, ohne zu aktualisieren. */
  spaeter: () => void
}

/**
 * Beobachtet, ob eine neue App-Version bereitsteht.
 *
 * Lifecycle: Der Effekt registriert den Service Worker (idempotent im Modul)
 * und hängt sich an das Listener-Set. Zusätzlich wird bei jedem Wechsel in den
 * Vordergrund aktiv nach einer Aktualisierung gesucht — am Beckenrand bleibt
 * die App lange offen und würde sonst nie nachsehen. Cleanup entfernt Listener
 * und Sichtbarkeits-Handler, damit ein Unmount keine Zustände mehr setzt.
 *
 * Rückgabe ist stabil (`useCallback`), damit der Aufrufer sie in
 * Abhängigkeitslisten verwenden kann.
 */
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
      // Ohne Service-Worker-Unterstützung gibt es nichts zu prüfen; ein
      // direkter Zugriff würde hier bei jedem Tab-Wechsel werfen.
      if (!('serviceWorker' in navigator) || !navigator.serviceWorker?.getRegistration) return
      void navigator.serviceWorker
        .getRegistration()
        .then((registration) => registration?.update())
        .catch(() => undefined)
    }
    document.addEventListener('visibilitychange', beiSichtbarkeit)

    return () => {
      updateListener.delete(listener)
      document.removeEventListener('visibilitychange', beiSichtbarkeit)
    }
  }, [])

  const neuLaden = useCallback(() => {
    // `true` bedeutet „Seite neu laden“, sobald der neue Worker übernimmt.
    // Fehlt der Aktualisierer (kein Service Worker), bleibt der Aufruf wirkungslos.
    void aktualisiereServiceWorker?.(true)
  }, [])

  const spaeter = useCallback(() => setVerfuegbar(false), [])

  return { verfuegbar, neuLaden, spaeter }
}

/**
 * Meldet, ob der Browser online ist. Nur ein Hinweis für die Kopfzeile: Die App
 * arbeitet vollständig lokal und braucht keine Verbindung.
 *
 * Startwert ist `navigator.onLine`; danach folgen die `online`/`offline`-
 * Ereignisse des Fensters. Ohne `navigator` (SSR, Tests) gilt „online“.
 */
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

/**
 * Nicht standardisiertes `beforeinstallprompt`-Ereignis. Es existiert nur in
 * Chromium-Browsern; über `prompt()` öffnet sich der echte Installationsdialog,
 * `userChoice` löst mit der Entscheidung auf.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Erkennt, ob die App bereits als installierte App läuft (eigener Fensterrahmen).
 * Zwei Wege, weil ältere iOS-Versionen `display-mode` nicht auswerten und nur
 * `navigator.standalone` setzen.
 */
function laeuftAlsApp(): boolean {
  if (typeof window === 'undefined') return false
  const eigenstaendig = (window.navigator as Navigator & { standalone?: boolean }).standalone
  return window.matchMedia?.('(display-mode: standalone)').matches === true || eigenstaendig === true
}

/** iPadOS meldet sich als Mac — erkennbar an den Touch-Punkten. */
function istAppleMobil(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return true
  return /macintosh/i.test(ua) && navigator.maxTouchPoints > 1
}

/**
 * Rückgabe von `useInstallPrompt`. `anleitung` ist der Text für Browser ohne
 * Installationsdialog; die Oberfläche zeigt ihn, solange die App weder
 * installiert ist noch ein Dialog angeboten wird.
 */
export interface InstallState {
  /** App läuft bereits als installierte App (eigener Fensterrahmen). */
  installiert: boolean
  /** Der Browser bietet einen echten Installationsdialog an. */
  kannInstallieren: boolean
  installiere: () => Promise<void>
  /** Kurzanleitung für Browser ohne Installationsdialog (v. a. iOS). */
  anleitung: string
}

/**
 * Bietet die Installation an, soweit der Browser das unterstützt.
 *
 * Lifecycle: Der Effekt fängt `beforeinstallprompt` ab (Standardverhalten
 * unterdrücken, Ereignis merken), beobachtet `appinstalled` und Änderungen der
 * Anzeigeart (`display-mode: standalone`). Cleanup entfernt alle Listener.
 *
 * Randfälle: Der Prompt ist nach einem Aufruf verbraucht und wird deshalb auch
 * bei Ablehnung verworfen. Wirft der Browser beim Öffnen, bleibt die Anleitung
 * sichtbar. `istAppleMobil` wird nur einmal bestimmt, weil sich die Plattform
 * während einer Sitzung nicht ändert.
 */
export function useInstallPrompt(): InstallState {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [installiert, setInstalliert] = useState(laeuftAlsApp)
  const [appleMobil] = useState(istAppleMobil)

  useEffect(() => {
    const beiPrompt = (event: Event) => {
      // Standardverhalten unterdrücken: Der Hinweis soll in der App erscheinen,
      // nicht als Leiste des Browsers.
      event.preventDefault()
      setPrompt(event as InstallPromptEvent)
    }
    const beiInstalliert = () => {
      setPrompt(null)
      setInstalliert(true)
    }
    const medien = window.matchMedia?.('(display-mode: standalone)')
    const beiAnzeigeart = () => setInstalliert(laeuftAlsApp())

    window.addEventListener('beforeinstallprompt', beiPrompt)
    window.addEventListener('appinstalled', beiInstalliert)
    medien?.addEventListener('change', beiAnzeigeart)

    return () => {
      window.removeEventListener('beforeinstallprompt', beiPrompt)
      window.removeEventListener('appinstalled', beiInstalliert)
      medien?.removeEventListener('change', beiAnzeigeart)
    }
  }, [])

  const installiere = useCallback(async () => {
    if (!prompt) return
    try {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      if (outcome === 'accepted') setInstalliert(true)
    } catch {
      // Der Browser kann den Dialog verweigern; die Anleitung bleibt sichtbar.
    } finally {
      // Der Prompt ist danach verbraucht, auch wenn er abgelehnt wurde.
      setPrompt(null)
    }
  }, [prompt])

  const anleitung = appleMobil
    ? 'Teilen-Symbol in Safari → „Zum Home-Bildschirm“. Danach startet die App im Vollbild und funktioniert offline.'
    : 'Browsermenü → „App installieren“ (oder das Symbol rechts in der Adressleiste). Danach startet die App im Vollbild und funktioniert offline.'

  return { installiert, kannInstallieren: prompt !== null, installiere, anleitung }
}
