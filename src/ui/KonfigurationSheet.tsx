/**
 * Konfiguration von Lauf und nächstem Lauf.
 *
 * Dasselbe Sheet dient zwei Zwecken: Im Modus „lauf“ ändert es den sichtbaren
 * Lauf (Beckenlänge, Strecke, Zwischenzeiten und die Schwimmer je Bahn und Reihe), im Modus
 * „einstellungen“ die Vorgaben für den nächsten Lauf samt Bahnen je Reihe, Reihen, Serie und
 * Schwimmerzuordnung. Die Werte werden direkt in `app/AppProvider` gespeichert;
 * Sperren und Prüfungen kommen aus domain/lauf und domain/serie.
 */
import { useApp } from '../app/AppProvider'
import {
  anzeigeZuMeter,
  beckenlaengenFuer,
  einheitVon,
  formatBeckenlaenge,
  streckeAnzeige,
} from '../domain/einheit'
import {
  bahnenNachReihen,
  automatischeZwischenzeiten,
  eingestellteZwischenzeiten,
  isStreckeLocked,
  istVielfacheDerBeckenlaenge,
  reihenVon,
  validateKonfiguration,
} from '../domain/lauf'
import { istSerie, warnungSeriePlan } from '../domain/serie'
import { MAX_BAHNEN, MAX_REIHEN, bahnenGesamt, ordneAktiveUm } from '../domain/training'
import { type Beckenlaenge, type LaufKonfiguration } from '../domain/types'
import { Chip, Feld, TaktWahl, ZwischenzeitenWahl } from './Felder'
import { Sheet } from './Sheet'

// Feste Auswahlwerte der Chips. Ein bereits gesetzter, hier nicht enthaltener
// Wert (z. B. aus einem Backup) wird später ergänzt, damit er sichtbar bleibt.
const STRECKEN = [50, 100, 200, 400, 800, 1500] as const

const VERSATZE = [0, 5_000, 10_000, 15_000, 20_000, 30_000] as const

interface KonfigurationSheetProps {
  open: boolean
  onClose: () => void
  /** „lauf“ bearbeitet den sichtbaren Lauf, „einstellungen“ die Vorgaben. */
  modus: 'einstellungen' | 'lauf'
}

/**
 * Sheet für Strecke, Beckenlänge, Zwischenzeiten, Startversatz und Serie.
 *
 * Im Laufmodus sind Strecke, Beckenlänge und Zwischenzeiten nach dem ersten
 * Anschlag gesperrt und bei einer Serie immer, weil alle Runden vorausgeplant
 * sind. Startversatz und Takt sind dort nur informativ; im Einstellungsmodus
 * legen sie den nächsten Lauf fest. Die Schwimmerauswahl schreibt entweder in
 * den Lauf oder in die Vorgaben für den nächsten Lauf.
 */
