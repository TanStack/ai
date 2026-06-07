import { CliError } from '../core/exit-codes'
import { COMMON_FLAGS } from '../manifest/manifest'
import type { CommandSpec, FlagSpec } from '../manifest/types'

/**
 * Coerce commander's raw (mostly-string) option bag into typed values per the
 * manifest: numbers parsed, `json` flags JSON-parsed, repeatable flags kept as
 * arrays. `--config` is intentionally left as a raw string (loaded later).
 */
export function coerceFlags(
  spec: CommandSpec,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const flags = [...COMMON_FLAGS, ...spec.flags]
  const byName = new Map(flags.map((f) => [f.name, f]))
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue
    const flag = byName.get(key)
    if (!flag) {
      out[key] = value
      continue
    }
    out[key] = coerceValue(flag, value)
  }
  return out
}

function coerceValue(flag: FlagSpec, value: unknown): unknown {
  // --config and --schema stay strings; loadJsonInput() handles the
  // file-vs-inline distinction and parsing at the handler.
  if (flag.name === 'config' || flag.name === 'schema') return value

  switch (flag.type) {
    case 'number': {
      const n = Number(value)
      if (Number.isNaN(n)) {
        throw new CliError('USAGE', `--${flag.name} must be a number, got "${String(value)}".`)
      }
      return n
    }
    case 'json':
      return parseJsonFlag(flag.name, value)
    case 'string[]':
      return Array.isArray(value) ? value : [value]
    case 'string':
    case 'boolean':
      return value
  }
}

function parseJsonFlag(name: string, value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch (cause) {
    throw new CliError('USAGE', `--${name} must be valid JSON.`, { cause })
  }
}
