import { aiEventClient } from '@tanstack/ai-event-client'
import type {
  ChatMiddleware,
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  ModelMessage,
  StreamChunk,
} from '@tanstack/ai'
import type {
  MemoryAdapter,
  MemoryScope,
  MemoryTurn,
  RecallResult,
  SaveReceipt,
} from './types'

/**
 * How the middleware participates in the run:
 * - `'recall+save'` (default): recall on init (inject prompt + tools), save on finish.
 * - `'save-only'`: skip recall entirely — persist the turn but never read/inject.
 */
export type MemoryMiddlewareRole = 'recall+save' | 'save-only'

export interface MemoryRecallInfo {
  scope: MemoryScope
  query: string
  result: RecallResult
}

export interface MemorySaveInfo {
  scope: MemoryScope
  turn: MemoryTurn
  receipts: Array<SaveReceipt>
}

export interface MemoryMiddlewareOptions {
  /** The memory backend to recall from / save to. */
  adapter: MemoryAdapter
  /**
   * Scope for every adapter call. The function form is the safer default for
   * multi-tenant apps: derive scope per request from trusted, server-validated
   * chat context — never from client input.
   */
  scope:
    | MemoryScope
    | ((ctx: ChatMiddlewareContext) => MemoryScope | Promise<MemoryScope>)
  /** Participation role. Defaults to `'recall+save'`. */
  role?: MemoryMiddlewareRole
  /** Fired after `recall` completes (post-injection), for app telemetry. */
  onRecall?: (info: MemoryRecallInfo) => void | Promise<void>
  /** Fired after the deferred `save` completes, for app telemetry. */
  onSave?: (info: MemorySaveInfo) => void | Promise<void>
}

/** Per-request scratch state, keyed by context in a module-level WeakMap so the
 *  same middleware instance is safe across concurrent `chat()` calls. */
interface MemoryRequestState {
  resolvedScope?: MemoryScope
  lastUserText: string
}

const stateByCtx = new WeakMap<ChatMiddlewareContext, MemoryRequestState>()

/**
 * Server-side memory middleware. Recalls relevant memory into the prompt before
 * the model runs, then defers `save` of the completed turn after it finishes.
 * All extraction/ranking/rendering lives in the adapter — this middleware only
 * wires `recall`/`save` into the chat lifecycle and emits devtools events.
 */
export function memoryMiddleware(
  options: MemoryMiddlewareOptions,
): ChatMiddleware {
  const role = options.role ?? 'recall+save'

  async function resolveScope(
    ctx: ChatMiddlewareContext,
    state: MemoryRequestState,
  ): Promise<MemoryScope> {
    if (state.resolvedScope) return state.resolvedScope
    state.resolvedScope =
      typeof options.scope === 'function'
        ? await options.scope(ctx)
        : options.scope
    return state.resolvedScope
  }

  return {
    name: `memory:${options.adapter.id}`,

    async onConfig(ctx, config) {
      if (ctx.phase !== 'init') return

      const state: MemoryRequestState = { lastUserText: '' }
      stateByCtx.set(ctx, state)

      state.lastUserText = getMessageText(findLastUserMessage(config.messages))
      if (!state.lastUserText || role === 'save-only') return

      const startedAt = Date.now()
      let scope: MemoryScope
      let result: RecallResult
      try {
        scope = await resolveScope(ctx, state)
        safeEmit('memory:retrieve:started', {
          scope,
          adapter: options.adapter.id,
          query: state.lastUserText,
          timestamp: startedAt,
        })
        result = await options.adapter.recall(scope, state.lastUserText)
      } catch (error) {
        const errScope = state.resolvedScope ?? emptyScope()
        safeEmit('memory:error', {
          scope: errScope,
          adapter: options.adapter.id,
          phase: 'recall',
          error: errorInfo(error),
          timestamp: Date.now(),
        })
        return
      }

      const tools = result.tools ?? []
      safeEmit('memory:retrieve:completed', {
        scope,
        adapter: options.adapter.id,
        fragmentCount: result.fragments?.length ?? 0,
        hasTools: tools.length > 0,
        systemPromptChars: result.systemPrompt.length,
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
      })
      await options.onRecall?.({ scope, query: state.lastUserText, result })

      const memoryPrompts = [result.toolGuidance ?? '', result.systemPrompt]
      const additions = memoryPrompts.filter((p) => p.length > 0)
      if (additions.length === 0 && tools.length === 0) return

      return {
        systemPrompts: [...config.systemPrompts, ...additions],
        tools: [...config.tools, ...tools],
      } satisfies Partial<ChatMiddlewareConfig>
    },

    onFinish(ctx, info) {
      const state = stateByCtx.get(ctx)
      stateByCtx.delete(ctx)
      const userText =
        state?.lastUserText || getMessageText(findLastUserMessage(ctx.messages))
      const assistant = info.content
      if (!userText || !assistant) return
      const scope = state?.resolvedScope

      ctx.defer(
        (async () => {
          // Resolve scope defensively — a throwing resolver must not escape the
          // terminal hook. Memory failures are always non-fatal + observable.
          let resolved: MemoryScope
          try {
            resolved =
              scope ?? (await resolveScope(ctx, { lastUserText: userText }))
          } catch (error) {
            safeEmit('memory:error', {
              scope: emptyScope(),
              adapter: options.adapter.id,
              phase: 'save',
              error: errorInfo(error),
              timestamp: Date.now(),
            })
            return
          }

          const turn: MemoryTurn = { user: userText, assistant }
          const startedAt = Date.now()
          safeEmit('memory:persist:started', {
            scope: resolved,
            adapter: options.adapter.id,
            timestamp: startedAt,
          })
          let receipts: Array<SaveReceipt>
          try {
            receipts = await options.adapter.save(resolved, turn)
          } catch (error) {
            receipts = [{ ok: false, error: String(error) }]
            safeEmit('memory:error', {
              scope: resolved,
              adapter: options.adapter.id,
              phase: 'save',
              error: errorInfo(error),
              timestamp: Date.now(),
            })
          }
          safeEmit('memory:persist:completed', {
            scope: resolved,
            adapter: options.adapter.id,
            receiptCount: receipts.length,
            okCount: receipts.filter((r) => r.ok).length,
            durationMs: Date.now() - startedAt,
            timestamp: Date.now(),
          })
          await options.onSave?.({ scope: resolved, turn, receipts })
        })(),
      )
    },
  }
}

