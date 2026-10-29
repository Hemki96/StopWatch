/**
 * Von unten einfahrendes Sheet für Formulare und Auswahlpanels.
 *
 * Setzt auf `Dialog` auf und ergänzt Kopfzeile, Schließen-Knopf sowie die
 * Ziehgeste: Ein Zug nach unten an der Kopfzeile schließt das Sheet. Der
 * Inhalt bleibt scrollbar, die Kopfzeile klebt oben. Aufrufer liefern Titel und
 * Inhalt, die Aktionen selbst.
 */
import { useId, useRef, useState, type ReactNode } from 'react'
import { Dialog } from './Dialog'
import { XIcon } from './icons'

interface SheetProps {
  open: boolean
  /** Titel der Kopfzeile; zugleich Beschriftung für Screenreader. */
  titel: string
  /** Schließen per Knopf, Hintergrund, Escape oder Zug. */
  onClose: () => void
  children: ReactNode
}

/** Sheet mit Titelzeile; Schließen per Knopf, Hintergrund, Escape oder Zug. */
export function Sheet({ open, titel, onClose, children }: SheetProps) {
  const titelId = useId()
  // `zug` treibt die Darstellung, `zugRef` liefert den aktuellen Wert in den
  // Pointer-Handlern, ohne auf ein erneutes Rendern zu warten.
  const [zug, setZug] = useState(0)
  const zugRef = useRef(0)
  // Startpunkt des Zugs; `null` heißt: keine Geste aktiv.
  const startYRef = useRef<number | null>(null)

  const setzeZug = (wert: number) => {
    zugRef.current = wert
    setZug(wert)
  }

  /**
   * Beendet die Geste. Ab 90 px gilt sie als Schließwunsch, darunter federt das
   * Sheet zurück. Ein abgebrochener Zug (pointercancel) schließt nie.
   */
  const beendeZug = () => {
    const weit = zugRef.current
    startYRef.current = null
    if (weit > 90) {
      onClose()
    }
    setzeZug(0)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      role="dialog"
      labelledBy={titelId}
      backdropLabel="Schließen"
      // Handy: von unten. Tablet: zentriertes Fenster mit fester Lesebreite,
      // damit Formulare nicht über die ganze Gerätebreite laufen.
      layerClassName="justify-end rail:items-center rail:justify-center rail:p-6"
      panelClassName="max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-line bg-surface pb-[max(env(safe-area-inset-bottom),1rem)] shadow-2xl rail:max-h-[85dvh] rail:w-full rail:max-w-xl rail:rounded-3xl rail:border"
      panelStyle={{
        // Nur während der Geste ohne Übergang, damit der Finger direkt führt;
        // beim Zurückfedern entsteht so eine kurze Animation.
        transform: zug > 0 ? `translateY(${zug}px)` : undefined,
        transition: startYRef.current === null ? 'transform 150ms ease-out' : 'none',
      }}
    >
      {/* Kopfzeile mit Griff, Titel und Schließen-Knopf. Sie ist die einzige
          Ziehfläche; `touchAction: none` verhindert, dass das Scrollen des
          Inhalts die Geste abfängt. */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface py-3 pl-[max(env(safe-area-inset-left),1rem)] pr-[max(env(safe-area-inset-right),1rem)] rail:px-6"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          // Ein Zug, der auf dem Schließen-Knopf beginnt, ist ein Klick.
          if ((e.target as HTMLElement).closest('button')) return
          startYRef.current = e.clientY
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            // Safari kann bei synthetischen Zeigern werfen.
          }
        }}
        onPointerMove={(e) => {
          // Nur nach unten ziehen; nach oben bleibt das Sheet stehen.
          if (startYRef.current === null) return
          setzeZug(Math.max(0, e.clientY - startYRef.current))
        }}
        onPointerUp={beendeZug}
        onPointerCancel={() => {
          // Systemgeste oder Anruf: Geste verwerfen, Sheet bleibt offen.
          startYRef.current = null
          setzeZug(0)
        }}
      >
        {/* Dekorativer Griff; die Ziehgeste funktioniert auf der ganzen Zeile. */}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-1.5 mx-auto h-1 w-10 rounded-full bg-line rail:hidden"
        />
        <h2 id={titelId} className="pt-1 text-base font-semibold">
          {titel}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="grid h-9 w-9 place-items-center rounded-full bg-surface2 text-muted"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>
      <div className="py-4 pl-[max(env(safe-area-inset-left),1rem)] pr-[max(env(safe-area-inset-right),1rem)] rail:px-6 rail:py-5">
        {children}
      </div>
    </Dialog>
  )
}
