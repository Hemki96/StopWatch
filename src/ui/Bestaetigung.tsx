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
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6">
      <button
        type="button"
        aria-label="Abbrechen"
        onClick={onAbbrechen}
        className="absolute inset-0 bg-black/60"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={titel}
        className="relative w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-2xl"
      >
        <h2 className="text-base font-semibold">{titel}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
        <div className="mt-5 flex gap-2">
          <button
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
      </div>
    </div>
  )
}
