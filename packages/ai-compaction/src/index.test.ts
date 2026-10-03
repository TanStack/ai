import { describe, expect, it, vi } from 'vitest'
import type {
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  MetadataStore,
  ModelMessage,
  TokenUsage,
  ToolCall,
} from '@tanstack/ai'
import { provideMetadata } from '@tanstack/ai'
import {
  COMPACTION_ENDED_EVENT,
  COMPACTION_STARTED_EVENT,
  COMPACTION_STATE_EVENT,
  clearToolResults,
  composeStrategies,
  estimateMessageTokens,
  evictOldest,
  summarizeOldest,
  withCompaction,
} from './index'
import { countFromUsage, hashMessages, memoryMetadata } from './usage-count'
import type { CompactionStrategy } from './index'

interface RecordedCustom {
  name: string
  value: Record<string, unknown>
}

function recordingContext(
  phase: ChatMiddlewareContext['phase'] = 'beforeModel',
  extras: Partial<ChatMiddlewareContext> = {},
): { ctx: ChatMiddlewareContext; events: Array<RecordedCustom> } {
  const events: Array<RecordedCustom> = []
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- focused hook stub
  const ctx = {
    phase,
    emitCustomEvent: (name: string, value: Record<string, unknown>) => {
      events.push({ name, value })
    },
    ...extras,
  } as unknown as ChatMiddlewareContext
  return { ctx, events }
}

function runOnConfig(
  mw: ReturnType<typeof withCompaction>,
  messages: Array<ModelMessage>,
  ctx: ChatMiddlewareContext = recordingContext().ctx,
) {
  const config: ChatMiddlewareConfig = {
    messages,
    systemPrompts: [],
    tools: [],
  }
  return mw.onConfig?.(ctx, config)
}

function checkpointContext(
  store: MetadataStore,
  options: { aborted?: boolean; phase?: ChatMiddlewareContext['phase'] } = {},
): ChatMiddlewareContext {
  const recorded = recordingContext(options.phase)
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- focused hook stub
  const ctx = {
    ...recorded.ctx,
    threadId: 'thread-1',
    signal: options.aborted ? AbortSignal.abort() : undefined,
    capabilities: { markProvided: () => undefined },
  } as unknown as ChatMiddlewareContext
  provideMetadata(ctx, store)
  return ctx
}

function memoryStore(): MetadataStore {
  const values = new Map<string, unknown>()
  return {
    get: async (namespace, key) => values.get(`${namespace}:${key}`) ?? null,
    set: async (namespace, key, value) => {
      values.set(`${namespace}:${key}`, value)
    },
    delete: async (namespace, key) => {
      values.delete(`${namespace}:${key}`)
    },
  }
}

function phaseContext(
  phase: ChatMiddlewareContext['phase'],
): ChatMiddlewareContext {
  return recordingContext(phase).ctx
}

const text = (role: ModelMessage['role'], content: string): ModelMessage => ({
  role,
  content,
})
// ~40 tokens each at chars/4.
const big = (role: ModelMessage['role']) => text(role, 'x'.repeat(160))

const call: ToolCall = {
  id: 't1',
  type: 'function',
  function: { name: 'f', arguments: '{}' },
}

