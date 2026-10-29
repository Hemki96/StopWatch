/**
 * Gemeinsame Hülle aller modalen Fenster.
 *
 * Kapselt Fokusfalle, Scroll-Sperre, Escape, die Zurück-Geste und die
 * Fokus-Rückgabe an den Auslöser. `Sheet` und `Bestaetigung` setzen nur noch
 * Layout und Inhalt darauf; mehrere Dialoge stapeln sich und nur der oberste
 * reagiert. Die Komponente kennt keine Fachlogik.
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'

/** Alle Elemente, die im Dialog per Tab erreichbar sind; `disabled` zählt nicht. */
const FOKUSSIERBAR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

// Offene Dialoge in Öffnungsreihenfolge. Der letzte Eintrag ist der oberste
// und darf als einziger auf Escape reagieren.
const stapel: symbol[] = []
// Referenzzähler statt booleschem Flag: Erst wenn der letzte Dialog schließt,
// wird das Scrollen der Seite wieder freigegeben.
let scrollSperren = 0

/** Sperrt das Scrollen der Seite und gibt eine Aufräumfunktion zurück. */
function sperreScrollen(): () => void {
  scrollSperren += 1
  if (scrollSperren === 1) {
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
  }
  return () => {
    scrollSperren = Math.max(0, scrollSperren - 1)
    if (scrollSperren === 0) {
      document.documentElement.style.overflow = ''
      document.body.style.overflow = ''
    }
  }
}

/**
 * Sichtbare, fokussierbare Elemente im Panel. Versteckte Elemente fliegen
 * heraus, weil `querySelectorAll` auch per Utility-Klasse ausgeblendete
 * Knöpfe findet und die Fokusfalle sonst ins Leere springt.
 */
function fokussiereElemente(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOKUSSIERBAR)].filter((element) => {
    const stil = window.getComputedStyle(element)
    return stil.display !== 'none' && stil.visibility !== 'hidden'
  })
}

/**
 * Nach dem Schließen zurück zum Auslöser. Existiert er nicht mehr, landet der
 * Fokus auf einem sinnvollen Element der Seite statt auf `body`.
 */
function stelleFokusWiederHer(vorher: HTMLElement | null): void {
  if (vorher?.isConnected) {
    vorher.focus()
    return
  }
  const ersatz = document.querySelector<HTMLElement>(
    'main button:not([disabled]), main [href], main [tabindex]:not([tabindex="-1"])',
  )
  ersatz?.focus()
}

interface DialogProps {
  open: boolean
  onClose: () => void
  role: 'dialog' | 'alertdialog'
  labelledBy: string
  describedBy?: string
  /** Zusätzliche Klassen für den Inhaltsrahmen. */
  panelClassName?: string
  panelStyle?: CSSProperties
  /** Zusätzliche Klassen für den äußeren Layer (Ausrichtung). */
  layerClassName?: string
  backdropLabel: string
  initialFocusRef?: RefObject<HTMLElement | null>
  children: ReactNode
}

/**
 * Dialog-Hülle mit Fokusfalle. `open=false` rendert nichts, das Öffnen setzt
 * den Fokus ins Panel oder auf `initialFocusRef`.
 */
