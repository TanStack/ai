import type { Logger } from './types'

const DIR_OPTIONS = { depth: null, colors: true } as const

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
  const isNodeRuntime =
    typeof process !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- a partial process global (bundler shims) may lack versions
    typeof process.versions?.node === 'string'
  if (isNodeRuntime) {
    return 'dir'
  }
  return 'arg'
}

function stringifyMetaSafely(value: unknown): string {
  const seen = new WeakSet<object>()
  try {
    return JSON.stringify(
      value,
      (_key, entry: unknown) => {
        if (typeof entry === 'bigint') return entry.toString()
        if (entry instanceof Error) {
          return {
            name: entry.name,
            message: entry.message,
            stack: entry.stack,
          }
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
