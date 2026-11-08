/**
 * Kleiner PDF-Schreiber für Berichte.
 *
 * Die App bleibt bewusst ohne PDF-Bibliothek: Für einen Textbericht reichen
 * die beiden Standardfonts Helvetica und Helvetica-Bold. Dieses Modul setzt
 * Zeilen um, verteilt sie auf A4-Seiten, zeichnet eine Fußzeile mit Seitenzahl
 * und schreibt die PDF-Objekte samt xref-Tabelle. Es kennt keine Domänentypen.
 *
 * Kodierung: PDF-Standardschriften erwarten WinAnsi, nicht UTF-8. Deutsche
 * Umlaute und die typografischen Zeichen des Berichts werden deshalb auf
 * WinAnsi-Codes abgebildet. Zeichen außerhalb dieses Zeichensatzes werden zu
 * `?`; das betrifft vor allem Emojis in frei eingegebenen Namen.
 *
 * Grenzen: Kein Bild, keine Tabelle, kein Fettdruck innerhalb einer Zeile.
 * Das reicht für den Trainingsbericht und hält den Export offline verfügbar.
 */

/** Schriftstil einer Berichtszeile. */
export type PdfStil = 'titel' | 'abschnitt' | 'fett' | 'text' | 'klein'

/** Eine logische Zeile; wird beim Setzen bei Bedarf umbrochen. */
export interface PdfZeile {
  text: string
  stil?: PdfStil
  /** Einzug in Punkten, z. B. für Unterpunkte. */
  einzug?: number
}

// A4 in PDF-Punkten (1/72 Zoll). Der Bericht ist für den Druck gedacht.
const SEITEN_BREITE = 595.28
const SEITEN_HOEHE = 841.89
const RAND = 48
const INHALT_BREITE = SEITEN_BREITE - RAND * 2
const UNTEN = 52

interface SatzStil {
  font: 'F1' | 'F2'
  size: number
  leading: number
  /** Zusätzlicher Abstand vor der Zeile in Punkten. */
  vor: number
}

// `F2` ist Helvetica-Bold. Die Werte sind so gewählt, dass Titel und Fließtext
// auch auf dem Handy gut lesbar bleiben.
const STILE: Record<PdfStil, SatzStil> = {
  titel: { font: 'F2', size: 18, leading: 23, vor: 0 },
  abschnitt: { font: 'F2', size: 13, leading: 18, vor: 14 },
  fett: { font: 'F2', size: 10.5, leading: 14, vor: 4 },
  text: { font: 'F1', size: 10.5, leading: 14, vor: 0 },
  klein: { font: 'F1', size: 9, leading: 12, vor: 2 },
}

// Zeichenbreiten von Helvetica für die ASCII-Codes 32 bis 126, in Tausendstel
// der Schriftgröße. Sie stammen aus den AFM-Metriken der Standardschrift und
// werden nur zum Umbruch gebraucht.
const BREITEN: Record<'F1' | 'F2', readonly number[]> = {
  F1: [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
    278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
    584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
    833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
    278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
    500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
    500, 334, 260, 334, 584,
  ],
  F2: [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278,
    278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584,
    584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611,
    833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
    278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278,
    556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
    500, 389, 280, 389, 584,
  ],
}

// WinAnsi kennt die deutschen Anführungszeichen, Gedankenstriche und das
// Euro-Zeichen an anderen Stellen als ISO-8859-1. Diese Sonderfälle werden
// explizit abgebildet; Buchstaben mit Akzent liegen bereits auf demselben Code.
const WIN_ANSI: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  'ƒ': 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  'ˆ': 0x88,
  '‰': 0x89,
  'Š': 0x8a,
  '‹': 0x8b,
  'Œ': 0x8c,
  'Ž': 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  'š': 0x9a,
  '›': 0x9b,
  'œ': 0x9c,
  'ž': 0x9e,
  'Ÿ': 0x9f,
  // Häufige typografische Ersatzzeichen, die in Namen und Titeln vorkommen.
  '−': 0x2d,
  '→': 0x2d,
  '≈': 0xbb,
}

// Akzentuierte Buchstaben übernehmen die Breite ihres Grundbuchstabens. Das
// hält den Umbruch stabil, ohne eine zweite Breitentabelle zu pflegen.
const GRUNDBUCHSTABE: Record<string, string> = {
  Ä: 'A',
  Ö: 'O',
  Ü: 'U',
  ß: 's',
  ä: 'a',
  ö: 'o',
  ü: 'u',
  á: 'a',
  à: 'a',
  â: 'a',
  ã: 'a',
  å: 'a',
  é: 'e',
  è: 'e',
  ê: 'e',
  ë: 'e',
  í: 'i',
  ì: 'i',
  î: 'i',
  ï: 'i',
  ñ: 'n',
  ó: 'o',
  ò: 'o',
  ô: 'o',
  õ: 'o',
  ú: 'u',
  ù: 'u',
  û: 'u',
  ç: 'c',
}

