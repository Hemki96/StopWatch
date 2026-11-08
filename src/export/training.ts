/**
 * Export eines ganzen Trainings als Markdown oder PDF.
 *
 * Ein Training ist mehr als ein Lauf: Es bündelt Aktive, mehrere Sätze und
 * deren Runden. Der Bericht folgt genau dieser Reihenfolge und zeigt auch noch
 * nicht gestartete Sätze, damit der Plan vollständig nachlesbar bleibt. Die
 * Inhalte kommen aus den Domänenobjekten; dieses Modul formatiert nur und
 * speichert nichts.
 *
 * Beide Formate teilen sich denselben Berichtsbaum. Markdown ist die lesbare
 * Textfassung zum Weitergeben, PDF die Druckfassung. So können die Formate
 * nicht auseinanderlaufen.
 */
import { formatStrecke, formatTime } from '../domain/format'
import { einheitVon } from '../domain/einheit'
import { eingestellteZwischenzeiten, finishMs } from '../domain/lauf'
import { sortiereRunden } from '../domain/analyse'
import {
  trainingsSatzMeta,
  trainingsSatzTitel,
  type TrainingsSatzFortschritt,
} from '../domain/training'
import { SCHWIMMARTEN, type Bahn, type Lauf, type Schwimmer, type Training } from '../domain/types'
import { erzeugePdf, type PdfZeile } from './pdf'

/** Ein Punkt im Bericht; die Ebene steuert Einzug und Markdown-Verschachtelung. */
export interface BerichtZeile {
  text: string
  ebene?: 0 | 1 | 2
}

/** Ein Abschnitt mit eigener Überschrift, z. B. ein Trainingssatz. */
export interface BerichtAbschnitt {
  titel: string
  zeilen: BerichtZeile[]
}

/** Formatneutraler Trainingsbericht. */
export interface TrainingsBericht {
  titel: string
  untertitel: string[]
  abschnitte: BerichtAbschnitt[]
}

const STATUS: Record<TrainingsSatzFortschritt['status'], string> = {
  offen: 'offen',
  bereit: 'bereit',
  laeuft: 'läuft',
  fertig: 'fertig',
}

/** Formatiert ein ISO-Datum als `TT.MM.JJJJ`; andere Werte bleiben unverändert. */
function datumText(datum: string): string {
  const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum)
  return treffer ? `${treffer[3]}.${treffer[2]}.${treffer[1]}` : datum || 'ohne Datum'
}

/** Uhrzeit eines Wanduhr-Ankers in der lokalen Zeitzone. */
function uhrzeitText(ms: number): string {
  const datum = new Date(ms)
  const stunden = `${datum.getHours()}`.padStart(2, '0')
  const minuten = `${datum.getMinutes()}`.padStart(2, '0')
  return `${stunden}:${minuten}`
}

/** Deutsches Label einer Schwimmart für die Planzeile. */
function schwimmartText(schwimmart: Lauf['konfiguration']['schwimmart']): string {
  return SCHWIMMARTEN.find((eintrag) => eintrag.wert === schwimmart)?.label ?? schwimmart
}

/**
 * Namen der Aktiven, Reihe für Reihe. Fehlende Plätze werden als `—`
 * ausgegeben, damit die Aufteilung sichtbar bleibt.
 */
function aktiveZeilen(training: Training, schwimmer: Schwimmer[]): BerichtZeile[] {
  const namen = new Map(schwimmer.map((eintrag) => [eintrag.id, eintrag.name]))
  const nameFuer = (id: string | null): string => (id ? (namen.get(id) ?? 'unbekannt') : '—')

  if (training.reihen <= 1) {
    const liste = training.aktive.map(nameFuer).join(', ')
    return [{ text: `Aktive: ${liste || '—'}` }]
  }

  return Array.from({ length: training.reihen }, (_, index) => {
    const reihe = training.aktive.slice(
      index * training.bahnen,
      (index + 1) * training.bahnen,
    )
    return { text: `Reihe ${index + 1}: ${reihe.map(nameFuer).join(', ')}` }
  })
}

