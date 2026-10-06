import { describe, expect, it, vi } from 'vitest'
import type {
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  FinishInfo,
  MetadataStore,
  ModelMessage,
  SummarizationResult,
  TextOptions,
  TokenUsage,
  ToolCall,
} from '@tanstack/ai'
import {
  CapabilityRegistry,
  provideLogRecords,
  provideMetadata,
} from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import {
  COMPACTION_ENDED_EVENT,
  COMPACTION_RECORD_TYPE,
  COMPACTION_STARTED_EVENT,
  COMPACTION_STATE_EVENT,
  clearToolResults,
  composeStrategies,
  conversationSummarizer,
  estimateMessageTokens,
  evictOldest,
  projectCompaction,
  summarizeOldest,
  withCompaction,
} from './index'
import { countFromUsage, hashMessages, memoryMetadata } from './usage-count'
import type {
  CompactionInfo,
  CompactionMiddleware,
  CompactionOptions,
  CompactionStrategy,
  SummarizeInput,
  Summarizer,
} from './index'

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

describe('compaction usage and errors', () => {
  const longList = () => [
    big('user'),
    big('assistant'),
    big('user'),
    big('assistant'),
  ]

  it('reports the usage of the summary call on onCompact and compaction:ended', async () => {
    const summaryUsage = tokenUsage(120, 30)
    // The result of summarize() from @tanstack/ai fits as it is.
    const summarized: SummarizationResult = {
      id: 's1',
      model: 'test-model',
      summary: 'the gist',
      usage: summaryUsage,
    }
    const onCompact = vi.fn()
    const mw = withCompaction({
      maxTokens: 100,
      onCompact,
      strategy: summarizeOldest({
        summarize: async () => summarized,
        keepRecentTokens: 50,
      }),
    })
    const { ctx, events } = recordingContext('beforeModel')
    const result = await runOnConfig(mw, longList(), ctx)

    expect(result?.providerMessages?.[0]?.content).toBe(
      '<untrusted-conversation-summary>\nthe gist\n</untrusted-conversation-summary>',
    )
    expect(onCompact.mock.calls[0]?.[0]).toMatchObject({
      reason: 'threshold',
      usage: summaryUsage,
    })
    expect(events[0]?.value).toMatchObject({ reason: 'threshold' })
    expect(events.at(-1)?.value).toMatchObject({
      reason: 'threshold',
      usage: summaryUsage,
    })
  })

  it('sums the addUsage calls of a custom strategy', async () => {
    const strategy: CompactionStrategy = (messages, ctx) => {
      ctx.addUsage(tokenUsage(10, 2))
      ctx.addUsage(tokenUsage(5, 1))
      return messages.slice(-1)
    }
    const mw = withCompaction({ maxTokens: 100, strategy })
    const { ctx, events } = recordingContext('beforeModel')
    await runOnConfig(mw, longList(), ctx)
    expect(events.at(-1)?.value.usage).toEqual(tokenUsage(15, 3))
  })

  it('marks a compactNext compaction with reason forced', async () => {
    const mw = withCompaction({
      maxTokens: 1000,
      strategy: evictOldest({ keepRecentTokens: 50 }),
    })
    mw.compactNext('thread-1')
    const { ctx, events } = recordingContext('beforeModel', {
      threadId: 'thread-1',
    })
    await runOnConfig(mw, longList(), ctx)
    expect(events[0]?.value.reason).toBe('forced')
    expect(events.at(-1)?.value.reason).toBe('forced')
  })

  it('ends with the error and fails the run when the strategy throws', async () => {
    const mw = withCompaction({
      maxTokens: 100,
      strategy: () => {
        throw new Error('summary failed')
      },
    })
    const { ctx, events } = recordingContext('beforeModel')
    await expect(runOnConfig(mw, longList(), ctx)).rejects.toThrow(
      'summary failed',
    )
    expect(events.map((event) => event.name)).toEqual([
      COMPACTION_STARTED_EVENT,
      COMPACTION_ENDED_EVENT,
    ])
    expect(events[1]?.value).toMatchObject({
      after: 160,
      messagesAfter: 4,
      reason: 'threshold',
      error: { message: 'summary failed' },
    })
  })

  it('sends the list without compaction when continueOnError is set', async () => {
    const mw = withCompaction({
      maxTokens: 100,
      continueOnError: true,
      strategy: async () => {
        throw new Error('summary failed')
      },
    })
    const { ctx, events } = recordingContext('beforeModel')
    expect(await runOnConfig(mw, longList(), ctx)).toBeUndefined()
    expect(events.at(-1)?.value).toMatchObject({
      error: { message: 'summary failed' },
    })
  })

  it('keeps the checkpoint list when continueOnError is set and a later compaction fails', async () => {
    const store = memoryStore()
    const summarize = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('the gist')
      .mockRejectedValue(new Error('summary failed'))
    const mw = withCompaction({
      maxTokens: 100,
      continueOnError: true,
      strategy: summarizeOldest({ summarize, keepRecentTokens: 50 }),
      strategyKey: 'summary-v1',
    })
    const messages = longList()
    await runOnConfig(mw, messages, checkpointContext(store))

    const longer = [...messages, big('user'), big('assistant')]
    const result = await runOnConfig(mw, longer, checkpointContext(store))

    expect(summarize).toHaveBeenCalledTimes(2)
    expect(result?.providerMessages?.[0]?.content).toContain('the gist')
    expect(result?.providerMessages).toHaveLength(4)
    expect(longer).toHaveLength(6)
    expect(result?.providerMessages).not.toHaveLength(longer.length)
  })

  it('rethrows when the run is aborted, even with continueOnError', async () => {
    const mw = withCompaction({
      maxTokens: 100,
      continueOnError: true,
      strategy: async () => {
        throw new Error('aborted')
      },
    })
    const ctx = checkpointContext(memoryStore(), { aborted: true })
    await expect(runOnConfig(mw, longList(), ctx)).rejects.toThrow('aborted')
  })

  it('keeps the old event fields and values for a caller with no new option', async () => {
    const mw = withCompaction({ maxTokens: 100 })
    const { ctx, events } = recordingContext('beforeModel')
    await runOnConfig(mw, longList(), ctx)

    expect(Object.keys(events[0]?.value ?? {}).sort()).toEqual([
      'before',
      'maxTokens',
      'messagesBefore',
      'reason',
      'reusedCheckpoint',
      'strategyKey',
    ])
    expect(events[0]?.value).toMatchObject({
      before: 160,
      messagesBefore: 4,
      reusedCheckpoint: false,
      maxTokens: 100,
      strategyKey: 'evict-oldest:half:maxTokens=100',
    })
    expect(Object.keys(events[2]?.value ?? {}).sort()).toEqual([
      'after',
      'durationMs',
      'maxTokens',
      'messagesAfter',
      'reason',
      'reusedCheckpoint',
      'strategyKey',
    ])
    expect(events[2]?.value).toMatchObject({
      messagesAfter: 2,
      reusedCheckpoint: false,
      maxTokens: 100,
      durationMs: expect.any(Number),
    })
  })
})

const withId = (message: ModelMessage, id: string): ModelMessage => ({
  ...message,
  id,
})

const summaryOf = (summary: string): ModelMessage => ({
  role: 'assistant',
  content: `<untrusted-conversation-summary>\n${summary}\n</untrusted-conversation-summary>`,
})

