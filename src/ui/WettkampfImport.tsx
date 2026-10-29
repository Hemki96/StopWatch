/**
 * Sheet für den Meldelisten-Import als CSV.
 *
 * Zwei Betriebsarten: ohne `wettkampf` entsteht ein neuer Wettkampf (Name,
 * Datum, Beckenlänge), mit `wettkampf` wird ein bestehender ergänzt. Die
 * eingefügte oder geladene CSV wird über domain/meldeliste geparst und vor dem
 * Import als Zusammenfassung mit Warnungen angezeigt; geschrieben wird erst
 * über `onImport` bzw. app/AppProvider. Eine Vorlage lässt sich herunterladen.
 */
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { lokalesDatum } from '../domain/format'
import {
  anzeigeZuMeter,
  beckenlaengenFuer,
  einheitVon,
  formatBeckenlaenge,
  standardBeckenlaenge,
  streckeAnzeige,
} from '../domain/einheit'
import {
  meldelisteVorlage,
  meldelisteZusammenfassung,
  parseMeldeliste,
} from '../domain/meldeliste'
import {
  SCHWIMMARTEN,
  type Beckenlaenge,
  type Einheit,
  type Schwimmart,
  type Wettkampf,
} from '../domain/types'
import type { WettkampfPlan } from '../domain/wettkampf'
import { speichereDatei, waehleDatei } from '../export/datei'
import { Sheet } from './Sheet'
import { UploadIcon } from './icons'

const STRECKEN = [50, 100, 200, 400, 800, 1500] as const

/**
 * Import-Dialog für eine Meldeliste.
 *
 * Eingaben: optionaler Wettkampfrahmen, Vorgaben für Zeilen ohne Disziplin
 * (Strecke und Schwimmart) und der CSV-Text. Die Vorschau zeigt Anzahl und
 * Namen der Disziplinen sowie Warnungen. Der Import-Knopf bleibt gesperrt,
 * solange die CSV unlesbar ist, ein Wettkampfname fehlt oder das Datum leer ist.
 */
