import { useEffect, type ReactNode } from 'react'
import { XIcon } from './icons'

interface SheetProps {
  open: boolean
  titel: string
  onClose: () => void
  children: ReactNode
}

export function Sheet({ open, titel, onClose, children }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Schließen"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titel}
        className="relative max-h-[88dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-surface pb-[max(env(safe-area-inset-bottom),1rem)] shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
          <h2 className="text-base font-semibold">{titel}</h2>
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
      </div>
    </div>
  )
}
