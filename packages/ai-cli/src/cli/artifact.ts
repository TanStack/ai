import { writeFile } from 'node:fs/promises'
import { CliError } from '../core/exit-codes'
import { emitBytes } from '../core/emit'

/** Bytes of a generated artifact plus the file extension to use by default. */
export interface Artifact {
  bytes: Uint8Array
  ext: string
  mimeType: string
}

/**
 * Resolve where an artifact should be written. Explicit `-o` wins; otherwise a
 * timestamped name in the cwd. `-o -` is handled by the caller (stdout).
 */
export function resolveOutputPath(
  command: string,
  ext: string,
  output: string | undefined,
  now: number,
): string {
  if (output && output !== '-') return output
  return `./ts-ai-${command}-${now}.${ext}`
}

/**
 * Persist an artifact. Returns the path written, or null when bytes were sent
 * to stdout (`-o -`).
 */
export async function writeArtifact(
  command: string,
  artifact: Artifact,
  output: string | undefined,
  now: number,
): Promise<string | null> {
  if (output === '-') {
    await emitBytes(artifact.bytes)
    return null
  }
  const path = resolveOutputPath(command, artifact.ext, output, now)
  try {
    await writeFile(path, artifact.bytes)
  } catch (cause) {
    throw new CliError('RUNTIME', `Failed to write artifact to "${path}".`, { cause })
  }
  return path
}

/** Fetch bytes from a generated-media URL. */
export async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new CliError('PROVIDER', `Failed to download artifact (${res.status}) from ${url}.`)
  }
  return new Uint8Array(await res.arrayBuffer())
}

/** Resolve a `{ url } | { b64Json }` media source into raw bytes. */
export async function mediaSourceToBytes(source: {
  url?: string
  b64Json?: string
}): Promise<Uint8Array> {
  if (source.b64Json) return new Uint8Array(Buffer.from(source.b64Json, 'base64'))
  if (source.url) return fetchBytes(source.url)
  throw new CliError('PROVIDER', 'Generated media has neither url nor b64Json.')
}
