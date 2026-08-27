import type { DebugCategories, Logger } from './types'

export type ResolvedCategories = Required<DebugCategories>

const CATEGORY_EMOJI: Record<keyof ResolvedCategories, string> = {
  request: '📤',
  provider: '📥',
  output: '📨',
  middleware: '🧩',
  tools: '🔧',
  agentLoop: '🔁',
  config: '⚙️',
  errors: '❌',
  sandbox: '📦',
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

  /** Log sandbox internals (watcher, file events, hook dispatch). Chat-only. */
  sandbox(message: string, meta?: Record<string, unknown>): void {
    this.emit('debug', 'sandbox', message, meta)
  }

  /** Log an agent-loop iteration marker or phase transition. Chat-only. */
  agentLoop(message: string, meta?: Record<string, unknown>): void {
    this.emit('debug', 'agentLoop', message, meta)
  }

  /** Log a config transform returned by a middleware `onConfig` hook. Chat-only. */
  config(message: string, meta?: Record<string, unknown>): void {
    this.emit('debug', 'config', message, meta)
  }

  errors(message: string, meta?: Record<string, unknown>): void {
    this.emit('error', 'errors', message, meta)
  }

  /** Log outgoing request metadata before an adapter SDK call. */
  request(message: string, meta?: Record<string, unknown>): void {
    this.emit('debug', 'request', message, meta)
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (!this.categories.errors) return
    const prefixed = `⚠️ [tanstack-ai:warn] ⚠️ ${message}`
    try {
      this.logger.warn(prefixed, meta)
    } catch {
      // User-supplied logger threw; swallow so a broken logger never masks the
      // condition we were trying to surface.
    }
  }
}
