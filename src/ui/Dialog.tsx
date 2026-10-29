import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'

/**
 * Gemeinsame Hülle für alle modalen Dialoge. Fokus-, Scroll- und
 * Escape-Regeln stehen nur hier und werden nicht in jedem Dialog neu gepflegt.
 */

const FOKUSSIERBAR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const stapel: symbol[] = []
let scrollSperren = 0

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
  const [tiefe, setTiefe] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const vorherFokusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const initialFocusRefCurrent = useRef(initialFocusRef)
  initialFocusRefCurrent.current = initialFocusRef

  useEffect(() => {
    if (!open) return

    const token = Symbol('dialog')
    stapel.push(token)
    setTiefe(stapel.length - 1)
    const gibScrollFrei = sperreScrollen()

    // Die Zurück-Geste des Systems schließt den obersten Dialog statt die App
    // zu verlassen. Nur der unterste Dialog legt dafür einen History-Eintrag an.
    if (stapel.length === 1 && !history.state?.beckenrandDialog) {
      history.pushState({ beckenrandDialog: true }, '')
    }
    const beiZurueck = () => {
      if (stapel.at(-1) === token) onCloseRef.current()
    }
    window.addEventListener('popstate', beiZurueck)
    vorherFokusRef.current = document.activeElement as HTMLElement | null

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

      if (e.key !== 'Tab' || !panel || !istOberster()) return
      const elemente = fokussiereElemente(panel)
      if (elemente.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const erstes = elemente[0]!
      const letztes = elemente.at(-1)!
      const aktiv = document.activeElement
      if (e.shiftKey && (aktiv === erstes || !panel.contains(aktiv))) {
        e.preventDefault()
        letztes.focus()
      } else if (!e.shiftKey && (aktiv === letztes || !panel.contains(aktiv))) {
        e.preventDefault()
        erstes.focus()
      }
    }

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
      className={`fixed inset-0 flex flex-col ${layerClassName}`}
      style={{ zIndex: 40 + tiefe * 10 }}
    >
      <button
        type="button"
        aria-label={backdropLabel}
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
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
