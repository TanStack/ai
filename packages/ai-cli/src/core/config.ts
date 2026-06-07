import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { CliError } from './exit-codes'

/**
 * The `--config` value: either a path to a JSON file or an inline JSON string.
 * Its shape mirrors the resolved options object for the command; provider
 * specific options live under `modelOptions`.
 */
export function loadConfig(
  value: string | undefined,
): Promise<Record<string, unknown>> {
  return loadJsonInput(value, '--config')
}

/**
 * Load a JSON-object input that may be either an inline JSON string (starts with
 * `{`) or a path to a JSON file. Used by `--config` and `--schema`.
 */
export async function loadJsonInput(
  value: string | undefined,
  label: string,
): Promise<Record<string, unknown>> {
  if (!value) return {}

  const looksInline = value.trimStart().startsWith('{')
  let raw: string
  if (looksInline) {
    raw = value
  } else if (existsSync(value)) {
    raw = await readFile(value, 'utf8')
  } else {
    throw new CliError(
      'USAGE',
      `${label} "${value}" is neither inline JSON nor an existing file.`,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (cause) {
    throw new CliError('USAGE', `${label} is not valid JSON.`, { cause })
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new CliError('USAGE', `${label} must be a JSON object.`)
  }
  return parsed as Record<string, unknown>
}

/**
 * Merge resolved options with precedence flags > config > env-derived defaults.
 * `flags` are the values commander parsed (undefined when absent), `config` is
 * the parsed `--config` object. Undefined flag values never clobber config.
 */
export function mergeOptions(
  flags: Record<string, unknown>,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...config }
  for (const [key, value] of Object.entries(flags)) {
    if (value !== undefined) merged[key] = value
  }
  return merged
}