describe('withCompaction', () => {
  it('passes through when under the token budget', async () => {
    const mw = withCompaction({ maxTokens: 1000 })
    const result = await runOnConfig(mw, [
      text('user', 'hi'),
      text('assistant', 'hello'),
    ])
    expect(result).toBeUndefined()
  })

  it('defaults to evictOldest', async () => {
    const mw = withCompaction({ maxTokens: 100 })
    const msgs = [big('user'), big('assistant'), big('user'), big('assistant')]
    const result = await runOnConfig(mw, msgs)
    const out = result?.providerMessages ?? []
    expect(out[0]?.content).toContain('omitted')
    expect(out[out.length - 1]).toBe(msgs[msgs.length - 1])
  })

  it('reports before/after token and message counts via onCompact', async () => {
    const onCompact = vi.fn()
    const mw = withCompaction({ maxTokens: 100, onCompact })
    await runOnConfig(mw, [
      big('user'),
      big('assistant'),
      big('user'),
      big('assistant'),
    ])
    expect(onCompact).toHaveBeenCalledOnce()
    const info = onCompact.mock.calls[0]?.[0]
    expect(info.after).toBeLessThan(info.before)
    expect(info.messagesAfter).toBeLessThan(info.messagesBefore)
  })

  it('emits started, state, and ended custom events when compacting', async () => {
    const mw = withCompaction({ maxTokens: 100 })
    const { ctx, events } = recordingContext('beforeModel')
    const msgs = [big('user'), big('assistant'), big('user'), big('assistant')]
    await runOnConfig(mw, msgs, ctx)
    expect(events.map((event) => event.name)).toEqual([
      COMPACTION_STARTED_EVENT,
      COMPACTION_STATE_EVENT,
      COMPACTION_ENDED_EVENT,
    ])
    const stateValue = events[1]?.value
    expect(stateValue).toMatchObject({
      reusedCheckpoint: false,
      maxTokens: 100,
    })
    expect(Array.isArray(stateValue?.dropped)).toBe(true)
    expect(Array.isArray(stateValue?.result)).toBe(true)
    expect(
      Array.isArray(stateValue?.dropped) ? stateValue.dropped.length : 0,
    ).toBeGreaterThan(0)
    expect(typeof events[2]?.value.durationMs).toBe('number')
  })

  it('emits started before summarizeOldest finishes', async () => {
    let release!: (summary: string) => void
    const gate = new Promise<string>((resolve) => {
      release = resolve
    })
    const mw = withCompaction({
      maxTokens: 100,
      strategy: summarizeOldest({ summarize: () => gate }),
    })
    const { ctx, events } = recordingContext('beforeModel')
    const pending = runOnConfig(
      mw,
      [big('user'), big('assistant'), big('user'), big('assistant')],
      ctx,
    )
    await vi.waitFor(() => {
      expect(events.map((event) => event.name)).toEqual([
        COMPACTION_STARTED_EVENT,
      ])
    })
    release('the gist')
    await pending
    expect(events.map((event) => event.name)).toEqual([
      COMPACTION_STARTED_EVENT,
      COMPACTION_STATE_EVENT,
      COMPACTION_ENDED_EVENT,
    ])
  })

  it('does not emit custom events when under the token budget', async () => {
    const mw = withCompaction({ maxTokens: 1000 })
    const { ctx, events } = recordingContext('beforeModel')
    await runOnConfig(mw, [text('user', 'hi')], ctx)
    expect(events).toEqual([])
  })

  it('does not compact during init', async () => {
    const onCompact = vi.fn()
    const mw = withCompaction({ maxTokens: 100, onCompact })
    const result = await runOnConfig(
      mw,
      [big('user'), big('assistant'), big('user'), big('assistant')],
      phaseContext('init'),
    )
    expect(result).toBeUndefined()
    expect(onCompact).not.toHaveBeenCalled()
  })

  it('runs summarize once per beforeModel call with no metadata store', async () => {
    const summarize = vi.fn(async () => 'the gist')
    const onCompact = vi.fn()
    const mw = withCompaction({
      maxTokens: 100,
      strategy: summarizeOldest({ summarize, keepRecentTokens: 50 }),
      onCompact,
    })
    const msgs = [big('user'), big('assistant'), big('user'), big('assistant')]

    await runOnConfig(mw, msgs, phaseContext('init'))
    await runOnConfig(mw, msgs, phaseContext('beforeModel'))

    expect(summarize).toHaveBeenCalledOnce()
    expect(onCompact).toHaveBeenCalledOnce()

    // Estimate mode keeps no checkpoint in memory, so the next call compacts again.
    await runOnConfig(mw, msgs, phaseContext('beforeModel'))
    expect(summarize).toHaveBeenCalledTimes(2)
  })

  it('reuses a persisted checkpoint for an unchanged canonical prefix', async () => {
    const store = memoryStore()
    const summarize = vi.fn(async () => 'the gist')
    const messages = [
      big('user'),
      big('assistant'),
      big('user'),
      big('assistant'),
    ]
    const options = {
      maxTokens: 100,
      strategy: summarizeOldest({ summarize, keepRecentTokens: 50 }),
      strategyKey: 'summary-v1',
    }

    const first = await runOnConfig(
      withCompaction(options),
      messages,
      checkpointContext(store),
    )
    const appended = [...messages, text('user', 'new')]
    const second = await runOnConfig(
      withCompaction(options),
      appended,
      checkpointContext(store),
    )

    expect(summarize).toHaveBeenCalledOnce()
    expect(first?.providerMessages?.[0]?.content).toContain('the gist')
    expect(second?.providerMessages?.[0]?.content).toContain('the gist')
    expect(second?.providerMessages?.at(-1)?.content).toBe('new')
    expect(appended).toHaveLength(5)
  })

  it('rejects a checkpoint when the canonical prefix changes', async () => {
    const store = memoryStore()
    const summarize = vi.fn(async () => 'the gist')
    const options = {
      maxTokens: 100,
      strategy: summarizeOldest({ summarize, keepRecentTokens: 50 }),
      strategyKey: 'summary-v1',
    }
    const messages = [
      big('user'),
      big('assistant'),
      big('user'),
      big('assistant'),
    ]

    await runOnConfig(
      withCompaction(options),
      messages,
      checkpointContext(store),
    )
    await runOnConfig(
      withCompaction(options),
      [text('user', 'changed'.repeat(30)), ...messages.slice(1)],
      checkpointContext(store),
    )

    expect(summarize).toHaveBeenCalledTimes(2)
  })

  it('does not write a checkpoint after cancellation', async () => {
    const set = vi.fn<MetadataStore['set']>()
    const store: MetadataStore = {
      get: async () => null,
      set,
      delete: async () => undefined,
    }

    await runOnConfig(
      withCompaction({ maxTokens: 100 }),
      [big('user'), big('assistant'), big('user'), big('assistant')],
      checkpointContext(store, { aborted: true }),
    )

    expect(set).not.toHaveBeenCalled()
  })
})

