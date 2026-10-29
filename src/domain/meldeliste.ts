/**
 * Toleranter CSV-Import für Meldelisten.
 *
 * Die Meldeliste ist bewusst nachsichtig: Sie akzeptiert eine vollständige
 * Disziplinliste mit Kopfzeile genauso wie eine schnelle Liste „Bahn;Name“.
 * Erkannt werden deutsche und englische Spaltennamen; unbekannte Spalten
 * werden ignoriert, damit ein Export aus einer Wettkampfsoftware nicht erst
 * umgebaut werden muss.
 *
 * Jede Datenzeile ist ein Start. Disziplin, Lauf und Bahn werden gruppiert;
 * fehlende Angaben füllt die `MeldelisteVorgabe` auf, fehlende Bahnen werden
 * der Reihe nach vergeben. Echte Widersprüche (doppelte Bahn, Strecke passt
 * nicht zur Beckenlänge) sind Fehler mit Zeilennummer, unsichere Angaben
 * (unbekannte Schwimmart) nur Warnungen. Der Import legt selbst nichts an: Er
 * liefert einen Plan, aus dem `wettkampf.ts` Sätze und Läufe erzeugt.
 */

import {
  SCHWIMMARTEN,
  type Beckenlaenge,
  type Einheit,
  type Schwimmart,
} from './types'
import {
  anzeigeZuMeter,
  einheitVon,
  formatBeckenlaenge,
  formatStreckeEinheit,
} from './einheit'
import { istVielfacheDerBeckenlaenge } from './lauf'
import { disziplinBezeichnung, type WettkampfDisziplinPlan } from './wettkampf'

/**
 * Vorgaben für den Import. Sie greifen nur, wenn die Datei die Angabe nicht
 * selbst enthält, und machen so eine reine Namensliste importierbar.
 */
export interface MeldelisteVorgabe {
  beckenlaengeM: Beckenlaenge
  /** Anzeige-Einheit des Wettkampfs; fehlt sie, gilt Meter. */
  einheit?: Einheit
  /** Fallback, wenn die Datei keine Strecke nennt (kanonisch in Metern). */
  streckeM: number
  /** Fallback, wenn die Datei keine Schwimmart nennt. */
  schwimmart: Schwimmart
  /** Laufnummer für Dateien ohne eigene Lauf-Spalte. */
  lauf?: number
}

/** Das Ergebnis eines erfolgreichen Imports, noch ohne gespeicherte Objekte. */
export interface Meldeliste {
  disziplinen: WettkampfDisziplinPlan[]
  anzahlStarts: number
  anzahlLaeufe: number
  warnungen: string[]
}

/** Erfolg mit Plan oder Fehler mit einer Meldung, die die Zeile nennt. */
export type MeldelisteErgebnis =
  | { ok: true; meldeliste: Meldeliste }
  | { ok: false; fehler: string }

/** Obergrenze für sinnvolle Zeilen; größere Dateien werden mit einem Hinweis abgelehnt. */
const MAX_ZEILEN = 2000
/** Bahnen pro Lauf; entspricht der Grenze in `training.ts` und im Datenmodell. */
const MAX_BAHNEN = 10

/** Die Spalten, die der Import versteht. Alles andere wird ignoriert. */
type FeldName =
  | 'name'
  | 'vorname'
  | 'nachname'
  | 'bahn'
  | 'lauf'
  | 'strecke'
  | 'schwimmart'
  | 'disziplin'
  | 'jahrgang'

/**
 * Erkannte Spaltennamen je Feld. Verglichen wird mit dem normalisierten
 * Kopfzellentext, deshalb sind die Aliase überwiegend klein und ohne Umlaute
 * notiert. Mehrere Aliase pro Feld, weil Wettkampfprogramme unterschiedlich
 * exportieren.
 */