/** Kodiert Text als WinAnsi-String, Buchstabe für Buchstabe. */
function kodiere(text: string): string {
  let ergebnis = ''
  for (const zeichen of text) {
    const code = zeichen.codePointAt(0) ?? 0
    let byte: number
    if (WIN_ANSI[zeichen] !== undefined) byte = WIN_ANSI[zeichen]
    else if (code === 0x0a || code === 0x0d || code === 0x09) byte = 0x20
    else if (code >= 0x20 && code <= 0x7e) byte = code
    else if (code >= 0xa0 && code <= 0xff) byte = code
    else byte = 0x3f
    ergebnis += String.fromCharCode(byte)
  }
  return ergebnis
}

/** Maskiert einen bereits kodierten Text für einen PDF-Literalstring. */
function maskiere(text: string): string {
  return text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
}

/** Breite eines Zeichens in Punkten bei der angegebenen Schriftgröße. */
function zeichenBreite(zeichen: string, font: 'F1' | 'F2', size: number): number {
  const code = zeichen.codePointAt(0) ?? 0
  const tabelle = BREITEN[font]
  let breite = 556
  if (code >= 32 && code <= 126) breite = tabelle[code - 32] ?? 556
  else {
    const grund = GRUNDBUCHSTABE[zeichen]
    if (grund) {
      const grundCode = grund.codePointAt(0) ?? 0
      breite = tabelle[grundCode - 32] ?? 556
    } else if (zeichen === 'ß') breite = 500
    else if (zeichen === '€') breite = 556
  }
  return (breite / 1000) * size
}

/** Breite eines Texts in Punkten. */
function textBreite(text: string, font: 'F1' | 'F2', size: number): number {
  let breite = 0
  for (const zeichen of text) breite += zeichenBreite(zeichen, font, size)
  return breite
}

/**
 * Bricht ein einzelnes zu langes Wort an der Zeichengrenze um. Ohne diesen
 * Zweig würde ein einzelner langer Name oder eine lange Zahl über den Rand
 * laufen.
 */
function zerlegeWort(wort: string, font: 'F1' | 'F2', size: number, maxBreite: number): string[] {
  const teile: string[] = []
  let rest = wort
  while (rest.length > 0) {
    let index = 1
    let breite = zeichenBreite(rest.slice(0, 1), font, size)
    while (index < rest.length) {
      const naechste = zeichenBreite(rest.slice(index, index + 1), font, size)
      if (breite + naechste > maxBreite) break
      breite += naechste
      index += 1
    }
    teile.push(rest.slice(0, index))
    rest = rest.slice(index)
  }
  return teile
}

/**
 * Bricht eine logische Zeile in sichtbare Zeilen. Mehrfache Leerzeichen
 * verschwinden; ein leeres Feld erzeugt eine Leerzeile und damit Abstand.
 */
function umbrechen(
  text: string,
  font: 'F1' | 'F2',
  size: number,
  maxBreite: number,
): string[] {
  const bereinigt = text.replace(/\s+/g, ' ').trim()
  if (!bereinigt) return ['']

  const zeilen: string[] = []
  let aktuell = ''
  for (const wort of bereinigt.split(' ')) {
    const kandidat = aktuell ? `${aktuell} ${wort}` : wort
    if (textBreite(kandidat, font, size) <= maxBreite) {
      aktuell = kandidat
      continue
    }
    if (aktuell) {
      zeilen.push(aktuell)
      aktuell = ''
    }
    if (textBreite(wort, font, size) <= maxBreite) {
      aktuell = wort
      continue
    }
    const teile = zerlegeWort(wort, font, size, maxBreite)
    const letzte = teile.pop()
    zeilen.push(...teile)
    aktuell = letzte ?? ''
  }
  if (aktuell) zeilen.push(aktuell)
  return zeilen.length > 0 ? zeilen : ['']
}

interface Positioniert {
  text: string
  font: 'F1' | 'F2'
  size: number
  x: number
  y: number
}

interface Seite {
  inhalt: Positioniert[]
}

/**
 * Setzt die Zeilen auf Seiten. `y` ist die Grundlinie; die erste Zeile beginnt
 * unter dem oberen Rand. Ein Abschnittstitel bekommt zwei Zeilen Platz, damit
 * er nicht allein am Seitenende steht.
 */
