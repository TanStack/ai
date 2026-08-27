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
  MemoryFact,
  MemoryScope,
  MemoryTurn,
  RecallResult,
  SaveReceipt,
} from './types'

export const MEMORY_STATE_EVENT = 'memory:state'

export interface MemoryStateEventValue {
  scope: MemoryScope
  adapter: string
  /** The recall query (last user text). */
  query: string
  /** Recall metrics for the operations timeline. */
  recall: {
    fragmentCount: number
    hasTools: boolean
    systemPromptChars: number
    durationMs: number
  }
  /** Live store snapshot, when the adapter supports `inspect`/`listFacts`. */
  snapshot?: {
    takenAt: string
    data: unknown
    facts: Array<MemoryFact>
  }
}

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
  /** Pending devtools transport chunk, injected once by the first `onChunk`. */
  stateChunk?: { emitted: boolean; value: MemoryStateEventValue }
}

const stateByCtx = new WeakMap<ChatMiddlewareContext, MemoryRequestState>()

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
      if (!state.lastUserText) return
      if (role === 'save-only') return

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
        safeEmit('memory:error', {
          // Only attach scope when resolve already succeeded; otherwise omit
          // (no empty-string / partial fake identity).
          ...(state.resolvedScope ? { scope: state.resolvedScope } : {}),
          adapter: options.adapter.id,
          phase: 'recall',
          error: errorInfo(error),
          timestamp: Date.now(),
        })
        return
      }

      const tools = result.tools ?? []
      const recallMetrics = {
        fragmentCount: result.fragments?.length ?? 0,
        hasTools: tools.length > 0,
        systemPromptChars: result.systemPrompt.length,
        durationMs: Date.now() - startedAt,
      }
      safeEmit('memory:retrieve:completed', {
        scope,
        adapter: options.adapter.id,
        ...recallMetrics,
        timestamp: Date.now(),
      })
      await options.onRecall?.({ scope, query: state.lastUserText, result })

      const snapshot = await gatherSnapshot(options.adapter, scope)
      state.stateChunk = {
        emitted: false,
        value: {
          scope,
          adapter: options.adapter.id,
          query: state.lastUserText,
          recall: recallMetrics,
          ...(snapshot ? { snapshot } : {}),
        },
      }

      const memoryPrompts = [result.toolGuidance ?? '', result.systemPrompt]
      const additions = memoryPrompts.filter((p) => p.length > 0)
      const nothingToAdd = additions.length === 0 && tools.length === 0
      if (nothingToAdd) return

      const existingToolNames = new Set(config.tools.map((tool) => tool.name))
      const extraTools = tools.filter(
        (tool) => !existingToolNames.has(tool.name),
      )

      return {
        systemPrompts: [...config.systemPrompts, ...additions],
        tools:
          extraTools.length > 0
            ? [...config.tools, ...extraTools]
            : config.tools,
      } satisfies Partial<ChatMiddlewareConfig>
    },

    onChunk(ctx, chunk) {
      const state = stateByCtx.get(ctx)
      if (!state?.stateChunk) return
      if (state.stateChunk.emitted) return
      state.stateChunk.emitted = true
      const custom: StreamChunk = {
        type: 'CUSTOM',
        name: MEMORY_STATE_EVENT,
        value: state.stateChunk.value,
        timestamp: Date.now(),
      }
      return [chunk, custom]
    },

    onFinish(ctx, info) {
      const state = stateByCtx.get(ctx)
      stateByCtx.delete(ctx)
      const userText =
        state?.lastUserText || getMessageText(findLastUserMessage(ctx.messages))
      const assistant = info.content
      if (!userText) return
      if (!assistant) return
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
          await emitSnapshot(options.adapter, resolved)
          await options.onSave?.({ scope: resolved, turn, receipts })
        })(),
      )
    },
  }
}

async function gatherSnapshot(
  adapter: MemoryAdapter,
  scope: MemoryScope,
): Promise<
  { takenAt: string; data: unknown; facts: Array<MemoryFact> } | undefined
> {
  if (!adapter.inspect) return undefined
  try {
    const snapshot = await adapter.inspect(scope)
    const facts = (await adapter.listFacts?.(scope)) ?? []
    return { takenAt: snapshot.takenAt, data: snapshot.data, facts }
  } catch {
    // ignored — introspection is best-effort telemetry.
    return undefined
  }
}

async function emitSnapshot(
  adapter: MemoryAdapter,
  scope: MemoryScope,
): Promise<void> {
  const snapshot = await gatherSnapshot(adapter, scope)
  if (!snapshot) return
  safeEmit('memory:snapshot', {
    scope,
    adapter: adapter.id,
    ...snapshot,
    timestamp: Date.now(),
  })
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
