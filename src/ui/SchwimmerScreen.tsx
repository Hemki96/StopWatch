/**
 * Schwimmer-Tab: Stammdaten und Bestzeiten je Person.
 *
 * Die Liste zeigt alle Schwimmer mit Jahrgang und Anzahl der Bestzeiten; ein
 * Eintrag klappt die Zeitentwicklung auf, „Bearbeiten“ öffnet das Formular.
 * Bestzeiten werden aus den Läufen berechnet (domain/analyse), gruppiert nach
 * Strecke, Schwimmart und Beckenlänge. Schreibende Aktionen laufen über
 * app/AppProvider; gelöschte Schwimmer verlieren nur die Bahnzuordnung, nicht
 * die gemessenen Zeiten.
 */
import { useMemo, useState } from 'react'
import { useApp } from '../app/AppProvider'
import { berechnePbs, pbKey } from '../domain/analyse'
import { formatStrecke, formatTime } from '../domain/format'
import { finishMs } from '../domain/lauf'
import { SCHWIMMARTEN, type Lauf, type Schwimmer } from '../domain/types'
import { Bestaetigung } from './Bestaetigung'
import { Sheet } from './Sheet'
import { ChevronRightIcon, PlusIcon } from './icons'

// Formularzustand: geschlossen, neuer Schwimmer oder ein bestehender Eintrag.
type Bearbeitung = { modus: 'neu' } | { modus: 'bearbeiten'; schwimmer: Schwimmer } | null

/** Eine gemessene Zielzeit in der Zeitentwicklung eines Schwimmers. */
interface ZeitEintrag {
  ms: number
  /** Wanduhr des Laufstarts; 0, wenn unbekannt. */
  startWallMs: number
  laufId: string
  /** Diese Zeit ist die aktuelle Bestzeit der Gruppe. */
  istPb: boolean
  /** Zielzeit wurde nachträglich korrigiert. */
  istManuell: boolean
}

/** Alle Zeiten eines Schwimmers für eine Strecke/Schwimmart/Beckenlänge. */
interface BestzeitenGruppe {
  key: string
  titel: string
  pbMs: number
  eintraege: ZeitEintrag[]
}

/** Gruppentitel aus Strecke, Schwimmart und Beckenlänge, z. B. „100 m · Freistil · 50 m“. */
function beschreibeGruppe(lauf: Lauf): string {
  const art = SCHWIMMARTEN.find((s) => s.wert === lauf.konfiguration.schwimmart)?.label ?? ''
  return `${formatStrecke(lauf.konfiguration.streckeM)} · ${art} · ${lauf.konfiguration.beckenlaengeM} m`
}

/**
 * Bestzeiten und Zeitentwicklung je Schwimmer. Grundlage ist die PB-Berechnung
 * aus `analyse.ts`; hier wird nur gruppiert und dargestellt.
 *
 * Offene Strecken haben keine vergleichbare Bestzeit und bleiben außen vor.
 * Eine Zeit zählt nur, wenn die Bahn dem Schwimmer gehört und einen
 * Zielanschlag hat. Innerhalb einer Gruppe stehen die Zeiten chronologisch.
 */
function bestzeitenFuer(schwimmerId: string, laeufe: Lauf[]): BestzeitenGruppe[] {
  const pbs = berechnePbs(laeufe)
  const gruppen = new Map<string, BestzeitenGruppe>()

  for (const lauf of laeufe) {
    // Ohne feste Strecke gibt es keinen Schlüssel für einen Vergleich.
    if (lauf.konfiguration.streckeM === null) continue
    for (const bahn of lauf.bahnen) {
      if (bahn.schwimmerId !== schwimmerId) continue
      const ms = finishMs(bahn)
      if (ms === null) continue
      // Der Schlüssel enthält Strecke, Schwimmart und Beckenlänge.
      const key = pbKey(lauf.konfiguration, schwimmerId)
      const pb = pbs.get(key)
      // Fehlt der PB-Eintrag (etwa bei unvollständigen Daten), dient die erste
      // gefundene Zeit als Anzeigewert der Gruppe.
      const gruppe = gruppen.get(key) ?? {
        key,
        titel: beschreibeGruppe(lauf),
        pbMs: pb?.ms ?? ms,
        eintraege: [],
      }
      gruppe.eintraege.push({
        ms,
        startWallMs: lauf.startWallMs ?? 0,
        laufId: lauf.id,
        istPb: pb?.ms === ms,
        istManuell: bahn.anschlaege.find((a) => a.istFinish)?.manuell === true,
      })
      gruppen.set(key, gruppe)
    }
  }

  // Zeiten chronologisch, Gruppen alphabetisch nach Titel.
  return [...gruppen.values()]
    .map((gruppe) => ({
      ...gruppe,
      eintraege: gruppe.eintraege.sort((a, b) => a.startWallMs - b.startWallMs),
    }))
    .sort((a, b) => a.titel.localeCompare(b.titel, 'de'))
}

/** Tagesdatum ohne Jahr für die kompakte Zeitentwicklung; 0 wird zu „—“. */
function datumKurz(ms: number): string {
  if (!ms) return '—'
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(ms)
}

