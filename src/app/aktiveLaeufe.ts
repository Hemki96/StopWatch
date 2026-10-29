/**
 * Die Leiste der aktiven Läufe: gespeicherte Auswahl, Bereinigung und Anzeige.
 *
 * Die Leiste ist reine Oberflächenauswahl, keine Messdaten. Sie darf deshalb
 * verloren gehen, ohne dass Zeiten fehlen; beim nächsten Start wird sie über
 * `bereinigeAktiveIds` wieder auf existierende, offene Läufe reduziert.
 *
 * Gespeichert werden nur Verweise (IDs) unter flachen, stabilen Schlüsseln —
 * auch das Onboarding-Gate in `App.tsx` und die E2E-Tests lesen sie. Eine Serie
 * erscheint als genau ein Eintrag; ihr Anker ist die erste Wiederholung.
 */
import type { Lauf, Satz } from '../domain/types'
import { hatLaufendeBahn, isComplete } from '../domain/lauf'
import { istSerie, runden as rundenVon } from '../domain/serie'
import { entferneText, leseText, schreibeText } from './lokalSpeicher'

/**
 * Ein Eintrag der Leiste oben.
 *
 * Bei einer Serie ist `lauf` die Ankerwiederholung (Runde 1), `satz` der Satz
 * mit Plan und `serie` wahr. Auf diese Weise erscheint eine Serie als ein
 * Eintrag, nicht als fünf. `lauf` kann auch der zuletzt gewählte Lauf sein,
 * wenn die Anker-ID nicht mehr in der Leiste steht.
 */
export interface AktiverEintrag {
  /** Anker-Lauf in der Leiste; bei einer Serie die erste Wiederholung. */
  id: string
  lauf: Lauf
  satz: Satz | null
  serie: boolean
}

const ACTIVE_KEY = 'beckenrand.aktiverLauf'
const ACTIVE_LIST_KEY = 'beckenrand.aktiveLaeufe'

/**
 * Liest die aktiven Lauf-IDs; die alte Einzel-ID bleibt als Migration lesbar.
 *
 * Reihenfolge: zuerst die Liste, dann der alte Einzelwert. Kaputtes JSON fällt
 * still auf die Einzel-ID zurück, damit ein abgebrochener Schreibvorgang nicht
 * die ganze Leiste kostet.
 */
export function leseAktiveIds(): string[] {
  const roh = leseText(ACTIVE_LIST_KEY)
  if (roh) {
    try {
      const geparst: unknown = JSON.parse(roh)
      if (Array.isArray(geparst)) {
        return geparst.filter((wert): wert is string => typeof wert === 'string' && wert.length > 0)
      }
    } catch {
      // Ohne lesbaren Speicher startet die App ohne aktive Läufe.
    }
  }
  const alt = leseText(ACTIVE_KEY)
  return alt ? [alt] : []
}

/** Merkt die Leiste. Sie ist nur Auswahl; ein Fehler darf die Sitzung nicht stören. */
export function speichereAktiveIds(ids: string[]): void {
  schreibeText(ACTIVE_LIST_KEY, JSON.stringify(ids))
}

/** Liest den zuletzt sichtbaren Lauf (Migrationspfad, siehe `leseAktiveIds`). */
export function leseAktivenLaufId(): string | null {
  return leseText(ACTIVE_KEY)
}

/**
 * Merkt den sichtbaren Lauf. `null` entfernt den Einzelwert; maßgeblich bleibt
 * die Liste, damit beide Speicherorte nicht auseinanderlaufen.
 */
export function speichereAktivenLaufId(id: string | null): void {
  if (id) schreibeText(ACTIVE_KEY, id)
  else entferneText(ACTIVE_KEY)
}

/**
 * Entfernt verwaiste und vollständig beendete Einträge. Eine Serie bleibt
 * aktiv, solange irgendeine ihrer Wiederholungen offen ist; ihr Anker ist die
 * erste Wiederholung, damit die Leiste nicht fünf Chips für einen Satz zeigt.
 *
 * Regeln im Einzelnen:
 * - Unbekannte IDs (gelöschter Lauf) fallen weg.
 * - Wettkampf-Läufe erscheinen nie in der Trainingsleiste; sie werden im
 *   Wettkampf-Tab bedient.
 * - Vollständig beendete Läufe und Serien werden ausgeblendet, bleiben aber im
 *   Verlauf. Nach einem Neustart ist die Leiste dadurch aufgeräumt.
 * - Doppelte Einträge derselben Serie bzw. desselben Laufs werden über
 *   `gesehen` zusammengefasst.
 */
