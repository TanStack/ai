import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'

/** The modelschemas error codes that mean "no document for this provider". */
const SKIP_CODES = new Set([
  'missing_connect',
  'no_endpoints',
  'unknown_provider',
])

/**
 * The reason a provider is skipped, or `undefined` when its document can be
 * used. Any other failure is an error, not a skip.
 */
export function docSkipReason(status: number, body: string) {
  if (status >= 200 && status < 300) return undefined
  try {
    const code: unknown = JSON.parse(body)?.error?.code
    return typeof code === 'string' && SKIP_CODES.has(code) ? code : undefined
  } catch {
    return undefined
  }
}

/** Every file under `dir` (dot directories included), by relative path. */
export async function readTree(dir: string) {
  const files: Record<string, string> = {}
  const entries = await readdir(dir, {
    recursive: true,
    withFileTypes: true,
  }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const path = join(entry.parentPath, entry.name)
    files[relative(dir, path)] = await readFile(path, 'utf8')
  }
  return files
}

export async function writeTree(dir: string, files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true })
    await writeFile(join(dir, path), text)
  }
}

/** The files that differ between the expected and the committed tree. */
export function diffFiles(
  expected: Record<string, string>,
  actual: Record<string, string>,
) {
  const changes: Array<{
    path: string
    kind: 'added' | 'changed' | 'removed'
  }> = []
  for (const [path, text] of Object.entries(expected)) {
    if (!(path in actual)) changes.push({ path, kind: 'added' })
    else if (actual[path] !== text) changes.push({ path, kind: 'changed' })
  }
  for (const path of Object.keys(actual)) {
    if (!(path in expected)) changes.push({ path, kind: 'removed' })
  }
  return changes
}
