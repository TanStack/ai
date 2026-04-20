import type { Logger } from './types'

/**
 * Default `Logger` implementation that routes each level to the matching
 * `console` method:
 *
 * - `debug` → `console.debug`
 * - `info` → `console.info`
 * - `warn` → `console.warn`
 * - `error` → `console.error`
 *
 * When a `meta` object is supplied, it is passed as the second argument to the
 * underlying `console` method. On Node we first run it through
 * `util.inspect({ depth: null })` so deeply nested structures (e.g. provider
 * chunk payloads with `usage`, `output`, `reasoning`, `tools`) render in full
 * instead of truncating to `[Object]` / `[Array]`. In browsers we pass the
 * object through so DevTools can render it interactively.
 *
 * This is the logger used when `debug` is enabled on any activity and no
 * custom `logger` is supplied via `debug: { logger }`.
 */

type InspectFn = (
  value: unknown,
  options: {
    depth: number | null
    colors: boolean
    breakLength: number
    maxArrayLength: number | null
    maxStringLength: number | null
  },
) => string

const isNode =
  typeof globalThis !== 'undefined' &&
  typeof (globalThis as { process?: { versions?: { node?: string } } })
    .process?.versions?.node === 'string'

let inspect: InspectFn | null = null
if (isNode) {
  try {
    // Hide the specifier from static bundler analysis so browser bundles
    // don't try to resolve `node:util` at build time.
    const specifier = 'node:util'
    const util = (await import(/* @vite-ignore */ specifier)) as {
      inspect: InspectFn
    }
    inspect = util.inspect
  } catch {
    inspect = null
  }
}

function format(meta: Record<string, unknown>): unknown {
  if (!inspect) return meta
  return inspect(meta, {
    depth: null,
    colors: true,
    breakLength: 120,
    maxArrayLength: null,
    maxStringLength: null,
  })
}

export class ConsoleLogger implements Logger {
  /** Log a debug-level message; forwards to `console.debug`. */
  debug(message: string, meta?: Record<string, unknown>): void {
    if (meta === undefined) console.debug(message)
    else console.debug(message, format(meta))
  }

  /** Log an info-level message; forwards to `console.info`. */
  info(message: string, meta?: Record<string, unknown>): void {
    if (meta === undefined) console.info(message)
    else console.info(message, format(meta))
  }

  /** Log a warning-level message; forwards to `console.warn`. */
  warn(message: string, meta?: Record<string, unknown>): void {
    if (meta === undefined) console.warn(message)
    else console.warn(message, format(meta))
  }

  /** Log an error-level message; forwards to `console.error`. */
  error(message: string, meta?: Record<string, unknown>): void {
    if (meta === undefined) console.error(message)
    else console.error(message, format(meta))
  }
}