export function WettkampfImportSheet({
  open,
  onClose,
  wettkampf,
  onImport,
}: {
  open: boolean
  onClose: () => void
  wettkampf: Wettkampf | null
  onImport: (plan: WettkampfPlan, wettkampfId: string | null) => void
}) {
  const app = useApp()
  const [name, setName] = useState('')
  const [datum, setDatum] = useState(() => lokalesDatum(Date.now()))
  const [einheit, setEinheit] = useState<Einheit>('m')
  const [beckenlaengeM, setBeckenlaengeM] = useState<Beckenlaenge>(50)
  const [streckeM, setStreckeM] = useState(100)
  const [schwimmart, setSchwimmart] = useState<Schwimmart>('freistil')
  const [text, setText] = useState('')
  const [dateiFehler, setDateiFehler] = useState<string | null>(null)

  // Beim Öffnen alles zurücksetzen; im Rahmen eines Wettkampfs werden dessen
  // Stammdaten übernommen und sind nicht mehr editierbar.
  useEffect(() => {
    if (!open) return
    setName(wettkampf?.name ?? '')
    setDatum(wettkampf?.datum ?? lokalesDatum(Date.now()))
    const startEinheit: Einheit = wettkampf?.einheit === 'yd' ? 'yd' : 'm'
    setEinheit(startEinheit)
    setBeckenlaengeM(wettkampf?.beckenlaengeM ?? standardBeckenlaenge(startEinheit))
    // Die Vorgabe-Strecke gilt in der Einheit des Wettkampfs; sonst stünde in
    // einem Yard-Wettkampf stillschweigend 100 m.
    setStreckeM(anzeigeZuMeter(100, startEinheit))
    setSchwimmart('freistil')
    setText('')
    setDateiFehler(null)
  }, [open, wettkampf])

  // Die Beckenlänge des bestehenden Wettkampfs hat Vorrang vor der Auswahl;
  // dasselbe gilt für die Einheit.
  const pool = wettkampf?.beckenlaengeM ?? beckenlaengeM
  const aktiveEinheit = wettkampf ? einheitVon(wettkampf) : einheit
  // Vorschau wird bei jeder Textänderung neu geparst; die Vorgaben gelten nur
  // für Zeilen, die selbst keine Disziplin nennen.
  const ergebnis = useMemo(
    () =>
      text.trim()
        ? parseMeldeliste(text, {
            beckenlaengeM: pool,
            einheit: aktiveEinheit,
            streckeM,
            schwimmart,
            lauf: 1,
          })
        : null,
    [text, pool, aktiveEinheit, streckeM, schwimmart],
  )

  const fehler = ergebnis && !ergebnis.ok ? ergebnis.fehler : null
  const meldeliste = ergebnis && ergebnis.ok ? ergebnis.meldeliste : null
  // Ohne bestehenden Wettkampf braucht ein neuer einen Namen.
  const nameFehlt = !wettkampf && !name.trim()
  const kannImportieren = !!meldeliste && !nameFehlt && !!datum

  /** Liest eine CSV- oder Textdatei in das Textfeld; Abbruch ist kein Fehler. */
  const ladeDatei = async () => {
    const datei = await waehleDatei('text/csv,text/plain,.csv,.txt')
    if (!datei) return
    try {
      setText(await datei.text())
      setDateiFehler(null)
    } catch {
      setDateiFehler('Die Datei konnte nicht gelesen werden.')
    }
  }

  /**
   * Reicht den geparsten Plan weiter. Im bestehenden Wettkampf bleiben Name,
   * Datum und Beckenlänge unverändert; nur die Disziplinen kommen hinzu.
   */
  const importiere = () => {
    if (!meldeliste) return
    onImport(
      {
        name: (wettkampf?.name ?? name).trim(),
        datum: wettkampf?.datum ?? datum,
        beckenlaengeM: pool,
        einheit: aktiveEinheit,
        disziplinen: meldeliste.disziplinen,
      },
      wettkampf?.id ?? null,
    )
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      titel={wettkampf ? 'Meldeliste hinzufügen' : 'Meldeliste importieren'}
    >
      {!wettkampf ? (
        <>
          {/* Nur ohne bestehenden Wettkampf: Rahmen selbst festlegen. */}
          <section className="mb-5">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
              Wettkampf
            </h3>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              placeholder="z. B. Herbstpokal"
              aria-label="Name des Wettkampfs"
              className="h-12 w-full rounded-xl border border-line bg-surface2 px-3 text-base"
            />
            <div className="mt-2 flex gap-2">
              <input
                type="date"
                value={datum}
                onChange={(event) => setDatum(event.target.value)}
                aria-label="Datum des Wettkampfs"
                className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface2 px-3 text-sm"
              />
              {(['m', 'yd'] as const).map((wert) => (
                <button
                  key={wert}
                  type="button"
                  onClick={() => {
                    setEinheit(wert)
                    setBeckenlaengeM(standardBeckenlaenge(wert))
                    setStreckeM(anzeigeZuMeter(100, wert))
                  }}
                  className={`h-11 rounded-xl border px-3 text-sm font-semibold ${
                    einheit === wert
                      ? 'border-accent bg-accent text-accent-fg'
                      : 'border-line bg-surface2'
                  }`}
                >
                  {wert === 'm' ? 'Meter' : 'Yards'}
                </button>
              ))}
              {beckenlaengenFuer(einheit).map((wert) => (
                <button
                  key={wert}
                  type="button"
                  onClick={() => setBeckenlaengeM(wert)}
                  className={`h-11 rounded-xl border px-3 text-sm font-semibold ${
                    beckenlaengeM === wert
                      ? 'border-accent bg-accent text-accent-fg'
                      : 'border-line bg-surface2'
                  }`}
                >
                  {formatBeckenlaenge(wert, einheit)}
                </button>
              ))}
            </div>
          </section>
        </>
      ) : (
        // Bestehender Wettkampf: Stammdaten nur anzeigen, nicht ändern.
        <p className="mb-5 rounded-xl border border-line bg-surface2 px-3 py-2 text-xs leading-relaxed text-muted">
          {wettkampf.name} · {wettkampf.datum} ·{' '}
          {formatBeckenlaenge(wettkampf.beckenlaengeM, einheitVon(wettkampf))}-Becken
        </p>
      )}

      <section className="mb-5">
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
          Vorgabe, wenn die Datei keine Disziplin nennt
        </h3>
        {/* Diese Werte füllen nur Zeilen ohne eigene Disziplin; eine explizite
            Disziplin in der CSV hat immer Vorrang. */}
        <div className="flex flex-wrap gap-2">
          {STRECKEN.map((wert) => (
            <button
              key={wert}
              type="button"
              onClick={() => setStreckeM(anzeigeZuMeter(wert, aktiveEinheit))}
              className={`h-10 rounded-xl border px-3 text-sm font-semibold ${
                streckeAnzeige(streckeM, aktiveEinheit) === wert
                  ? 'border-accent bg-accent text-accent-fg'
                  : 'border-line bg-surface2'
              }`}
            >
              {wert} {aktiveEinheit}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {SCHWIMMARTEN.map((eintrag) => (
            <button
              key={eintrag.wert}
              type="button"
              onClick={() => setSchwimmart(eintrag.wert)}
              className={`h-10 rounded-xl border px-3 text-sm font-semibold ${
                schwimmart === eintrag.wert
                  ? 'border-accent bg-accent text-accent-fg'
                  : 'border-line bg-surface2'
              }`}
            >
              {eintrag.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted">
            Meldeliste als CSV
          </h3>
          <button
            type="button"
            onClick={() =>
              void speichereDatei(
                'beckenrand-meldeliste-vorlage.csv',
                meldelisteVorlage(aktiveEinheit),
                'text/csv;charset=utf-8',
              ).catch(() => app.zeigeToast('Vorlage konnte nicht gespeichert werden.'))
            }
            className="text-xs font-semibold text-accent"
          >
            Vorlage laden
          </button>
        </div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={7}
          spellCheck={false}
          placeholder={'bahn;name\n3;Anna Muster\n4;Ben Beispiel'}
          aria-label="Meldeliste"
          className="tabular w-full rounded-xl border border-line bg-surface2 px-3 py-2 text-xs leading-relaxed"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void ladeDatei()}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-line bg-surface2 px-3 text-xs font-semibold"
          >
            <UploadIcon className="h-4 w-4" />
            Datei wählen
          </button>
          <span className="text-[11px] text-muted">Semikolon oder Komma, UTF-8</span>
        </div>
        {dateiFehler ? (
          <p role="alert" className="mt-2 text-xs text-danger">
            {dateiFehler}
          </p>
        ) : null}
      </section>

      {fehler ? (
        <p role="alert" className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {fehler}
        </p>
      ) : null}

      {meldeliste ? (
        // Vorschau: Zusammenfassung, erkannte Disziplinen und höchstens vier
        // Warnungen. Erst „Importieren“ schreibt tatsächlich.
        <div className="mb-4 rounded-xl border border-ok/40 bg-ok/10 px-3 py-2">
          <p className="text-xs font-semibold text-ok">
            {meldelisteZusammenfassung(meldeliste)}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            {meldeliste.disziplinen.map((disziplin) => disziplin.bezeichnung).join(' · ')}
          </p>
          {meldeliste.warnungen.length > 0 ? (
            <ul className="mt-2 space-y-1 text-[11px] text-warn">
              {/* Nur die ersten vier Warnungen, damit die Vorschau kompakt bleibt. */}
              {meldeliste.warnungen.slice(0, 4).map((warnung) => (
                <li key={warnung}>{warnung}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {nameFehlt ? <p className="mb-3 text-xs text-warn">Bitte einen Wettkampfnamen angeben.</p> : null}

      <button
        type="button"
        disabled={!kannImportieren}
        onClick={importiere}
        className="h-14 w-full rounded-xl bg-accent text-base font-bold text-accent-fg disabled:opacity-40"
      >
        {wettkampf ? 'Meldeliste hinzufügen' : 'Importieren'}
      </button>
    </Sheet>
  )
}