/** Beschriftung eines Anschlags: Ziel, Zwischenzeit oder Streckenlänge. */
function anschlagLabel(anschlag: Bahn['anschlaege'][number], lauf: Lauf, eigene: boolean): string {
  if (anschlag.istFinish) return 'Ziel'
  if (eigene) return `Zw. ${anschlag.laengeNr}`
  return formatStrecke(
    anschlag.laengeNr * lauf.konfiguration.beckenlaengeM,
    einheitVon(lauf.konfiguration),
  )
}

/**
 * Zeilen einer Runde: zuerst die Rundenüberschrift, dann je Bahn die Zielzeit
 * und darunter die kumulierten Splits. Namen kommen aus der Bahn, nicht aus
 * dem aktuellen Trainingsplan: Gemessene Läufe behalten ihre damalige
 * Zuordnung.
 */
function rundenZeilen(lauf: Lauf, wiederholungen: number, schwimmer: Schwimmer[]): BerichtZeile[] {
  const zeilen: BerichtZeile[] = []
  const namen = new Map(schwimmer.map((eintrag) => [eintrag.id, eintrag.name]))
  const eigeneZwischenzeiten = eingestellteZwischenzeiten(lauf.konfiguration) !== null
  const nummer = lauf.wiederholung ?? 1
  const start = lauf.startWallMs ? ` · Start ${uhrzeitText(lauf.startWallMs)} Uhr` : ''
  zeilen.push({
    text: `Runde ${nummer}${wiederholungen > 1 ? ` von ${wiederholungen}` : ''}${start}`,
  })

  const bahnen = [...lauf.bahnen].sort(
    (a, b) => a.reihe - b.reihe || a.nummer - b.nummer,
  )
  if (bahnen.length === 0) {
    zeilen.push({ text: 'Keine Bahnen angelegt.', ebene: 1 })
    return zeilen
  }

  for (const bahn of bahnen) {
    const ms = finishMs(bahn)
    const name = bahn.schwimmerId ? (namen.get(bahn.schwimmerId) ?? 'unbekannt') : 'ohne Namen'
    const reihe = bahn.reihe > 1 ? ` · Reihe ${bahn.reihe}` : ''
    const ziel = ms === null ? 'ohne Zielzeit' : `Ziel ${formatTime(ms)}`
    const korrigiert = bahn.anschlaege.some((anschlag) => anschlag.manuell === true)
      ? ' · manuell korrigiert'
      : ''
    zeilen.push({ text: `Bahn ${bahn.nummer}${reihe} · ${name} · ${ziel}${korrigiert}`, ebene: 1 })

    if (bahn.anschlaege.length > 0) {
      const splits = bahn.anschlaege
        .map((anschlag) => {
          const label = anschlagLabel(anschlag, lauf, eigeneZwischenzeiten)
          const manuell = anschlag.manuell ? ' (manuell)' : ''
          return `${label} ${formatTime(anschlag.splitMs)}${manuell}`
        })
        .join(' · ')
      zeilen.push({ text: `Splits: ${splits}`, ebene: 2 })
    }
  }

  return zeilen
}

/**
 * Baut den formatneutralen Bericht eines Trainings.
 *
 * @param training Der Plan mit Aktiven und Sätzen.
 * @param fortschritt Ergebnis von `trainingsFortschritt`; enthält die
 *   zugehörigen Sätze und Läufe bereits in der Reihenfolge des Plans.
 * @param schwimmer Namen für die Auflösung der IDs.
 */
