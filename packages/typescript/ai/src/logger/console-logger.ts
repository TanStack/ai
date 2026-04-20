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
 * When a `meta` object is supplied, the message is logged first and the meta
 * object is then printed via `console.dir(meta, { depth: null, colors: true })`
 * so deeply nested structures (e.g. provider chunk payloads with `usage`,
 * `output`, `reasoning`, `tools`) render in full instead of truncating to
 * `[Object]` / `[Array]`. On Node this produces a depth-unlimited inspect
 * dump; browsers present the object as an interactive tree (extra options
 * are ignored).
 *
 * This is the logger used when `debug` is enabled on any activity and no
 * custom `logger` is supplied via `debug: { logger }`.
 */
const DIR_OPTIONS = { depth: null, colors: true } as const

export class ConsoleLogger implements Logger {
  /** Log a debug-level message; forwards to `console.debug`. */
  debug(message: string, meta?: Record<string, unknown>): void {
    console.debug(message)
    if (meta !== undefined) console.dir(meta, DIR_OPTIONS)
  }

  /** Log an info-level message; forwards to `console.info`. */
  info(message: string, meta?: Record<string, unknown>): void {
    console.info(message)
    if (meta !== undefined) console.dir(meta, DIR_OPTIONS)
  }

  /** Log a warning-level message; forwards to `console.warn`. */
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(message)
    if (meta !== undefined) console.dir(meta, DIR_OPTIONS)
  }

  /** Log an error-level message; forwards to `console.error`. */
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(message)
    if (meta !== undefined) console.dir(meta, DIR_OPTIONS)
  }
}
