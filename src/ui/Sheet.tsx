import { useId, useRef, useState, type ReactNode } from 'react'
import { Dialog } from './Dialog'
import { XIcon } from './icons'

interface SheetProps {
  open: boolean
  titel: string
  onClose: () => void
  children: ReactNode
}

export function Sheet({ open, titel, onClose, children }: SheetProps) {
  const titelId = useId()
  const [zug, setZug] = useState(0)
  const zugRef = useRef(0)
  const startYRef = useRef<number | null>(null)

  const setzeZug = (wert: number) => {
    zugRef.current = wert
    setZug(wert)
  }

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
      layerClassName="justify-end"
      panelClassName="max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-line bg-surface pb-[max(env(safe-area-inset-bottom),1rem)] shadow-2xl"
      panelStyle={{
        transform: zug > 0 ? `translateY(${zug}px)` : undefined,
        transition: startYRef.current === null ? 'transform 150ms ease-out' : 'none',
      }}
    >
      <div
        className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
          startYRef.current = e.clientY
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            // Safari kann bei synthetischen Zeigern werfen.
          }
        }}
        onPointerMove={(e) => {
          if (startYRef.current === null) return
          setzeZug(Math.max(0, e.clientY - startYRef.current))
        }}
        onPointerUp={beendeZug}
        onPointerCancel={() => {
          startYRef.current = null
          setzeZug(0)
        }}
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-1.5 mx-auto h-1 w-10 rounded-full bg-line"
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
      <div className="px-4 py-4">{children}</div>
    </Dialog>
  )
}
