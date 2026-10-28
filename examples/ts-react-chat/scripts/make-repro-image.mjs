// One-off generator for the issue #363 repro image.
// Renders a fixed 3-digit secret number as black pixels on white.
// The number is impossible to guess (1/1000) and appears nowhere in any text
// the tool returns, so a model that genuinely *sees* the image can read it and
// a model that only received stringified JSON cannot. Writes the PNG to
// public/ and prints its base64 for embedding in the tool.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Keep this in sync with REPRO_SECRET in src/lib/image-tool-repro.ts
const SECRET = '473'
const CELL = 16 // px per font cell
const MARGIN = 24
const GAP = CELL // gap between digits

// 3x5 bitmap font for digits 0-9.
const FONT = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
}

const digits = [...SECRET]
const digitW = 3 * CELL
const digitH = 5 * CELL
const width = MARGIN * 2 + digits.length * digitW + (digits.length - 1) * GAP
const height = MARGIN * 2 + digitH

// White background, black digit pixels.
const px = new Uint8Array(width * height * 3).fill(255)
function setBlack(x, y) {
  const i = (y * width + x) * 3
  px[i] = 0
  px[i + 1] = 0
  px[i + 2] = 0
}

digits.forEach((d, di) => {
  const glyph = FONT[d]
  const originX = MARGIN + di * (digitW + GAP)
  for (let gy = 0; gy < 5; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      if (glyph[gy][gx] !== '1') continue
      for (let cy = 0; cy < CELL; cy++) {
        for (let cx = 0; cx < CELL; cx++) {
          setBlack(originX + gx * CELL + cx, MARGIN + gy * CELL + cy)
        }
      }
    }
  }
})

// Pack into PNG scanlines (filter byte 0 per row).
const raw = Buffer.alloc((width * 3 + 1) * height)
let o = 0
for (let y = 0; y < height; y++) {
  raw[o++] = 0
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3
    raw[o++] = px[i]
    raw[o++] = px[i + 1]
    raw[o++] = px[i + 2]
  }
}

// CRC32 (PNG chunks require it).
const crcTable = (() => {
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
  for (let i = 0; i < buf.length; i++)
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(width, 0)
ihdr.writeUInt32BE(height, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 2 // colour type: truecolour RGB
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])

const here = dirname(fileURLToPath(import.meta.url))
const outPath = join(here, '..', 'public', 'repro-secret.png')
writeFileSync(outPath, png)
console.log('Wrote', outPath, `(${png.length} bytes, secret=${SECRET})`)
console.log('BASE64_START')
console.log(png.toString('base64'))
console.log('BASE64_END')
