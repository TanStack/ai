import { aiEventClient } from '@tanstack/ai-event-client'
import { defaultRenderMemory } from './helpers'
import type {
  ChatMiddleware,
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
} from '../activities/chat/middleware/types'
import type { ModelMessage } from '../types'
import type {
  MemoryHit,
  MemoryMiddlewareOptions,
  MemoryOp,
  MemoryRecord,
  MemoryScope,
} from './types'

/**
 * Per-request scratch state. Keyed by `ChatMiddlewareContext` in a
 * module-level `WeakMap` so the SAME `memoryMiddleware()` factory output can
 * be safely shared across many concurrent `chat()` calls — each request gets
 * its own `MemoryRequestState`. Mirrors the OTEL middleware's pattern.
 */
interface MemoryRequestState {
  resolvedScope?: MemoryScope
  lastUserText: string
  lastUserEmbedding?: Array<number>
  retrievedHits: Array<MemoryHit>
}

const stateByCtx = new WeakMap<ChatMiddlewareContext, MemoryRequestState>()

/**
 * Server-side memory middleware. See docs/middlewares/memory.md and the
 * tanstack-ai-memory skill for usage.
 */
export function memoryMiddleware(
  options: MemoryMiddlewareOptions,
): ChatMiddleware {
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
    name: 'memory',

    async onConfig(ctx, config) {
      if (ctx.phase !== 'init') return

      // Allocate per-request state once at the init phase.
      const state: MemoryRequestState = {
        lastUserText: '',
        retrievedHits: [],
      }
      stateByCtx.set(ctx, state)

      const lastUser = findLastUserMessage(config.messages)
      state.lastUserText = getMessageText(lastUser)
      if (!state.lastUserText) return

      const scope = await resolveScope(ctx, state)

      if (options.shouldRetrieve) {
        const ok = await options.shouldRetrieve({
          userText: state.lastUserText,
          scope,
        })
        if (!ok) return
      }

      const startedAt = Date.now()
      try {
        safeEmit('memory:retrieve:started', {
          scope,
          query: state.lastUserText,
          topK: options.topK ?? 6,
          minScore: options.minScore ?? 0.15,
          embedderUsed: !!options.embedder,
          timestamp: startedAt,
        })
        await options.events?.onRetrieveStart?.({
          scope,
          query: state.lastUserText,
        })

        if (options.embedder) {
          state.lastUserEmbedding = await options.embedder.embed(
            state.lastUserText,
          )
        }

        state.retrievedHits = await searchAllPages(
          options,
          scope,
          state.lastUserText,
          state.lastUserEmbedding,
        )

        if (options.rerank && state.retrievedHits.length > 0) {
          state.retrievedHits = await options.rerank(state.retrievedHits, {
            scope,
            query: state.lastUserText,
            ctx,
          })
        }

        safeEmit('memory:retrieve:completed', {
          scope,
          hits: state.retrievedHits.map((h) => ({
            id: h.record.id,
            kind: h.record.kind,
            score: h.score,
            preview: preview(h.record.text),
          })),
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
        })
        await options.events?.onRetrieveEnd?.({
          scope,
          hits: state.retrievedHits,
        })
      } catch (error) {
        safeEmit('memory:error', {
          scope,
          phase: 'retrieve',
          error: errorInfo(error),
          timestamp: Date.now(),
        })
        await emitError(options, scope, 'retrieve', error)
        if (options.strict) throw error
        return
      }

      if (state.retrievedHits.length === 0) return

      const memoryPrompt =
        options.render?.(state.retrievedHits) ??
        defaultRenderMemory(state.retrievedHits)

      return {
        systemPrompts: [...config.systemPrompts, memoryPrompt],
      } satisfies Partial<ChatMiddlewareConfig>
    },

    async onAfterToolCall(ctx, info) {
      if (!options.onToolResult || !info.ok) return
      const state = stateByCtx.get(ctx)
      if (!state) return
      const scope = await resolveScope(ctx, state)
      try {
        let parsedArgs: unknown = {}
        try {
          const raw = info.toolCall.function.arguments
          if (typeof raw === 'string' && raw.length > 0) {
            parsedArgs = JSON.parse(raw)
          }
        } catch {
          parsedArgs = {}
        }
        const out = await options.onToolResult({
          toolName: info.toolName,
          toolCallId: info.toolCallId,
          args: parsedArgs,
          result: info.result,
          scope,
          adapter: options.adapter,
        })
        if (!out) return
        // Wrap the deferred write so adapter.add/update/delete failures emit
        // memory:error, fire events.onError, and (in strict mode) reject the
        // deferred promise — instead of being silently swallowed.
        ctx.defer(
          deferredApplyOps(options, scope, normalizeOps(out)).then(() => {}),
        )
      } catch (error) {
        // Errors from `onToolResult` itself (synchronous extraction failure)
        // — the persist phase is wrapped separately above.
        safeEmit('memory:error', {
          scope,
          phase: 'extract',
          error: errorInfo(error),
          timestamp: Date.now(),
        })
        await emitError(options, scope, 'extract', error)
        if (options.strict) throw error
      }
    },

    async onFinish(ctx, info) {
      const state = stateByCtx.get(ctx)
      if (!state) return
      const responseText = info.content
      if (!state.lastUserText && !responseText) {
        stateByCtx.delete(ctx)
        return
      }
      const scope = await resolveScope(ctx, state)
      const userText = state.lastUserText
      const userEmbedding = state.lastUserEmbedding
      const retrievedMemoryIds = state.retrievedHits.map((h) => h.record.id)
      // Done with state — drop the WeakMap entry now so the deferred work
      // below cannot accidentally observe stale fields. (The WeakMap would
      // GC the entry once `ctx` is dropped anyway; this is just defensive.)
      stateByCtx.delete(ctx)
      ctx.defer(
        persistTurn({
          options,
          scope,
          userText,
          userEmbedding,
          responseText,
          retrievedMemoryIds,
        }),
      )
    },
  }
}