/** A context of thread-1 with LogRecordsCapability. Each append lands in `appended`. */
function durableContext(
  appended: Array<unknown>,
  messages: ReadonlyArray<ModelMessage> = [],
) {
  const recorded = usageContext(messages, {
    capabilities: new CapabilityRegistry(),
  })
  provideLogRecords(recorded.ctx, {
    append: async (records) => {
      appended.push(...records)
    },
  })
  return recorded
}

describe('durable compaction', () => {
  const longList = () => [
    withId(big('user'), 'm1'),
    withId(big('assistant'), 'm2'),
    withId(big('user'), 'm3'),
    withId(big('assistant'), 'm4'),
  ]

  it('writes a head and from record and gives the model the same list', async () => {
    const appended: Array<unknown> = []
    const mw = withCompaction({
      maxTokens: 100,
      durable: true,
      strategy: summarizeOldest({
        summarize: async () => 'the gist',
        keepRecentTokens: 50,
      }),
    })
    const messages = longList()
    const result = await runOnConfig(mw, messages, durableContext(appended).ctx)

    expect(result?.providerMessages).toEqual([
      summaryOf('the gist'),
      messages[3],
    ])
    expect(appended).toEqual([
      {
        type: COMPACTION_RECORD_TYPE,
        reason: 'threshold',
        tokensBefore: 160,
        tokensAfter: expect.any(Number),
        head: [summaryOf('the gist')],
        from: 3,
        firstKeptId: 'm4',
      },
    ])
  })

  it('puts the usage of the summary call on the record', async () => {
    const appended: Array<unknown> = []
    const mw = withCompaction({
      maxTokens: 100,
      durable: true,
      strategy: summarizeOldest({
        summarize: async () => ({
          summary: 'the gist',
          usage: tokenUsage(12, 3),
        }),
        keepRecentTokens: 50,
      }),
    })
    await runOnConfig(mw, longList(), durableContext(appended).ctx)
    expect(appended[0]).toMatchObject({ usage: tokenUsage(12, 3) })
  })

  it('writes the full new list as head, from the end of the list, when the strategy changed the last message', async () => {
    const appended: Array<unknown> = []
    const strategy: CompactionStrategy = (messages) =>
      messages.map((message) => ({ ...message, content: 'short' }))
    const mw = withCompaction({ maxTokens: 100, durable: true, strategy })
    const result = await runOnConfig(
      mw,
      longList(),
      durableContext(appended).ctx,
    )

    expect(appended).toEqual([
      {
        type: COMPACTION_RECORD_TYPE,
        reason: 'threshold',
        tokensBefore: 160,
        tokensAfter: 8,
        head: result?.providerMessages,
        from: 4,
      },
    ])
  })

  it('writes a record that a fold without the tool results of this phase skips', async () => {
    // Five parallel tool calls. The fold of the log does not have their
    // results yet: they are saved after this hook. A record that the fold
    // used would give the model those results two times.
    const appended: Array<{ type: string } & Record<string, unknown>> = []
    const ids = ['c1', 'c2', 'c3', 'c4', 'c5']
    const fold = [
      withId(text('user', 'q1'), 'm1'),
      withId(text('assistant', 'a1'), 'm2'),
      withId(text('user', 'q2'), 'm3'),
      withId(
        {
          role: 'assistant',
          content: '',
          toolCalls: ids.map((id) => ({ ...call, id })),
        },
        'm4',
      ),
    ]
    const messages = [
      ...fold,
      ...ids.map(
        (id): ModelMessage => ({
          role: 'tool',
          content: 'r'.repeat(40),
          toolCallId: id,
        }),
      ),
    ]
    const mw = withCompaction({
      maxTokens: 20,
      durable: true,
      strategy: clearToolResults(),
    })
    const result = await runOnConfig(mw, messages, durableContext(appended).ctx)

    expect(appended).toMatchObject([
      { head: result?.providerMessages?.slice(0, 6), from: 6 },
    ])
    expect(
      appended.map((record) => projectCompaction({ messages: fold, record })),
    ).toEqual([undefined])
    // The fold that has the results gives the list the model got.
    expect(
      appended.map((record) => projectCompaction({ messages, record })),
    ).toEqual([result?.providerMessages])
  })

  it('keeps each rewritten message of clearToolResults in head', async () => {
    const appended: Array<unknown> = []
    const toolResult = (id: string): ModelMessage => ({
      role: 'tool',
      content: 'x'.repeat(160),
      toolCallId: id,
    })
    const messages = [
      withId(big('user'), 'm1'),
      toolResult('t1'),
      toolResult('t2'),
      withId(big('user'), 'm2'),
    ]
    const mw = withCompaction({
      maxTokens: 10,
      durable: true,
      strategy: clearToolResults({ keepRecentToolResults: 1 }),
    })
    await runOnConfig(mw, messages, durableContext(appended).ctx)

    expect(appended).toMatchObject([
      {
        head: [
          messages[0],
          {
            role: 'tool',
            content: '[tool output cleared to save context]',
            toolCallId: 't1',
          },
        ],
        from: 2,
      },
    ])
  })

  it('never reuses a checkpoint in durable mode', async () => {
    const store = memoryStore()
    const strategy = summarizeOldest({
      summarize: async () => 'the gist',
      keepRecentTokens: 50,
    })
    // A run on a host without a log writes a checkpoint to the shared store.
    await runOnConfig(
      withCompaction({ maxTokens: 100, durable: true, strategy }),
      longList().slice(0, 3),
      checkpointContext(store),
    )
    expect(
      await store.get('@tanstack/ai-compaction', 'thread-1'),
    ).not.toBeNull()

    // A durable run with the same store compacts the full list again.
    const appended: Array<unknown> = []
    const { ctx } = durableContext(appended)
    provideMetadata(ctx, store)
    await runOnConfig(
      withCompaction({ maxTokens: 100, durable: true, strategy }),
      longList(),
      ctx,
    )
    expect(appended).toMatchObject([{ from: 3, firstKeptId: 'm4' }])
  })

  it('falls back to the checkpoint without LogRecordsCapability', async () => {
    const store = memoryStore()
    await runOnConfig(
      withCompaction({ maxTokens: 100, durable: true }),
      longList(),
      checkpointContext(store),
    )
    expect(
      await store.get('@tanstack/ai-compaction', 'thread-1'),
    ).not.toBeNull()
  })

  it('keeps a provider-only result when an earlier middleware set providerMessages', async () => {
    const appended: Array<unknown> = []
    const messages = longList()
    const config: ChatMiddlewareConfig = {
      messages,
      providerMessages: [...messages],
      systemPrompts: [],
      tools: [],
    }
    const result = await withCompaction({
      maxTokens: 100,
      durable: true,
    }).onConfig?.(durableContext(appended).ctx, config)

    expect(result?.providerMessages?.[0]?.content).toContain('omitted')
    expect(appended).toEqual([])
  })
})

