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
 * underlying `console` method (so modern dev-tools render it as a structured
 * object). When `meta` is omitted, the call is made with just the message
 * to avoid a trailing `undefined` argument.
 *
 * This is the logger used when `debug` is enabled on any activity and no
 * custom `logger` is supplied via `debug: { logger }`.
 */
export class ConsoleLogger implements Logger {
  /** Log a debug-level message; forwards to `console.debug`. */
  debug(message: string, meta?: Record<string, unknown>): void {
    if (meta === undefined) console.debug(message)
    else console.debug(message, meta)
  }

  /** Log an info-level message; forwards to `console.info`. */
  info(message: string, meta?: Record<string, unknown>): void {
    if (meta === undefined) console.info(message)
    else console.info(message, meta)
  }

  /** Log a warning-level message; forwards to `console.warn`. */
  warn(message: string, meta?: Record<string, unknown>): void {
    if (meta === undefined) console.warn(message)
    else console.warn(message, meta)
  }

  /** Log an error-level message; forwards to `console.error`. */
  error(message: string, meta?: Record<string, unknown>): void {
    if (meta === undefined) console.error(message)
    else console.error(message, meta)
  }
}