export function KonfigurationSheet({ open, onClose, modus }: KonfigurationSheetProps) {
  const app = useApp()
  const lauf = app.aktiverLauf
  const satz = app.aktiverSatz
  // Nur im Laufmodus zählt der Plan der aktiven Serie; sonst gelten die
  // Einstellungen für den nächsten Lauf.
  const serie = modus === 'lauf' && istSerie(satz)
  const plan = serie ? (satz?.plan ?? null) : null
  const konfiguration: LaufKonfiguration =
    modus === 'lauf' && lauf ? lauf.konfiguration : app.einstellungen.konfiguration
  // Eigene Zahl und abgeleiteter Wert getrennt halten: Die Anzeige zeigt bei
  // „Automatisch“ den Wert, der sich aus Strecke und Beckenlänge ergibt.
  const zwischenzeitenWert = eingestellteZwischenzeiten(konfiguration)
  const zwischenzeitenAutomatisch = automatischeZwischenzeiten(konfiguration)
  // Eine Serie ist nach dem Anlegen fest; ein einzelner Lauf erst nach dem
  // ersten Anschlag. Der Startversatz hat eine eigene Sperre im Laufmodus.
  const gesperrt = modus === 'lauf' && lauf ? isStreckeLocked(lauf) || serie : false
  const fehler = validateKonfiguration(konfiguration)

  // Angezeigte Werte stammen im Laufmodus aus dem Plan bzw. Lauf, sonst aus
  // den Einstellungen. Die Fallbacks halten das Sheet auch ohne Plan stabil.
  const startversatzMs =
    modus === 'lauf' && lauf ? (plan?.startversatzMs ?? lauf.startversatzMs) : app.einstellungen.startversatzMs
  const wiederholungen =
    modus === 'lauf' ? (serie ? (plan?.wiederholungen ?? 1) : 1) : app.einstellungen.wiederholungen
  const taktSek =
    modus === 'lauf' ? (serie ? (plan?.taktSek ?? 120) : 120) : app.einstellungen.taktSek
  // Der aktuelle Wert kann außerhalb der festen Liste liegen; die Anzeige
  // ergänzt ihn, statt stillschweigend auf einen anderen Wert zu springen.
  const versatzOptionen = Array.from(new Set<number>([...VERSATZE, startversatzMs])).sort(
    (a, b) => a - b,
  )
  // Warnung nur bei einer geplanten Serie: Der Takt ist kürzer als der
  // Reihenversatz, die nächste Runde überlappt also.
  const warnung =
    modus === 'einstellungen' && wiederholungen > 1
      ? warnungSeriePlan(
          { wiederholungen, taktSek, startversatzMs },
          app.einstellungen.reihen,
        )
      : null
  // Konkrete Startzeiten der geplanten Reihen; macht den Versatz begreifbar,
  // bevor der Lauf angelegt ist.
  const reihenStartplan = Array.from(
    { length: app.einstellungen.reihen },
    (_, index) => (index === 0 ? '0 s' : `+${(app.einstellungen.startversatzMs / 1000) * index} s`),
  ).join(' · ')
  const reihenGemeinsam =
    modus === 'einstellungen' && app.einstellungen.reihen > 1 && startversatzMs === 0

  /** Übernimmt eine Änderung nur, wenn die Kombination gültig bleibt. */
  const aendere = (teil: Partial<LaufKonfiguration>) => {
    const naechste = { ...konfiguration, ...teil }
    if (validateKonfiguration(naechste) !== null) return
    if (modus === 'lauf') app.setzeKonfiguration(naechste)
    else app.setzeEinstellungen({ ...app.einstellungen, konfiguration: naechste })
  }

  /** Schreibt nur im Einstellungsmodus; im Laufmodus sind diese Felder fest. */
  const setzeEinstellung = (teil: Partial<typeof app.einstellungen>) => {
    if (modus === 'lauf') return
    app.setzeEinstellungen({ ...app.einstellungen, ...teil })
  }

  /**
   * Ändert Bahnen je Reihe und Reihenzahl gemeinsam. Die Schwimmer bleiben in
   * ihrer Reihe an ihrer Bahn; nur neue Plätze werden leer. Sonst würde beim
   * Verkleinern eine Person unbemerkt die Reihe wechseln.
   */
  const setzeAufteilung = (bahnen: number, reihen: number) => {
    const naechsteBahnen = Math.min(MAX_BAHNEN, Math.max(1, bahnen))
    const naechsteReihen = Math.min(MAX_REIHEN, Math.max(1, reihen))
    setzeEinstellung({
      bahnen: naechsteBahnen,
      reihen: naechsteReihen,
      schwimmerProBahn: ordneAktiveUm(
        app.einstellungen.schwimmerProBahn,
        { bahnen: app.einstellungen.bahnen, reihen: app.einstellungen.reihen },
        { bahnen: naechsteBahnen, reihen: naechsteReihen },
      ),
    })
  }

  /**
   * Wechselt die Beckenlänge. Passt die bisherige Strecke nicht mehr als
   * Vielfaches, wird sie auf zwei Beckenlängen gesetzt statt ungültig zu werden.
   */
  const setzeBeckenlaenge = (beckenlaengeM: Beckenlaenge) => {
    const strecke = konfiguration.streckeM
    const naechste =
      strecke !== null && !istVielfacheDerBeckenlaenge(strecke, beckenlaengeM)
        ? { beckenlaengeM, streckeM: beckenlaengeM * 2 }
        : { beckenlaengeM }
    aendere(naechste)
  }

  return (
    <Sheet open={open} onClose={onClose} titel={modus === 'lauf' ? 'Lauf' : 'Nächster Lauf'}>
      <Feld label="Beckenlänge">
        <div className="flex flex-wrap gap-2">
          {beckenlaengenFuer(einheitVon(konfiguration)).map((wert) => (
            <Chip
              key={wert}
              aktiv={konfiguration.beckenlaengeM === wert}
              disabled={gesperrt}
              onClick={() => setzeBeckenlaenge(wert)}
            >
              {formatBeckenlaenge(wert, einheitVon(konfiguration))}
            </Chip>
          ))}
        </div>
      </Feld>

      <Feld
        label="Strecke"
        hint={
          serie
            ? 'Bei einer Serie nach dem Anlegen gesperrt.'
            : gesperrt
              ? 'Gesperrt, sobald der erste Anschlag erfasst wurde.'
              : 'Bei offener Strecke bestimmt ein eigener Knopf auf der Kachel das Ziel.'
        }
      >
        <div className="flex flex-wrap gap-2">
          {STRECKEN.map((wert) => (
            <Chip
              key={wert}
              aktiv={streckeAnzeige(konfiguration.streckeM, einheitVon(konfiguration)) === wert}
              disabled={gesperrt}
              onClick={() => aendere({ streckeM: anzeigeZuMeter(wert, einheitVon(konfiguration)) })}
            >
              {wert} {einheitVon(konfiguration)}
            </Chip>
          ))}
          <Chip
            aktiv={konfiguration.streckeM === null}
            disabled={gesperrt}
            onClick={() => aendere({ streckeM: null })}
          >
            offen
          </Chip>
        </div>
      </Feld>

      <Feld
        label="Zwischenzeiten"
        hint={
          serie
            ? 'Bei einer Serie nach dem Anlegen gesperrt.'
            : gesperrt
              ? 'Gesperrt, sobald der erste Anschlag erfasst wurde.'
              : 'So viele Zwischenzeiten nimmst du, der nächste Anschlag ist das Ziel. Tippe die Zahl direkt ein oder nutze „Automatisch“.'
        }
      >
        <ZwischenzeitenWahl
          wert={zwischenzeitenWert}
          automatisch={zwischenzeitenAutomatisch}
          disabled={gesperrt}
          onWert={(wert) => aendere({ zwischenzeiten: wert })}
        />
      </Feld>

      {modus === 'einstellungen' ? (
        <>
          <Feld
            label="Bahnen pro Reihe"
            hint="Wie viele Personen gleichzeitig starten. Zusammen mit den Reihen ergibt das die Personenzahl."
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Weniger Bahnen pro Reihe"
                disabled={app.einstellungen.bahnen <= 1}
                onClick={() =>
                  setzeAufteilung(app.einstellungen.bahnen - 1, app.einstellungen.reihen)
                }
                className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold disabled:opacity-40"
              >
                −
              </button>
              <span className="tabular w-10 text-center text-2xl font-semibold">
                {app.einstellungen.bahnen}
              </span>
              <button
                type="button"
                aria-label="Mehr Bahnen pro Reihe"
                disabled={app.einstellungen.bahnen >= MAX_BAHNEN}
                onClick={() =>
                  setzeAufteilung(app.einstellungen.bahnen + 1, app.einstellungen.reihen)
                }
                className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold disabled:opacity-40"
              >
                +
              </button>
            </div>
          </Feld>

          <Feld
            label="Reihen"
            hint="Jede Reihe startet gemeinsam; die nächste Reihe nach dem Reihenversatz."
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Weniger Reihen"
                disabled={app.einstellungen.reihen <= 1}
                onClick={() =>
                  setzeAufteilung(app.einstellungen.bahnen, app.einstellungen.reihen - 1)
                }
                className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold disabled:opacity-40"
              >
                −
              </button>
              <span className="tabular w-10 text-center text-2xl font-semibold">
                {app.einstellungen.reihen}
              </span>
              <button
                type="button"
                aria-label="Mehr Reihen"
                disabled={app.einstellungen.reihen >= MAX_REIHEN}
                onClick={() =>
                  setzeAufteilung(app.einstellungen.bahnen, app.einstellungen.reihen + 1)
                }
                className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold disabled:opacity-40"
              >
                +
              </button>
              <span className="text-sm text-muted">
                {bahnenGesamt(app.einstellungen.bahnen, app.einstellungen.reihen)} Personen
              </span>
            </div>
            <p className="mt-2 text-xs text-muted">Startzeiten: {reihenStartplan}</p>
            {reihenGemeinsam ? (
              <p className="mt-1 text-xs text-warn">
                Alle Reihen starten gemeinsam. Für einen Versatz oben einen Wert wählen.
              </p>
            ) : null}
          </Feld>
        </>
      ) : null}

      <Feld
        label="Startversatz"
        hint={
          modus === 'lauf'
            ? 'Fest beim Anlegen. Ändern unter „Nächster Lauf“.'
            : 'Wirkt zwischen den Reihen; innerhalb einer Reihe starten alle gemeinsam.'
        }
      >
        {/* Im Laufmodus nur lesend: Der Versatz ist beim Anlegen festgelegt. */}
        <div className="flex flex-wrap gap-2">
          {versatzOptionen.map((wert) => (
            <Chip
              key={wert}
              aktiv={startversatzMs === wert}
              disabled={modus === 'lauf'}
              onClick={() => setzeEinstellung({ startversatzMs: wert })}
            >
              {wert === 0 ? 'aus' : `${wert / 1000} s`}
            </Chip>
          ))}
        </div>
      </Feld>

      <Feld
        label="Serie"
        hint="1 = einzelner Lauf. Bei mehreren startet die nächste Runde im festen Takt."
      >
        {/* Der Wert ist im Laufmodus fest; die Grenzen 1 und 20 entsprechen
            den von der Domäne akzeptierten Wiederholungen. */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Weniger Wiederholungen"
            disabled={modus === 'lauf' || wiederholungen <= 1}
            onClick={() => setzeEinstellung({ wiederholungen: wiederholungen - 1 })}
            className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold disabled:opacity-40"
          >
            −
          </button>
          <span className="tabular w-12 text-center text-2xl font-semibold">{wiederholungen}×</span>
          <button
            type="button"
            aria-label="Mehr Wiederholungen"
            disabled={modus === 'lauf' || wiederholungen >= 20}
            onClick={() => setzeEinstellung({ wiederholungen: wiederholungen + 1 })}
            className="h-12 w-12 rounded-xl border border-line bg-surface2 text-xl font-bold disabled:opacity-40"
          >
            +
          </button>
        </div>

        {wiederholungen > 1 ? (
          <div className="mt-3">
            <p className="mb-2 text-xs text-muted">Takt (Start zu Start)</p>
            <TaktWahl
              wert={taktSek}
              disabled={modus === 'lauf'}
              onWert={(sekunden) => setzeEinstellung({ taktSek: sekunden })}
            />
          </div>
        ) : null}

        {warnung ? <p className="mt-2 text-xs text-warn">{warnung}</p> : null}
      </Feld>

      {modus === 'lauf' && lauf ? (
        <Feld label="Schwimmer">
          {/* Bei einer Serie gilt die Zuordnung zeilenweise für alle Runden;
              darum schreibt die Auswahl über `setzeSchwimmerSerie`. */}
          <div className="space-y-3">
            {bahnenNachReihen(lauf.bahnen).map((gruppe) => (
              <div key={gruppe.reihe} className="space-y-2">
                {reihenVon(lauf) > 1 ? (
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                    Reihe {gruppe.reihe}
                  </p>
                ) : null}
                {gruppe.bahnen.map((bahn) => {
                  const index = lauf.bahnen.indexOf(bahn)
                  return (
                    <div key={bahn.id} className="flex items-center gap-3">
                      <span className="tabular w-6 text-sm text-muted">{bahn.nummer}</span>
                      <select
                        value={bahn.schwimmerId ?? ''}
                        onChange={(e) =>
                          serie
                            ? app.setzeSchwimmerSerie(index, e.target.value || null)
                            : app.setzeSchwimmer(bahn.id, e.target.value || null)
                        }
                        aria-label={`Schwimmer für Reihe ${bahn.reihe}, Bahn ${bahn.nummer}`}
                        className="h-11 flex-1 rounded-xl border border-line bg-surface2 px-3 text-sm"
                      >
                        <option value="">— kein Schwimmer —</option>
                        {app.schwimmer.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          {app.schwimmer.length === 0 ? (
            <p className="mt-2 text-xs text-muted">
              Noch keine Schwimmer angelegt. Das geht im Tab „Schwimmer“.
            </p>
          ) : null}
        </Feld>
      ) : (
        <Feld label="Schwimmer für den nächsten Lauf">
          {/* Die Vorgabenliste gehört zu den Einstellungen und wird in der
              Länge von Bahnen × Reihen angezeigt, Reihe für Reihe. */}
          <div className="space-y-3">
            {Array.from({ length: app.einstellungen.reihen }, (_, reiheIndex) => (
              <div key={reiheIndex} className="space-y-2">
                {app.einstellungen.reihen > 1 ? (
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                    Reihe {reiheIndex + 1}
                  </p>
                ) : null}
                {Array.from({ length: app.einstellungen.bahnen }, (_, bahnIndex) => {
                  const index = reiheIndex * app.einstellungen.bahnen + bahnIndex
                  return (
                    <div key={index} className="flex items-center gap-3">
                      <span className="tabular w-6 text-sm text-muted">{bahnIndex + 1}</span>
                      <select
                        value={app.einstellungen.schwimmerProBahn[index] ?? ''}
                        onChange={(e) => {
                          const liste = [...app.einstellungen.schwimmerProBahn]
                          liste[index] = e.target.value || null
                          app.setzeEinstellungen({ ...app.einstellungen, schwimmerProBahn: liste })
                        }}
                        aria-label={`Schwimmer für Reihe ${reiheIndex + 1}, Bahn ${bahnIndex + 1}`}
                        className="h-11 flex-1 rounded-xl border border-line bg-surface2 px-3 text-sm"
                      >
                        <option value="">— kein Schwimmer —</option>
                        {app.schwimmer.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          {app.schwimmer.length === 0 ? (
            <p className="mt-2 text-xs text-muted">
              Noch keine Schwimmer angelegt. Das geht im Tab „Schwimmer“.
            </p>
          ) : null}
        </Feld>
      )}

      {/* Die Domäne prüft erneut; hier steht nur, warum eine Kombination nicht
          gespeichert wurde. */}
      {fehler ? <p className="text-sm text-danger">{fehler}</p> : null}
    </Sheet>
  )
}
