import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))
const ZIEL = join(HIER, '..', 'public', 'icons')

const HINTERGRUND = [7, 12, 21]
const AKZENT = [56, 189, 248]
const WEISS = [242, 246, 252]

const TABELLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = TABELLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const laenge = Buffer.alloc(4)
  laenge.writeUInt32BE(data.length)
  const typ = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typ, data])))
  return Buffer.concat([laenge, typ, data, crc])
}

function pngBreite(size, pixel) {
  const roh = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const zeile = y * (size * 4 + 1)
    roh[zeile] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y)
      const i = zeile + 1 + x * 4
      roh[i] = r
      roh[i + 1] = g
      roh[i + 2] = b
      roh[i + 3] = a
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(roh, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function mische(unten, oben, alpha) {
  return [
    Math.round(unten[0] + (oben[0] - unten[0]) * alpha),
    Math.round(unten[1] + (oben[1] - unten[1]) * alpha),
    Math.round(unten[2] + (oben[2] - unten[2]) * alpha),
    255,
  ]
}

function deckung(distanz) {
  return Math.min(1, Math.max(0, 0.5 - distanz))
}

function abstandSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const laenge2 = dx * dx + dy * dy
  const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / laenge2))
  const nx = ax + t * dx
  const ny = ay + t * dy
  return Math.hypot(px - nx, py - ny)
}

function zeichne(size, skalierung = 1) {
  // `skalierung` verkleinert die Zeichnung um die Bildmitte. Maskable-Icons
  // brauchen Rand, weil Android sie zu einem Kreis oder Quadrat zuschneidet.
  const s = (size / 512) * skalierung
  const versatz = size / 2 - 256 * s
  const x = (wert) => wert * s + versatz
  const y = (wert) => wert * s + versatz

  const mitte = { x: x(256), y: y(274) }
  const radius = 148 * s
  const ringStaerke = 30 * s
  const handStaerke = 22 * s
  const knopf = { x1: x(216), y1: y(56), x2: x(296), y2: y(96), r: 20 * s }

  const knopfMitte = { x: (knopf.x1 + knopf.x2) / 2, y: (knopf.y1 + knopf.y2) / 2 }
  const knopfHalb = { x: (knopf.x2 - knopf.x1) / 2, y: (knopf.y2 - knopf.y1) / 2 }

  return (x, y) => {
    const px = x + 0.5
    const py = y + 0.5

    const distanzRing = Math.abs(Math.hypot(px - mitte.x, py - mitte.y) - radius) - ringStaerke / 2
    const distanzHand =
      abstandSegment(px, py, mitte.x, mitte.y, mitte.x, mitte.y - radius * 0.62) - handStaerke / 2

    const dx = Math.abs(px - knopfMitte.x) - knopfHalb.x + knopf.r
    const dy = Math.abs(py - knopfMitte.y) - knopfHalb.y + knopf.r
    const distanzKnopf =
      Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - knopf.r

    let farbe = [...HINTERGRUND, 255]
    farbe = mische(farbe, AKZENT, deckung(distanzRing))
    farbe = mische(farbe, WEISS, deckung(distanzHand))
    farbe = mische(farbe, AKZENT, deckung(distanzKnopf))
    return farbe
  }
}

mkdirSync(ZIEL, { recursive: true })

for (const [name, size, skalierung] of [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.72],
  ['apple-touch-icon.png', 180, 1],
  ['favicon-32.png', 32, 0.92],
]) {
  writeFileSync(join(ZIEL, name), pngBreite(size, zeichne(size, skalierung)))
  console.log(`geschrieben: public/icons/${name}`)
}