export function bereinigeAktiveIds(ids: string[], laeufe: Lauf[], satze: Satz[]): string[] {
  const ergebnis: string[] = []
  const gesehen = new Set<string>()
  for (const id of ids) {
    const lauf = laeufe.find((eintrag) => eintrag.id === id)
    if (!lauf || lauf.modus === 'wettkampf') continue
    const satz = satze.find((eintrag) => eintrag.id === lauf.satzId)
    if (istSerie(satz) && satz) {
      const runden = rundenVon(laeufe, satz.id)
      if (runden.length === 0 || runden.every(isComplete)) continue
      const schluessel = `satz:${satz.id}`
      if (gesehen.has(schluessel)) continue
      gesehen.add(schluessel)
      ergebnis.push(runden[0]!.id)
      continue
    }
    if (isComplete(lauf)) continue
    const schluessel = `lauf:${lauf.id}`
    if (gesehen.has(schluessel)) continue
    gesehen.add(schluessel)
    ergebnis.push(lauf.id)
  }
  return ergebnis
}

/**
 * Wählt nach einem Neustart den zuletzt gestarteten offenen Lauf, wenn die
 * gespeicherte Leiste leer ist. Bei einer Serie ist das ihr Anker, nicht die
 * zuletzt gestartete Wiederholung.
 */
export function waehleOffenenLauf(laeufe: Lauf[], satze: Satz[]): string | null {
  const kandidat = [...laeufe]
    .sort((a, b) => (b.startWallMs ?? 0) - (a.startWallMs ?? 0))
    .find((lauf) => !isComplete(lauf) && lauf.modus !== 'wettkampf')
  if (!kandidat) return null
  const satz = satze.find((eintrag) => eintrag.id === kandidat.satzId)
  const anker = istSerie(satz) && satz ? (rundenVon(laeufe, satz.id)[0] ?? kandidat) : kandidat
  return anker.id
}

/**
 * Die Leiste oben: ein Eintrag je Lauf oder Serie, dedupliziert wie in
 * `bereinigeAktiveIds`. Verwaiste IDs werden still übersprungen, damit ein
 * gelöschter Lauf keinen leeren Chip hinterlässt.
 */
export function berechneAktiveEintraege(
  ids: string[],
  laeufe: Lauf[],
  satze: Satz[],
): AktiverEintrag[] {
  const gesehen = new Set<string>()
  const ergebnis: AktiverEintrag[] = []
  for (const id of ids) {
    const lauf = laeufe.find((eintrag) => eintrag.id === id)
    if (!lauf) continue
    const satz = lauf.satzId ? (satze.find((eintrag) => eintrag.id === lauf.satzId) ?? null) : null
    const serie = istSerie(satz)
    const schluessel = serie && satz ? `satz:${satz.id}` : `lauf:${lauf.id}`
    if (gesehen.has(schluessel)) continue
    gesehen.add(schluessel)
    ergebnis.push({ id: lauf.id, lauf, satz, serie })
  }
  return ergebnis
}

/**
 * Wahr, solange irgendein aktiver Lauf plant oder läuft. Steuert in den
 * Screens die Animationsschleife (`useNow`) und den Wake Lock; bei `false`
 * laufen keine Frames und der Bildschirm darf schlafen.
 *
 * Bewusst aus den Daten abgeleitet und nicht als Flag gepflegt: Ein
 * vergessener Zähler würde den Bildschirm dauerhaft wachhalten.
 */
export function berechneBrauchtTakt(eintraege: AktiverEintrag[], laeufe: Lauf[]): boolean {
  return (
    eintraege.some((eintrag) => {
      if (eintrag.serie && eintrag.satz) {
        return rundenVon(laeufe, eintrag.satz.id).some(hatLaufendeBahn)
      }
      return hatLaufendeBahn(eintrag.lauf)
    }) ||
    // Ein laufender Wettkampf-Lauf hält den Takt genauso nötig wie ein
    // Trainingslauf, auch wenn er nicht in der Trainingsleiste steht.
    laeufe.some((lauf) => lauf.modus === 'wettkampf' && hatLaufendeBahn(lauf))
  )
}
