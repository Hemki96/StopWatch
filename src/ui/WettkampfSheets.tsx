/**
 * Dialoge des Wettkampf-Tabs.
 *
 * Enthält das Anlegen eines Wettkampfs, das Anlegen einer Disziplin, das
 * Nachtragen von Bahnnamen und die manuelle Zielzeit. Die Sheets halten nur
 * Formularzustand und melden geprüfte Werte über ihre `onCreate`/`onSave`-
 * Rückrufe an den Screen; geschrieben wird ausschließlich in
 * app/AppProvider. Formate (Zeit, Datum) kommen aus domain/format.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { formatTime, lokalesDatum, parseTime } from '../domain/format'
import { SCHWIMMARTEN, type Beckenlaenge, type Lauf, type Schwimmart } from '../domain/types'
import { Sheet } from './Sheet'

const STRECKEN = [50, 100, 200, 400, 800, 1500] as const

/** Feldblock für ein Sheet: Überschrift, Inhalt und optionaler Hinweis. */
function Feld({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">{label}</h3>
      {children}
      {hint ? <p className="mt-2 text-xs leading-relaxed text-muted">{hint}</p> : null}
    </section>
  )
}

/** Einzelauswahl als Chip; der aktive Zustand ist farblich und per Border markiert. */
function Chip({
  aktiv,
  onClick,
  children,
}: {
  aktiv: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 rounded-xl border px-3 text-sm font-semibold transition-colors ${
        aktiv ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface2 text-fg'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Minus/Plus-Zähler mit festen Grenzen. Die Knöpfe sind an den Grenzen
 * deaktiviert; der Wert bleibt zusätzlich per `Math.min`/`Math.max` im Bereich.
 */
function Stepper({
  wert,
  min,
  max,
  label,
  onChange,
}: {
  wert: number
  min: number
  max: number
  label: string
  onChange: (wert: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label={`Weniger ${label}`}
        disabled={wert <= min}
        onClick={() => onChange(Math.max(min, wert - 1))}
        className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold disabled:opacity-40"
      >
        −
      </button>
      <span className="tabular w-10 text-center text-2xl font-semibold">{wert}</span>
      <button
        type="button"
        aria-label={`Mehr ${label}`}
        disabled={wert >= max}
        onClick={() => onChange(Math.min(max, wert + 1))}
        className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold disabled:opacity-40"
      >
        +
      </button>
    </div>
  )
}

/**
 * Legt einen Wettkampf mit Name, Datum und Beckenlänge an.
 *
 * Der Knopf bleibt gesperrt, bis Name und Datum gesetzt sind. Beim Öffnen wird
 * das Formular auf die Vorgaben zurückgesetzt, damit keine alte Eingabe in
 * einen neuen Wettkampf gerät.
 */
export function WettkampfAnlegenSheet({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (daten: { name: string; datum: string; beckenlaengeM: Beckenlaenge }) => void
}) {
  const [name, setName] = useState('')
  const [datum, setDatum] = useState(() => lokalesDatum(Date.now()))
  const [beckenlaengeM, setBeckenlaengeM] = useState<Beckenlaenge>(50)

  // Jedes Öffnen startet mit leerem Namen, heutigem Datum und 50-m-Becken.
  useEffect(() => {
    if (!open) return
    setName('')
    setDatum(lokalesDatum(Date.now()))
    setBeckenlaengeM(50)
  }, [open])

  return (
    <Sheet open={open} onClose={onClose} titel="Neuer Wettkampf">
      <Feld label="Name">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          placeholder="z. B. Herbstpokal"
          aria-label="Name des Wettkampfs"
          className="h-12 w-full rounded-xl border border-line bg-surface2 px-3 text-base"
        />
      </Feld>

      <Feld label="Datum">
        <input
          type="date"
          value={datum}
          onChange={(event) => setDatum(event.target.value)}
          aria-label="Datum des Wettkampfs"
          className="h-12 w-full rounded-xl border border-line bg-surface2 px-3 text-base"
        />
      </Feld>

      <Feld label="Beckenlänge" hint="Gilt für alle Disziplinen dieses Wettkampfs.">
        <div className="flex gap-2">
          {([25, 50] as const).map((wert) => (
            <Chip key={wert} aktiv={beckenlaengeM === wert} onClick={() => setBeckenlaengeM(wert)}>
              {wert} m
            </Chip>
          ))}
        </div>
      </Feld>

      <button
        type="button"
        disabled={!name.trim() || !datum}
        onClick={() => onCreate({ name: name.trim(), datum, beckenlaengeM })}
        className="h-14 w-full rounded-xl bg-accent text-base font-bold text-accent-fg disabled:opacity-40"
      >
        Wettkampf anlegen
      </button>
    </Sheet>
  )
}

/**
 * Legt eine Disziplin mit Strecke, Schwimmart, Heats und Bahnen je Heat an.
 *
 * Die Strecke muss ein Vielfaches der Beckenlänge des Wettkampfs sein; sonst
 * bleibt der Knopf gesperrt. Die Bezeichnung wird aus Strecke und Schwimmart
 * gebildet und ist zugleich der Name im Verlauf.
 */
export function DisziplinSheet({
  open,
  onClose,
  beckenlaengeM,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  beckenlaengeM: Beckenlaenge
  onCreate: (daten: {
    bezeichnung: string
    streckeM: number
    schwimmart: Schwimmart
    laeufe: number
    bahnen: number
  }) => void
}) {
  const [streckeM, setStreckeM] = useState(100)
  const [schwimmart, setSchwimmart] = useState<Schwimmart>('freistil')
  const [laeufe, setLaeufe] = useState(1)
  const [bahnen, setBahnen] = useState(6)

  // Vorgaben bei jedem Öffnen; die Beckenlänge kommt vom Wettkampf.
  useEffect(() => {
    if (!open) return
    setStreckeM(100)
    setSchwimmart('freistil')
    setLaeufe(1)
    setBahnen(6)
  }, [open])

  const art = SCHWIMMARTEN.find((eintrag) => eintrag.wert === schwimmart)?.label ?? ''
  // Ein Lauf ist ein Heat; die Strecke muss ganzzahlig in Becken passen.
  const ungueltig = streckeM % beckenlaengeM !== 0

  return (
    <Sheet open={open} onClose={onClose} titel="Disziplin anlegen">
      <Feld label="Strecke" hint={ungueltig ? `Passt nicht zu ${beckenlaengeM} m.` : undefined}>
        <div className="flex flex-wrap gap-2">
          {STRECKEN.map((wert) => (
            <Chip key={wert} aktiv={streckeM === wert} onClick={() => setStreckeM(wert)}>
              {wert} m
            </Chip>
          ))}
        </div>
      </Feld>

      <Feld label="Schwimmart">
        <div className="flex flex-wrap gap-2">
          {SCHWIMMARTEN.map((eintrag) => (
            <Chip
              key={eintrag.wert}
              aktiv={schwimmart === eintrag.wert}
              onClick={() => setSchwimmart(eintrag.wert)}
            >
              {eintrag.label}
            </Chip>
          ))}
        </div>
      </Feld>

      <Feld label="Läufe" hint="Ein Lauf ist ein Heat. Namen kannst du danach pro Lauf eintragen.">
        <Stepper wert={laeufe} min={1} max={20} label="Läufe" onChange={setLaeufe} />
      </Feld>

      <Feld label="Bahnen pro Lauf">
        <Stepper wert={bahnen} min={1} max={10} label="Bahnen" onChange={setBahnen} />
      </Feld>

      <button
        type="button"
        disabled={ungueltig}
        onClick={() =>
          onCreate({
            bezeichnung: `${streckeM} m ${art}`,
            streckeM,
            schwimmart,
            laeufe,
            bahnen,
          })
        }
        className="h-14 w-full rounded-xl bg-accent text-base font-bold text-accent-fg disabled:opacity-40"
      >
        {`${streckeM} m ${art} anlegen`}
      </button>
    </Sheet>
  )
}

/**
 * Trägt die Namen aller Bahnen eines Heats nach.
 *
 * Startwert ist `startNamen`; der Effekt setzt ihn nur beim Öffnen bzw. beim
 * Wechsel des Laufs zurück, damit Tippen im Feld nicht durch einen Render
 * überschrieben wird. Leere Felder bleiben ohne Zuordnung, bekannte Namen
 * werden wiederverwendet.
 */
export function NamenSheet({
  open,
  onClose,
  lauf,
  startNamen,
  onSave,
}: {
  open: boolean
  onClose: () => void
  lauf: Lauf | null
  startNamen: string[]
  onSave: (namen: string[]) => void
}) {
  const [namen, setNamen] = useState<string[]>([])

  useEffect(() => {
    if (!open || !lauf) return
    setNamen(startNamen)
    // startNamen ist nur der Startwert; Änderungen im Feld dürfen ihn nicht
    // während des Tippens zurücksetzen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lauf?.id])

  if (!lauf) return null

  return (
    <Sheet open={open} onClose={onClose} titel="Namen für diesen Lauf">
      <p className="mb-4 text-xs leading-relaxed text-muted">
        Leere Felder bleiben ohne Zuordnung. Vorhandene Schwimmer werden wiederverwendet.
      </p>
      <div className="space-y-2">
        {lauf.bahnen.map((bahn, index) => (
          <label key={bahn.id} className="flex items-center gap-3">
            <span className="tabular w-6 shrink-0 text-sm text-muted">{bahn.nummer}</span>
            <input
              value={namen[index] ?? ''}
              onChange={(event) =>
                setNamen((aktuell) =>
                  aktuell.map((wert, i) => (i === index ? event.target.value : wert)),
                )
              }
              maxLength={80}
              autoComplete="off"
              placeholder="Name"
              aria-label={`Name für Bahn ${bahn.nummer}`}
              className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface2 px-3 text-sm"
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onSave(namen)}
        className="mt-5 h-14 w-full rounded-xl bg-accent text-base font-bold text-accent-fg"
      >
        Namen speichern
      </button>
    </Sheet>
  )
}

/**
 * Sheet für eine von Hand eingetragene oder korrigierte Zielzeit.
 *
 * Beim Öffnen wird die vorhandene Zeit als `mm:ss,hh` vorbefüllt. `parseTime`
 * akzeptiert nur lesbare Zeitangaben; Fehler bleiben als Meldung stehen, ohne
 * zu speichern. Die gespeicherte Zeit wird als `manuell` markiert.
 */
export function ZeitSheet({
  open,
  onClose,
  titel,
  wert,
  onSave,
}: {
  open: boolean
  onClose: () => void
  titel: string
  wert: number | null
  onSave: (ms: number) => void
}) {
  const [eingabe, setEingabe] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)

  // Beim Öffnen (und wenn sich der Zielwert ändert) Eingabe und Fehler neu setzen.
  useEffect(() => {
    if (!open) return
    setEingabe(wert === null ? '' : formatTime(wert))
    setFehler(null)
  }, [open, wert])

  /** Prüft das Format und übergibt die Zeit in Millisekunden. */
  const speichern = () => {
    const ms = parseTime(eingabe)
    if (ms === null) {
      setFehler('Bitte eine Zeit wie 01:23,45 eingeben.')
      return
    }
    onSave(ms)
  }

  return (
    <Sheet open={open} onClose={onClose} titel={titel}>
      <p className="mb-4 text-xs leading-relaxed text-muted">
        Die Zeit wird als manuell erfasst markiert. Format: Minuten:Sekunden,Hundertstel.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          speichern()
        }}
      >
        <input
          autoFocus
          value={eingabe}
          onChange={(event) => {
            setEingabe(event.target.value)
            // Eine alte Fehlermeldung verschwindet beim Weitertippen.
            setFehler(null)
          }}
          inputMode="decimal"
          placeholder="01:23,45"
          aria-label="Zielzeit"
          className="tabular h-16 w-full rounded-xl border border-line bg-surface2 px-3 text-center text-3xl font-semibold"
        />
        {fehler ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {fehler}
          </p>
        ) : null}
        <button
          type="submit"
          className="mt-5 h-14 w-full rounded-xl bg-accent text-base font-bold text-accent-fg"
        >
          Zeit speichern
        </button>
      </form>
    </Sheet>
  )
}