describe('projectCompaction', () => {
  const fold = [
    withId(text('user', 'q1'), 'm1'),
    withId(text('assistant', 'a1'), 'm2'),
    withId(text('user', 'q2'), 'm3'),
    withId(text('assistant', 'a2'), 'm4'),
  ]
  const summary = summaryOf('the gist')

  it('ignores a record of another type', () => {
    expect(
      projectCompaction({
        messages: fold,
        record: { type: 'app.note', head: [summary], from: 0 },
      }),
    ).toBeUndefined()
  })

  it('finds the first kept message by id before it uses from', () => {
    // `from` is wrong here, as when a record lands before the reply is saved.
    expect(
      projectCompaction({
        messages: fold,
        record: {
          type: COMPACTION_RECORD_TYPE,
          head: [summary],
          from: 1,
          firstKeptId: 'm3',
        },
      }),
    ).toEqual([summary, fold[2], fold[3]])
  })

  it('uses from when the first kept message has no id', () => {
    expect(
      projectCompaction({
        messages: fold,
        record: { type: COMPACTION_RECORD_TYPE, head: [summary], from: 2 },
      }),
    ).toEqual([summary, fold[2], fold[3]])
  })

  it('keeps the full head when from is the end of the fold', () => {
    expect(
      projectCompaction({
        messages: fold,
        record: { type: COMPACTION_RECORD_TYPE, head: [summary], from: 4 },
      }),
    ).toEqual([summary])
  })

  // The log is folded again on each open, so a bad record must not throw.
  it.each<[string, Record<string, unknown>]>([
    [
      'a kept id that the fold does not have',
      { head: [summary], from: 1, firstKeptId: 'x' },
    ],
    ['a from past the end of the fold', { head: [summary], from: 9 }],
    ['a negative from', { head: [summary], from: -1 }],
    ['a from that is not an integer', { head: [summary], from: 1.5 }],
    ['a head that is not a message list', { head: [null], from: 1 }],
    ['only a messages list', { messages: [1] }],
  ])('skips a record with %s', (_label, fields) => {
    expect(
      projectCompaction({
        messages: fold,
        record: { type: COMPACTION_RECORD_TYPE, ...fields },
      }),
    ).toBeUndefined()
  })
})

describe('an empty summary', () => {
  const longList = () => [
    withId(big('user'), 'm1'),
    withId(big('assistant'), 'm2'),
    withId(big('user'), 'm3'),
    withId(big('assistant'), 'm4'),
  ]
  const EMPTY = 'The summarizer returned an empty summary.'
  const blank = (summary: string) =>
    summarizeOldest({ summarize: async () => summary, keepRecentTokens: 50 })

  it.each(['', '  \n\t '])(
    'fails the threshold compaction for %j and reports the error',
    async (summary) => {
      const mw = withCompaction({ maxTokens: 100, strategy: blank(summary) })
      const { ctx, events } = recordingContext('beforeModel')
      await expect(runOnConfig(mw, longList(), ctx)).rejects.toThrow(EMPTY)
      expect(events.at(-1)?.value).toMatchObject({
        reason: 'threshold',
        messagesAfter: 4,
        error: { message: EMPTY },
      })
    },
  )

  it('keeps the history with continueOnError', async () => {
    const mw = withCompaction({
      maxTokens: 100,
      continueOnError: true,
      strategy: blank(''),
    })
    const { ctx, events } = recordingContext('beforeModel')
    expect(await runOnConfig(mw, longList(), ctx)).toBeUndefined()
    expect(events.at(-1)?.value).toMatchObject({ error: { message: EMPTY } })
  })

  it('keeps the history on the compactNext path', async () => {
    const mw = withCompaction({
      maxTokens: 100_000,
      auto: false,
      continueOnError: true,
      strategy: blank(''),
    })
    mw.compactNext('thread-1')
    const { ctx, events } = recordingContext('beforeModel', {
      threadId: 'thread-1',
    })
    expect(await runOnConfig(mw, longList(), ctx)).toBeUndefined()
    expect(events.at(-1)?.value).toMatchObject({
      reason: 'forced',
      error: { message: EMPTY },
    })
  })

  it('fails when one call of a turn cut is empty', async () => {
    const mw = withCompaction({
      maxTokens: 100,
      strategy: summarizeOldest({
        summarize: async (_messages, input) =>
          input.turnPrefix ? '' : 'the gist',
        keepRecentTokens: 50,
        cut: 'turn',
      }),
    })
    const list = [
      big('user'),
      big('assistant'),
      big('user'),
      big('assistant'),
      big('assistant'),
    ]
    await expect(runOnConfig(mw, list)).rejects.toThrow(EMPTY)
  })

  it('writes no record on the durable path', async () => {
    const appended: Array<unknown> = []
    const mw = withCompaction({
      maxTokens: 100,
      durable: true,
      continueOnError: true,
      strategy: blank(''),
    })
    const { ctx, events } = durableContext(appended)
    expect(await runOnConfig(mw, longList(), ctx)).toBeUndefined()
    expect(appended).toEqual([])
    expect(events.at(-1)?.value).toMatchObject({ error: { message: EMPTY } })
  })

  it('writes no record after the turn and reports the error', async () => {
    const appended: Array<unknown> = []
    const onCompact = vi.fn()
    const mw = withCompaction({
      maxTokens: 100,
      contextWindow: 100,
      countTokens: 'usage',
      durable: true,
      onCompact,
      strategy: blank(''),
    })
    const { ctx } = durableContext(appended)
    const list = longList().slice(0, 3)
    ctx.messages = list
    await mw.onUsage?.(ctx, tokenUsage(110, 10))
    ctx.messages = longList()
    await mw.onFinish?.(ctx, { finishReason: 'stop', duration: 0, content: '' })

    expect(appended).toEqual([])
    expect(onCompact).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'after-turn',
        error: { message: EMPTY },
      }),
    )
  })
})