describe('evictOldest', () => {
  it('keeps the recent tail and drops the head', async () => {
    const mw = withCompaction({
      maxTokens: 100,
      strategy: evictOldest({ keepRecentTokens: 50 }),
    })
    const msgs = [big('user'), big('assistant'), big('user'), big('assistant')]
    const out = (await runOnConfig(mw, msgs))?.providerMessages ?? []
    expect(out[0]?.content).toContain('omitted')
    expect(out[out.length - 1]).toBe(msgs[msgs.length - 1])
  })

  it('never lets the tail start with an orphaned tool result', async () => {
    const assistantCall: ModelMessage = {
      role: 'assistant',
      content: 'x'.repeat(160),
      toolCalls: [call],
    }
    const toolResult: ModelMessage = {
      role: 'tool',
      content: 'x'.repeat(160),
      toolCallId: 't1',
    }
    const msgs = [big('user'), assistantCall, toolResult, big('user')]
    const mw = withCompaction({
      maxTokens: 100,
      strategy: evictOldest({ keepRecentTokens: 45 }),
    })
    const out = (await runOnConfig(mw, msgs))?.providerMessages ?? []
    expect(out.slice(1).some((m) => m.role === 'tool')).toBe(false)
  })

  it('keeps the trailing assistant plus tool result when the transcript ends in a tool', async () => {
    const assistantCall: ModelMessage = {
      role: 'assistant',
      content: 'x'.repeat(160),
      toolCalls: [call],
    }
    const toolResult: ModelMessage = {
      role: 'tool',
      content: 'x'.repeat(160),
      toolCallId: 't1',
    }
    const msgs = [big('user'), assistantCall, toolResult]
    const mw = withCompaction({
      maxTokens: 100,
      strategy: evictOldest({ keepRecentTokens: 45 }),
    })
    const out = (await runOnConfig(mw, msgs))?.providerMessages ?? []
    expect(out.at(-2)).toBe(assistantCall)
    expect(out.at(-1)).toBe(toolResult)
    expect(out.some((m) => m.role === 'tool')).toBe(true)
  })

  it('keeps a trailing parallel tool-result group with its assistant', async () => {
    const assistantCall: ModelMessage = {
      role: 'assistant',
      content: 'x'.repeat(160),
      toolCalls: [
        call,
        {
          id: 't2',
          type: 'function',
          function: { name: 'g', arguments: '{}' },
        },
      ],
    }
    const toolA: ModelMessage = {
      role: 'tool',
      content: 'x'.repeat(160),
      toolCallId: 't1',
    }
    const toolB: ModelMessage = {
      role: 'tool',
      content: 'x'.repeat(160),
      toolCallId: 't2',
    }
    const msgs = [big('user'), assistantCall, toolA, toolB]
    const mw = withCompaction({
      maxTokens: 100,
      strategy: evictOldest({ keepRecentTokens: 45 }),
    })
    const out = (await runOnConfig(mw, msgs))?.providerMessages ?? []
    expect(out.slice(-3)).toEqual([assistantCall, toolA, toolB])
  })
})

