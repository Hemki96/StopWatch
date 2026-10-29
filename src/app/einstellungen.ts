/**
 * Vorbelegung des nächsten Laufs und Designwahl — lesen, begrenzen, schreiben.
 *
 * Beide leben in `localStorage`, nicht in IndexedDB, und sind deshalb bewusst
 * nicht Teil des JSON-Backups. Jedes Feld wird einzeln geprüft: Ein kaputter
 * Teil fällt auf seinen Standardwert zurück, statt alle Einstellungen zu
 * verwerfen. Die Grenzen gelten beim Lesen **und** beim Schreiben, weil der
 * Provider die einzige Schreibstelle ist und sich nicht darauf verlassen darf,
 * dass jeder Aufrufer brav validiert.
 */
import {
  SCHWIMMARTEN,
  type Beckenlaenge,
  type Einheit,
  type LaufKonfiguration,
} from '../domain/types'
import { einheitVon } from '../domain/einheit'
import { istVielfacheDerBeckenlaenge } from '../domain/lauf'
import { MAX_BAHNEN, MAX_REIHEN, bahnenGesamt } from '../domain/training'
import { leseText, schreibeText } from './lokalSpeicher'

/** Das tatsächlich angewendete Design. */
export type Theme = 'dark' | 'light'

/**
 * Die gespeicherte Wahl. `system` folgt der Betriebssystem-Einstellung und wird
 * erst über `theme` im Kontext in ein konkretes `Theme` aufgelöst.
 */
export type ThemeEinstellung = Theme | 'system'

/**
 * Vorbelegung für den nächsten Lauf.
 *
 * Diese Werte werden beim Anlegen kopiert und nicht von laufenden Läufen
 * geteilt; eine Änderung hier darf eine laufende Messung nicht umschreiben.
 */
export interface Einstellungen {
  konfiguration: LaufKonfiguration
  /** Bahnen je Reihe; zusammen mit `reihen` ergibt das die Personenzahl. */
  bahnen: number
  /** Reihen (Startgruppen); Reihe 1 startet sofort, jede weitere versetzt. */
  reihen: number
  /**
   * Vorbelegung der Bahnen für den nächsten Lauf, Reihe für Reihe: erst alle
   * Bahnen der Reihe 1, dann Reihe 2. Die Länge ist `bahnen × reihen`.
   */
  schwimmerProBahn: (string | null)[]
  /** Abstand zwischen den Starts der Reihen in ms. 0 = gemeinsam. */
  startversatzMs: number
  /** Wiederholungen der nächsten Serie; 1 = einzelner Lauf. */
  wiederholungen: number
  /** Takt zwischen zwei Wiederholungen in Sekunden. */
  taktSek: number
}

/** Standard-Bahnenzahl, wenn weder gespeichert noch eingegeben etwas Brauchbares vorliegt. */
const STANDARD_BAHNEN = 6

/** Nur der allererste Start (kein lesbarer Speicher) verwendet diese Werte. */
export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  konfiguration: { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' },
  bahnen: STANDARD_BAHNEN,
  reihen: 1,
  schwimmerProBahn: Array.from({ length: STANDARD_BAHNEN }, () => null),
  startversatzMs: 0,
  wiederholungen: 1,
  taktSek: 120,
}

/** `localStorage`-Schlüssel der Einstellungen und der Designwahl. */
const EINSTELLUNGEN_KEY = 'beckenrand.einstellungen'
const THEME_KEY = 'beckenrand.theme'

/**
 * Bringt eine beliebige gespeicherte Bahnbelegung auf genau `anzahl` Plätze.
 *
 * Zu kurze Listen werden mit `null` aufgefüllt, zu lange abgeschnitten, leere
 * Zeichenketten gelten als „keine Zuordnung“. So kann eine geänderte
 * Bahnenzahl oder Reihenzahl nie zu einer verschobenen Zuordnung führen.
 */