describe('after-turn check', () => {
  const finish: FinishInfo = { finishReason: 'stop', duration: 0, content: '' }
  const covered = () => [
    withId(big('user'), 'm1'),
    withId(big('assistant'), 'm2'),
    withId(big('user'), 'm3'),
  ]
  const reply = withId(big('assistant'), 'm4')
  const gist = () =>
    summarizeOldest({ summarize: async () => 'the gist', keepRecentTokens: 50 })

  /** One model call with `promptTokens + 10` of usage, then the end of the run. */
  async function finishTurn(
    mw: CompactionMiddleware,
    ctx: ChatMiddlewareContext,
    promptTokens: number,
  ) {
    const list = covered()
    ctx.messages = list
    await mw.onUsage?.(ctx, tokenUsage(promptTokens, 10))
    ctx.messages = [...list, reply]
    await mw.onFinish?.(ctx, finish)
  }

  it('compacts after a silent overflow, even with auto: false', async () => {
    const appended: Array<unknown> = []
    const onCompact = vi.fn()
    const mw = withCompaction({
      maxTokens: 1000,
      contextWindow: 100,
      countTokens: 'usage',
      auto: false,
      durable: true,
      onCompact,
      strategy: gist(),
    })
    await finishTurn(mw, durableContext(appended).ctx, 110)

    expect(appended).toEqual([
      {
        type: COMPACTION_RECORD_TYPE,
        reason: 'after-turn',
        tokensBefore: 120,
        tokensAfter: expect.any(Number),
        head: [summaryOf('the gist')],
        from: 3,
        firstKeptId: 'm4',
      },
    ])
    expect(onCompact).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'after-turn', before: 120 }),
    )
  })

  it('records the usage of the summary call after the turn', async () => {
    const appended: Array<unknown> = []
    const mw = withCompaction({
      maxTokens: 1000,
      contextWindow: 100,
      countTokens: 'usage',
      durable: true,
      strategy: summarizeOldest({
        summarize: async () => ({
          summary: 'the gist',
          usage: tokenUsage(12, 3),
        }),
        keepRecentTokens: 50,
      }),
    })
    await finishTurn(mw, durableContext(appended).ctx, 110)

    expect(appended).toMatchObject([
      { reason: 'after-turn', usage: tokenUsage(12, 3) },
    ])
  })

  it('compacts after the turn over maxTokens when auto is on', async () => {
    const appended: Array<unknown> = []
    const mw = withCompaction({
      maxTokens: 100,
      contextWindow: 1000,
      countTokens: 'usage',
      durable: true,
      strategy: gist(),
    })
    await finishTurn(mw, durableContext(appended).ctx, 110)
    expect(appended).toMatchObject([{ reason: 'after-turn', from: 3 }])
  })

  it('counts the usage of a last call that got a compacted view', async () => {
    const appended: Array<unknown> = []
    const mw = withCompaction({
      maxTokens: 100,
      contextWindow: 1000,
      countTokens: 'usage',
      durable: true,
      strategy: gist(),
    })
    const { ctx } = durableContext(appended)
    // The call compacts, and the model gets the compacted view.
    const view = (await runOnConfig(mw, covered(), ctx))?.providerMessages ?? []
    ctx.messages = view
    await mw.onUsage?.(ctx, tokenUsage(110, 10))
    ctx.messages = [...view, reply]
    await mw.onFinish?.(ctx, finish)

    expect(appended).toMatchObject([
      { reason: 'threshold' },
      { reason: 'after-turn', tokensBefore: 120 },
    ])
  })

  it('ignores maxTokens after the turn with auto: false', async () => {
    const appended: Array<unknown> = []
    const mw = withCompaction({
      maxTokens: 100,
      contextWindow: 1000,
      countTokens: 'usage',
      auto: false,
      durable: true,
      strategy: gist(),
    })
    await finishTurn(mw, durableContext(appended).ctx, 110)
    expect(appended).toEqual([])
  })

  it('writes no record when the strategy returns its input', async () => {
    const appended: Array<unknown> = []
    const strategy = vi.fn<CompactionStrategy>(
      (messages) => messages as Array<ModelMessage>,
    )
    const mw = withCompaction({
      maxTokens: 100,
      contextWindow: 1000,
      countTokens: 'usage',
      durable: true,
      strategy,
    })
    await finishTurn(mw, durableContext(appended).ctx, 110)
    expect(strategy).toHaveBeenCalledOnce()
    expect(appended).toEqual([])
  })

  it('writes the record and never fails the run when onCompact throws', async () => {
    const appended: Array<unknown> = []
    const onCompact = vi.fn<(info: CompactionInfo) => void>(() => {
      throw new Error('observer failed')
    })
    const mw = withCompaction({
      maxTokens: 1000,
      contextWindow: 100,
      countTokens: 'usage',
      durable: true,
      onCompact,
      strategy: gist(),
    })

    await expect(
      finishTurn(mw, durableContext(appended).ctx, 110),
    ).resolves.toBeUndefined()
    expect(appended).toMatchObject([{ reason: 'after-turn' }])
    expect(onCompact).toHaveBeenLastCalledWith(
      expect.objectContaining({ error: { message: 'observer failed' } }),
    )
  })

  it('fails the run when the log append fails, and reports no success', async () => {
    const onCompact = vi.fn()
    const mw = withCompaction({
      maxTokens: 1000,
      contextWindow: 100,
      countTokens: 'usage',
      durable: true,
      onCompact,
      strategy: gist(),
    })
    const { ctx } = usageContext([], {
      capabilities: new CapabilityRegistry(),
    })
    provideLogRecords(ctx, {
      append: async () => {
        throw new Error('log closed')
      },
    })

    await expect(finishTurn(mw, ctx, 110)).rejects.toThrow('log closed')
    expect(onCompact).not.toHaveBeenCalled()
  })

  it('does nothing under both limits', async () => {
    const appended: Array<unknown> = []
    const summarize = vi.fn(async () => 'the gist')
    const mw = withCompaction({
      maxTokens: 1000,
      contextWindow: 1000,
      countTokens: 'usage',
      durable: true,
      strategy: summarizeOldest({ summarize, keepRecentTokens: 50 }),
    })
    await finishTurn(mw, durableContext(appended).ctx, 110)
    expect(summarize).not.toHaveBeenCalled()
    expect(appended).toEqual([])
  })

  it('skips without LogRecordsCapability, and the next call checks the overflow', async () => {
    const store = memoryStore()
    const summarize = vi.fn(async () => 'the gist')
    const mw = withCompaction({
      maxTokens: 100,
      contextWindow: 1000,
      countTokens: 'usage',
      durable: true,
      strategy: summarizeOldest({ summarize, keepRecentTokens: 50 }),
    })
    // A store but no log: the after-turn check does nothing.
    await finishTurn(mw, checkpointContext(store), 110)
    expect(summarize).not.toHaveBeenCalled()
    expect(await store.get('@tanstack/ai-compaction', 'thread-1')).toBeNull()

    // The next call counts 120 + 1 from the saved usage and compacts first.
    const next = [...covered(), reply, text('user', 'next')]
    const result = await runOnConfig(mw, next, checkpointContext(store))
    expect(summarize).toHaveBeenCalledOnce()
    expect(result?.providerMessages?.[0]).toEqual(summaryOf('the gist'))
  })

  it('reports a failed after-turn compaction through onCompact and never fails the run', async () => {
    const appended: Array<unknown> = []
    const onCompact = vi.fn()
    // continueOnError is not set: the after-turn check still does not throw.
    const mw = withCompaction({
      maxTokens: 1000,
      contextWindow: 100,
      countTokens: 'usage',
      durable: true,
      onCompact,
      strategy: summarizeOldest({
        summarize: async () => {
          throw new Error('summary failed')
        },
        keepRecentTokens: 50,
      }),
    })

    await expect(
      finishTurn(mw, durableContext(appended).ctx, 110),
    ).resolves.toBeUndefined()
    expect(onCompact).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'after-turn',
        before: 120,
        error: { message: 'summary failed' },
      }),
    )
    expect(appended).toEqual([])
  })

  it('passes the abort signal of the run to the summary call', async () => {
    const appended: Array<unknown> = []
    const run = new AbortController()
    const reason = new Error('stop')
    let seen: unknown
    const mw = withCompaction({
      maxTokens: 1000,
      contextWindow: 100,
      countTokens: 'usage',
      durable: true,
      strategy: summarizeOldest({
        summarize: async (_messages, input) => {
          run.abort(reason)
          seen = input.signal?.reason
          return 'the gist'
        },
        keepRecentTokens: 50,
      }),
    })
    const { ctx } = durableContext(appended)
    ctx.signal = run.signal
    await finishTurn(mw, ctx, 110)

    expect(seen).toBe(reason)
    // The run was aborted, so there is no record.
    expect(appended).toEqual([])
  })

  it('adds no onFinish hook without both durable: true and countTokens: usage', () => {
    expect(
      withCompaction({ maxTokens: 100, durable: true }).onFinish,
    ).toBeUndefined()
    expect(
      withCompaction({
        maxTokens: 100,
        contextWindow: 1000,
        countTokens: 'usage',
      }).onFinish,
    ).toBeUndefined()
  })
})