// ===========================
// Internals
// ===========================

async function searchAllPages(
  options: MemoryMiddlewareOptions,
  scope: MemoryScope,
  text: string,
  embedding: Array<number> | undefined,
): Promise<Array<MemoryHit>> {
  const topK = options.topK ?? 6
  const minScore = options.minScore ?? 0.15
  const all: Array<MemoryHit> = []
  let cursor: string | undefined
  do {
    const page = await options.adapter.search({
      scope,
      text,
      embedding,
      topK,
      minScore,
      kinds: options.kinds,
      cursor,
    })
    all.push(...page.hits)
    cursor = page.nextCursor
    if (all.length >= topK) break
  } while (cursor)
  return all.slice(0, topK)
}

function normalizeOps(
  input: Array<MemoryOp> | Array<MemoryRecord>,
): Array<MemoryOp> {
  if (input.length === 0) return []
  const first = input[0]
  if (first && 'op' in first) return input as Array<MemoryOp>
  return (input as Array<MemoryRecord>).map((record) => ({
    op: 'add' as const,
    record,
  }))
}

/**
 * Apply ops in array order, dispatching each to the matching adapter method.
 *
 * **Order matters.** A previous implementation batched all `add` ops to the
 * end so they could be flushed in one `adapter.add(records[])` call; that
 * meant `[{add X}, {update X}]` silently no-op'd because the update fired
 * against an empty store before the add committed. Strict in-order dispatch
 * is correct at the cost of per-op round-trips. For high-throughput callers,
 * `afterPersist` is the right place to do bulk fan-out.
 */
async function applyOps(
  options: MemoryMiddlewareOptions,
  scope: MemoryScope,
  ops: Array<MemoryOp>,
): Promise<Array<MemoryRecord>> {
  const newRecords: Array<MemoryRecord> = []
  for (const op of ops) {
    if (op.op === 'add') {
      await options.adapter.add(op.record)
      newRecords.push(op.record)
    } else if (op.op === 'update') {
      await options.adapter.update(op.id, scope, op.patch)
    } else {
      await options.adapter.delete([op.id], scope)
    }
  }
  return newRecords
}

/**
 * Wrap `applyOps` so a deferred write surfaces failures via the same
 * devtools/events/strict-mode plumbing as the synchronous paths.
 *
 * Without this wrapper, a rejecting `ctx.defer(applyOps(...))` is collected
 * by `Promise.allSettled` in the chat engine — silently swallowed, with no
 * `memory:error` event and no `events.onError` call. That's a debuggability
 * cliff for adapter outages (e.g. a Redis blip).
 */
async function deferredApplyOps(
  options: MemoryMiddlewareOptions,
  scope: MemoryScope,
  ops: Array<MemoryOp>,
): Promise<Array<MemoryRecord>> {
  try {
    return await applyOps(options, scope, ops)
  } catch (error) {
    safeEmit('memory:error', {
      scope,
      phase: 'persist',
      error: errorInfo(error),
      timestamp: Date.now(),
    })
    await emitError(options, scope, 'persist', error)
    if (options.strict) throw error
    return []
  }
}