/**
 * Compose multiple memory middlewares into one — useful for saving to (or
 * recalling from) more than one backend in a single run. `onConfig` results are
 * merged in order; every other hook fans out to each middleware.
 */
export function composeMemoryMiddleware(
  middlewares: Array<ChatMiddleware>,
): ChatMiddleware {
  return {
    name: 'memory:compose',

    async onConfig(ctx, config) {
      let current: ChatMiddlewareConfig = config
      let changed = false
      for (const middleware of middlewares) {
        const result = await middleware.onConfig?.(ctx, current)
        if (result != null) {
          current = { ...current, ...result }
          changed = true
        }
      }
      return changed ? current : undefined
    },

    async onChunk(ctx, chunk) {
      let chunks: Array<StreamChunk> = [chunk]
      for (const middleware of middlewares) {
        if (!middleware.onChunk) continue
        const next: Array<StreamChunk> = []
        for (const item of chunks) {
          const result = await middleware.onChunk(ctx, item)
          if (result === null) continue
          if (result === undefined) next.push(item)
          else if (Array.isArray(result)) next.push(...result)
          else next.push(result)
        }
        chunks = next
      }
      if (chunks.length === 0) return null
      if (chunks.length === 1) return chunks[0]
      return chunks
    },

    async onStart(ctx) {
      for (const m of middlewares) await m.onStart?.(ctx)
    },
    async onFinish(ctx, info) {
      for (const m of middlewares) await m.onFinish?.(ctx, info)
    },
    async onAbort(ctx, info) {
      for (const m of middlewares) await m.onAbort?.(ctx, info)
    },
    async onError(ctx, info) {
      for (const m of middlewares) await m.onError?.(ctx, info)
    },
  }
}

// ===========================
// Internals
// ===========================

function emptyScope(): MemoryScope {
  return { sessionId: '' }
}

function findLastUserMessage(
  messages: ReadonlyArray<ModelMessage>,
): ModelMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message && message.role === 'user') return message
  }
  return undefined
}

/**
 * Extract plain text from a `ModelMessage`. Text lives on `part.content` for
 * `TextPart`; bare strings in the content array are tolerated. All other
 * content kinds (tool-call, image, …) yield '' so they don't pollute the
 * recall query.
 */
function getMessageText(message?: ModelMessage): string {
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part.type === 'text' && typeof part.content === 'string') {
          return part.content
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function errorInfo(error: unknown): { name: string; message: string } {
  if (error instanceof Error)
    return { name: error.name, message: error.message }
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    typeof error.name === 'string'
  ) {
    return {
      name: error.name,
      message: String((error as { message?: unknown }).message ?? error),
    }
  }
  return { name: 'Error', message: String(error) }
}

/** Fire-and-forget devtools emit — telemetry failures must never affect chat. */
function safeEmit(...args: Parameters<typeof aiEventClient.emit>): void {
  try {
    aiEventClient.emit(...args)
  } catch {
    // ignored — telemetry must not affect chat behaviour
  }
}