describe('summarizeOldest merge and turn cut', () => {
  it('passes the earlier summary and its details to the callback', async () => {
    const summarize = vi.fn<Summarizer>(async () => 'new summary')
    const earlier: ModelMessage = {
      role: 'assistant',
      content:
        '<untrusted-conversation-summary>\nold facts\n\n<compaction-details>\nfiles: a.ts\n</compaction-details>\n</untrusted-conversation-summary>',
    }
    const mw = withCompaction({
      maxTokens: 100,
      strategy: summarizeOldest({ summarize, keepRecentTokens: 50 }),
    })
    const messages = [
      earlier,
      big('user'),
      big('assistant'),
      big('user'),
      big('assistant'),
    ]
    await runOnConfig(mw, messages)

    expect(summarize).toHaveBeenCalledOnce()
    // The messages are the same as before, so an old callback still works.
    expect(summarize.mock.calls[0]?.[0]).toEqual(messages.slice(0, 4))
    expect(summarize.mock.calls[0]?.[1]).toMatchObject({
      previousSummary: 'old facts',
      previousDetails: 'files: a.ts',
    })
  })

  it('reads the details back on the next compaction', async () => {
    const seen: Array<SummarizeInput> = []
    const summarize: Summarizer = async (_messages, input) => {
      seen.push(input)
      return 'gist\n\n<compaction-details>\nfiles: a.ts\n</compaction-details>'
    }
    const mw = withCompaction({
      maxTokens: 100,
      strategy: summarizeOldest({ summarize, keepRecentTokens: 50 }),
    })
    const first = await runOnConfig(mw, [
      big('user'),
      big('assistant'),
      big('user'),
      big('assistant'),
    ])
    const compacted = first?.providerMessages ?? []
    await runOnConfig(mw, [...compacted, big('user'), big('assistant')])

    expect(seen[0]?.previousSummary).toBeUndefined()
    expect(seen[1]).toMatchObject({
      previousSummary: 'gist',
      previousDetails: 'files: a.ts',
    })
  })

  it('passes the abort signal of the run to the callback', async () => {
    const controller = new AbortController()
    const reason = new Error('stop')
    let seen: unknown
    const summarize = vi.fn<Summarizer>(async (_messages, input) => {
      controller.abort(reason)
      seen = input.signal?.reason
      return 'the gist'
    })
    const mw = withCompaction({
      maxTokens: 100,
      strategy: summarizeOldest({ summarize, keepRecentTokens: 50 }),
    })
    await runOnConfig(
      mw,
      [big('user'), big('assistant'), big('user'), big('assistant')],
      recordingContext('beforeModel', { signal: controller.signal }).ctx,
    )
    expect(seen).toBe(reason)
  })

  it('adds :turn to the strategy key with cut: turn', async () => {
    const keyOf = async (cut?: 'turn') => {
      const mw = withCompaction({
        maxTokens: 100,
        strategy: summarizeOldest({
          summarize: async () => 'the gist',
          keepRecentTokens: 50,
          cut,
        }),
      })
      const { ctx, events } = recordingContext('beforeModel')
      await runOnConfig(
        mw,
        [big('user'), big('assistant'), big('user'), big('assistant')],
        ctx,
      )
      return events[0]?.value.strategyKey
    }
    expect(await keyOf()).toBe('summarize-oldest:50:assistant:maxTokens=100')
    expect(await keyOf('turn')).toBe(
      'summarize-oldest:50:assistant:turn:maxTokens=100',
    )
  })

  it('summarizes a split turn in two parallel calls with cut: turn', async () => {
    const seen: Array<{
      messages: Array<ModelMessage>
      input: SummarizeInput
    }> = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const summarize: Summarizer = async (messages, input) => {
      seen.push({ messages, input })
      await gate
      return input.turnPrefix ? 'prefix gist' : 'history gist'
    }
    const mw = withCompaction({
      maxTokens: 100,
      strategy: summarizeOldest({
        summarize,
        keepRecentTokens: 50,
        cut: 'turn',
      }),
    })
    const lastAnswer = big('assistant')
    // The kept tail starts at the last answer, inside the turn of 'new task'.
    const messages: Array<ModelMessage> = [
      text('user', 'old question'),
      text('assistant', 'old answer'),
      text('user', 'new task'),
      { role: 'assistant', content: 'x'.repeat(160), toolCalls: [call] },
      { role: 'tool', content: 'x'.repeat(160), toolCallId: 't1' },
      lastAnswer,
    ]
    const pending = runOnConfig(mw, messages)
    // Both calls start before either one ends.
    await vi.waitFor(() => expect(seen).toHaveLength(2))
    release()
    const result = await pending

    expect(seen.map((item) => item.input.turnPrefix ?? false)).toEqual([
      false,
      true,
    ])
    expect(seen[0]?.messages.map((message) => message.content)).toEqual([
      'old question',
      'old answer',
    ])
    expect(seen[1]?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
    ])
    expect(result?.providerMessages).toEqual([
      {
        role: 'assistant',
        content:
          '<untrusted-conversation-summary>\nhistory gist\n\n## Turn context\n\nprefix gist\n</untrusted-conversation-summary>',
      },
      lastAnswer,
    ])
  })

  it('makes only the turn-prefix call when the turn starts right after the earlier summary', async () => {
    const summarize = vi.fn<Summarizer>(async () => 'prefix gist')
    const mw = withCompaction({
      maxTokens: 100,
      strategy: summarizeOldest({
        summarize,
        keepRecentTokens: 50,
        cut: 'turn',
      }),
    })
    const lastAnswer = big('assistant')
    // The user message of the turn comes right after the summary.
    const result = await runOnConfig(mw, [
      {
        role: 'assistant',
        content:
          '<untrusted-conversation-summary>\nold facts\n\n<compaction-details>\nfiles: a.ts\n</compaction-details>\n</untrusted-conversation-summary>',
      },
      text('user', 'new task'),
      { role: 'assistant', content: 'x'.repeat(160), toolCalls: [call] },
      { role: 'tool', content: 'x'.repeat(160), toolCallId: 't1' },
      lastAnswer,
    ])

    expect(summarize).toHaveBeenCalledOnce()
    expect(summarize.mock.calls[0]?.[1].turnPrefix).toBe(true)
    expect(result?.providerMessages).toEqual([
      {
        role: 'assistant',
        content:
          '<untrusted-conversation-summary>\nold facts\n\n<compaction-details>\nfiles: a.ts\n</compaction-details>\n\n## Turn context\n\nprefix gist\n</untrusted-conversation-summary>',
      },
      lastAnswer,
    ])
  })

  it.each(['assistant', 'user'] as const)(
    'merges with one update call when no user message comes after the earlier summary (summary role %s)',
    async (role) => {
      const summarize = vi.fn<Summarizer>(async () => 'new gist')
      const mw = withCompaction({
        maxTokens: 100,
        strategy: summarizeOldest({
          summarize,
          keepRecentTokens: 50,
          summaryRole: role,
          cut: 'turn',
        }),
      })
      // One long agent turn: it started before the earlier summary.
      const result = await runOnConfig(mw, [
        { ...summaryOf('old facts'), role },
        { role: 'assistant', content: 'x'.repeat(160), toolCalls: [call] },
        { role: 'tool', content: 'x'.repeat(160), toolCallId: 't1' },
        { role: 'assistant', content: 'x'.repeat(160), toolCalls: [call] },
        { role: 'tool', content: 'x'.repeat(160), toolCallId: 't1' },
        big('assistant'),
      ])

      expect(summarize).toHaveBeenCalledOnce()
      expect(summarize.mock.calls[0]?.[1]).toMatchObject({
        previousSummary: 'old facts',
      })
      expect(summarize.mock.calls[0]?.[1].turnPrefix).toBeUndefined()
      expect(result?.providerMessages?.[0]?.content).toBe(
        '<untrusted-conversation-summary>\nnew gist\n</untrusted-conversation-summary>',
      )
    },
  )

  it('aborts the other call when one call fails', async () => {
    let prefixSignal: AbortSignal | undefined
    const summarize: Summarizer = async (_messages, input) => {
      if (!input.turnPrefix) throw new Error('history failed')
      prefixSignal = input.signal
      // Ends when the signal aborts, so no promise stays open.
      await new Promise((resolve) => {
        input.signal?.addEventListener('abort', resolve)
      })
      return 'prefix gist'
    }
    const mw = withCompaction({
      maxTokens: 100,
      strategy: summarizeOldest({
        summarize,
        keepRecentTokens: 50,
        cut: 'turn',
      }),
    })
    await expect(
      runOnConfig(mw, [
        text('user', 'old question'),
        text('assistant', 'old answer'),
        text('user', 'new task'),
        { role: 'assistant', content: 'x'.repeat(160), toolCalls: [call] },
        { role: 'tool', content: 'x'.repeat(160), toolCallId: 't1' },
        big('assistant'),
      ]),
    ).rejects.toThrow('history failed')
    expect(prefixSignal?.aborted).toBe(true)
  })

  it('does not split a turn when the cut is at a user message', async () => {
    const summarize = vi.fn<Summarizer>(async () => 'the gist')
    const mw = withCompaction({
      maxTokens: 100,
      strategy: summarizeOldest({
        summarize,
        keepRecentTokens: 50,
        cut: 'turn',
      }),
    })
    await runOnConfig(mw, [
      big('assistant'),
      big('user'),
      big('assistant'),
      big('user'),
    ])
    expect(summarize).toHaveBeenCalledOnce()
    expect(summarize.mock.calls[0]?.[1].turnPrefix).toBeUndefined()
  })
})

