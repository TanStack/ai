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
  /**
   * Tool-result ops buffered from `onAfterToolCall` until `onFinish`. Flushed
   * inside `persistTurn` AFTER the per-turn `shouldRemember` gate passes —
   * returning `false` from `shouldRemember` short-circuits both base records,
   * `extractMemories`, AND these tool-result ops, matching the documented
   * "short-circuits the entire persist path for the current turn" contract.
   */
  pendingToolOps: Array<MemoryOp>
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
        pendingToolOps: [],
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
          query: preview(state.lastUserText),
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
        } catch (parseError) {
          // Tool-args JSON parse failure: the engine yielded malformed
          // tool-call arguments. We still want `onToolResult` to run with the
          // result it has — but observers MUST see this as a real failure
          // because callers receive `args: {}` regardless of what the model
          // actually sent. Fire `memory:error` (phase: 'extract') and route
          // through `events.onError` so the failure isn't silent.
          //
          // Intentionally NOT rethrowing on strict: the malformed payload is
          // an engine/provider bug, not a memory failure, and rethrowing here
          // would also cause the outer `onAfterToolCall` catch to emit a
          // second `phase: 'extract'` event for the same root cause. Falling
          // back to `parsedArgs = {}` lets `onToolResult` still derive a
          // record from `result`, which is the more useful signal anyway.
          parsedArgs = {}
          safeEmit('memory:error', {
            scope,
            phase: 'extract',
            error: errorInfo(parseError),
            timestamp: Date.now(),
          })
          await emitError(options, scope, 'extract', parseError)
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
        // Buffer the tool-result ops for the per-turn `shouldRemember` gate
        // inside `persistTurn`. Per the JSDoc contract on `shouldRemember`,
        // returning `false` short-circuits the ENTIRE persist path for the
        // current turn — including tool-result memories. Persist then flushes
        // these buffered ops in a single observed round at finish-turn time
        // alongside base records and `extractMemories` output.
        state.pendingToolOps.push(...normalizeOps(out))
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
      // Snapshot tool-result ops buffered by `onAfterToolCall` so they can be
      // gated by `shouldRemember` and flushed in the same observed persist
      // round as base records + `extractMemories` output.
      const pendingToolOps = state.pendingToolOps
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
          pendingToolOps,
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
 *
 * **Scope is enforced on add.** The resolved scope overrides whatever scope
 * the user-supplied record carried. A buggy or hostile `extractMemories` /
 * `onToolResult` callback cannot write into another tenant's bucket — the
 * record's scope is silently corrected to the resolved scope before
 * `adapter.add`. Update and delete already take `scope` as an explicit
 * parameter, so they're isolated by the adapter's own `scopeMatches` check.
 */
async function applyOps(
  options: MemoryMiddlewareOptions,
  scope: MemoryScope,
  ops: Array<MemoryOp>,
): Promise<Array<MemoryRecord>> {
  const newRecords: Array<MemoryRecord> = []
  for (const op of ops) {
    if (op.op === 'add') {
      // Force the resolved scope onto user-supplied records to prevent a
      // buggy extractMemories / onToolResult callback from writing into
      // another tenant. This is defence-in-depth: the contract docs already
      // promise tenant isolation, but enforcing it here means a single
      // mistaken `scope: { tenantId: 'wrong' }` in a callback cannot breach
      // the boundary.
      const record: MemoryRecord = { ...op.record, scope }
      await options.adapter.add(record)
      newRecords.push(record)
    } else if (op.op === 'update') {
      await options.adapter.update(op.id, scope, op.patch)
    } else {
      await options.adapter.delete([op.id], scope)
    }
  }
  return newRecords
}

/**
 * Run a persist batch with the full observability pipeline:
 *   1. Emit `memory:persist:started` (skipped when there are no `add` ops, to
 *      avoid noise on update-only / delete-only batches).
 *   2. Fire `events.onPersistStart` with the to-be-added records.
 *   3. Apply ops via `applyOps`.
 *   4. Emit `memory:persist:completed`.
 *   5. Fire `events.onPersistEnd` with the actually-added records.
 *   6. Call `options.afterPersist` with the newly-added records.
 *
 * Used by BOTH finish-turn persistence (via `persistTurn`) and `onToolResult`
 * deferred persistence so that observability is symmetric across the two
 * paths — `afterPersist` and the persist devtools events fire for every
 * `adapter.add` commit, not just the finish-turn one.
 *
 * Adapter failures surface via `memory:error` + `events.onError` and (in
 * strict mode) re-throw so a deferred persist promise rejects rather than
 * being silently swallowed by the chat engine's `Promise.allSettled`.
 */
async function runObservedPersist(
  options: MemoryMiddlewareOptions,
  scope: MemoryScope,
  ops: Array<MemoryOp>,
): Promise<Array<MemoryRecord>> {
  if (ops.length === 0) return []
  const startedAt = Date.now()
  const adds = ops.filter(
    (o): o is Extract<MemoryOp, { op: 'add' }> => o.op === 'add',
  )
  // Only emit persist:started when there's at least one add. Update-only or
  // delete-only batches don't represent a new write that observers care about.
  if (adds.length > 0) {
    safeEmit('memory:persist:started', {
      scope,
      records: adds.map((o) => {
        const r = o.record
        return {
          id: r.id,
          kind: r.kind,
          role: r.role,
          preview: preview(r.text),
        }
      }),
      timestamp: startedAt,
    })
    await options.events?.onPersistStart?.({
      scope,
      records: adds.map((o) => o.record),
    })
  }
  let newRecords: Array<MemoryRecord> = []
  try {
    newRecords = await applyOps(options, scope, ops)
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
  if (adds.length > 0) {
    safeEmit('memory:persist:completed', {
      scope,
      recordIds: newRecords.map((r) => r.id),
      durationMs: Date.now() - startedAt,
      timestamp: Date.now(),
    })
    await options.events?.onPersistEnd?.({ scope, records: newRecords })
  }
  if (options.afterPersist && newRecords.length > 0) {
    try {
      await options.afterPersist({
        newRecords,
        scope,
        adapter: options.adapter,
      })
    } catch (error) {
      // afterPersist is documented as background work — surface failures via
      // the same plumbing as adapter failures so they aren't swallowed, but
      // route through phase: 'persist' since it's part of the persist arc.
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
  return newRecords
}

async function persistTurn(args: {
  options: MemoryMiddlewareOptions
  scope: MemoryScope
  userText: string
  userEmbedding?: Array<number>
  responseText: string
  retrievedMemoryIds: Array<string>
  /**
   * Tool-result ops buffered by `onAfterToolCall` during the turn. Flushed
   * AFTER the `shouldRemember` gate passes so a `false` return short-circuits
   * tool-result memories along with base records and `extractMemories`.
   */
  pendingToolOps: Array<MemoryOp>
}): Promise<void> {
  const { options, scope } = args
  // Hoisted out of the try block so the outer catch can read them when
  // deciding whether the thrown value is the strict-mode extract re-throw
  // (already-emitted, must not double-emit).
  let extractError: unknown
  let extractFailed = false
  // OUTERMOST try/catch so any throw — extract, persist, afterPersist —
  // routes through the same error plumbing and (in strict mode) rejects the
  // deferred promise via the engine's `Promise.allSettled` collector.
  try {
    const now = Date.now()

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
      // The assistant-side embedder call lives OUTSIDE `runObservedPersist`,
      // so a throw here would bypass the persist-phase observability if it
      // escaped uncaught. Wrap it locally and route failures through the same
      // `memory:error` + `events.onError` plumbing as every other site.
      // Mirrors the user-text embedder catch in `onConfig`'s retrieval block.
      // In strict mode we rethrow so the outer catch turns it into a deferred
      // persist rejection. In non-strict mode we continue with
      // `embedding: undefined` so the assistant record still lands.
      let assistantEmbedding: Array<number> | undefined
      if (options.embedder) {
        try {
          assistantEmbedding = await options.embedder.embed(args.responseText)
        } catch (error) {
          safeEmit('memory:error', {
            scope,
            phase: 'persist',
            error: errorInfo(error),
            timestamp: Date.now(),
          })
          await emitError(options, scope, 'persist', error)
          if (options.strict) throw error
          // Non-strict: leave `assistantEmbedding` undefined and continue.
        }
      }
      baseRecords.push({
        id: crypto.randomUUID(),
        scope,
        text: args.responseText,
        kind: 'message',
        role: 'assistant',
        createdAt: now,
        importance: 0.4,
        embedding: assistantEmbedding,
        metadata: { retrievedMemoryIds: args.retrievedMemoryIds },
      })
    }

    // Op ordering is intentional and documented:
    //   1. base records (user, assistant) — always first
    //   2. extractMemories output — appended after base
    //   3. pendingToolOps — appended last
    // `applyOps` dispatches in array order (see its JSDoc for why ordering
    // matters), so `[{add X}, {update X}]` from extractMemories will see the
    // base records already committed, and tool-result ops referring to ids
    // that extractMemories created will be applied last.
    let ops: Array<MemoryOp> = baseRecords.map((record) => ({
      op: 'add' as const,
      record,
    }))

    // Strict-mode `extractMemories` failure semantics:
    //   1. The error is emitted exactly ONCE via `memory:error`/`onError`
    //      with `phase: 'extract'` — the outer persist catch is suppressed
    //      below so it does not re-emit with `phase: 'persist'`.
    //   2. Base user/assistant records still land. We commit `applyOps` for
    //      the records already accumulated before re-throwing so an extract
    //      failure does not silently lose the conversation turn.
    //   3. In strict mode the original extract error is re-thrown AFTER
    //      `applyOps` commits, so the deferred persist promise rejects and
    //      the engine surfaces the failure through `Promise.allSettled`.
    //   4. In non-strict mode the error is swallowed after the single emit
    //      and persistence continues with the base records.
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
        extractFailed = true
        extractError = error
        safeEmit('memory:error', {
          scope,
          phase: 'extract',
          error: errorInfo(error),
          timestamp: Date.now(),
        })
        await emitError(options, scope, 'extract', error)
        // Intentionally NOT re-throwing here — see note (2)/(3) above. The
        // re-throw happens after `applyOps` so base records still persist.
      }
    }

    // Append tool-result ops (buffered from `onAfterToolCall`) AFTER the
    // shouldRemember gate has passed. This is what enforces the contract:
    // returning `false` from `shouldRemember` discards tool-result memories
    // along with base records and `extractMemories` output, since none of
    // them ever reach `runObservedPersist`.
    if (args.pendingToolOps.length > 0) {
      ops = ops.concat(args.pendingToolOps)
    }

    // `runObservedPersist` owns the persist:started/completed events, the
    // onPersistStart/onPersistEnd callbacks, afterPersist, and the
    // memory:error+strict rethrow on adapter failure. Letting it handle
    // strict-mode rethrows itself means the catch below ONLY has to deal
    // with the strict-mode extract rethrow (and a guard against double-
    // emitting memory:error for that case).
    await runObservedPersist(options, scope, ops)

    // Strict-mode extract failure: base records have now been committed via
    // `runObservedPersist`. Re-throw the original extract error so the
    // deferred persist promise rejects. The outer catch below recognises
    // this case and does NOT re-emit `memory:error` (it would otherwise
    // fire a second event with phase: 'persist' for the same failure).
    if (extractFailed && options.strict) throw extractError
  } catch (error) {
    // By the time we reach this catch, `memory:error` has ALREADY been
    // emitted at the source — either:
    //   (a) Strict-mode extract rethrow: the inner extract catch above
    //       emitted `phase: 'extract'`. The `extractFailed` /
    //       `extractError` hoisted state lets future maintainers verify
    //       at a glance that this branch is reachable.
    //   (b) Strict-mode adapter or afterPersist rethrow: emitted inside
    //       `runObservedPersist` with `phase: 'persist'` immediately
    //       before it threw.
    //   (c) Strict-mode assistant-side embedder rethrow: the local
    //       try/catch around the assistant embedder call above emitted
    //       `phase: 'persist'` before rethrowing.
    // Either way the event already fired with the correct phase; re-
    // emitting here would produce a duplicate event for the same failure.
    // So this catch is intentionally a pass-through in non-strict mode
    // and a rethrow-only path in strict mode.
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
    // Per `TextPart` in ../types.ts the text payload lives on `content`, not
    // `text`. Bare strings are still tolerated because a handful of adapters
    // pass them through in the content array. All other ContentPart kinds
    // (tool-call, tool-result, image, audio, …) yield '' so they don't
    // pollute the retrieval query or persisted record text.
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