export function erstelleTrainingsBericht(
  training: Training,
  fortschritt: TrainingsSatzFortschritt[],
  schwimmer: Schwimmer[],
): TrainingsBericht {
  const aktive = training.aktive.filter(Boolean).length
  const fertig = fortschritt.filter((eintrag) => eintrag.status === 'fertig').length
  const gesamt = fortschritt.length
  const bezeichnung = training.bezeichnung.trim() || 'Training'

  const abschnitte: BerichtAbschnitt[] = [
    { titel: 'Aktive', zeilen: aktiveZeilen(training, schwimmer) },
  ]

  for (const eintrag of fortschritt) {
    const plan = eintrag.eintrag
    const einheit = einheitVon(plan.konfiguration)
    const strecke = formatStrecke(plan.konfiguration.streckeM, einheit)
    const planZeile = [
      strecke,
      schwimmartText(plan.konfiguration.schwimmart),
      trainingsSatzMeta(plan),
    ].join(' · ')

    const zeilen: BerichtZeile[] = [
      { text: `Plan: ${planZeile}` },
      {
        text: `Status: ${STATUS[eintrag.status]}${
          eintrag.laeufe.length > 0
            ? ` · ${eintrag.fertigeRunden} von ${eintrag.laeufe.length} Runden vollständig`
            : ''
        }`,
      },
    ]

    if (eintrag.laeufe.length === 0) {
      zeilen.push({ text: 'Noch nicht gestartet.' })
    } else {
      for (const lauf of sortiereRunden(eintrag.laeufe)) {
        zeilen.push(...rundenZeilen(lauf, plan.wiederholungen, schwimmer))
      }
    }

    abschnitte.push({
      titel: `${eintrag.index + 1}. ${trainingsSatzTitel(plan)}`,
      zeilen,
    })
  }

  return {
    titel: `Training: ${bezeichnung}`,
    untertitel: [
      `Datum: ${datumText(training.datum)}`,
      `${fertig} von ${gesamt} ${gesamt === 1 ? 'Satz' : 'Sätzen'} erledigt · ${aktive} ${
        aktive === 1 ? 'Aktiver' : 'Aktive'
      }`,
    ],
    abschnitte,
  }
}

/** Rendert den Bericht als Markdown mit Überschriften und verschachtelten Listen. */
export function berichtAlsMarkdown(bericht: TrainingsBericht): string {
  const zeilen: string[] = [`# ${bericht.titel}`, '']
  zeilen.push(...bericht.untertitel, '')

  for (const abschnitt of bericht.abschnitte) {
    zeilen.push(`## ${abschnitt.titel}`, '')
    for (const zeile of abschnitt.zeilen) {
      const ebene = zeile.ebene ?? 0
      const einzug = '  '.repeat(ebene)
      zeilen.push(`${einzug}- ${zeile.text}`)
    }
    zeilen.push('')
  }

  return `${zeilen.join('\n').trimEnd()}\n`
}

/** Rendert den Bericht als PDF-Zeilen; Einzug und Aufzählungszeichen kommen hier. */
export function berichtAlsPdf(bericht: TrainingsBericht): Uint8Array<ArrayBuffer> {
  const zeilen: PdfZeile[] = [
    { text: bericht.titel, stil: 'titel' },
    ...bericht.untertitel.map((text) => ({ text, stil: 'klein' as const })),
  ]

  for (const abschnitt of bericht.abschnitte) {
    zeilen.push({ text: abschnitt.titel, stil: 'abschnitt' })
    for (const zeile of abschnitt.zeilen) {
      const ebene = zeile.ebene ?? 0
      const marke = ebene === 0 ? '•' : ebene === 1 ? '–' : '·'
      zeilen.push({
        text: `${marke} ${zeile.text}`,
        einzug: 8 + ebene * 14,
        stil: 'text',
      })
    }
  }

  return erzeugePdf(zeilen, bericht.titel)
}

/** Vollständiger Trainingsbericht als Markdown-Text. */
export function trainingAlsMarkdown(
  training: Training,
  fortschritt: TrainingsSatzFortschritt[],
  schwimmer: Schwimmer[],
): string {
  return berichtAlsMarkdown(erstelleTrainingsBericht(training, fortschritt, schwimmer))
}

/** Vollständiger Trainingsbericht als PDF-Bytes. */
export function trainingAlsPdf(
  training: Training,
  fortschritt: TrainingsSatzFortschritt[],
  schwimmer: Schwimmer[],
): Uint8Array<ArrayBuffer> {
  return berichtAlsPdf(erstelleTrainingsBericht(training, fortschritt, schwimmer))
}

/**
 * Dateiname des Trainingsberichts, z. B. `beckenrand-training-2026-10-30.pdf`.
 * Das Trainingsdatum ist stabiler als der Exportzeitpunkt; mehrere Exporte am
 * selben Tag nummeriert der Browser bzw. das Share-Ziel durch.
 */
export function trainingDateiname(training: Training, endung: 'md' | 'pdf'): string {
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(training.datum) ? training.datum : 'ohne-datum'
  return `beckenrand-training-${datum}.${endung}`
}