describe('conversationSummarizer', () => {
  /** A fake model that answers `the summary` twice and keeps each request. */
  function fakeSummaryModel() {
    const requests: Array<TextOptions> = []
    const fake = fakeText()
    const answer = ({ request }: { request: TextOptions }) => {
      requests.push(request)
      return { text: 'the summary' }
    }
    // Two answers: a split turn makes a history call and a turn-prefix call.
    fake.setResponses([answer, answer])
    return { fake, requests }
  }
  type Details = (input: {
    messages: Array<ModelMessage>
    previousDetails?: string
  }) => string | undefined
  /** summarizeOldest with cut: turn and conversationSummarizer. */
  const turnCut = (fake: ReturnType<typeof fakeText>, details: Details) =>
    withCompaction({
      maxTokens: 100,
      strategy: summarizeOldest({
        summarize: conversationSummarizer({ adapter: fake, details }),
        keepRecentTokens: 50,
        cut: 'turn',
      }),
    })
  const toolTurn = (): Array<ModelMessage> => [
    { role: 'assistant', content: 'x'.repeat(160), toolCalls: [call] },
    { role: 'tool', content: 'x'.repeat(160), toolCallId: 't1' },
  ]
  const systemOf = (request: TextOptions | undefined) =>
    JSON.stringify(request?.systemPrompts)
  const userOf = (request: TextOptions | undefined) =>
    JSON.stringify(request?.messages)

  it('asks with the checkpoint sections and reports the usage', async () => {
    const { fake, requests } = fakeSummaryModel()
    const result = await conversationSummarizer({ adapter: fake })(
      [text('user', 'fix the bug'), text('assistant', 'done')],
      {},
    )

    expect(result).toEqual({
      summary: 'the summary',
      usage: expect.objectContaining({
        promptTokens: expect.any(Number),
        completionTokens: 3,
      }),
    })
    for (const heading of [
      '## Goal',
      '## Constraints',
      '## Progress',
      '## Key decisions',
      '## Next steps',
      '## Critical context',
    ]) {
      expect(systemOf(requests[0])).toContain(heading)
    }
    expect(userOf(requests[0])).toContain('[User]: fix the bug')
    expect(userOf(requests[0])).toContain('[Assistant]: done')
  })

  it('writes text parts and a tag for each other part', async () => {
    const { fake, requests } = fakeSummaryModel()
    await conversationSummarizer({ adapter: fake })(
      [
        {
          role: 'user',
          content: [
            { type: 'text', content: 'look at this' },
            {
              type: 'image',
              source: { type: 'url', value: 'https://x/y.png' },
            },
          ],
        },
        { role: 'assistant', content: null },
      ],
      {},
    )

    expect(userOf(requests[0])).toContain('[User]: look at this\\n[image]')
    expect(userOf(requests[0])).toContain('[Assistant]: ')
  })

  it('uses the update prompt and leaves the earlier summary out of the conversation', async () => {
    const { fake, requests } = fakeSummaryModel()
    const earlier: ModelMessage = {
      role: 'assistant',
      content:
        '<untrusted-conversation-summary>\nold facts\n</untrusted-conversation-summary>',
    }
    await conversationSummarizer({ adapter: fake })(
      [earlier, text('user', 'new step')],
      { previousSummary: 'old facts' },
    )

    expect(systemOf(requests[0])).toContain('You update a checkpoint summary')
    const content = userOf(requests[0])
    expect(content).toContain(
      '<previous-summary>\\nold facts\\n</previous-summary>',
    )
    expect(content.match(/old facts/g)).toHaveLength(1)
    expect(content).toContain('[User]: new step')
  })

  it('uses the turn-prefix prompt for the first part of a turn', async () => {
    const { fake, requests } = fakeSummaryModel()
    await conversationSummarizer({ adapter: fake })(
      [text('user', 'new task')],
      { turnPrefix: true },
    )
    expect(systemOf(requests[0])).toContain(
      'the first part of the current turn',
    )
  })

  it('cuts each tool result to 2,000 characters, or to maxToolResultChars', async () => {
    const tool: ModelMessage = {
      role: 'tool',
      content: 'y'.repeat(5000),
      toolCallId: 't1',
    }
    const first = fakeSummaryModel()
    await conversationSummarizer({ adapter: first.fake })([tool], {})
    expect(userOf(first.requests[0])).toContain('y'.repeat(2000))
    expect(userOf(first.requests[0])).not.toContain('y'.repeat(2001))

    const second = fakeSummaryModel()
    await conversationSummarizer({
      adapter: second.fake,
      maxToolResultChars: 10,
    })([tool], {})
    expect(userOf(second.requests[0])).toContain('y'.repeat(10))
    expect(userOf(second.requests[0])).not.toContain('y'.repeat(11))
  })

  it('adds the details tag only when details returns text', async () => {
    const withDetails = fakeSummaryModel()
    const details = vi.fn(
      ({ previousDetails }: { previousDetails?: string }) =>
        previousDetails ? `${previousDetails}, b.ts` : 'a.ts',
    )
    const result = await conversationSummarizer({
      adapter: withDetails.fake,
      details,
    })([text('user', 'edit b.ts')], {
      previousSummary: 'old',
      previousDetails: 'a.ts',
    })
    expect(result).toMatchObject({
      summary:
        'the summary\n\n<compaction-details>\na.ts, b.ts\n</compaction-details>',
    })

    const without = fakeSummaryModel()
    const plain = await conversationSummarizer({
      adapter: without.fake,
      details: () => undefined,
    })([text('user', 'hi')], {})
    expect(plain).toMatchObject({ summary: 'the summary' })
  })

  it('gives details the new messages without the earlier summary', async () => {
    const { fake } = fakeSummaryModel()
    const details = vi.fn<Details>(() => undefined)
    await conversationSummarizer({ adapter: fake, details })(
      [summaryOf('old facts'), text('user', 'new step')],
      { previousSummary: 'old facts' },
    )
    expect(details).toHaveBeenCalledWith({
      messages: [text('user', 'new step')],
    })
  })

  it('gives details the history and the turn prefix, and keeps the prefix out of the history prompt', async () => {
    const { fake, requests } = fakeSummaryModel()
    const details = vi.fn<Details>(() => 'files: a.ts')
    const prefix = [text('user', 'new task'), ...toolTurn()]
    const result = await runOnConfig(turnCut(fake, details), [
      summaryOf('old facts'),
      text('user', 'old question'),
      text('assistant', 'old answer'),
      ...prefix,
      big('assistant'),
    ])

    expect(details).toHaveBeenCalledOnce()
    expect(details.mock.calls[0]?.[0].messages).toEqual([
      text('user', 'old question'),
      text('assistant', 'old answer'),
      ...prefix,
    ])
    const history = requests.find((request) =>
      systemOf(request).includes('You update a checkpoint summary'),
    )
    expect(userOf(history)).toContain('[User]: old question')
    expect(userOf(history)).not.toContain('new task')
    expect(result?.providerMessages?.[0]?.content).toBe(
      '<untrusted-conversation-summary>\nthe summary\n\n<compaction-details>\nfiles: a.ts\n</compaction-details>\n\n## Turn context\n\nthe summary\n</untrusted-conversation-summary>',
    )
  })

  it('writes the details in the turn-prefix call when no history call runs', async () => {
    const { fake, requests } = fakeSummaryModel()
    const details = vi.fn<Details>(() => 'files: a.ts')
    // The first compaction of one long turn: the turn starts at index 0.
    const prefix = [text('user', 'new task'), ...toolTurn()]
    const result = await runOnConfig(turnCut(fake, details), [
      ...prefix,
      big('assistant'),
    ])

    expect(requests).toHaveLength(1)
    expect(details.mock.calls).toEqual([[{ messages: prefix }]])
    expect(result?.providerMessages?.[0]?.content).toBe(
      '<untrusted-conversation-summary>\n<compaction-details>\nfiles: a.ts\n</compaction-details>\n\n## Turn context\n\nthe summary\n</untrusted-conversation-summary>',
    )
  })

  it('replaces the details of the earlier summary when the turn starts right after it', async () => {
    const { fake, requests } = fakeSummaryModel()
    const details = vi.fn<Details>(
      ({ previousDetails }) => `${previousDetails}, b.ts`,
    )
    const prefix = [text('user', 'new task'), ...toolTurn()]
    const result = await runOnConfig(turnCut(fake, details), [
      {
        role: 'assistant',
        content:
          '<untrusted-conversation-summary>\nold facts\n\n<compaction-details>\na.ts\n</compaction-details>\n</untrusted-conversation-summary>',
      },
      ...prefix,
      big('assistant'),
    ])

    expect(requests).toHaveLength(1)
    expect(details.mock.calls).toEqual([
      [{ messages: prefix, previousDetails: 'a.ts' }],
    ])
    // One details tag, with the merged text of the hook.
    expect(result?.providerMessages?.[0]?.content).toBe(
      '<untrusted-conversation-summary>\nold facts\n\n<compaction-details>\na.ts, b.ts\n</compaction-details>\n\n## Turn context\n\nthe summary\n</untrusted-conversation-summary>',
    )
  })

  it('follows the abort signal of the run', async () => {
    // Already aborted: it throws the reason and makes no model request.
    const early = fakeSummaryModel()
    await expect(
      conversationSummarizer({ adapter: early.fake })([text('user', 'hi')], {
        signal: AbortSignal.abort(new Error('stop')),
      }),
    ).rejects.toThrow('stop')
    expect(early.requests).toEqual([])

    // A reason that is not an Error: it throws its own error.
    await expect(
      conversationSummarizer({ adapter: early.fake })([text('user', 'hi')], {
        signal: AbortSignal.abort('stop'),
      }),
    ).rejects.toThrow('The summary was aborted.')

    // Aborted during the call: the signal of the model request is aborted.
    // chat() gives the adapter `request.signal`, not `abortController`.
    const controller = new AbortController()
    const late = fakeText()
    let requestSignal: AbortSignal | null | undefined
    late.setResponses([
      ({ request }) => {
        controller.abort(new Error('stop'))
        requestSignal = request.request?.signal
        return { text: 'the summary' }
      },
    ])
    await expect(
      conversationSummarizer({ adapter: late })([text('user', 'hi')], {
        signal: controller.signal,
      }),
    ).rejects.toThrow('stop')
    expect(requestSignal?.aborted).toBe(true)
  })
})