const ALIASE: Record<FeldName, readonly string[]> = {
  name: ['name', 'schwimmer', 'schwimmerin', 'athlet', 'athletin', 'athlete', 'teilnehmer', 'starter'],
  vorname: ['vorname', 'firstname', 'first_name', 'first name', 'givenname', 'given_name'],
  nachname: ['nachname', 'lastname', 'last_name', 'last name', 'surname', 'familienname'],
  bahn: ['bahn', 'lane', 'spur', 'platz'],
  lauf: ['lauf', 'heat', 'vorlauf', 'runde', 'race'],
  strecke: ['strecke', 'strecke_m', 'distanz', 'distance', 'meter', 'laenge', 'länge'],
  schwimmart: ['schwimmart', 'lage', 'stroke', 'style', 'technik'],
  disziplin: ['disziplin', 'wettkampf', 'event', 'bewerb', 'wettkampfart', 'wettkampfnummer'],
  jahrgang: ['jahrgang', 'jg', 'jahr', 'year', 'geburtsjahr'],
}

/**
 * Schwimmarten-Aliase in Prüfreihenfolge. Aliase ab drei Zeichen werden auch
 * als Teilstring akzeptiert, damit ein Disziplintext wie „200 m Freistil“ ohne
 * exakte Schreibweise erkannt wird; die Reihenfolge entscheidet daher bei
 * Überschneidungen.
 */
const ART_ALIASE: readonly [string, Schwimmart][] = [
  ['schmetterling', 'schmetterling'],
  ['butterfly', 'schmetterling'],
  ['delfin', 'schmetterling'],
  ['freistil', 'freistil'],
  ['freestyle', 'freistil'],
  ['kraul', 'freistil'],
  ['brust', 'brust'],
  ['breaststroke', 'brust'],
  ['breast', 'brust'],
  ['ruecken', 'ruecken'],
  ['rücken', 'ruecken'],
  ['backstroke', 'ruecken'],
  ['back', 'ruecken'],
  ['lagen', 'lagen'],
  ['medley', 'lagen'],
  ['beliebig', 'beliebig'],
]

/**
 * Vereinheitlicht Spaltennamen und Freitexte für den Vergleich: trimmen,
 * kleinschreiben, Umlaute aufschreiben, Mehrfach-Leerraum zusammenfassen.
 * Weitere Satzzeichen bleiben stehen, weil sie in Disziplintexten vorkommen
 * können.
 */
function normalisiere(wert: string): string {
  return wert
    .trim()
    .toLocaleLowerCase('de')
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .replace(/\s+/g, ' ')
}

/** Ordnet einem Kopfzellentext ein bekanntes Feld zu; `null` heißt unbekannt. */
function feldName(wert: string): FeldName | null {
  const normal = normalisiere(wert)
  for (const [name, aliase] of Object.entries(ALIASE) as [FeldName, readonly string[]][]) {
    if (aliase.includes(normal)) return name
  }
  return null
}

/**
 * Erkennt das Trennzeichen an der ersten sinnvollen Zeile.
 *
 * Gezählt werden Semikolon, Tabulator und Komma; das häufigste gewinnt. Bei
 * Gleichstand bleibt die Reihenfolge der Kandidaten ausschlaggebend, also
 * Semikolon vor Tabulator vor Komma.
 */
function erkenneTrenner(zeile: string): string {
  const kandidaten = [
    { zeichen: ';', anzahl: 0 },
    { zeichen: '\t', anzahl: 0 },
    { zeichen: ',', anzahl: 0 },
  ]
  for (const kandidat of kandidaten) {
    kandidat.anzahl = zeile.split(kandidat.zeichen).length - 1
  }
  kandidaten.sort((a, b) => b.anzahl - a.anzahl)
  return kandidaten[0]?.zeichen ?? ';'
}

/**
 * Zerlegt eine CSV-Zeile mit Anführungszeichen und doppelten Quotes.
 *
 * Ein Trennzeichen innerhalb von Anführungszeichen wird nicht gewertet, `""`
 * steht für ein wörtliches Anführungszeichen. Die Felder werden getrimmt, weil
 * Exporte häufig Leerzeichen um die Trennzeichen setzen.
 */