export function normalisiereSchwimmerProBahn(
  liste: unknown,
  anzahl: number,
): (string | null)[] {
  const werte = Array.isArray(liste) ? liste : []
  return Array.from({ length: anzahl }, (_, i) => {
    const wert = werte[i]
    return typeof wert === 'string' && wert.length > 0 ? wert : null
  })
}

/**
 * Klemmt den Startversatz auf 0 … 120 s und rundet auf ganze Sekunden.
 *
 * Die Grenze ist eine Bedienentscheidung, keine Domänenregel: Ein Versatz über
 * zwei Minuten ist am Beckenrand nicht mehr sinnvoll und würde nur die
 * Countdown-Anzeige verstopfen.
 */
export function begrenzeVersatz(wert: unknown): number {
  if (typeof wert !== 'number' || !Number.isFinite(wert)) return 0
  return Math.min(120_000, Math.max(0, Math.round(wert / 1000) * 1000))
}

/**
 * Begrenzt die Reihen auf 1 … `MAX_REIHEN`. Fehlende oder unbrauchbare Werte
 * gelten als eine Reihe, damit ältere Einstellungen unverändert weiterlaufen.
 */
export function begrenzeReihen(wert: unknown): number {
  if (typeof wert !== 'number' || !Number.isFinite(wert)) return 1
  return Math.min(MAX_REIHEN, Math.max(1, Math.round(wert)))
}

/**
 * Begrenzt die Wiederholungen einer Serie auf 1 … 20 (wie `MAX_WIEDERHOLUNGEN`
 * im Trainingsmodell). 1 bedeutet „kein Plan“, also einen einzelnen Lauf.
 */
export function begrenzeWiederholungen(wert: unknown): number {
  if (typeof wert !== 'number' || !Number.isFinite(wert)) return 1
  return Math.min(20, Math.max(1, Math.round(wert)))
}

/**
 * Begrenzt den Takt auf 10 … 3600 s. Unter 10 s wäre ein Takt kein Takt mehr,
 * über einer Stunde passt er nicht mehr zu einer Trainingseinheit.
 */
export function begrenzeTakt(wert: unknown): number {
  if (typeof wert !== 'number' || !Number.isFinite(wert)) return 120
  return Math.min(3600, Math.max(10, Math.round(wert)))
}

/**
 * Begrenzt eine bereits vollständige Einstellung. Die Konfiguration bleibt
 * unangetastet: Sie kommt aus einem geprüften Formular, nicht aus dem Speicher.
 */
export function begrenzeEinstellungen(naechste: Einstellungen): Einstellungen {
  const bahnen =
    typeof naechste.bahnen === 'number' && Number.isFinite(naechste.bahnen)
      ? Math.min(MAX_BAHNEN, Math.max(1, Math.round(naechste.bahnen)))
      : STANDARD_EINSTELLUNGEN.bahnen
  const reihen = begrenzeReihen(naechste.reihen)
  return {
    ...naechste,
    bahnen,
    reihen,
    schwimmerProBahn: normalisiereSchwimmerProBahn(
      naechste.schwimmerProBahn,
      bahnenGesamt(bahnen, reihen),
    ),
    startversatzMs: begrenzeVersatz(naechste.startversatzMs),
    wiederholungen: begrenzeWiederholungen(naechste.wiederholungen),
    taktSek: begrenzeTakt(naechste.taktSek),
  }
}

/**
 * Liest und bereinigt die gespeicherten Einstellungen.
 *
 * Jedes Feld wird einzeln geprüft: Ein kaputter Teil fällt auf seinen
 * Standardwert zurück, statt alle Einstellungen zu verwerfen. Nur ein
 * unlesbarer Datensatz führt komplett zu `STANDARD_EINSTELLUNGEN`.
 * Die Strecke muss positiv und ein Vielfaches der Beckenlänge sein; sonst gilt
 * der Standard. `null` ist dagegen ein gültiger Wert (offene Strecke).
 */