function setzeSeiten(zeilen: readonly PdfZeile[], titel: string): Seite[] {
  const seiten: Seite[] = []
  let inhalt: Positioniert[] = []
  let y = SEITEN_HOEHE - RAND

  const neueSeite = () => {
    if (inhalt.length > 0) seiten.push({ inhalt })
    inhalt = []
    y = SEITEN_HOEHE - RAND
  }

  for (const zeile of zeilen) {
    const stil = STILE[zeile.stil ?? 'text']
    const einzug = Math.max(0, zeile.einzug ?? 0)
    // Abschnittstitel brauchen mindestens zwei Zeilen; sonst rutschen sie
    // allein an das Seitenende.
    const platz = zeile.stil === 'abschnitt' ? stil.leading * 2 : stil.leading
    if (y - stil.vor - platz < UNTEN) neueSeite()
    y -= stil.vor

    const maxBreite = INHALT_BREITE - einzug
    for (const sichtbar of umbrechen(zeile.text, stil.font, stil.size, maxBreite)) {
      if (y - stil.leading < UNTEN) neueSeite()
      y -= stil.leading
      inhalt.push({
        text: sichtbar,
        font: stil.font,
        size: stil.size,
        x: RAND + einzug,
        y,
      })
    }
  }

  if (inhalt.length > 0 || seiten.length === 0) seiten.push({ inhalt })
  const gesamt = seiten.length

  // Fußzeile nach dem Umbruch: erst jetzt steht die Gesamtzahl der Seiten fest.
  const fuss = titel.slice(0, 72)
  seiten.forEach((seite, index) => {
    seite.inhalt.push({
      text: `Beckenrand · ${fuss}`,
      font: 'F1',
      size: 8.5,
      x: RAND,
      y: 30,
    })
    const seitenText = `Seite ${index + 1} von ${gesamt}`
    seite.inhalt.push({
      text: seitenText,
      font: 'F1',
      size: 8.5,
      x: SEITEN_BREITE - RAND - textBreite(seitenText, 'F1', 8.5),
      y: 30,
    })
  })

  return seiten
}

/** Baut einen PDF-Inhaltsstream aus den positionierten Zeilen einer Seite. */
function inhaltsStream(seite: Seite): string {
  return `${seite.inhalt
    .map(
      (zeile) =>
        `BT /${zeile.font} ${zeile.size} Tf 1 0 0 1 ${zeile.x.toFixed(2)} ${zeile.y.toFixed(2)} Tm (${maskiere(kodiere(zeile.text))}) Tj ET`,
    )
    .join('\n')}\n`
}

/** Wandelt einen Latin-1-String in seine Bytes; PDF-Offsets zählen Bytes. */
function alsBytes(text: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index) & 0xff
  }
  return bytes
}

/**
 * Erzeugt ein PDF aus den übergebenen Zeilen.
 *
 * @param zeilen Logische Berichtszeilen in Anzeigereihenfolge.
 * @param titel Fußzeilentext, üblicherweise der Berichtstitel.
 * @returns Vollständiges PDF als Bytes, geeignet für `speichereDatei`.
 */
export function erzeugePdf(zeilen: readonly PdfZeile[], titel: string): Uint8Array<ArrayBuffer> {
  const seiten = setzeSeiten(zeilen, titel)
  const objekte = new Map<number, string>()

  const seitenIds = seiten.map((_, index) => 5 + index * 2)
  objekte.set(1, '<< /Type /Catalog /Pages 2 0 R >>')
  objekte.set(
    2,
    `<< /Type /Pages /Kids [${seitenIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${seiten.length} >>`,
  )
  objekte.set(
    3,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  )
  objekte.set(
    4,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  )

  seiten.forEach((seite, index) => {
    const seitenId = 5 + index * 2
    const inhaltId = seitenId + 1
    objekte.set(
      seitenId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${SEITEN_BREITE} ${SEITEN_HOEHE}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${inhaltId} 0 R >>`,
    )
    const stream = inhaltsStream(seite)
    objekte.set(inhaltId, `<< /Length ${stream.length} >>\nstream\n${stream}endstream`)
  })

  let pdf = '%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n'
  let laenge = pdf.length
  const offsets: number[] = []
  const anzahl = 4 + seiten.length * 2

  for (let id = 1; id <= anzahl; id += 1) {
    offsets[id] = laenge
    const objekt = `${id} 0 obj\n${objekte.get(id) ?? ''}\nendobj\n`
    pdf += objekt
    laenge += objekt.length
  }

  const xrefStart = laenge
  pdf += `xref\n0 ${anzahl + 1}\n0000000000 65535 f \n`
  for (let id = 1; id <= anzahl; id += 1) {
    pdf += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${anzahl + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

  return alsBytes(pdf)
}