describe('summarizeOldest', () => {
  it('replaces the head with a summary', async () => {
    const summarize = vi.fn(async () => 'the gist')
    const mw = withCompaction({
      maxTokens: 100,
      strategy: summarizeOldest({ summarize, keepRecentTokens: 50 }),
    })
    const result = await runOnConfig(mw, [
      big('user'),
      big('assistant'),
      big('user'),
      big('assistant'),
    ])
    expect(summarize).toHaveBeenCalledOnce()
    expect(result?.providerMessages?.[0]?.role).toBe('assistant')
    expect(result?.providerMessages?.[0]?.content).toBe(
      '<untrusted-conversation-summary>\nthe gist\n</untrusted-conversation-summary>',
    )
  })

  it('reuses a checkpoint without an explicit strategyKey', async () => {
    const store = memoryStore()
    const summarize = vi.fn(async () => 'the gist')
    const messages = [
      big('user'),
      big('assistant'),
      big('user'),
      big('assistant'),
    ]
    const options = {
      maxTokens: 100,
      strategy: summarizeOldest({ summarize, keepRecentTokens: 50 }),
    }

    await runOnConfig(
      withCompaction(options),
      messages,
      checkpointContext(store),
    )
    const second = await runOnConfig(
      withCompaction(options),
      [...messages, text('user', 'new')],
      checkpointContext(store),
    )

    expect(summarize).toHaveBeenCalledOnce()
    expect(second?.providerMessages?.at(-1)?.content).toBe('new')
  })
})

describe('clearToolResults', () => {
  const toolMsg = (id: string): ModelMessage => ({
    role: 'tool',
    content: 'x'.repeat(400),
    toolCallId: id,
  })

  it('stubs old tool results but keeps recent ones and message count', async () => {
    const msgs: Array<ModelMessage> = [
      text('user', 'go'),
      toolMsg('a'),
      toolMsg('b'),
      toolMsg('c'),
      toolMsg('d'),
    ]
    const mw = withCompaction({
      maxTokens: 100,
      strategy: clearToolResults({ keepRecentToolResults: 2 }),
    })
    const out = (await runOnConfig(mw, msgs))?.providerMessages ?? []
    // Same number of messages — structure is untouched.
    expect(out.length).toBe(msgs.length)
    // Oldest two tool results are stubbed.
    expect(out[1]?.content).toBe('[tool output cleared to save context]')
    expect(out[2]?.content).toBe('[tool output cleared to save context]')
    // Two most recent tool results are untouched.
    expect(out[3]?.content).toBe('x'.repeat(400))
    expect(out[4]?.content).toBe('x'.repeat(400))
  })

  it('no-ops when there are not enough tool results to clear', async () => {
    const msgs: Array<ModelMessage> = [big('user'), toolMsg('a'), big('user')]
    const mw = withCompaction({
      maxTokens: 50,
      strategy: clearToolResults({ keepRecentToolResults: 3 }),
    })
    expect(await runOnConfig(mw, msgs)).toBeUndefined()
  })
})

describe('composeStrategies', () => {
  const assistantCall = (id: string): ModelMessage => ({
    role: 'assistant',
    content: '',
    toolCalls: [
      { id, type: 'function', function: { name: 'f', arguments: '{}' } },
    ],
  })
  const toolMsg = (id: string): ModelMessage => ({
    role: 'tool',
    content: 'x'.repeat(800), // ~200 tokens
    toolCallId: id,
  })
  const history = (): Array<ModelMessage> => [
    text('user', 'HEAD_MARKER'),
    assistantCall('a'),
    toolMsg('a'),
    assistantCall('b'),
    toolMsg('b'),
    text('user', 'last'),
  ]

  it('stops after the first strategy once back under budget', async () => {
    const mw = withCompaction({
      maxTokens: 260,
      strategy: composeStrategies(
        clearToolResults({ keepRecentToolResults: 1 }),
        evictOldest({ keepRecentTokens: 50 }),
      ),
    })
    const msgs = history()
    const out = (await runOnConfig(mw, msgs))?.providerMessages ?? []
    // Clearing one tool result was enough, so evict never ran:
    // the head message and full message count survive.
    expect(out.length).toBe(msgs.length)
    expect(out.some((m) => m.content === 'HEAD_MARKER')).toBe(true)
    expect(out[2]?.content).toBe('[tool output cleared to save context]')
  })

  it('escalates to the next strategy when the first is not enough', async () => {
    const mw = withCompaction({
      maxTokens: 60,
      strategy: composeStrategies(
        clearToolResults({ keepRecentToolResults: 1 }),
        evictOldest({ keepRecentTokens: 30 }),
      ),
    })
    const msgs = history()
    const out = (await runOnConfig(mw, msgs))?.providerMessages ?? []
    // Clearing was not enough, so evict ran too: the head is dropped.
    expect(out.some((m) => m.content === 'HEAD_MARKER')).toBe(false)
    expect(out[0]?.content).toContain('omitted')
  })
})