export function leseEinstellungen(): Einstellungen {
  const roh = leseText(EINSTELLUNGEN_KEY)
  if (!roh) return STANDARD_EINSTELLUNGEN
  try {
    const geparst: unknown = JSON.parse(roh)
    if (typeof geparst !== 'object' || geparst === null) return STANDARD_EINSTELLUNGEN
    const parsed = geparst as Partial<Einstellungen>
    const roheKonfiguration: Partial<LaufKonfiguration> =
      typeof parsed.konfiguration === 'object' && parsed.konfiguration !== null
        ? parsed.konfiguration
        : STANDARD_EINSTELLUNGEN.konfiguration
    // Fehlt die Einheit, gelten Meter; eine unbekannte Yard-Kombination wird
    // auf ein 25-Yard-Becken zurückgeführt, statt stillschweigend Meter zu
    // zeigen. So bleibt jede gespeicherte Einstellung in sich stimmig.
    const einheit: Einheit = einheitVon(roheKonfiguration)
    // Meter kennt 25/50, Yards nur 25 yd (22,86 m). Alles andere fällt auf die
    // Vorgabe der Einheit zurück.
    const beckenlaengeM: Beckenlaenge =
      einheit === 'yd' ? 22.86 : roheKonfiguration.beckenlaengeM === 25 ? 25 : 50
    const roheStrecke = roheKonfiguration.streckeM
    // `null` bleibt erhalten und bedeutet „offene Strecke“; nur ein
    // unbrauchbarer Zahlenwert fällt auf den Standard der Einheit zurück.
    const streckeM =
      roheStrecke === null
        ? null
        : typeof roheStrecke === 'number' &&
            Number.isFinite(roheStrecke) &&
            roheStrecke > 0 &&
            istVielfacheDerBeckenlaenge(roheStrecke, beckenlaengeM)
          ? Math.round(roheStrecke * 100) / 100
          : einheit === 'yd'
            ? 91.44
            : STANDARD_EINSTELLUNGEN.konfiguration.streckeM
    const schwimmart =
      SCHWIMMARTEN.find((eintrag) => eintrag.wert === roheKonfiguration.schwimmart)?.wert ??
      'freistil'
    const bahnen =
      typeof parsed.bahnen === 'number' && Number.isFinite(parsed.bahnen)
        ? parsed.bahnen
        : STANDARD_EINSTELLUNGEN.bahnen
    const begrenzt = Math.min(MAX_BAHNEN, Math.max(1, Math.round(bahnen)))
    const reihen = begrenzeReihen(parsed.reihen)
    return {
      konfiguration: {
        beckenlaengeM,
        streckeM,
        schwimmart,
        ...(einheit === 'yd' ? { einheit: 'yd' as const } : {}),
      },
      bahnen: begrenzt,
      reihen,
      schwimmerProBahn: normalisiereSchwimmerProBahn(
        parsed.schwimmerProBahn,
        bahnenGesamt(begrenzt, reihen),
      ),
      startversatzMs: begrenzeVersatz(parsed.startversatzMs),
      wiederholungen: begrenzeWiederholungen(parsed.wiederholungen),
      taktSek: begrenzeTakt(parsed.taktSek),
    }
  } catch {
    return STANDARD_EINSTELLUNGEN
  }
}

/** Speichert die bereits begrenzte Einstellung. */
export function schreibeEinstellungen(einstellungen: Einstellungen): void {
  schreibeText(EINSTELLUNGEN_KEY, JSON.stringify(einstellungen))
}

/**
 * Liest die Designwahl. Unbekannte oder fehlende Werte ergeben `system`, damit
 * eine ältere oder manipulierte Einstellung nie zu einem unsichtbaren Design
 * führt.
 */
export function leseThemeEinstellung(): ThemeEinstellung {
  const gespeichert = leseText(THEME_KEY)
  if (gespeichert === 'light' || gespeichert === 'dark' || gespeichert === 'system') {
    return gespeichert
  }
  return 'system'
}

/** Speichert die Designwahl; `system` bleibt als solches gemerkt. */
export function schreibeThemeEinstellung(einstellung: ThemeEinstellung): void {
  schreibeText(THEME_KEY, einstellung)
}