const BACKGROUND = '@tanstack/ai-compaction:background'

/** `count` messages of 40 tokens, user and assistant in turn, with ids m1, m2, ... */
const list = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    withId(big(index % 2 === 0 ? 'user' : 'assistant'), `m${index + 1}`),
  )

/** One message of one token, with id `id`. */
const small = (id: string) => withId(text('user', 'ok'), id)

/** A summarizer that waits for `release()`. `calls` keeps the messages of each call. */
function gatedSummary() {
  const calls: Array<Array<ModelMessage>> = []
  let open = (): void => undefined
  const gate = new Promise<void>((resolve) => {
    open = () => resolve()
  })
  const summarize: Summarizer = async (messages) => {
    calls.push(messages)
    await gate
    return 'the gist'
  }
  return { summarize, calls, release: () => open() }
}

/**
 * A beforeModel context of thread-1 in run `runId`. `store` is its metadata
 * store, and each log append lands in `appended`.
 */
function runContext(
  runId: string,
  options: {
    store?: MetadataStore
    appended?: Array<unknown>
    signal?: AbortSignal
  } = {},
) {
  const recorded = usageContext([], {
    runId,
    ...(options.signal ? { signal: options.signal } : {}),
    capabilities: new CapabilityRegistry(),
  })
  if (options.store) provideMetadata(recorded.ctx, options.store)
  const appended = options.appended
  if (appended) {
    provideLogRecords(recorded.ctx, {
      append: async (records) => {
        appended.push(...records)
      },
    })
  }
  return recorded
}

/** maxTokens 200, atTokens 150. The summary keeps the last 40-token message. */
const backgroundCompaction = (
  summarize: Summarizer,
  extra: Partial<CompactionOptions> = {},
) =>
  withCompaction({
    maxTokens: 200,
    background: { atTokens: 150 },
    strategy: summarizeOldest({ summarize, keepRecentTokens: 50 }),
    ...extra,
  })

