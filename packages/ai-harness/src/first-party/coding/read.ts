import { toolDefinition } from '@tanstack/ai'
import { toBase64 } from '../../media'
import { mimeTypeOf } from '../../media-ref'
import { isRecord } from '../../utils'
import { pathsOf, stringArg } from './backend'
import type { ContentPart } from '@tanstack/ai'
import type { ToolEnv } from './backend'

// The page limits stay inside the defaults of `boundToolOutput` (2000 lines,
// 50 KiB), so that plugin does not cut a page again.
const MAX_LINES = 2000
const MAX_PAGE_BYTES = 50 * 1024
const MAX_LINE_CHARS = 2000
// A NUL byte in this many first bytes marks a binary file.
const BINARY_CHECK_BYTES = 8 * 1024
// ponytail: media goes to the model as inline base64, and it stays in the
// transcript. Store it as harness media if big files make turns too large.
const MAX_MEDIA_BYTES = 5 * 1024 * 1024
const MAX_SUGGESTIONS = 3

// The first bytes of the files that go to the model as media parts. The
// bytes decide, not the extension: a Git LFS pointer named `x.png` is text.
const MEDIA = [
  { type: 'image', mimeType: 'image/png', signature: /^\x89PNG/ },
  { type: 'image', mimeType: 'image/jpeg', signature: /^\xff\xd8\xff/ },
  { type: 'image', mimeType: 'image/gif', signature: /^GIF8/ },
  { type: 'image', mimeType: 'image/webp', signature: /^RIFF[\s\S]{4}WEBP/ },
  { type: 'document', mimeType: 'application/pdf', signature: /^%PDF-/ },
] as const

// The default decoder drops a byte order mark, so the model does not see
// it. `edit_file` keeps the mark in the file.
const decoder = new TextDecoder()
const encoder = new TextEncoder()

/** The edit distance of `a` and `b`: the fewest one-character changes. */
function distance(a: string, b: string) {
  // `row[j]` is the distance of the first i characters of `a` and the first
  // j characters of `b`. Each pass over `a` makes the next row.
  let row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 0; i < a.length; i++) {
    let diagonal = i
    let left = i + 1
    row = row.map((above, j) => {
      if (j === 0) return left
      const cost = a[i] === b[j - 1] ? 0 : 1
      left = Math.min(above + 1, left + 1, diagonal + cost)
      diagonal = above
      return left
    })
  }
  return row.at(-1) ?? 0
}

/**
 * The error for a file that does not exist. It names up to 3 files in the
 * same folder with a similar name: the same name in other letter case, the
 * same name with another extension, or a name 2 or fewer changes away.
 */
async function notFound(env: ToolEnv, full: string) {
  const { dirname, join, parse } = pathsOf(env.backend)
  const folder = dirname(full)
  const wanted = parse(full).base.toLowerCase()
  const wantedStem = parse(wanted).name
  // A missing folder has no names to suggest.
  const entries = await env.backend.readdir(folder).catch(() => [])
  const similar = entries
    .filter((entry) => entry.type === 'file')
    .map((entry) => {
      const name = entry.name.toLowerCase()
      const isSameStem = parse(name).name === wantedStem
      return { name: entry.name, isSameStem, distance: distance(name, wanted) }
    })
    .filter((item) => item.isSameStem || item.distance <= 2)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_SUGGESTIONS)
    .map((item) => env.shown(join(folder, item.name)))
  const message = `File not found: ${env.shown(full)}.`
  return new Error(
    similar.length > 0
      ? `${message} Did you mean ${similar.join(', ')}?`
      : message,
  )
}

/** `line` with its number. A line over 2000 characters is cut. */
function numbered(lineNumber: number, line: string) {
  const isLong = line.length > MAX_LINE_CHARS
  const text = isLong
    ? `${line.slice(0, MAX_LINE_CHARS)}... [line cut: ${line.length - MAX_LINE_CHARS} more characters]`
    : line
  return `${lineNumber}\t${text}`
}

