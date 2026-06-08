import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { CliError } from './exit-codes'

let stdinBufferCache: Buffer | undefined

/**
 * Read all of stdin as raw bytes. Returns an empty buffer on an interactive TTY.
 * Memoized: stdin can only be drained once, so a later consumer (e.g.
 * `--attachment -` after the prompt was read from stdin) gets the same bytes.
 */
async function readStdinBuffer(): Promise<Buffer> {
  if (process.stdin.isTTY) return Buffer.alloc(0)
  if (stdinBufferCache !== undefined) return stdinBufferCache
  const chunks: Array<Buffer> = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer)
  }
  stdinBufferCache = Buffer.concat(chunks)
  return stdinBufferCache
}

/** Read all of stdin as a UTF-8 string (for text prompts). */
export async function readStdin(): Promise<string> {
  return (await readStdinBuffer()).toString('utf8')
}

/** Read all of stdin as raw bytes (for binary attachments — no text decoding). */
export async function readStdinBytes(): Promise<Buffer> {
  return readStdinBuffer()
}

/**
 * Resolve the prompt for a command.
 *
 * Positional args win; stdin is read ONLY when no positional prompt is given.
 * Reading stdin unconditionally would block whenever a harness leaves an open
 * (non-TTY) stdin pipe attached, so the positional case must never touch it.
 */
export async function resolvePrompt(
  positional: Array<string>,
  options: { required?: boolean } = {},
): Promise<string> {
  const fromArgs = positional.join(' ').trim()
  if (fromArgs) return fromArgs

  const fromStdin = (await readStdin()).trim()
  if (!fromStdin && options.required) {
    throw new CliError(
      'USAGE',
      'No prompt provided. Pass it as arguments or pipe via stdin.',
    )
  }
  return fromStdin
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
}

export interface LoadedAttachment {
  path: string
  mimeType: string
  /** Base64-encoded bytes. */
  data: string
}

/** Infer a MIME type from a file extension, defaulting to octet-stream. */
export function inferMimeType(path: string): string {
  return MIME_BY_EXT[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

/** Load `--attachment` files into base64 + inferred mime. `-` reads stdin. */
export async function loadAttachments(
  paths: Array<string>,
): Promise<Array<LoadedAttachment>> {
  const out: Array<LoadedAttachment> = []
  for (const path of paths) {
    try {
      const buffer =
        path === '-' ? await readStdinBytes() : await readFile(path)
      out.push({
        path,
        mimeType:
          path === '-' ? 'application/octet-stream' : inferMimeType(path),
        data: buffer.toString('base64'),
      })
    } catch (cause) {
      throw new CliError('USAGE', `Cannot read attachment "${path}".`, {
        cause,
      })
    }
  }
  return out
}
