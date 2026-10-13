import { describe, expect, it, vi } from 'vitest'
import type {
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  MetadataStore,
  ModelMessage,
  TextCompactOptions,
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
import type { CompactionInfo, CompactionStrategy } from './index'

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

  it('fails the compaction and keeps the history when the summary is empty', async () => {
    const set = vi.fn<MetadataStore['set']>()
    const store: MetadataStore = {
      get: async () => null,
      set,
      delete: async () => undefined,
    }
    const mw = withCompaction({
      maxTokens: 100,
      strategy: summarizeOldest({
        summarize: async () => '  \n',
        keepRecentTokens: 50,
      }),
    })

    await expect(
      runOnConfig(
        mw,
        [big('user'), big('assistant'), big('user'), big('assistant')],
        checkpointContext(store),
      ),
    ).rejects.toThrow('The summarizer returned an empty summary.')
    expect(set).not.toHaveBeenCalled()
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

describe('withCompaction native', () => {
  const sealed: ModelMessage = {
    role: 'assistant',
    content: null,
    thinking: [{ content: '', redacted: true, signature: 'sealed' }],
  }

  it('uses the adapter compact when native is on and the adapter has it', async () => {
    const calls: Array<{ messages: number; model: string; wrapped: boolean }> =
      []
    const strategy = vi.fn<CompactionStrategy>(() => [text('user', 'cut')])
    const adapter = {
      prefix: 'kept',
      async compact(options: {
        messages: Array<ModelMessage>
        model: string
        wrapFetch?: unknown
      }) {
        calls.push({
          messages: options.messages.length,
          model: options.model,
          wrapped: options.wrapFetch !== undefined,
        })
        return [text('user', this.prefix), sealed]
      },
    }
    const mw = withCompaction({ maxTokens: 50, strategy, native: adapter })
    const { ctx } = recordingContext('beforeModel', { model: 'gpt-5.5' })
    const result = await mw.onConfig?.(ctx, {
      messages: [big('user'), big('assistant'), big('user')],
      systemPrompts: [],
      tools: [],
      wrapFetch: (next) => next,
    })

    expect(calls).toStrictEqual([
      { messages: 3, model: 'gpt-5.5', wrapped: true },
    ])
    expect(strategy).not.toHaveBeenCalled()
    expect(result).toStrictEqual({
      providerMessages: [text('user', 'kept'), sealed],
    })
  })

  it('uses the strategy when the adapter has no compact', async () => {
    const strategy = vi.fn<CompactionStrategy>(() => [text('user', 'cut')])
    const mw = withCompaction({ maxTokens: 50, strategy, native: {} })
    const result = await runOnConfig(mw, [
      big('user'),
      big('assistant'),
      big('user'),
    ])

    expect(strategy).toHaveBeenCalledTimes(1)
    expect(result).toStrictEqual({ providerMessages: [text('user', 'cut')] })
  })

  it('uses the strategy when the adapter compact fails', async () => {
    const strategy = vi.fn<CompactionStrategy>(() => [text('user', 'cut')])
    const adapter = {
      compact: () => Promise.reject(new Error('404 Not Found')),
    }
    const mw = withCompaction({ maxTokens: 50, strategy, native: adapter })
    const result = await runOnConfig(mw, [
      big('user'),
      big('assistant'),
      big('user'),
    ])

    expect(strategy).toHaveBeenCalledTimes(1)
    expect(result).toStrictEqual({ providerMessages: [text('user', 'cut')] })
  })

  it('reports a failed adapter compact, and skips it for that model after', async () => {
    const strategy = vi.fn<CompactionStrategy>(() => [text('user', 'cut')])
    const compact = vi.fn(() =>
      Promise.reject(
        Object.assign(new Error('404 Not Found'), { status: 404 }),
      ),
    )
    const adapter = { compact }
    const infos: Array<CompactionInfo> = []
    const options = {
      maxTokens: 50,
      strategy,
      native: adapter,
      onCompact: (info: CompactionInfo) => infos.push(info),
    }
    const first = recordingContext('beforeModel', { model: 'gpt-5.5' })
    await runOnConfig(
      withCompaction(options),
      [big('user'), big('assistant'), big('user')],
      first.ctx,
    )

    expect(infos.map((info) => info.error)).toStrictEqual([
      { message: '404 Not Found' },
    ])
    expect(
      first.events.find((event) => event.name === 'compaction:ended')?.value
        .error,
    ).toStrictEqual({ message: '404 Not Found' })

    // A new middleware with the same adapter and model skips compact.
    const second = recordingContext('beforeModel', { model: 'gpt-5.5' })
    const result = await runOnConfig(
      withCompaction(options),
      [big('user'), big('assistant'), big('user')],
      second.ctx,
    )
    expect(compact).toHaveBeenCalledTimes(1)
    expect(strategy).toHaveBeenCalledTimes(2)
    expect(result).toStrictEqual({ providerMessages: [text('user', 'cut')] })
    expect(infos[1]?.error).toBeUndefined()

    // Another model still tries compact.
    await runOnConfig(
      withCompaction(options),
      [big('user'), big('assistant'), big('user')],
      recordingContext('beforeModel', { model: 'gpt-5.4' }).ctx,
    )
    expect(compact).toHaveBeenCalledTimes(2)
  })

  it.each([400, 429])('tries compact again after a %i', async (status) => {
    const strategy = vi.fn<CompactionStrategy>(() => [text('user', 'cut')])
    const compact = vi.fn(() =>
      Promise.reject(Object.assign(new Error(`${status}`), { status })),
    )
    const options = { maxTokens: 50, strategy, native: { compact } }
    for (let run = 0; run < 2; run++) {
      await runOnConfig(
        withCompaction(options),
        [big('user'), big('assistant'), big('user')],
        recordingContext('beforeModel', { model: 'gpt-5.5' }).ctx,
      )
    }

    expect(compact).toHaveBeenCalledTimes(2)
    expect(strategy).toHaveBeenCalledTimes(2)
  })

  it('keys a native checkpoint by model, also with a custom strategyKey', async () => {
    const store = memoryStore()
    const compact = vi.fn((options: TextCompactOptions) =>
      Promise.resolve([text('user', options.model), sealed]),
    )
    const options = {
      maxTokens: 50,
      strategyKey: 'mine',
      native: { compact },
    }
    const contextFor = (model: string) => {
      // oxlint-disable-next-line eslint-js/no-restricted-syntax -- focused hook stub
      const ctx = {
        ...recordingContext('beforeModel', { model }).ctx,
        threadId: 'thread-1',
        capabilities: { markProvided: () => undefined },
      } as unknown as ChatMiddlewareContext
      provideMetadata(ctx, store)
      return ctx
    }
    const messages = [big('user'), big('assistant'), big('user')]
    await runOnConfig(withCompaction(options), messages, contextFor('gpt-5.5'))
    const other = await runOnConfig(
      withCompaction(options),
      messages,
      contextFor('gpt-5.4'),
    )

    // gpt-5.4 does not get the item that only gpt-5.5 reads.
    expect(compact).toHaveBeenCalledTimes(2)
    expect(other?.providerMessages?.[0]?.content).toBe('gpt-5.4')
  })

  it('passes the system prompts to the adapter compact', async () => {
    const compact = vi.fn((_options: TextCompactOptions) =>
      Promise.resolve([text('user', 'kept')]),
    )
    const mw = withCompaction({ maxTokens: 50, native: { compact } })
    await mw.onConfig?.(
      recordingContext('beforeModel', { model: 'gpt-5.5' }).ctx,
      {
        messages: [big('user'), big('assistant'), big('user')],
        systemPrompts: ['Be brief.'],
        tools: [],
      },
    )

    expect(compact.mock.calls[0]?.[0]).toMatchObject({
      systemPrompts: ['Be brief.'],
    })
  })
})
