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
 * Server-side memory middleware. See docs/middlewares/memory.md and the
 * tanstack-ai-memory skill for usage.
 */
export function memoryMiddleware(
  options: MemoryMiddlewareOptions,
): ChatMiddleware {
  // Per-request closure state. The chat engine creates one ChatMiddleware
  // instance per chat() call (no cross-request leakage).
  let resolvedScope: MemoryScope | undefined
  let lastUserText = ''
  let lastUserEmbedding: Array<number> | undefined
  let retrievedHits: Array<MemoryHit> = []

  async function resolveScope(
    ctx: ChatMiddlewareContext,
  ): Promise<MemoryScope> {
    if (resolvedScope) return resolvedScope
    resolvedScope =
      typeof options.scope === 'function'
        ? await options.scope(ctx)
        : options.scope
    return resolvedScope
  }

  return {
    name: 'memory',

    async onConfig(ctx, config) {
      if (ctx.phase !== 'init') return

      const lastUser = findLastUserMessage(config.messages)
      lastUserText = getMessageText(lastUser)
      if (!lastUserText) return

      const scope = await resolveScope(ctx)

      if (options.shouldRetrieve) {
        const ok = await options.shouldRetrieve({
          userText: lastUserText,
          scope,
        })
        if (!ok) return
      }

      const startedAt = Date.now()
      try {
        safeEmit('memory:retrieve:started', {
          scope,
          query: lastUserText,
          topK: options.topK ?? 6,
          minScore: options.minScore ?? 0.15,
          embedderUsed: !!options.embedder,
          timestamp: startedAt,
        })
        await options.events?.onRetrieveStart?.({
          scope,
          query: lastUserText,
        })

        if (options.embedder) {
          lastUserEmbedding = await options.embedder.embed(lastUserText)
        }

        retrievedHits = await searchAllPages(
          options,
          scope,
          lastUserText,
          lastUserEmbedding,
        )

        if (options.rerank && retrievedHits.length > 0) {
          retrievedHits = await options.rerank(retrievedHits, {
            scope,
            query: lastUserText,
            ctx,
          })
        }

        safeEmit('memory:retrieve:completed', {
          scope,
          hits: retrievedHits.map((h) => ({
            id: h.record.id,
            kind: h.record.kind,
            score: h.score,
            preview: preview(h.record.text),
          })),
          durationMs: Date.now() - startedAt,
          timestamp: Date.now(),
        })
        await options.events?.onRetrieveEnd?.({ scope, hits: retrievedHits })
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

      if (retrievedHits.length === 0) return

      const memoryPrompt =
        options.render?.(retrievedHits) ?? defaultRenderMemory(retrievedHits)

      return {
        systemPrompts: [...config.systemPrompts, memoryPrompt],
      } satisfies Partial<ChatMiddlewareConfig>
    },

    async onAfterToolCall(ctx, info) {
      if (!options.onToolResult || !info.ok) return
      const scope = await resolveScope(ctx)
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
        ctx.defer(applyOps(options, scope, normalizeOps(out)))
      } catch (error) {
        await emitError(options, scope, 'extract', error)
        if (options.strict) throw error
      }
    },

    async onFinish(ctx, info) {
      const responseText = info.content
      if (!lastUserText && !responseText) return
      const scope = await resolveScope(ctx)
      ctx.defer(
        persistTurn({
          options,
          scope,
          userText: lastUserText,
          userEmbedding: lastUserEmbedding,
          responseText,
          retrievedMemoryIds: retrievedHits.map((h) => h.record.id),
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

function normalizeOps(input: Array<MemoryOp> | Array<MemoryRecord>): Array<MemoryOp> {
  if (input.length === 0) return []
  const first = input[0]
  if (first && 'op' in first) return input as Array<MemoryOp>
  return (input as Array<MemoryRecord>).map((record) => ({
    op: 'add' as const,
    record,
  }))
}

async function applyOps(
  options: MemoryMiddlewareOptions,
  scope: MemoryScope,
  ops: Array<MemoryOp>,
): Promise<Array<MemoryRecord>> {
  const newRecords: Array<MemoryRecord> = []
  const adds: Array<MemoryRecord> = []
  for (const op of ops) {
    if (op.op === 'add') {
      adds.push(op.record)
      newRecords.push(op.record)
    } else if (op.op === 'update') {
      await options.adapter.update(op.id, scope, op.patch)
    } else {
      await options.adapter.delete([op.id], scope)
    }
  }
  if (adds.length > 0) await options.adapter.add(adds)
  return newRecords
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
  const now = Date.now()
  const startedAt = now
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

  // shouldRemember filter
  const filtered: Array<MemoryRecord> = []
  for (const record of baseRecords) {
    if (!options.shouldRemember) {
      filtered.push(record)
      continue
    }
    const keep = await options.shouldRemember({
      message: { role: record.role ?? 'assistant', content: record.text },
      responseText: args.responseText,
    })
    if (keep) filtered.push(record)
  }

  // extractMemories ops
  let ops: Array<MemoryOp> = filtered.map((record) => ({
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

  try {
    safeEmit('memory:persist:started', {
      scope,
      records: ops
        .filter((o) => o.op === 'add')
        .map((o) => {
          const r = (o).record
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
      records: ops
        .filter((o) => o.op === 'add')
        .map((o) => (o).record),
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