describe('estimateMessageTokens', () => {
  it('counts content and tool calls', () => {
    expect(estimateMessageTokens(text('user', 'x'.repeat(40)))).toBe(10)
  })
})

/** A beforeModel context of thread-1 whose `messages` are `messages`. */
function usageContext(
  messages: ReadonlyArray<ModelMessage>,
  extras: Partial<ChatMiddlewareContext> = {},
) {
  return recordingContext('beforeModel', {
    threadId: 'thread-1',
    messages,
    ...extras,
  })
}

const tokenUsage = (
  promptTokens: number,
  completionTokens = 0,
): TokenUsage => ({
  promptTokens,
  completionTokens,
  totalTokens: promptTokens + completionTokens,
})

describe('countTokens: usage', () => {
  it('counts the reported usage and the messages after the reply', async () => {
    const onCompact = vi.fn()
    const mw = withCompaction({
      maxTokens: 200,
      countTokens: 'usage',
      onCompact,
    })
    const first = [big('user'), big('assistant'), big('user')]
    // No usage yet: the estimate (120) is under the limit.
    expect(
      await runOnConfig(mw, first, usageContext(first).ctx),
    ).toBeUndefined()
    await mw.onUsage?.(usageContext(first).ctx, tokenUsage(150, 40))

    // The estimate is 180, but the usage count is 150 + 40 + 20 = 210.
    const second = [...first, big('assistant'), text('user', 'x'.repeat(80))]
    const { ctx, events } = usageContext(second)
    await runOnConfig(mw, second, ctx)

    expect(events[0]?.name).toBe(COMPACTION_STARTED_EVENT)
    expect(events[0]?.value.before).toBe(210)
    expect(onCompact).toHaveBeenCalledOnce()
  })

  it('uses the estimate when the last covered message changed or the list is shorter', async () => {
    const mw = withCompaction({ maxTokens: 200, countTokens: 'usage' })
    const first = [big('user'), big('assistant'), big('user')]
    await mw.onUsage?.(usageContext(first).ctx, tokenUsage(150, 40))

    const edited = [
      big('user'),
      big('assistant'),
      text('user', 'edited'),
      big('assistant'),
      text('user', 'x'.repeat(80)),
    ]
    const editedCall = usageContext(edited)
    expect(await runOnConfig(mw, edited, editedCall.ctx)).toBeUndefined()
    expect(editedCall.events).toEqual([])

    const shorter = [big('user'), big('assistant')]
    const shorterCall = usageContext(shorter)
    expect(await runOnConfig(mw, shorter, shorterCall.ctx)).toBeUndefined()
    expect(shorterCall.events).toEqual([])
  })

  it('does not compact again after a provider-only compaction only because the canonical list is long', async () => {
    const summarize = vi.fn(async () => 'the gist')
    const mw = withCompaction({
      maxTokens: 100,
      countTokens: 'usage',
      strategy: summarizeOldest({ summarize, keepRecentTokens: 50 }),
    })
    const first = [big('user'), big('assistant'), big('user'), big('assistant')]
    const firstCall = usageContext(first)
    const compacted = await runOnConfig(mw, first, firstCall.ctx)
    expect(compacted?.providerMessages?.[0]?.content).toContain('the gist')
    // The model got the short list, so its usage is small.
    await mw.onUsage?.(firstCall.ctx, tokenUsage(30, 5))

    // The canonical list is long (estimate 201). The count is 30 + 5 + 1 = 36.
    // The estimate of the reused view is 100, so only the usage gives 36.
    const second = [...first, big('assistant'), text('user', 'next')]
    const { ctx, events } = usageContext(second)
    const result = await runOnConfig(mw, second, ctx)

    expect(summarize).toHaveBeenCalledOnce()
    expect(events[0]?.value.before).toBe(36)
    // The model still gets the compacted list, from the checkpoint in memory.
    expect(result?.providerMessages?.[0]?.content).toContain('the gist')
    expect(result?.providerMessages?.at(-1)?.content).toBe('next')
  })

  it('drops the saved usage after a compaction, so a call with no usage reuses the checkpoint', async () => {
    const summarize = vi.fn(async () => 'the gist')
    const mw = withCompaction({
      maxTokens: 100,
      countTokens: 'usage',
      strategy: summarizeOldest({ summarize, keepRecentTokens: 50 }),
    })
    const first = [big('user')]
    await mw.onUsage?.(usageContext(first).ctx, tokenUsage(40, 40))

    // The count is 40 + 40 + 40 = 120, so this call compacts. The call is
    // aborted, so it reports no usage.
    const second = [...first, big('assistant'), big('user')]
    const compacted = await runOnConfig(mw, second, usageContext(second).ctx)
    expect(compacted?.providerMessages?.[0]?.content).toContain('the gist')

    // The old usage counted the list before the compaction (122 here). With
    // no usage, the estimate of the reused view (61) counts.
    const third = [...second, text('assistant', 'ok'), text('user', 'next')]
    const { ctx, events } = usageContext(third)
    const result = await runOnConfig(mw, third, ctx)

    expect(summarize).toHaveBeenCalledOnce()
    expect(events[0]?.value).toMatchObject({
      before: 61,
      reusedCheckpoint: true,
    })
    expect(result?.providerMessages?.[0]?.content).toContain('the gist')
  })

  it('keeps the usage with the checkpoint when the strategy has no key', async () => {
    const store = memoryStore()
    // A strategy with no key keeps its checkpoint in the middleware's memory.
    const strategy = evictOldest({
      keepRecentTokens: 50,
      marker: (count) => `[${count} dropped]`,
    })
    const first = [big('user'), big('assistant'), big('user'), big('assistant')]
    const firstCtx = checkpointContext(store)
    firstCtx.messages = first
    const firstMw = withCompaction({
      maxTokens: 100,
      countTokens: 'usage',
      strategy,
    })
    expect(await runOnConfig(firstMw, first, firstCtx)).toBeDefined()
    // The model got the short list, so its usage is small.
    await firstMw.onUsage?.(firstCtx, tokenUsage(30, 5))
    expect(
      await store.get('@tanstack/ai-compaction:usage', 'thread-1'),
    ).toBeNull()

    // A new middleware per request has no checkpoint. The usage of the
    // compacted view does not fit, so the estimate (201) counts.
    const onCompact = vi.fn()
    const second = [...first, big('assistant'), text('user', 'next')]
    const result = await runOnConfig(
      withCompaction({
        maxTokens: 100,
        countTokens: 'usage',
        strategy,
        onCompact,
      }),
      second,
      checkpointContext(store),
    )

    expect(onCompact.mock.calls[0]?.[0].before).toBe(201)
    expect(result?.providerMessages?.length).toBeLessThan(second.length)
  })

  it('reads the usage from the store it was saved in when the strategy has no key', async () => {
    const store = memoryStore()
    const mw = withCompaction({
      maxTokens: 100,
      countTokens: 'usage',
      strategy: evictOldest({
        keepRecentTokens: 50,
        marker: (count) => `[${count} dropped]`,
      }),
    })
    const first = [big('user'), big('assistant'), big('user'), big('assistant')]
    const firstCtx = checkpointContext(store)
    firstCtx.messages = first
    expect(await runOnConfig(mw, first, firstCtx)).toBeDefined()
    await mw.onUsage?.(firstCtx, tokenUsage(30, 5))

    // The usage is in the memory of this middleware, not in the store. The
    // count is 30 + 5 + 1 = 36. The estimate of the reused view is 84.
    const second = [...first, big('assistant'), text('user', 'next')]
    const ctx = checkpointContext(store)
    const emit = vi.spyOn(ctx, 'emitCustomEvent')
    await runOnConfig(mw, second, ctx)

    expect(emit.mock.calls[0]?.[1]).toMatchObject({
      before: 36,
      reusedCheckpoint: true,
    })
  })

  it('does not use the usage of a compacted view when the checkpoint does not fit', async () => {
    const store = memoryStore()
    const summarize = vi.fn(async () => 'the gist')
    const onCompact = vi.fn()
    const mw = withCompaction({
      maxTokens: 100,
      countTokens: 'usage',
      strategy: summarizeOldest({ summarize, keepRecentTokens: 50 }),
      onCompact,
    })
    const first = [big('user'), big('assistant'), big('user'), big('assistant')]
    const firstCtx = checkpointContext(store)
    firstCtx.messages = first
    await runOnConfig(mw, first, firstCtx)
    // The model got the short list, so its usage is small.
    await mw.onUsage?.(firstCtx, tokenUsage(30, 5))

    // An earlier message changed (for example, a run tag from persistence).
    // The checkpoint does not fit, but the last covered message is the same.
    const second = [
      big('user'),
      text('assistant', 'y'.repeat(160)),
      big('user'),
      big('assistant'),
      big('assistant'),
      text('user', 'next'),
    ]
    const result = await runOnConfig(mw, second, checkpointContext(store))

    // The estimate (201) counts, not the usage of the compacted view (36).
    expect(onCompact.mock.calls[1]?.[0].before).toBe(201)
    expect(summarize).toHaveBeenCalledTimes(2)
    expect(result?.providerMessages?.length).toBeLessThan(second.length)
  })

  it('marks the usage of a reused checkpoint as a compacted view', async () => {
    const store = memoryStore()
    const summarize = vi.fn(async () => 'the gist')
    const onCompact = vi.fn()
    const mw = withCompaction({
      maxTokens: 100,
      countTokens: 'usage',
      strategy: summarizeOldest({ summarize, keepRecentTokens: 50 }),
      onCompact,
    })
    const first = [big('user'), big('assistant'), big('user'), big('assistant')]
    await runOnConfig(mw, first, checkpointContext(store))

    // This call reuses the checkpoint, so the model gets the compacted view.
    const second = [...first, text('user', 'next')]
    const secondCtx = checkpointContext(store)
    secondCtx.messages = second
    expect(
      (await runOnConfig(mw, second, secondCtx))?.providerMessages?.[0]
        ?.content,
    ).toContain('the gist')
    await mw.onUsage?.(secondCtx, tokenUsage(30, 5))

    // The checkpoint does not fit, so the usage of that view (37) does not
    // count. The estimate (203) counts, and the call compacts again.
    const third = [
      big('user'),
      text('assistant', 'y'.repeat(160)),
      big('user'),
      big('assistant'),
      text('user', 'next'),
      big('assistant'),
      text('user', 'again'),
    ]
    await runOnConfig(mw, third, checkpointContext(store))
    expect(onCompact).toHaveBeenCalledTimes(2)
  })

  it('uses the last good usage after an aborted call, and the estimate when there is none', async () => {
    const mw = withCompaction({ maxTokens: 200, countTokens: 'usage' })
    // The first call was aborted, so no usage exists. The estimate (120) counts.
    const first = [big('user'), big('assistant'), big('user')]
    await expect(
      runOnConfig(mw, first, usageContext(first).ctx),
    ).resolves.toBeUndefined()

    // A call that ends saves its usage.
    const second = [...first, big('assistant'), big('user')]
    await mw.onUsage?.(usageContext(second).ctx, tokenUsage(150, 10))

    // The next call is aborted. A late report under the aborted signal is ignored.
    const third = [...second, big('assistant'), text('user', 'x'.repeat(200))]
    await mw.onUsage?.(
      usageContext(third, { signal: AbortSignal.abort() }).ctx,
      tokenUsage(5, 0),
    )

    // The count is the last good usage, 150 + 10, plus 50 for the new message.
    const { ctx, events } = usageContext(third)
    await expect(runOnConfig(mw, third, ctx)).resolves.toBeDefined()
    expect(events[0]?.value.before).toBe(210)
  })

  it('saves the usage in the MetadataStore, so a restart can use it', async () => {
    const store = memoryStore()
    const covered = [big('user')]
    const ctx = checkpointContext(store)
    ctx.messages = covered
    await withCompaction({ maxTokens: 200, countTokens: 'usage' }).onUsage?.(
      ctx,
      tokenUsage(150, 10),
    )
    expect(
      await store.get('@tanstack/ai-compaction:usage', 'thread-1'),
    ).toEqual({
      schemaVersion: 1,
      tokens: 160,
      coveredCount: 1,
      lastCoveredHash: expect.any(String),
      compacted: false,
    })

    // A new middleware (a restart) reads the saved usage.
    const onCompact = vi.fn()
    const next = [...covered, big('assistant'), text('user', 'x'.repeat(200))]
    await runOnConfig(
      withCompaction({ maxTokens: 200, countTokens: 'usage', onCompact }),
      next,
      checkpointContext(store),
    )
    expect(onCompact.mock.calls[0]?.[0].before).toBe(210)
  })

  it('ignores a saved usage that has no compacted field', async () => {
    const messages = [big('user'), text('user', 'next')]
    const saved = {
      schemaVersion: 1,
      tokens: 10,
      coveredCount: 1,
      lastCoveredHash: await hashMessages([big('user')]),
    }
    const count = (value: unknown) =>
      countFromUsage(value, messages, estimateMessageTokens, false)

    expect(await count({ ...saved, compacted: false })).toBe(11)
    expect(await count(saved)).toBeUndefined()
  })

  it('keeps the 1000 newest threads in memory', async () => {
    const store = memoryMetadata()
    for (let thread = 0; thread < 1000; thread++) {
      await store.set('ns', String(thread), thread)
    }
    // A new value moves thread 0 to the newest place.
    await store.set('ns', '0', 'again')
    await store.set('ns', '1000', 1000)

    expect(await store.get('ns', '0')).toBe('again')
    expect(await store.get('ns', '1')).toBeNull()
    // Only the oldest thread went: the cap is 1000, not 999.
    expect(await store.get('ns', '2')).toBe(2)
    expect(await store.get('ns', '1000')).toBe(1000)
  })

  it('keeps the estimate and adds no onUsage hook without countTokens', () => {
    expect(withCompaction({ maxTokens: 100 }).onUsage).toBeUndefined()
  })
})

