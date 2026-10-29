import { deflateSync } from 'node:zlib'

/** Raw screen pixels, as robotjs captures them: blue, green, red, then one unused byte. */
export interface Bitmap {
  width: number
  height: number
  /** Bytes in one row. */
  byteWidth: number
  bytesPerPixel: number
  image: Uint8Array
}

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

// ponytail: zlib.crc32 needs Node 20.15. The package supports Node 18.
function crc32(bytes: Uint8Array) {
  let c = 0xffffffff
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  out.set(data, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

/**
 * Scale a bitmap to `width` x `height`, then encode it as an RGB PNG.
 *
 * Each output pixel is the average of the source pixels that it covers, so
 * small text stays readable.
 */
export function toPng(bitmap: Bitmap, width: number, height: number) {
  const { image, byteWidth, bytesPerPixel } = bitmap
  const rowLength = 1 + width * 3
  // Each row starts with filter byte 0, which Buffer.alloc already set.
  const rows = Buffer.alloc(rowLength * height)

  for (let ty = 0; ty < height; ty++) {
    const y0 = Math.floor((ty * bitmap.height) / height)
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * bitmap.height) / height))
    for (let tx = 0; tx < width; tx++) {
      const x0 = Math.floor((tx * bitmap.width) / width)
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * bitmap.width) / width))
      let red = 0
      let green = 0
      let blue = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * byteWidth + x * bytesPerPixel
          blue += image[i] ?? 0
          green += image[i + 1] ?? 0
          red += image[i + 2] ?? 0
        }
      }
      const count = (y1 - y0) * (x1 - x0)
      const o = ty * rowLength + 1 + tx * 3
      rows[o] = Math.round(red / count)
      rows[o + 1] = Math.round(green / count)
      rows[o + 2] = Math.round(blue / count)
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // 8 bits for each color
  header[9] = 2 // RGB
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', new Uint8Array()),
  ])
}
