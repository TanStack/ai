import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { CliError } from '../core/exit-codes'
import { emitBytes } from '../core/emit'

/** Bytes of a generated artifact plus the file extension to use by default. */
export interface Artifact {
  bytes: Uint8Array
  ext: string
  mimeType: string
}

/** Where to write an artifact: an explicit full path and/or a target directory. */
export interface OutputTarget {
  /** `-o/--output`: explicit path ("-" = stdout). Wins over `outputDir`. */
  output?: string
  /** `--outputDir`: directory for the auto-generated filename. Defaults to cwd. */
  outputDir?: string
}

/**
 * Resolve where an artifact should be written. Precedence: an explicit
 * `--output` path wins; otherwise an auto-generated filename inside
 * `--outputDir` (default: the current directory). Cross-platform via node:path.
 * `-o -` is handled by the caller (stdout).
 */
export function resolveOutputPath(
  command: string,
  ext: string,
  target: OutputTarget,
  now: number,
): string {
  if (target.output && target.output !== '-') return target.output
  const dir = target.outputDir ?? '.'
  return join(dir, `ts-ai-${command}-${now}.${ext}`)
}

/**
 * Persist an artifact, creating the target directory if needed. Returns the
 * path written, or null when bytes were sent to stdout (`-o -`).
 */
export async function writeArtifact(
  command: string,
  artifact: Artifact,
  target: OutputTarget,
  now: number,
): Promise<string | null> {
  if (target.output === '-') {
    await emitBytes(artifact.bytes)
    return null
  }
  const path = resolveOutputPath(command, artifact.ext, target, now)
  try {
    const dir = dirname(path)
    if (dir && dir !== '.') await mkdir(dir, { recursive: true })
    await writeFile(path, artifact.bytes)
  } catch (cause) {
    throw new CliError('RUNTIME', `Failed to write artifact to "${path}".`, {
      cause,
    })
  }
  return path
}

/** Fetch bytes from a generated-media URL, with a timeout and normalized errors. */
export async function fetchBytes(url: string): Promise<Uint8Array> {
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === 'TimeoutError'
    throw new CliError(
      'PROVIDER',
      `Failed to download artifact from ${url}${timedOut ? ' (timed out)' : ''}.`,
      { cause },
    )
  }
  if (!res.ok) {
    throw new CliError(
      'PROVIDER',
      `Failed to download artifact (${res.status}) from ${url}.`,
    )
  }
  return new Uint8Array(await res.arrayBuffer())
}

/** Resolve a `{ url } | { b64Json }` media source into raw bytes. */
export async function mediaSourceToBytes(source: {
  url?: string
  b64Json?: string
}): Promise<Uint8Array> {
  if (source.b64Json)
    return new Uint8Array(Buffer.from(source.b64Json, 'base64'))
  if (source.url) return fetchBytes(source.url)
  throw new CliError('PROVIDER', 'Generated media has neither url nor b64Json.')
}