describe('background compaction', () => {
  it('throws when atTokens is not below maxTokens', () => {
    expect(() =>
      withCompaction({ maxTokens: 200, background: { atTokens: 200 } }),
    ).toThrow('withCompaction: background.atTokens must be below maxTokens.')
  })

  it('starts the summary past atTokens, and the model call does not wait', async () => {
    const gated = gatedSummary()
    const mw = backgroundCompaction(gated.summarize)
    const { ctx, events } = runContext('r1')
    // 160 tokens: over atTokens (150), not over maxTokens (200).
    const result = await runOnConfig(mw, list(4), ctx)

    expect(result).toBeUndefined()
    expect(events.map((event) => event.name)).toEqual([
      COMPACTION_STARTED_EVENT,
    ])
    expect(events[0]?.value).toMatchObject({
      before: 160,
      messagesBefore: 4,
      reason: 'background',
    })
    await vi.waitFor(() => expect(gated.calls).toHaveLength(1))

    // A later call while it runs starts no second summary.
    await runOnConfig(mw, list(4), runContext('r1').ctx)
    expect(gated.calls).toHaveLength(1)
    gated.release()
  })

  it('reports a failed summary, applies nothing, and starts again at the next call', async () => {
    const onCompact = vi.fn()
    const summarize = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error('summary failed'))
    const mw = backgroundCompaction(summarize, { onCompact })
    const store = memoryStore()
    const first = runContext('r1', { store })
    await runOnConfig(mw, list(4), first.ctx)
    await vi.waitFor(() => expect(onCompact).toHaveBeenCalledTimes(1))

    expect(onCompact).toHaveBeenCalledWith({
      before: 160,
      after: 160,
      messagesBefore: 4,
      messagesAfter: 4,
      reason: 'background',
      error: { message: 'summary failed' },
    })
    expect(first.events.map((event) => event.name)).toEqual([
      COMPACTION_STARTED_EVENT,
      COMPACTION_ENDED_EVENT,
    ])
    expect(first.events[1]?.value).toMatchObject({
      reason: 'background',
      error: { message: 'summary failed' },
    })
    expect(await store.get(BACKGROUND, 'thread-1')).toBeNull()

    // The next call past atTokens starts a new summary.
    await runOnConfig(mw, list(4), runContext('r1', { store }).ctx)
    await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(2))
  })
  it('applies a ready summary at the first model call of the next run, not later in the same run', async () => {
    const gated = gatedSummary()
    const store = memoryStore()
    const mw = backgroundCompaction(gated.summarize)
    await runOnConfig(mw, list(4), runContext('r1', { store }).ctx)
    gated.release()
    await vi.waitFor(async () =>
      expect(await store.get(BACKGROUND, 'thread-1')).not.toBeNull(),
    )

    // A later call of the same run does not apply it, and starts no new one.
    const grown = [...list(4), small('m5')]
    expect(
      await runOnConfig(mw, grown, runContext('r1', { store }).ctx),
    ).toBeUndefined()

    // The first call of the next run applies it.
    const { ctx, events } = runContext('r2', { store })
    const result = await runOnConfig(mw, grown, ctx)
    expect(result?.providerMessages).toEqual([
      summaryOf('the gist'),
      grown[3],
      grown[4],
    ])
    expect(events.map((event) => event.name)).toEqual([
      COMPACTION_STATE_EVENT,
      COMPACTION_ENDED_EVENT,
    ])
    expect(events[1]?.value).toMatchObject({
      reason: 'background',
      messagesAfter: 3,
    })
    expect(await store.get(BACKGROUND, 'thread-1')).toBeNull()
    expect(gated.calls).toHaveLength(1)
  })

  it('drops a ready summary whose kept message is gone, and reports it', async () => {
    const onCompact = vi.fn()
    const store = memoryStore()
    const mw = backgroundCompaction(async () => 'the gist', { onCompact })
    await runOnConfig(mw, list(4), runContext('r1', { store }).ctx)
    await vi.waitFor(async () =>
      expect(await store.get(BACKGROUND, 'thread-1')).not.toBeNull(),
    )

    // A newer compaction cut past m4.
    const newer = [summaryOf('newer'), small('m9')]
    const { ctx, events } = runContext('r2', { store })
    expect(await runOnConfig(mw, newer, ctx)).toBeUndefined()
    expect(events.map((event) => event.name)).toEqual([COMPACTION_ENDED_EVENT])
    expect(events[0]?.value).toMatchObject({
      reason: 'background',
      stale: true,
    })
    expect(onCompact).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'background', stale: true }),
    )
    expect(await store.get(BACKGROUND, 'thread-1')).toBeNull()
  })

  it('applies a ready summary from the metadata store after a restart', async () => {
    const store = memoryStore()
    await runOnConfig(
      backgroundCompaction(async () => 'the gist'),
      list(4),
      runContext('r1', { store }).ctx,
    )
    await vi.waitFor(async () =>
      expect(await store.get(BACKGROUND, 'thread-1')).not.toBeNull(),
    )

    // A new middleware instance on the same store.
    const grown = [...list(4), small('m5')]
    const result = await runOnConfig(
      backgroundCompaction(async () => 'the gist'),
      grown,
      runContext('r2', { store }).ctx,
    )
    expect(result?.providerMessages).toEqual([
      summaryOf('the gist'),
      grown[3],
      grown[4],
    ])
  })

  it('without ids, applies only when the messages before the cut are the same', async () => {
    const plain = [big('user'), big('assistant'), big('user'), big('assistant')]
    const store = memoryStore()
    const mw = backgroundCompaction(async () => 'the gist')
    await runOnConfig(mw, plain, runContext('r1', { store }).ctx)
    await vi.waitFor(async () =>
      expect(await store.get(BACKGROUND, 'thread-1')).not.toBeNull(),
    )
    const grown = [...plain, text('user', 'ok')]
    const result = await runOnConfig(mw, grown, runContext('r2', { store }).ctx)
    expect(result?.providerMessages).toEqual([
      summaryOf('the gist'),
      plain[3],
      grown[4],
    ])

    // A changed message before the cut makes the summary stale.
    const otherStore = memoryStore()
    const other = backgroundCompaction(async () => 'the gist')
    await runOnConfig(other, plain, runContext('r1', { store: otherStore }).ctx)
    await vi.waitFor(async () =>
      expect(await otherStore.get(BACKGROUND, 'thread-1')).not.toBeNull(),
    )
    const edited = [
      text('user', 'y'.repeat(160)),
      ...plain.slice(1),
      text('user', 'ok'),
    ]
    const { ctx, events } = runContext('r2', { store: otherStore })
    expect(await runOnConfig(other, edited, ctx)).toBeUndefined()
    expect(events[0]?.value).toMatchObject({
      reason: 'background',
      stale: true,
    })
  })

  it('writes a background record on a durable host', async () => {
    const appended: Array<unknown> = []
    const store = memoryStore()
    const mw = backgroundCompaction(async () => 'the gist', { durable: true })
    await runOnConfig(mw, list(4), runContext('r1', { store, appended }).ctx)
    await vi.waitFor(async () =>
      expect(await store.get(BACKGROUND, 'thread-1')).not.toBeNull(),
    )
    expect(appended).toEqual([])

    const grown = [...list(4), small('m5')]
    const result = await runOnConfig(
      mw,
      grown,
      runContext('r2', { store, appended }).ctx,
    )
    expect(result?.providerMessages).toEqual([
      summaryOf('the gist'),
      grown[3],
      grown[4],
    ])
    expect(appended).toEqual([
      {
        type: COMPACTION_RECORD_TYPE,
        reason: 'background',
        tokensBefore: 161,
        tokensAfter: expect.any(Number),
        head: [summaryOf('the gist')],
        from: 3,
        firstKeptId: 'm4',
      },
    ])
  })

  it('applies the summary at the next run when the run that started it was aborted', async () => {
    const gated = gatedSummary()
    const store = memoryStore()
    const mw = backgroundCompaction(gated.summarize)
    const controller = new AbortController()
    await runOnConfig(
      mw,
      list(4),
      runContext('r1', { store, signal: controller.signal }).ctx,
    )
    await vi.waitFor(() => expect(gated.calls).toHaveLength(1))

    // The run that started the summary stops before the summary is ready.
    controller.abort(new Error('stop'))
    gated.release()
    await vi.waitFor(async () =>
      expect(await store.get(BACKGROUND, 'thread-1')).not.toBeNull(),
    )

    const grown = [...list(4), small('m5')]
    const result = await runOnConfig(mw, grown, runContext('r2', { store }).ctx)
    expect(result?.providerMessages).toEqual([
      summaryOf('the gist'),
      grown[3],
      grown[4],
    ])
    expect(gated.calls).toHaveLength(1)
  })
})
