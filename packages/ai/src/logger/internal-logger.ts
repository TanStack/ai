import type { DebugCategories, Logger } from './types'

/**
 * Fully-resolved categories map. Every flag is a definite boolean (never
 * undefined), produced by `resolveDebugOption` from a `DebugOption`.
 */
export type ResolvedCategories = Required<DebugCategories>

/**
 * Package-internal logger wrapper used by every activity and adapter in
 * `@tanstack/ai`. Wraps a user-supplied (or default `ConsoleLogger`) `Logger`
 * plus a fully-resolved per-category map. Each category has a dedicated
 * method that no-ops when its flag is `false`, or prepends a
 * `[tanstack-ai:<category>] ` prefix and calls the underlying logger's
 * `error` (for the `errors` category) or `debug` (for everything else).
 *
 * Not exported from the package root. Adapter packages consume it via the
 * `@tanstack/ai/adapter-internals` subpath export.
 */
/**
 * Emoji marker per category — bracketing the `[tanstack-ai:<cat>]` tag on
 * both sides makes it trivial to visually pick out a category when scanning
 * dense streaming logs.
 */
const CATEGORY_EMOJI: Record<keyof ResolvedCategories, string> = {
  request: '📤',
  provider: '📥',
  output: '📨',
  middleware: '🧩',
  tools: '🔧',
  agentLoop: '🔁',
  config: '⚙️',
  errors: '❌',
}

export class InternalLogger {
  constructor(
    private readonly logger: Logger,
    private readonly categories: ResolvedCategories,
  ) {}

  /** Whether a category is enabled. Cheap, safe to call on hot paths. */
  isEnabled(category: keyof ResolvedCategories): boolean {
    return this.categories[category]
  }

  private emit(
    level: 'debug' | 'error',
    category: keyof ResolvedCategories,
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    if (!this.categories[category]) return
    const emoji = CATEGORY_EMOJI[category]
    const prefixed = `${emoji} [tanstack-ai:${category}] ${emoji} ${message}`
    try {
      if (level === 'error') this.logger.error(prefixed, meta)
      else this.logger.debug(prefixed, meta)
    } catch {
      // User-supplied logger threw; swallow so we never mask the original
      // error that triggered this log call.
    }
  }

  /** Log a raw chunk/frame received from a provider SDK. */
  provider(message: string, meta?: Record<string, unknown>): void {
    this.emit('debug', 'provider', message, meta)
  }

  /** Log a chunk/result yielded to the consumer after middleware. */
  output(message: string, meta?: Record<string, unknown>): void {
    this.emit('debug', 'output', message, meta)
  }

  /** Log inputs/outputs around a middleware hook invocation. Chat-only. */
  middleware(message: string, meta?: Record<string, unknown>): void {
    this.emit('debug', 'middleware', message, meta)
  }

  /** Log before/after a tool-call execution. Chat-only. */
  tools(message: string, meta?: Record<string, unknown>): void {
    this.emit('debug', 'tools', message, meta)
  }

  /** Log an agent-loop iteration marker or phase transition. Chat-only. */
  agentLoop(message: string, meta?: Record<string, unknown>): void {
    this.emit('debug', 'agentLoop', message, meta)
  }

  /** Log a config transform returned by a middleware `onConfig` hook. Chat-only. */
  config(message: string, meta?: Record<string, unknown>): void {
    this.emit('debug', 'config', message, meta)
  }

  /**
   * Log a caught error. Defaults to on even when `debug` is unspecified.
   * Uses the underlying logger's `error` level.
   */
  errors(message: string, meta?: Record<string, unknown>): void {
    this.emit('error', 'errors', message, meta)
  }

  /** Log outgoing request metadata before an adapter SDK call. */
  request(message: string, meta?: Record<string, unknown>): void {
    this.emit('debug', 'request', message, meta)
  }
}
