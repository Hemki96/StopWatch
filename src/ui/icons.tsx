/**
 * Dekorative SVG-Symbole der Oberfläche.
 *
 * Alle Icons teilen Raster (24 × 24), Strichstärke und Farbe (`currentColor`),
 * bekommen ihre Größe über `className` und sind per `aria-hidden` aus dem
 * Vorlesetext heraus. Die Bedeutung trägt immer der Knopf oder Text daneben,
 * nie das Symbol allein.
 */
interface IconProps {
  /** Größe und Farbe kommen aus Utility-Klassen der aufrufenden Stelle. */
  className?: string
}

/**
 * Gemeinsame SVG-Attribute. `currentColor` bindet die Strichfarbe an die
 * Textfarbe, `aria-hidden` hält das Symbol aus dem Vorlesetext.
 */
function base(className?: string) {
  return {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
}

/** Stoppuhr; Tab „Timer“. */
export function TimerIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2" />
      <path d="M9 2h6" />
      <path d="M12 2v3" />
    </svg>
  )
}

/** Notizblock; Tab „Training“. */
export function TrainingIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  )
}

/** Uhr mit rückwärts gerichtetem Pfeil; Tab „Verlauf“. */
export function HistoryIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 12a9 9 0 1 0 2.6-6.4" />
      <path d="M3 4v5h5" />
      <path d="M12 8v5l3 2" />
    </svg>
  )
}

/** Zwei Personen; Tab „Schwimmer“. */
export function PeopleIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1" />
      <path d="M16.5 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18 14.2a5 5 0 0 1 3.5 4.8v1" />
    </svg>
  )
}

/** Zahnrad; Tab „Mehr“ mit den Einstellungen. */
export function GearIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  )
}

/** Plus; neuen Schwimmer anlegen. */
export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

/** Pfeil nach links; „zurück zum Verlauf“. */
export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

/** Pfeil nach rechts; kennzeichnet eine Zeile, die sich öffnen lässt. */
export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

/** Papierkorb; Löschen von Lauf, Satz, Training oder Runde. */
export function TrashIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 14h10l1-14" />
    </svg>
  )
}

/** Pfeil in ein Fach; CSV-Export und Backup sichern. */
export function DownloadIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3v12" />
      <path d="M7 11l5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  )
}

/** Pfeil aus dem Fach; Backup einlesen. */
export function UploadIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M4 20h16" />
    </svg>
  )
}

/** Sonne; helles Design. */
export function SunIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

/** Mond; dunkles Design. */
export function MoonIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  )
}

/** Stift; Zielzeit nachträglich eintragen oder Anschlag korrigieren. */
export function PencilIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 20h4l10-10-4-4L4 16v4Z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  )
}

/** Haken; bestätigte Auswahl. */
export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 12l5 5L20 6" />
    </svg>
  )
}

/** Kreuz; Sheet oder Hinweis schließen sowie fertigen Lauf abtreten. */
export function XIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
