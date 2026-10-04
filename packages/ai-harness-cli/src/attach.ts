import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { mediaPart, mimeTypeOf } from '@tanstack/ai-harness'
import type { ContentPart } from '@tanstack/ai'
import type {
  HarnessSession,
  MediaRecord,
  UserInput,
} from '@tanstack/ai-harness'

/**
 * An `@path` token: an `@` at the start of the text or after white space,
 * then a quoted path (`@"my cat.png"`) or the text up to the next white
 * space. The white space before the `@` is part of the match, so it goes
 * out of the text with the token.
 */
const TOKEN = /(^|\s)@(?:"([^"]+)"|(\S+))/g

/** The path of a token. One of the two groups always matches. */
function pathOf(token: RegExpExecArray) {
  return token[2] ?? token[3] ?? ''
}

/**
 * The file that `path` names, when it is a readable regular file, else
 * `undefined`. A file with an extension that `mimeTypeOf` does not know
 * throws.
 */
async function readToken(path: string, cwd: string) {
  const file = resolve(cwd, path)
  const info = await stat(file).catch(() => undefined)
  if (!info?.isFile()) return undefined
  const name = basename(file)
  const mimeType = mimeTypeOf(name)
  if (mimeType === undefined) {
    throw new Error(
      `Cannot attach ${name}: the file type is not known. To send the path as text, remove the @.`,
    )
  }
  // ponytail: reads the whole file, and the store refuses it after that when
  // it is over `media.maxBytes`. Stream it when big local files matter.
  const bytes = await readFile(file).catch(() => undefined)
  return bytes === undefined ? undefined : { bytes, mimeType, name }
}

/**
 * The message for `text`, with each `@path` token that names a file sent as
 * a stored media part. The token goes out of the text. Any other `@` stays
 * as typed: `me@acme.dev`, `@types/node`, or a path with no file. Returns
 * `text` as it is when no token names a file.
 *
 * Throws for a file of a type it does not know, before it stores a file.
 * `putMedia` throws a `MediaError` for a file over `media.maxBytes`, or of a
 * kind that the harness does not take. The message does not go then.
 */
export async function attach(
  session: HarnessSession,
  text: string,
  options: { cwd: string },
) {
  const tokens = [...text.matchAll(TOKEN)]
  // Read every file first, so a bad file stops the send before a store.
  const files = await Promise.all(
    tokens.map((token) => readToken(pathOf(token), options.cwd)),
  )
  if (files.every((file) => file === undefined)) return text

  const media: Array<ContentPart> = []
  let rest = ''
  let end = 0
  for (const [index, token] of tokens.entries()) {
    const file = files[index]
    if (file === undefined) continue
    rest += text.slice(end, token.index)
    end = token.index + token[0].length
    const record = await session.putMedia(file.bytes, {
      mimeType: file.mimeType,
      name: file.name,
    })
    media.push(mediaPart(record))
  }
  const content = `${rest}${text.slice(end)}`.trim()
  const input: UserInput =
    content === '' ? media : [{ type: 'text', content }, ...media]
  return input
}

function isTaken(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST'
}

/**
 * Write the bytes of a media file into `dir`, and return the path. The file
 * gets the name of the record, with `-1`, `-2`, ... before the extension
 * when that name is taken. It never overwrites a file. A name with a folder
 * in it (`/`, `\`, a drive `:`), `.`, or `..` is refused, because a name can
 * come from an upload.
 */
export async function saveMedia(
  session: HarnessSession,
  record: Pick<MediaRecord, 'id' | 'name'>,
  dir: string,
) {
  const { name } = record
  const isPlainName =
    name !== '' && name !== '.' && name !== '..' && !/[\\/:]/.test(name)
  if (!isPlainName) {
    throw new Error(
      `Cannot save ${JSON.stringify(name)}: it is not a plain file name.`,
    )
  }
  const bytes = await session.loadMedia(record.id)
  await mkdir(dir, { recursive: true })
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''
  for (let count = 0; ; count += 1) {
    const path = join(dir, count === 0 ? name : `${stem}-${count}${extension}`)
    try {
      // `wx` fails when the file is there, so a file is never overwritten.
      await writeFile(path, bytes, { flag: 'wx' })
      return path
    } catch (error) {
      if (!isTaken(error)) throw error
    }
  }
}

/**
 * Save a media file with `saveMedia`, and get the line that says where it
 * went, or why it was not saved. It does not throw.
 */
export async function saveMediaLine(
  session: HarnessSession,
  record: Pick<MediaRecord, 'id' | 'name' | 'kind'>,
  dir: string,
) {
  try {
    const path = await saveMedia(session, record, dir)
    return { path, text: `[${record.kind} saved: ${path}]` }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { text: `[${record.kind} not saved: ${reason}]` }
  }
}

/**
 * The default media folder of a harness, relative to the working folder:
 * the name as a safe folder name, then `-media`. `acme/coder` saves into
 * `acme-coder-media`.
 */
export function defaultMediaDir(harnessName: string) {
  const safe = harnessName.replace(/[^\w.-]+/g, '-').replace(/^[-.]+|-+$/g, '')
  return `${safe || 'harness'}-media`
}
