/**
 * A small tar writer for dockerode `container.putArchive`, so copying files
 * into a container needs no tar dependency.
 *
 * Each entry gets a POSIX ustar header. When a path or link target does not
 * fit a ustar field (over 100 bytes, or not plain ASCII), a PAX header with
 * the full value comes first.
 */
import { Readable } from 'node:stream'

/**
 * One archive entry. `path` is relative and `/`-separated. A file keeps only
 * the permission bits of `mode` (for example `0o644` or `0o755`).
 */
export type TarEntry =
  | { path: string; mode: number; data: Buffer }
  | { path: string; linkTarget: string }

/** One tar member: a file, a symlink, or a PAX header. */
type Member = {
  name: string
  type: '0' | '2' | 'x'
  mode: number
  linkTarget: string
  data: Buffer
}

const BLOCK = 512
/** The ustar name and linkname fields hold at most this many bytes. */
const NAME_BYTES = 100

/**
 * Stream `entries` as a tar archive. The stream pulls the next entry only when
 * it needs more bytes, so the archive is never all in memory. An error from
 * `entries` destroys the stream with that error.
 */
export function tarStream(
  entries: Iterable<TarEntry> | AsyncIterable<TarEntry>,
) {
  // One mtime for all entries: the time the stream was made.
  const mtime = Math.floor(Date.now() / 1000)
  async function* chunks() {
    for await (const entry of entries) {
      const member: Member =
        'data' in entry
          ? {
              name: entry.path,
              type: '0',
              mode: entry.mode & 0o777,
              linkTarget: '',
              data: entry.data,
            }
          : {
              name: entry.path,
              type: '2',
              mode: 0o777,
              linkTarget: entry.linkTarget,
              data: Buffer.alloc(0),
            }
      const pax = paxRecords(member)
      if (pax.length > 0) {
        yield* memberChunks(
          {
            name: 'PaxHeader',
            type: 'x',
            mode: 0o644,
            linkTarget: '',
            data: pax,
          },
          mtime,
        )
      }
      yield* memberChunks(member, mtime)
    }
    // Two zero blocks end the archive.
    yield Buffer.alloc(2 * BLOCK)
  }
  return Readable.from(chunks(), { objectMode: false })
}

/** A member's header, then its data, then zeros up to the next block. */
function* memberChunks(member: Member, mtime: number) {
  yield header(member, mtime)
  const size = member.data.length
  if (size === 0) return
  yield member.data
  const rest = size % BLOCK
  if (rest > 0) yield Buffer.alloc(BLOCK - rest)
}

function header(member: Member, mtime: number) {
  const block = Buffer.alloc(BLOCK)
  // A value that does not fit is cut here. Its PAX record has all of it.
  block.write(member.name, 0, NAME_BYTES)
  block.write(octal(member.mode, 8), 100)
  block.write(octal(0, 8), 108) // uid
  block.write(octal(0, 8), 116) // gid
  block.write(octal(member.data.length, 12), 124)
  block.write(octal(mtime, 12), 136)
  block.write(member.type, 156)
  block.write(member.linkTarget, 157, NAME_BYTES)
  block.write('ustar', 257) // the magic is "ustar" and a NUL
  block.write('00', 263) // version
  // The checksum is the sum of all header bytes, with its own field read as
  // spaces. Tar writes it as six octal digits, a NUL, and a space.
  block.fill(' ', 148, 156)
  const sum = block.reduce((total, byte) => total + byte, 0)
  block.write(`${octal(sum, 7)}\0`, 148)
  return block
}

/** Zero-padded octal digits for a numeric field, with room for the NUL. */
function octal(value: number, fieldBytes: number) {
  const digits = value.toString(8).padStart(fieldBytes - 1, '0')
  // The 12-byte size field holds up to 8 GiB.
  if (digits.length >= fieldBytes) {
    throw new Error(`tar: ${value} does not fit a ${fieldBytes}-byte field`)
  }
  return digits
}

/** PAX records for a name or link target that a ustar field cannot hold. */
function paxRecords(member: Member) {
  let records = ''
  if (needsPax(member.name)) records += paxRecord('path', member.name)
  if (needsPax(member.linkTarget)) {
    records += paxRecord('linkpath', member.linkTarget)
  }
  return Buffer.from(records)
}

function needsPax(value: string) {
  const bytes = Buffer.byteLength(value)
  // A non-ASCII character takes more than one UTF-8 byte.
  return bytes > NAME_BYTES || bytes !== value.length
}

/** One PAX record: `<length> <key>=<value>\n`. The length counts itself. */
function paxRecord(key: string, value: string) {
  const body = ` ${key}=${value}\n`
  const bodyBytes = Buffer.byteLength(body)
  // Adding the length's own digits can add one more digit, so count twice.
  const guess = bodyBytes + String(bodyBytes).length
  const length = bodyBytes + String(guess).length
  return `${length}${body}`
}