async function persistTurn(args: {
  options: MemoryMiddlewareOptions
  scope: MemoryScope
  userText: string
  userEmbedding?: Array<number>
  responseText: string
  retrievedMemoryIds: Array<string>
}): Promise<void> {
  const { options, scope } = args
  // OUTERMOST try/catch so any throw — extract, persist, afterPersist —
  // routes through the same error plumbing and (in strict mode) rejects the
  // deferred promise via the engine's `Promise.allSettled` collector.
  try {
    const now = Date.now()
    const startedAt = now

    // Per-turn `shouldRemember` gate. Per JSDoc: "Returning `false`
    // short-circuits `extractMemories` and the persist path for the current
    // turn." We evaluate ONCE here with the user message + responseText —
    // returning `false` skips both the base records and `extractMemories`.
    if (options.shouldRemember) {
      const keep = await options.shouldRemember({
        message: { role: 'user', content: args.userText },
        responseText: args.responseText,
      })
      if (!keep) return
    }

    const baseRecords: Array<MemoryRecord> = []
    if (args.userText) {
      baseRecords.push({
        id: crypto.randomUUID(),
        scope,
        text: args.userText,
        kind: 'message',
        role: 'user',
        createdAt: now,
        importance: 0.4,
        embedding: args.userEmbedding,
      })
    }
    if (args.responseText) {
      baseRecords.push({
        id: crypto.randomUUID(),
        scope,
        text: args.responseText,
        kind: 'message',
        role: 'assistant',
        createdAt: now,
        importance: 0.4,
        embedding: options.embedder
          ? await options.embedder.embed(args.responseText)
          : undefined,
        metadata: { retrievedMemoryIds: args.retrievedMemoryIds },
      })
    }

    let ops: Array<MemoryOp> = baseRecords.map((record) => ({
      op: 'add' as const,
      record,
    }))

    if (options.extractMemories) {
      try {
        const extras = await options.extractMemories({
          userText: args.userText,
          responseText: args.responseText,
          scope,
          adapter: options.adapter,
        })
        if (extras) ops = ops.concat(normalizeOps(extras))
      } catch (error) {
        safeEmit('memory:error', {
          scope,
          phase: 'extract',
          error: errorInfo(error),
          timestamp: Date.now(),
        })
        await emitError(options, scope, 'extract', error)
        if (options.strict) throw error
      }
    }

    safeEmit('memory:persist:started', {
      scope,
      records: ops
        .filter((o) => o.op === 'add')
        .map((o) => {
          const r = o.record
          return {
            id: r.id,
            kind: r.kind,
            role: r.role,
            preview: preview(r.text),
          }
        }),
      timestamp: Date.now(),
    })
    await options.events?.onPersistStart?.({
      scope,
      records: ops.filter((o) => o.op === 'add').map((o) => o.record),
    })

    const newRecords = await applyOps(options, scope, ops)

    safeEmit('memory:persist:completed', {
      scope,
      recordIds: newRecords.map((r) => r.id),
      durationMs: Date.now() - startedAt,
      timestamp: Date.now(),
    })
    await options.events?.onPersistEnd?.({ scope, records: newRecords })
    if (options.afterPersist) {
      await options.afterPersist({
        newRecords,
        scope,
        adapter: options.adapter,
      })
    }
  } catch (error) {
    safeEmit('memory:error', {
      scope,
      phase: 'persist',
      error: errorInfo(error),
      timestamp: Date.now(),
    })
    await emitError(options, scope, 'persist', error)
    if (options.strict) throw error
  }
}

async function emitError(
  options: MemoryMiddlewareOptions,
  scope: MemoryScope,
  phase: 'retrieve' | 'persist' | 'extract',
  error: unknown,
): Promise<void> {
  await options.events?.onError?.({ scope, phase, error })
}

/**
 * Extract a `{ name, message }` pair from an unknown thrown value. The
 * runtime can't trust `error` to be an `Error` instance (anything is throwable
 * in JS), so we narrow defensively and fall back to stringification.
 */
function errorInfo(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message }
  }
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    typeof (error as { name: unknown }).name === 'string'
  ) {
    return {
      name: (error as { name: string }).name,
      message: String((error as { message?: unknown }).message ?? error),
    }
  }
  return { name: 'Error', message: String(error) }
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

function preview(text: string, max = 200): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

/**
 * Defensive devtools emit. Devtools events should be fire-and-forget — if the
 * event client throws synchronously (misconfigured global, broken transport),
 * we swallow it so middleware behaviour never depends on devtools health.
 */
const safeEmit: typeof aiEventClient.emit = (...args) => {
  try {
    return aiEventClient.emit(...args)
  } catch {
    // ignored — telemetry failures must not affect chat behaviour
  }
}

function getMessageText(message?: ModelMessage): string {
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === 'string') return part
        if (
          typeof part === 'object' &&
          'text' in part &&
          typeof part.text === 'string'
        ) {
          return part.text
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}