/**
 * The numbered lines from line `offset`, at most `limit` lines (2000 when
 * `limit` is not set) and 50 KiB. When the page shows fewer lines than were
 * asked for and the file goes on, a note says how to read the next page.
 */
function page(
  text: string,
  options: { path: string; offset: number; limit: number | undefined },
) {
  const { path, offset, limit } = options
  const lines = text.split('\n')
  // A final newline ends the last line. It does not start a new one.
  if (text.endsWith('\n')) lines.pop()
  const window = lines.slice(
    offset - 1,
    offset - 1 + Math.min(limit ?? MAX_LINES, MAX_LINES),
  )
  const shown: Array<string> = []
  let bytes = 0
  for (const [index, line] of window.entries()) {
    const row = numbered(offset + index, line)
    // One line is at most about 8 KB, so the first line always fits.
    bytes += encoder.encode(row).length + 1
    if (bytes > MAX_PAGE_BYTES) break
    shown.push(row)
  }
  if (shown.length === 0) {
    return `[No lines from line ${offset}. ${path} has ${lines.length} lines.]`
  }
  const last = offset + shown.length - 1
  const isCut = shown.length < (limit ?? Infinity) && last < lines.length
  if (!isCut) return shown.join('\n')
  return `${shown.join('\n')}\n\n[Showing lines ${offset}-${last} of ${lines.length}. Read more with offset ${last + 1}.]`
}

/**
 * `read_file`: numbered lines of a text file, a page at a time. An image
 * (PNG, JPEG, GIF, WebP) or a PDF comes back as a content part. A binary
 * file gets a short note, not its bytes. The text that `afterRead` hooks
 * return is added after the lines of a text file.
 */
export function readTools(env: ToolEnv) {
  return [
    toolDefinition({
      name: 'read_file',
      description:
        'Read a file in the workspace. Text comes back as lines numbered from 1, at most 2000 lines or 50 KiB a page. Use offset and limit to read other lines. Images (PNG, JPEG, GIF, WebP) and PDFs up to 5 MB come back as media.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          offset: { type: 'number', description: 'First line, from 1' },
          limit: { type: 'number', description: 'Most lines to read' },
        },
        required: ['path'],
      },
      replay: 'safe',
    }).server(async (args: unknown) => {
      const full = await env.reach(stringArg(args, 'path'), 'read_file', 'file')
      const offset =
        isRecord(args) && typeof args.offset === 'number'
          ? Math.max(1, args.offset)
          : 1
      const limit =
        isRecord(args) && typeof args.limit === 'number'
          ? args.limit
          : undefined
      return env.lock(full, async () => {
        const path = env.shown(full)
        if (!(await env.backend.stat(full))) throw await notFound(env, full)
        const bytes = await env.backend.readFile(full)
        const head = String.fromCharCode(...bytes.subarray(0, 12))
        const media = MEDIA.find((item) => item.signature.test(head))
        if (media) {
          if (bytes.length > MAX_MEDIA_BYTES) {
            const size = (bytes.length / 1024 / 1024).toFixed(1)
            throw new Error(
              `${path} is ${size} MB. read_file sends images and PDFs up to 5 MB.`,
            )
          }
          const part: ContentPart = {
            type: media.type,
            source: {
              type: 'data',
              value: toBase64(bytes),
              mimeType: media.mimeType,
            },
          }
          return [part]
        }
        if (bytes.subarray(0, BINARY_CHECK_BYTES).includes(0)) {
          const type = mimeTypeOf(full)
          const typeNote = type === undefined ? '' : `, ${type}`
          return `${path} is a binary file (${bytes.length} bytes${typeNote}). read_file shows text, images, and PDFs only.`
        }
        const text = decoder.decode(bytes)
        const parts = [page(text, { path, offset, limit })]
        const hooks = env.hooks()
        for (const hook of hooks) {
          const extra = await hook.afterRead?.(full)
          if (extra) parts.push(extra)
        }
        return parts.join('\n\n')
      })
    }),
  ]
}
