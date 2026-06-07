import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Load a conventional `.env` from the current working directory into
 * `process.env`. Existing env vars are never overridden, so real environment
 * values and `--apiKey` always win. Parsing is intentionally minimal:
 * `KEY=VALUE` lines, `#` comments, optional surrounding quotes.
 */
export function loadDotEnv(cwd: string = process.cwd()): void {
  const path = resolve(cwd, '.env')
  if (!existsSync(path)) return

  let contents: string
  try {
    contents = readFileSync(path, 'utf8')
  } catch {
    return
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    if (key in process.env) continue
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (value) process.env[key] = value
  }
}