function parseZeile(zeile: string, trenner: string): string[] {
  const felder: string[] = []
  let feld = ''
  let inQuotes = false
  for (let index = 0; index < zeile.length; index += 1) {
    const zeichen = zeile[index]
    if (inQuotes) {
      if (zeichen === '"') {
        if (zeile[index + 1] === '"') {
          feld += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        feld += zeichen
      }
    } else if (zeichen === '"') {
      inQuotes = true
    } else if (zeichen === trenner) {
      felder.push(feld)
      feld = ''
    } else {
      feld += zeichen
    }
  }
  felder.push(feld)
  return felder.map((eintrag) => eintrag.trim())
}

/**
 * Liest eine nicht negative ganze Zahl. Nur reine Ziffernfolgen gelten; alles
 * andere („1a“, „-1“, „1,5“) ergibt `null`, damit der Aufrufer auf einen
 * Fallback oder eine Fehlermeldung ausweichen kann.
 */
function ganzeZahl(wert: string): number | null {
  const text = wert.trim()
  if (!/^\d+$/.test(text)) return null
  const zahl = Number(text)
  return Number.isSafeInteger(zahl) ? zahl : null
}

/**
 * Liest eine Strecke in Metern aus „100“, „100 m“ oder „1.500 m“.
 *
 * Tausenderpunkte werden vorher entfernt. Akzeptiert wird eine Zahl mit zwei
 * bis vier Ziffern im Bereich 25..5000 m; alles andere ist `null`. Die Grenzen
 * halten Zahlen wie „5“ oder „10000“ heraus, ohne echte Strecken zu beschneiden.
 */
function parseStrecke(wert: string): { streckeM: number; einheit: Einheit | null; anzeige: number } | null {
  // Tausenderpunkte entfernen; Yard-Angaben sind ganzzahlig, Meterangaben
  // davor auch. Die Einheit steht optional hinter der Zahl.
  const text = wert.replace(/\./g, '').trim()
  const mitYard = text.match(/(\d{2,4})\s*(?:yd|yards?|y)\b/i)
  if (mitYard?.[1]) {
    const anzeige = Number(mitYard[1])
    if (anzeige < 25 || anzeige > 5000) return null
    return { anzeige, einheit: 'yd', streckeM: anzeigeZuMeter(anzeige, 'yd') }
  }
  const mitMeter = text.match(/(\d{2,4})\s*m\b/i)
  if (mitMeter?.[1]) {
    const anzeige = Number(mitMeter[1])
    if (anzeige < 25 || anzeige > 5000) return null
    return { anzeige, einheit: 'm', streckeM: anzeige }
  }
  const nurZahl = text.match(/^\s*(\d{2,4})\s*$/)
  if (nurZahl?.[1]) {
    const anzeige = Number(nurZahl[1])
    if (anzeige < 25 || anzeige > 5000) return null
    // Ohne Einheit gilt die des Wettkampfs; die Umrechnung passiert beim
    // Aufrufer, weil dort die Vorgabe bekannt ist.
    return { anzeige, einheit: null, streckeM: anzeige }
  }
  return null
}

/**
 * Erkennt die Schwimmart aus einem Freitext. Zuerst exakt, dann als Teilstring
 * für Aliase ab drei Zeichen, damit z. B. „200 m Rücken“ oder „100m Kraul“
 * funktionieren. `null` heißt: nicht erkannt.
 */
function parseSchwimmart(wert: string): Schwimmart | null {
  const normal = normalisiere(wert)
  if (!normal) return null
  for (const [alias, art] of ART_ALIASE) {
    if (normal === alias) return art
    // Aliase ab drei Zeichen dürfen auch im Fließtext stehen; kürzere wären zu unscharf.
    if (alias.length > 2 && normal.includes(alias)) return art
  }
  return null
}

/**
 * Liest einen Jahrgang. Gültig ist 1900 bis zum nächsten Jahr; alles andere
 * wird still verworfen (`null`), weil ein falscher Jahrgang den Import nicht
 * blockieren soll.
 */
function parseJahrgang(wert: string): number | null {
  const zahl = ganzeZahl(wert)
  if (zahl === null) return null
  // Ein Jahrgang im nächsten Jahr ist bei Anmeldungen im Voraus plausibel.
  const hoechstes = new Date().getFullYear() + 1
  return zahl >= 1900 && zahl <= hoechstes ? zahl : null
}

/**
 * Gruppierungsschlüssel einer Disziplin. Die Bezeichnung wird normalisiert
 * mitgenommen, damit eine Freitext-Disziplin (z. B. „Staffel Mixed“) getrennt
 * bleibt, auch wenn Strecke und Schwimmart zufällig gleich sind.
 */
function disziplinSchluessel(
  bezeichnung: string,
  streckeM: number,
  schwimmart: Schwimmart,
  einheit: Einheit,
): string {
  return `${normalisiere(bezeichnung)}|${streckeM}|${schwimmart}|${einheit}`
}

/** Baut die Fehlerantwort; einheitlich für alle Abbruchstellen. */
function fehler(text: string): MeldelisteErgebnis {
  return { ok: false, fehler: text }
}

/**
 * Liest eine Meldeliste. Jede Zeile ist ein Start; gleiche Disziplin und
 * gleiche Laufnummer landen in einem Lauf, die Bahnnummer ordnet den Start zu.
 * Fehlt die Bahn, wird die nächste freie Bahn vergeben.
 *
 * Der Ablauf: BOM entfernen, Zeilen trennen und trimmen, Leerzeilen und
 * `#`-Kommentare verwerfen, Trennzeichen raten, Kopfzeile erkennen (sonst nur
 * ein oder zwei Spalten erlauben), dann Zeile für Zeile auswerten. Die
 * zurückgegebenen Disziplinen stehen in Dateireihenfolge — das ist die
 * Reihenfolge des Wettkampfprogramms —, Heats und Bahnen darin sortiert.
 *
 * Fehler nennen die Zeilennummer der Datei und brechen den ganzen Import ab,
 * damit kein halber Plan entsteht. Warnungen landen in `warnungen` und
 * blockieren nicht.
 */
export function parseMeldeliste(text: string, vorgabe: MeldelisteVorgabe): MeldelisteErgebnis {
  // Die Zeilennummer wird vor dem Filtern vergeben, damit Fehlermeldungen zur
  // Datei passen und nicht zu den verbleibenden Zeilen.
  const zeilen = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((inhalt, index) => ({ inhalt: inhalt.trim(), nummer: index + 1 }))
    .filter((zeile) => zeile.inhalt.length > 0 && !zeile.inhalt.startsWith('#'))

  if (zeilen.length === 0) return fehler('Die Meldeliste ist leer.')
  if (zeilen.length > MAX_ZEILEN) {
    return fehler(`Die Meldeliste hat mehr als ${MAX_ZEILEN} Zeilen. Bitte teile sie auf.`)
  }

  const trenner = erkenneTrenner(zeilen[0]!.inhalt)
  const kopf = parseZeile(zeilen[0]!.inhalt, trenner)
  const kopfFelder = kopf.map(feldName)
  // Eine Kopfzeile liegt vor, sobald mindestens eine Zelle ein bekannter
  // Spaltenname ist. Sonst wird die erste Zeile als Datenzeile gelesen.
  const hatKopfzeile = kopfFelder.some((feld) => feld !== null)

  let spalten: Partial<Record<FeldName, number>> = {}
  let datenzeilen = zeilen

  if (hatKopfzeile) {
    kopfFelder.forEach((feld, index) => {
      // Bei doppelten Spaltennamen gewinnt die erste Spalte.
      if (feld && spalten[feld] === undefined) spalten[feld] = index
    })
    datenzeilen = zeilen.slice(1)
  } else {
    // Schnellformat ohne Kopfzeile: eine Spalte ist der Name, zwei sind
    // Bahn und Name. Alles andere wäre Raten und wird abgelehnt.
    if (kopf.length === 1) {
      spalten = { name: 0 }
    } else if (kopf.length === 2) {
      spalten = { bahn: 0, name: 1 }
    } else {
      return fehler(
        'Ohne Kopfzeile werden nur „Name“ oder „Bahn;Name“ verstanden. Bitte ergänze eine Kopfzeile wie „bahn;name“.',
      )
    }
  }

  if (
    spalten.name === undefined &&
    spalten.vorname === undefined &&
    spalten.nachname === undefined
  ) {
    return fehler(
      'Die Meldeliste braucht eine Spalte „Name“ (oder „Schwimmer“) beziehungsweise „Vorname“ und „Nachname“.',
    )
  }

  const disziplinen = new Map<string, WettkampfDisziplinPlan>()
  // Belegte Bahnen je Disziplin + Lauf; der Schlüssel enthält beides, damit
  // gleiche Bahnnummern in verschiedenen Heats erlaubt sind.
  const belegteBahnen = new Map<string, Set<number>>()
  const warnungen = new Set<string>()
  let anzahlStarts = 0
  let anzahlLaeufe = 0

  for (const zeile of datenzeilen) {
    const felder = parseZeile(zeile.inhalt, trenner)
    // Fehlende Spalten liefern einen leeren String; der Fallback greift dann.
    const wert = (feld: FeldName): string => {
      const index = spalten[feld]
      return index === undefined ? '' : (felder[index] ?? '').trim()
    }

    // Viele Wettkampfprogramme trennen Vor- und Nachname. Beides wird zu
    // einem Namen zusammengesetzt, damit die Schwimmerzuordnung eindeutig
    // bleibt.
    const name =
      wert('name') ||
      [wert('vorname'), wert('nachname')].filter((teil) => teil.length > 0).join(' ')
    if (!name) {
      return fehler(`Zeile ${zeile.nummer}: Der Name fehlt.`)
    }
    if (name.length > 80) {
      return fehler(`Zeile ${zeile.nummer}: Der Name ist länger als 80 Zeichen.`)
    }

    const disziplinText = wert('disziplin')
    const streckeText = wert('strecke')
    const artText = wert('schwimmart')
    const vorgabeEinheit = einheitVon(vorgabe)

    // Reihenfolge: eigene Streckenspalte, Zahl im Disziplintext, Vorgabe.
    const streckeAngabe = parseStrecke(streckeText) ?? parseStrecke(disziplinText)
    // Eine ausdrücklich genannte Einheit muss zum Wettkampf passen. Ein
    // Meter-Eintrag in einem Yard-Wettkampf wäre sonst stillschweigend falsch.
    if (streckeAngabe?.einheit && streckeAngabe.einheit !== vorgabeEinheit) {
      return fehler(
        `Zeile ${zeile.nummer}: ${formatStreckeEinheit(
          streckeAngabe.streckeM,
          streckeAngabe.einheit,
        )} passt nicht zu einem Wettkampf in ${formatBeckenlaenge(
          vorgabe.beckenlaengeM,
          vorgabeEinheit,
        )}-Becken.`,
      )
    }
    const einheit = streckeAngabe?.einheit ?? vorgabeEinheit
    // Ohne Einheit ist die Zahl in der Einheit des Wettkampfs zu lesen.
    const streckeM = streckeAngabe
      ? streckeAngabe.einheit
        ? streckeAngabe.streckeM
        : anzeigeZuMeter(streckeAngabe.anzeige, vorgabeEinheit)
      : vorgabe.streckeM
    if (streckeM <= 0) {
      return fehler(`Zeile ${zeile.nummer}: Die Strecke fehlt oder ist ungültig.`)
    }
    // Die Strecke muss ein Vielfaches der Beckenlänge sein, sonst passt die
    // Längenanzahl des Laufs nicht zum Becken.
    if (!istVielfacheDerBeckenlaenge(streckeM, vorgabe.beckenlaengeM)) {
      return fehler(
        `Zeile ${zeile.nummer}: ${formatStreckeEinheit(streckeM, einheit)} passt nicht zu einem ${formatBeckenlaenge(
          vorgabe.beckenlaengeM,
          vorgabeEinheit,
        )}-Becken.`,
      )
    }

    const schwimmart =
      parseSchwimmart(artText) ?? parseSchwimmart(disziplinText) ?? vorgabe.schwimmart
    // Eine ausdrücklich genannte, aber unbekannte Schwimmart ist ein Hinweis
    // wert; eine fehlende Angabe ist normal und wird nicht gemeldet.
    if (artText && parseSchwimmart(artText) === null) {
      warnungen.add(`Zeile ${zeile.nummer}: Schwimmart „${artText}“ nicht erkannt, ${schwimmart} verwendet.`)
    }

    // Ein Freitext ohne erkennbare Strecke und Schwimmart (z. B. „Staffel“)
    // bleibt als Bezeichnung stehen; sonst wird sie aus den Werten gebaut.
    const bezeichnung =
      disziplinText && parseStrecke(disziplinText) === null && parseSchwimmart(disziplinText) === null
        ? disziplinText
        : disziplinBezeichnung(streckeM, schwimmart, einheit)
    const schluessel = disziplinSchluessel(bezeichnung, streckeM, schwimmart, einheit)

    let disziplin = disziplinen.get(schluessel)
    if (!disziplin) {
      disziplin = { bezeichnung, streckeM, schwimmart, einheit, laeufe: [] }
      disziplinen.set(schluessel, disziplin)
    }

    // Ohne Lauf-Spalte gilt die Vorgabe, sonst Lauf 1 (eine reine Namensliste).
    const laufNummer = ganzeZahl(wert('lauf')) ?? vorgabe.lauf ?? 1
    if (laufNummer < 1 || laufNummer > 99) {
      return fehler(`Zeile ${zeile.nummer}: Die Laufnummer muss zwischen 1 und 99 liegen.`)
    }
    let lauf = disziplin.laeufe.find((eintrag) => eintrag.nummer === laufNummer)
    if (!lauf) {
      lauf = { nummer: laufNummer, starts: [] }
      disziplin.laeufe.push(lauf)
      anzahlLaeufe += 1
    }

    const bahnSchluessel = `${schluessel}|${laufNummer}`
    let belegt = belegteBahnen.get(bahnSchluessel)
    if (!belegt) {
      belegt = new Set<number>()
      belegteBahnen.set(bahnSchluessel, belegt)
    }

    const bahnText = wert('bahn')
    let bahn = ganzeZahl(bahnText)
    if (bahn === null) {
      // Ohne (lesbare) Bahnnummer die erste freie Bahn im Lauf vergeben.
      bahn = Array.from({ length: MAX_BAHNEN }, (_, index) => index + 1).find(
        (kandidat) => !belegt!.has(kandidat),
      ) ?? null
      if (bahn === null) {
        return fehler(
          `Zeile ${zeile.nummer}: In ${bezeichnung}, Lauf ${laufNummer} sind alle ${MAX_BAHNEN} Bahnen belegt.`,
        )
      }
      if (bahnText) {
        warnungen.add(`Zeile ${zeile.nummer}: Bahn „${bahnText}“ nicht erkannt, Bahn ${bahn} verwendet.`)
      }
    }
    if (bahn < 1 || bahn > MAX_BAHNEN) {
      return fehler(`Zeile ${zeile.nummer}: Die Bahn muss zwischen 1 und ${MAX_BAHNEN} liegen.`)
    }
    // Eine doppelte Bahn ist ein echter Widerspruch: Zwei Namen auf einer Bahn
    // würden später eine der beiden Zeiten überschreiben.
    if (belegt.has(bahn)) {
      return fehler(
        `Zeile ${zeile.nummer}: Bahn ${bahn} ist in ${bezeichnung}, Lauf ${laufNummer} doppelt belegt.`,
      )
    }
    belegt.add(bahn)

    lauf.starts.push({
      name,
      bahn,
      jahrgang: parseJahrgang(wert('jahrgang')),
    })
    anzahlStarts += 1
  }

  if (anzahlStarts === 0) return fehler('Die Meldeliste enthält keine Starts.')

  // Die Reihenfolge der Datei ist die Reihenfolge des Wettkampfprogramms.
  // Innerhalb einer Disziplin werden die Heats nach Nummer und die Bahnen
  // nach Bahnnummer sortiert, weil die Datei beliebig gemischt sein darf.
  const sortiert = [...disziplinen.values()].map((disziplin) => ({
    ...disziplin,
    laeufe: [...disziplin.laeufe]
      .sort((a, b) => a.nummer - b.nummer)
      .map((lauf) => ({
        ...lauf,
        starts: [...lauf.starts].sort((a, b) => a.bahn - b.bahn),
      })),
  }))

  return {
    ok: true,
    meldeliste: {
      disziplinen: sortiert,
      anzahlStarts,
      anzahlLaeufe,
      warnungen: [...warnungen],
    },
  }
}

/**
 * Fertige Importvorlage: UTF-8-BOM, Semikolon, CRLF und Beispielzeilen.
 *
 * Das BOM hilft Excel, Umlaute als UTF-8 zu lesen; Semikolon und CRLF sind die
 * in deutschen Tabellenprogrammen erwartete Form. Die Vorlage muss durch
 * `parseMeldeliste` selbst wieder lesbar sein.
 */
export function meldelisteVorlage(einheit: Einheit = 'm'): string {
  const yd = einheit === 'yd'
  const einheitText = yd ? 'yd' : 'm'
  return `\uFEFF${[
    'disziplin;strecke;schwimmart;lauf;bahn;name;jahrgang',
    `100 ${einheitText} Freistil;100 ${einheitText};freistil;1;1;Anna Muster;2010`,
    `100 ${einheitText} Freistil;100 ${einheitText};freistil;1;2;Ben Beispiel;2011`,
    `100 ${einheitText} Freistil;100 ${einheitText};freistil;2;1;Clara Muster;2010`,
    `${'50'} ${einheitText} Brust;50 ${einheitText};brust;1;1;Dana Beispiel;2012`,
  ].join('\r\n')}\r\n`
}

/**
 * Die Disziplinen einer Meldeliste als lesbare Zusammenfassung, z. B.
 * „2 Disziplinen, 3 Läufe, 4 Starts“. Singular und Plural werden bewusst
 * ausgeschrieben, weil die Zeile in der Vorschau unter der Überschrift steht.
 */
export function meldelisteZusammenfassung(meldeliste: Meldeliste): string {
  const disziplinen = meldeliste.disziplinen.length
  const starts = meldeliste.anzahlStarts
  return `${disziplinen} ${disziplinen === 1 ? 'Disziplin' : 'Disziplinen'}, ${meldeliste.anzahlLaeufe} ${meldeliste.anzahlLaeufe === 1 ? 'Lauf' : 'Läufe'}, ${starts} ${starts === 1 ? 'Start' : 'Starts'}`
}

/**
 * Type Guard gegen `SCHWIMMARTEN`. Gedacht für Werte aus Formularen oder
 * Backups; der Import selbst nutzt die tolerantere Alias-Erkennung.
 */
export function istSchwimmart(wert: string): wert is Schwimmart {
  return SCHWIMMARTEN.some((eintrag) => eintrag.wert === wert)
}