describe('compactNext and auto', () => {
  const longList = () => [
    big('user'),
    big('assistant'),
    big('user'),
    big('assistant'),
  ]
  const threadContext = (
    threadId = 'thread-1',
    phase: ChatMiddlewareContext['phase'] = 'beforeModel',
  ) => recordingContext(phase, { threadId })

  it('compacts at the next model call under the limit, then clears the flag', async () => {
    const onCompact = vi.fn()
    const mw = withCompaction({
      maxTokens: 1000,
      onCompact,
      strategy: evictOldest({ keepRecentTokens: 50 }),
    })
    mw.compactNext('thread-1')

    const first = await runOnConfig(mw, longList(), threadContext().ctx)
    expect(first?.providerMessages?.[0]?.content).toContain('omitted')
    expect(
      await runOnConfig(mw, longList(), threadContext().ctx),
    ).toBeUndefined()
    expect(onCompact).toHaveBeenCalledOnce()
  })

  it('keeps the flag through init and uses it at the model-bound call', async () => {
    const mw = withCompaction({
      maxTokens: 1000,
      strategy: evictOldest({ keepRecentTokens: 50 }),
    })
    mw.compactNext('thread-1')

    expect(
      await runOnConfig(mw, longList(), threadContext('thread-1', 'init').ctx),
    ).toBeUndefined()
    const result = await runOnConfig(mw, longList(), threadContext().ctx)
    expect(result?.providerMessages?.[0]?.content).toContain('omitted')
  })

  it('forces only the thread it names', async () => {
    const mw = withCompaction({
      maxTokens: 1000,
      strategy: evictOldest({ keepRecentTokens: 50 }),
    })
    mw.compactNext('thread-a')

    expect(
      await runOnConfig(mw, longList(), threadContext('thread-b').ctx),
    ).toBeUndefined()
    const result = await runOnConfig(
      mw,
      longList(),
      threadContext('thread-a').ctx,
    )
    expect(result?.providerMessages?.[0]?.content).toContain('omitted')
  })

  it('clears the flag and ends the events when the strategy returns null', async () => {
    const strategy = vi.fn<CompactionStrategy>(() => null)
    const mw = withCompaction({ maxTokens: 1000, strategy })
    mw.compactNext('thread-1')

    const first = threadContext()
    expect(
      await runOnConfig(mw, [text('user', 'hi')], first.ctx),
    ).toBeUndefined()
    expect(first.events.map((event) => event.name)).toEqual([
      COMPACTION_STARTED_EVENT,
      COMPACTION_ENDED_EVENT,
    ])

    // The next call is under the limit and is not forced again.
    const second = threadContext()
    expect(
      await runOnConfig(mw, [text('user', 'hi')], second.ctx),
    ).toBeUndefined()
    expect(strategy).toHaveBeenCalledOnce()
    expect(second.events).toEqual([])
  })

  it('does not compact on the threshold with auto: false, but compactNext still runs', async () => {
    const onCompact = vi.fn()
    const mw = withCompaction({ maxTokens: 100, auto: false, onCompact })

    expect(
      await runOnConfig(mw, longList(), threadContext().ctx),
    ).toBeUndefined()
    expect(onCompact).not.toHaveBeenCalled()

    mw.compactNext('thread-1')
    const result = await runOnConfig(mw, longList(), threadContext().ctx)
    expect(result?.providerMessages?.[0]?.content).toContain('omitted')
    expect(onCompact).toHaveBeenCalledOnce()
  })
})