/** Aufgeklappte Bestzeiten eines Schwimmers; ohne Gruppen steht ein Hinweis. */
function Bestzeiten({ gruppen }: { gruppen: BestzeitenGruppe[] }) {
  if (gruppen.length === 0) {
    return (
      <p className="rounded-xl bg-surface2 px-3 py-2 text-xs leading-relaxed text-muted">
        Noch keine gültige Zielzeit für diesen Schwimmer. Bestzeiten entstehen aus vollständig
        beendeten Läufen mit fester Strecke.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {gruppen.map((gruppe) => (
        <section key={gruppe.key}>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold">{gruppe.titel}</h3>
            <span className="tabular text-sm font-semibold text-ok">{formatTime(gruppe.pbMs)}</span>
          </div>
          <ol className="mt-1 space-y-0.5">
            {/* Schlüssel aus Lauf und Zeit; Bestzeit und Korrektur sind
                zusätzlich als Text markiert, nicht nur farblich. */}
            {gruppe.eintraege.map((eintrag) => (
              <li
                key={`${eintrag.laufId}-${eintrag.ms}`}
                className="tabular flex items-baseline justify-between text-[11px] text-muted"
              >
                <span>{datumKurz(eintrag.startWallMs)}</span>
                <span className={eintrag.istPb ? 'font-semibold text-ok' : ''}>
                  {formatTime(eintrag.ms)}
                  {eintrag.istPb ? ' · Bestzeit' : ''}
                  {eintrag.istManuell ? ' · korrigiert' : ''}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

/**
 * Formular für einen neuen oder bestehenden Schwimmer.
 *
 * Speichert erst bei gültigem Namen; Jahrgang wird zu einer Zahl oder `null`.
 * Bei bestehenden Einträgen gibt es zusätzlich Löschen mit Bestätigung:
 * Gemessene Zeiten bleiben erhalten, verlieren aber die Zuordnung.
 */
function SchwimmerFormular({
  eintrag,
  onClose,
}: {
  eintrag: Bearbeitung
  onClose: () => void
}) {
  const app = useApp()
  const vorhanden = eintrag?.modus === 'bearbeiten' ? eintrag.schwimmer : null
  const [name, setName] = useState(vorhanden?.name ?? '')
  const [jahrgang, setJahrgang] = useState(vorhanden?.jahrgang ? String(vorhanden.jahrgang) : '')
  const [notiz, setNotiz] = useState(vorhanden?.notiz ?? '')
  const [frageLoeschen, setFrageLoeschen] = useState(false)

  /** Legt an oder aktualisiert; ohne Namen passiert nichts. */
  const speichern = () => {
    if (!name.trim()) return
    // Ein leerer oder unlesbarer Jahrgang wird als `null` gespeichert.
    const jahr = Number.parseInt(jahrgang, 10)
    app.speichereSchwimmer({
      id: vorhanden?.id,
      name,
      jahrgang: Number.isFinite(jahr) ? jahr : null,
      notiz,
    })
    onClose()
  }

  return (
    <Sheet open={eintrag !== null} onClose={onClose} titel={vorhanden ? 'Schwimmer' : 'Neuer Schwimmer'}>
      <label className="mb-4 block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted">
          Name
        </span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="next"
          maxLength={80}
          placeholder="Vor- und Nachname"
          className="h-12 w-full rounded-xl border border-line bg-surface2 px-3 text-base"
        />
      </label>

      <label className="mb-4 block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted">
          Jahrgang
        </span>
        <input
          name="jahrgang"
          value={jahrgang}
          // Nur Ziffern, höchstens vier Stellen; verhindert Buchstaben und
          // lange Eingaben direkt im Feld.
          onChange={(e) => setJahrgang(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="next"
          maxLength={4}
          placeholder="z. B. 2010"
          className="tabular h-12 w-full rounded-xl border border-line bg-surface2 px-3 text-base"
        />
      </label>

      <label className="mb-5 block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted">
          Notiz
        </span>
        <input
          name="notiz"
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
          autoComplete="off"
          enterKeyHint="done"
          maxLength={120}
          placeholder="optional"
          className="h-12 w-full rounded-xl border border-line bg-surface2 px-3 text-base"
        />
      </label>

      <button
        type="button"
        onClick={speichern}
        disabled={!name.trim()}
        className="h-14 w-full rounded-xl bg-accent text-base font-bold text-accent-fg disabled:opacity-40"
      >
        Speichern
      </button>

      {vorhanden ? (
        <button
          type="button"
          onClick={() => setFrageLoeschen(true)}
          className="mt-3 h-12 w-full rounded-xl text-sm font-semibold text-danger"
        >
          Schwimmer löschen
        </button>
      ) : null}

      <Bestaetigung
        open={frageLoeschen}
        titel="Schwimmer löschen?"
        text="Bereits gemessene Zeiten bleiben erhalten, verlieren aber die Zuordnung."
        bestaetigenLabel="Löschen"
        onBestaetigen={() => {
          if (vorhanden) app.loescheSchwimmer(vorhanden.id)
          setFrageLoeschen(false)
          onClose()
        }}
        onAbbrechen={() => setFrageLoeschen(false)}
      />
    </Sheet>
  )
}

/**
 * Schwimmer-Tab mit Liste und aufgeklappten Bestzeiten.
 *
 * Der Zustand ist bewusst lokal: `bearbeitung` steuert das Formular, `offen`
 * die einzige ausgeklappte Zeile. Bestzeiten und Bahnzuordnung werden aus den
 * Läufen abgeleitet; der Screen selbst speichert nichts außer über `app`.
 */
export function SchwimmerScreen() {
  const app = useApp()
  const [bearbeitung, setBearbeitung] = useState<Bearbeitung>(null)
  const [offen, setOffen] = useState<string | null>(null)

  // IDs aller Schwimmer, die aktuell oder früher auf einer Bahn standen.
  // Dient nur der Unterscheidung „noch keine Zielzeit“ vs. „keiner Bahn
  // zugeordnet“ in der Zeile.
  const zugeordnet = useMemo(() => {
    const ids = new Set<string>()
    for (const lauf of app.laeufe) {
      for (const bahn of lauf.bahnen) {
        if (bahn.schwimmerId) ids.add(bahn.schwimmerId)
      }
    }
    return ids
  }, [app.laeufe])

  // Anzeigezeilen in einem Durchlauf: Schwimmer, ob je einer Bahn zugeordnet
  // und die daraus berechneten Bestzeiten-Gruppen.
  const eintraege = useMemo(
    () =>
      app.schwimmer.map((schwimmer) => ({
        schwimmer,
        hatBahn: zugeordnet.has(schwimmer.id),
        gruppen: bestzeitenFuer(schwimmer.id, app.laeufe),
      })),
    [app.schwimmer, app.laeufe, zugeordnet],
  )

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-line px-4 py-3 rail:px-6">
        <div>
          <h1 className="text-lg font-semibold">Schwimmer</h1>
          <p className="text-xs text-muted">
            {app.schwimmer.length} {app.schwimmer.length === 1 ? 'Eintrag' : 'Einträge'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setBearbeitung({ modus: 'neu' })}
          aria-label="Schwimmer hinzufügen"
          className="grid h-11 w-11 place-items-center rounded-full bg-accent text-accent-fg"
        >
          <PlusIcon className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-8 pt-3 rail:px-6">
        {app.schwimmer.length === 0 ? (
          <p className="mt-16 text-center text-sm text-muted">
            Noch keine Schwimmer. Lege Namen an, um Bahnen zuzuordnen.
          </p>
        ) : null}

        <ul className="grid grid-cols-1 items-start gap-2 rail:grid-cols-2">
          {eintraege.map(({ schwimmer, hatBahn, gruppen }) => {
            // Nur eine Zeile ist gleichzeitig aufgeklappt; erneutes Tippen schließt sie.
            const aufgeklappt = offen === schwimmer.id
            return (
              <li
                key={schwimmer.id}
                className="overflow-hidden rounded-2xl border border-line bg-surface"
              >
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setOffen(aufgeklappt ? null : schwimmer.id)}
                    aria-expanded={aufgeklappt}
                    className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{schwimmer.name}</p>
                      <p className="text-xs text-muted">
                        {/* Drei Fälle: Bestzeiten vorhanden, Bahn aber noch kein
                            Ziel, oder noch nie einer Bahn zugeordnet. */}
                        {schwimmer.jahrgang ? `Jahrgang ${schwimmer.jahrgang}` : 'ohne Jahrgang'}
                        {gruppen.length > 0
                          ? ` · ${gruppen.length} ${gruppen.length === 1 ? 'Bestzeit' : 'Bestzeiten'}`
                          : hatBahn
                            ? ' · noch keine Zielzeit'
                            : ' · noch keiner Bahn zugeordnet'}
                      </p>
                    </div>
                    <ChevronRightIcon
                      className={`h-5 w-5 shrink-0 text-muted transition-transform ${
                        aufgeklappt ? 'rotate-90' : ''
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setBearbeitung({ modus: 'bearbeiten', schwimmer })}
                    aria-label={`${schwimmer.name} bearbeiten`}
                    className="mr-2 h-10 rounded-lg px-2 text-xs font-medium text-accent"
                  >
                    Bearbeiten
                  </button>
                </div>

                {aufgeklappt ? (
                  <div className="border-t border-line px-3 py-3">
                    <Bestzeiten gruppen={gruppen} />
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>

        {app.schwimmer.length > 0 && eintraege.every((e) => e.gruppen.length === 0) ? (
          // Fußnote nur, wenn es Einträge gibt, aber noch nirgends eine
          // gültige Bestzeit entstanden ist.
          <p className="mt-4 rounded-xl bg-surface2 px-3 py-2 text-xs leading-relaxed text-muted">
            Bestzeiten erscheinen, sobald ein Schwimmer einer Bahn zugeordnet ist und einen Lauf
            mit fester Strecke vollständig beendet hat.
          </p>
        ) : null}
      </div>

      {bearbeitung ? (
        <SchwimmerFormular eintrag={bearbeitung} onClose={() => setBearbeitung(null)} />
      ) : null}
    </div>
  )
}
