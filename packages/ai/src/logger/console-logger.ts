import type { Logger } from './types'

/**
 * `util.inspect` options used with `console.dir` on Node so deeply nested
 * structures (e.g. provider chunk payloads with `usage`, `output`,
 * `reasoning`, `tools`) render in full instead of truncating to
 * `[Object]` / `[Array]`.
 */
const DIR_OPTIONS = { depth: null, colors: true } as const

/**
 * How `meta` should be rendered on the current runtime:
 *
 * - `dir` — Node. `console.dir(meta, { depth: null, colors: true })` gives a
 *   depth-unlimited, colored inspect dump.
 * - `json` — Cloudflare Workers / workerd. workerd never forwards
 *   `console.dir` output to the terminal (with or without options), and its
 *   own inspect of extra console arguments truncates nested objects, so the
 *   payload is appended as circular-safe pretty-printed JSON instead.
 * - `arg` — everything else (browsers, Deno, Bun). `meta` is passed as an
 *   extra console argument: devtools keep collapsible object trees and the
 *   runtime's inspect handles circular references natively.
 */
type MetaStrategy = 'dir' | 'json' | 'arg'

function resolveMetaStrategy(): MetaStrategy {
  // workerd must be detected before the Node check: under the `nodejs_compat`
  // flag it emulates `process.versions.node`, but still drops `console.dir`.
  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- navigator is missing on Node < 21 despite the DOM lib typing it as always present
    if (globalThis.navigator?.userAgent === 'Cloudflare-Workers') return 'json'
  } catch {
    // A locked-down runtime with a throwing `userAgent` getter is not workerd;
    // fall through to the remaining checks rather than crash the log call.
  }
  if (
    typeof process !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- a partial process global (bundler shims) may lack versions
    typeof process.versions?.node === 'string'
  ) {
    return 'dir'
  }
  return 'arg'
}

/**
 * `JSON.stringify` hardened for debug payloads: circular references collapse
 * to `"[Circular]"`, `Error` instances expand to `name`/`message`/`stack`
 * (they would otherwise stringify to `{}`), and `bigint` values become
 * strings (they would otherwise throw). Never throws — falls back to
 * `String(value)` and, if even that coercion throws, a placeholder.
 */
function stringifyMetaSafely(value: unknown): string {
  const seen = new WeakSet<object>()
  try {
    return JSON.stringify(
      value,
      (_key, entry: unknown) => {
        if (typeof entry === 'bigint') return entry.toString()
        if (entry instanceof Error) {
          return { name: entry.name, message: entry.message, stack: entry.stack }
        }
        if (typeof entry === 'object' && entry !== null) {
          if (seen.has(entry)) return '[Circular]'
          seen.add(entry)
        }
        return entry
      },
      2,
    )
  } catch {
    try {
      return String(value)
    } catch {
      return '[Unserializable meta]'
    }
  }
}

/**
 * Default `Logger` implementation that routes each level to the matching
 * `console` method:
 *
 * - `debug` → `console.debug`
 * - `info` → `console.info`
 * - `warn` → `console.warn`
 * - `error` → `console.error`
 *
 * When a `meta` object is supplied it is rendered with the strategy that
 * actually surfaces it on the current runtime (see {@link MetaStrategy}):
 * depth-unlimited `console.dir` on Node, circular-safe JSON on Cloudflare
 * Workers, and an extra console argument everywhere else.
 *
 * This is the logger used when `debug` is enabled on any activity and no
 * custom `logger` is supplied via `debug: { logger }`.
 */
export class ConsoleLogger implements Logger {
  /** Log a debug-level message; forwards to `console.debug`. */
  debug(message: string, meta?: Record<string, unknown>): void {
    this.emit('debug', message, meta)
  }

  /** Log an info-level message; forwards to `console.info`. */
  info(message: string, meta?: Record<string, unknown>): void {
    this.emit('info', message, meta)
  }

  /** Log a warning-level message; forwards to `console.warn`. */
  warn(message: string, meta?: Record<string, unknown>): void {
    this.emit('warn', message, meta)
  }

  /** Log an error-level message; forwards to `console.error`. */
  error(message: string, meta?: Record<string, unknown>): void {
    this.emit('error', message, meta)
  }

  private emit(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    if (meta === undefined) {
      console[level](message)
      return
    }
    switch (resolveMetaStrategy()) {
      case 'dir':
        console[level](message)
        console.dir(meta, DIR_OPTIONS)
        break
      case 'json':
        console[level](`${message}\n${stringifyMetaSafely(meta)}`)
        break
      case 'arg':
        console[level](message, meta)
        break
    }
  }
}