export function Dialog({
  open,
  onClose,
  role,
  labelledBy,
  describedBy,
  panelClassName = '',
  panelStyle,
  layerClassName = '',
  backdropLabel,
  initialFocusRef,
  children,
}: DialogProps) {
  // Tiefe im Stapel: bestimmt den z-index, damit ein Dialog über einem Sheet
  // liegt und nicht dahinter verschwindet.
  const [tiefe, setTiefe] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  // Element, das vor dem Öffnen den Fokus hatte; bekommt ihn beim Schließen
  // zurück.
  const vorherFokusRef = useRef<HTMLElement | null>(null)
  // Refs statt Effekt-Abhängigkeiten: Der Effekt soll nur bei `open` laufen,
  // auch wenn der Aufrufer bei jedem Render neue Callback-Identitäten liefert.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const initialFocusRefCurrent = useRef(initialFocusRef)
  initialFocusRefCurrent.current = initialFocusRef

  useEffect(() => {
    if (!open) return

    // Jede Öffnung bekommt ein eigenes Token; nur das oberste darf schließen.
    const token = Symbol('dialog')
    stapel.push(token)
    setTiefe(stapel.length - 1)
    const gibScrollFrei = sperreScrollen()

    // Die Zurück-Geste des Systems schließt den obersten Dialog statt die App
    // zu verlassen. Den History-Eintrag legt nur der erste geöffnete Dialog an.
    if (stapel.length === 1 && !history.state?.beckenrandDialog) {
      history.pushState({ beckenrandDialog: true }, '')
    }
    const beiZurueck = () => {
      // Nur der oberste Dialog schließt sich; darunterliegende bleiben offen.
      if (stapel.at(-1) === token) onCloseRef.current()
    }
    window.addEventListener('popstate', beiZurueck)
    vorherFokusRef.current = document.activeElement as HTMLElement | null

    // Startfokus: bevorzugt das gewünschte Element (etwa „Abbrechen“), sonst
    // das Panel selbst, damit die Tastatur nicht auf der Seite dahinter landet.
    const panel = panelRef.current
    const initial = initialFocusRefCurrent.current?.current
    if (initial) initial.focus()
    else if (panel && !panel.contains(document.activeElement)) panel.focus()

    const istOberster = () => stapel.at(-1) === token

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Nur der oberste Dialog reagiert. Liegt eine Bestätigung über dem
        // Sheet, bleibt das Sheet offen.
        if (!istOberster()) return
        e.stopPropagation()
        onCloseRef.current()
        return
      }

      // Fokusfalle: Tab läuft am Rand des Panels wieder auf die andere Seite.
      if (e.key !== 'Tab' || !panel || !istOberster()) return
      const elemente = fokussiereElemente(panel)
      if (elemente.length === 0) {
        // Nichts fokussierbar: Fokus bleibt auf dem Panel.
        e.preventDefault()
        panel.focus()
        return
      }
      const erstes = elemente[0]!
      const letztes = elemente.at(-1)!
      const aktiv = document.activeElement
      // Liegt der Fokus außerhalb (etwa nach einem Klick auf den Hintergrund),
      // holt ihn die erste Tab-Bewegung zurück ins Panel.
      if (e.shiftKey && (aktiv === erstes || !panel.contains(aktiv))) {
        e.preventDefault()
        letztes.focus()
      } else if (!e.shiftKey && (aktiv === letztes || !panel.contains(aktiv))) {
        e.preventDefault()
        erstes.focus()
      }
    }

    // Capture-Phase, damit die Falle vor anderen Keydown-Handlern greift.
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('popstate', beiZurueck)
      gibScrollFrei()
      const index = stapel.indexOf(token)
      if (index !== -1) stapel.splice(index, 1)
      // Der eigene History-Eintrag wird beim programmatischen Schließen entfernt.
      // Verzögert, damit StrictMode (Effekt-Cleanup + Neuaufbau) keinen
      // Dialog schließt, der gerade wieder geöffnet wurde.
      queueMicrotask(() => {
        if (stapel.length === 0 && history.state?.beckenrandDialog) history.back()
      })
      stelleFokusWiederHer(vorherFokusRef.current)
    }
  }, [open])

  if (!open) return null

  return (
    <div
      // Der Layer wird nach Stapeltiefe angehoben, damit ein neuer Dialog über
      // dem bereits offenen liegt.
      className={`fixed inset-0 flex flex-col ${layerClassName}`}
      style={{ zIndex: 40 + tiefe * 10 }}
    >
      {/* Der Hintergrund ist ein echter Knopf mit Label: Tippen und
          Screenreader können damit schließen, ohne dass ein nacktes div
          fokussierbar werden müsste. */}
      <button
        type="button"
        aria-label={backdropLabel}
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      {/* `tabIndex={-1}` macht das Panel programmatisch fokussierbar, ohne in
          der Tab-Reihenfolge aufzutauchen. */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        style={panelStyle}
        className={`relative ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  )
}
