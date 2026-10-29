import { useId, useRef } from 'react'
import { Dialog } from './Dialog'

interface BestaetigungProps {
  open: boolean
  titel: string
  text: string
  bestaetigenLabel: string
  onBestaetigen: () => void
  onAbbrechen: () => void
}

export function Bestaetigung({
  open,
  titel,
  text,
  bestaetigenLabel,
  onBestaetigen,
  onAbbrechen,
}: BestaetigungProps) {
  const titelId = useId()
  const textId = useId()
  const abbrechenRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog
      open={open}
      onClose={onAbbrechen}
      role="alertdialog"
      labelledBy={titelId}
      describedBy={textId}
      backdropLabel="Abbrechen"
      layerClassName="items-center justify-center p-6"
      panelClassName="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-2xl"
      initialFocusRef={abbrechenRef}
    >
      <h2 id={titelId} className="text-base font-semibold">
        {titel}
      </h2>
      <p id={textId} className="mt-2 text-sm leading-relaxed text-muted">
        {text}
      </p>
      <div className="mt-5 flex gap-2">
        <button
          ref={abbrechenRef}
          type="button"
          onClick={onAbbrechen}
          className="h-12 flex-1 rounded-xl border border-line bg-surface2 text-sm font-semibold"
        >
          Abbrechen
        </button>
        <button
          type="button"
          onClick={onBestaetigen}
          className="h-12 flex-1 rounded-xl bg-danger text-sm font-semibold text-white"
        >
          {bestaetigenLabel}
        </button>
      </div>
    </Dialog>
  )
}
