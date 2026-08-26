import { describe, expect, it, vi } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import type {
  AdapterYieldChunk,
  AnyTextAdapter,
  ChatMiddleware,
  ModelMessage,
  StreamChunk,
  Tool,
  TokenUsage,
} from '@tanstack/ai'
import { memoryPersistence } from '../src/memory'
import { withPersistence } from '../src/middleware'
import { defineAIPersistence } from '../src/types'

// --- minimal mock text adapter ---------------------------------------------

function mockAdapter(iterations: Array<Array<AdapterYieldChunk>>) {
  const calls: Array<unknown> = []
  let i = 0
  const adapter = {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {},
    chatStream: (opts: unknown) => {
      calls.push(opts)
      const chunks = iterations[i] ?? []
      i++
      return (async function* () {
        for (const c of chunks) yield c
      })()
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  } as unknown as AnyTextAdapter
  return { adapter, calls }
}

const ev = {
  runStarted: (runId = 'r1', threadId = 't1'): AdapterYieldChunk => ({
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    timestamp: 1,
  }),
  text: (delta: string): AdapterYieldChunk => ({
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'm1',
    delta,
    timestamp: 1,
  }),
  runFinished: (
    runId = 'r1',
    threadId = 't1',
    usage?: TokenUsage,
  ): AdapterYieldChunk => ({
    type: EventType.RUN_FINISHED,
    runId,
    threadId,
    finishReason: 'stop',
    timestamp: 1,
    ...(usage ? { usage } : {}),
  }),
  interrupted: (interruptId = 'interrupt-1'): AdapterYieldChunk => ({
    type: EventType.RUN_FINISHED,
    runId: 'r1',
    threadId: 't1',
    finishReason: 'stop',
    timestamp: 1,
    outcome: {
      type: 'interrupt',
      interrupts: [
        {
          id: interruptId,
          reason: 'approval_required',
          toolCallId: 'tool-1',
          metadata: { kind: 'approval' },
        },
      ],
    },
  }),
}

async function collect(stream: AsyncIterable<StreamChunk>) {
  const out: Array<StreamChunk> = []
  for await (const c of stream) out.push(c)
  return out
}

function interruptErrorsOf(chunk: StreamChunk | undefined) {
  if (chunk?.type !== EventType.RUN_ERROR) return undefined
  return chunk.metadata?.tanstack?.interruptErrors
}

function serverSearchTool(): Tool {
  return {
    name: 'search',
    description: 'Search',
    execute: () => ({ hits: [] }),
  }
}

function findAssistantToolCall(
  messages: ReadonlyArray<ModelMessage>,
  toolCallId: string,
) {
  return messages.find(
    (message) =>
      message.role === 'assistant' &&
      message.toolCalls?.some((call) => call.id === toolCallId),
  )
}

describe('withPersistence (state-only)', () => {
  it('completes the run and saves the transcript', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([
      [ev.runStarted(), ev.text('hello'), ev.runFinished()],
    ])

    const chunks = await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    // The persistence middleware never stamps delivery cursors on the stream.
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.every((c) => !('cursor' in c))).toBe(true)

    // Run is completed and the full engine transcript is saved, including the
    // assistant's terminal text reply.
    expect((await persistence.stores.runs!.get('r1'))?.status).toBe('completed')
    expect(await persistence.stores.messages!.loadThread('t1')).toEqual([
      { role: 'user', content: 'hi' },
      expect.objectContaining({ role: 'assistant', content: 'hello' }),
    ])
  })

  it('saves canonical history when middleware compacts provider messages', async () => {
    const persistence = memoryPersistence()
    const { adapter, calls } = mockAdapter([
      [ev.runStarted(), ev.text('hello'), ev.runFinished()],
    ])

    const dropOldest: ChatMiddleware = {
      name: 'drop-oldest',
      onConfig(ctx, config) {
        if (ctx.phase !== 'beforeModel' || config.messages.length <= 1) return
        return { providerMessages: config.messages.slice(1) }
      },
    }

    await collect(
      chat({
        adapter,
        messages: [
          { role: 'user', content: 'DROP_ME_FIRST' },
          { role: 'user', content: 'KEEP_ME_LAST' },
        ],
        runId: 'r1',
        threadId: 't1',
        middleware: [dropOldest, withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const thread = await persistence.stores.messages!.loadThread('t1')
    expect(thread).toEqual([
      { role: 'user', content: 'DROP_ME_FIRST' },
      { role: 'user', content: 'KEEP_ME_LAST' },
      expect.objectContaining({ role: 'assistant', content: 'hello' }),
    ])
    expect(calls[0]).toEqual(
      expect.objectContaining({
        messages: [
          { role: 'user', content: 'KEEP_ME_LAST' },
        ],
      }),
    )
  })

  it('does not add ids to caller messages while saving', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([
      [ev.runStarted(), ev.text('hello'), ev.runFinished()],
    ])
    const userMessage: ModelMessage = { role: 'user', content: 'hello' }

    await collect(
      chat({
        adapter,
        messages: [userMessage],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(userMessage).toEqual({ role: 'user', content: 'hello' })
    expect(await persistence.stores.messages!.loadThread('t1')).toEqual([
      { role: 'user', content: 'hello' },
      expect.objectContaining({ role: 'assistant', content: 'hello' }),
    ])
  })

  it('persists cumulative usage across model calls', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([
      [
        ev.runStarted(),
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'agent-tool',
          role: 'assistant',
          timestamp: 1,
        },
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: 'call_1',
          toolCallName: 'search',
          toolName: 'search',
          parentMessageId: 'agent-tool',
          timestamp: 1,
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: 'call_1',
          delta: '{}',
          timestamp: 1,
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'r1',
          threadId: 't1',
          finishReason: 'tool_calls',
          timestamp: 1,
          usage: {
            promptTokens: 10,
            completionTokens: 2,
            totalTokens: 12,
            promptTokensDetails: { cachedTokens: 3 },
            billed: { quantity: 2, unit: 'units' },
            unitsBilled: 2,
            cost: 1,
          },
        },
      ],
      [
        ev.runStarted(),
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'agent-final',
          role: 'assistant',
          timestamp: 1,
        },
        ev.text('hello'),
        ev.runFinished('r1', 't1', {
          promptTokens: 20,
          completionTokens: 4,
          totalTokens: 24,
          completionTokensDetails: { reasoningTokens: 2 },
          providerUsageDetails: { requestId: 'final' },
          billed: { quantity: 1, unit: 'units' },
          unitsBilled: 1,
          cost: 2,
        }),
      ],
    ])

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'search' }],
        tools: [serverSearchTool()],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect((await persistence.stores.runs!.get('r1'))?.usage).toEqual({
      promptTokens: 30,
      completionTokens: 6,
      totalTokens: 36,
      promptTokensDetails: { cachedTokens: 3 },
      completionTokensDetails: { reasoningTokens: 2 },
      providerUsageDetails: { requestId: 'final' },
      billed: { quantity: 3, unit: 'units' },
      unitsBilled: 3,
      cost: 3,
    })
  })

  it('persists the pending user turn at start, so it survives a failed run', async () => {
    const persistence = memoryPersistence()
    const adapter = {
      kind: 'text',
      name: 'mock',
      model: 'test-model',
      '~types': {},
      chatStream: () =>
        (async function* () {
          yield ev.runStarted()
          throw new Error('provider boom')
        })(),
      structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    } as unknown as AnyTextAdapter

    await expect(
      collect(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'hi' }],
          runId: 'r1',
          threadId: 't1',
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow('provider boom')

    // onStart persisted the user turn before the failure, so it is not lost.
    expect(await persistence.stores.messages!.loadThread('t1')).toEqual([
      { role: 'user', content: 'hi' },
    ])
    expect((await persistence.stores.runs!.get('r1'))?.status).toBe('failed')
  })

  it('snapshots the in-progress reply when snapshotStreaming is on', async () => {
    const persistence = memoryPersistence()
    const adapter = {
      kind: 'text',
      name: 'mock',
      model: 'test-model',
      '~types': {},
      chatStream: () =>
        (async function* () {
          yield ev.runStarted()
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId: 'm1',
            timestamp: 1,
          }
          yield ev.text('Half a stor')
          // Die mid-generation, before any RUN_FINISHED / onFinish.
          throw new Error('crash mid-stream')
        })(),
      structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    } as unknown as AnyTextAdapter

    await expect(
      collect(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'hi' }],
          runId: 'r1',
          threadId: 't1',
          middleware: [
            withPersistence(persistence, { snapshotStreaming: true }),
          ],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow('crash mid-stream')

    // The partial assistant reply was snapshotted mid-stream, so it survives —
    // tagged with its stream messageId so a reload resumes the same bubble.
    expect(await persistence.stores.messages!.loadThread('t1')).toEqual([
      { role: 'user', content: 'hi' },
      expect.objectContaining({
        role: 'assistant',
        content: 'Half a stor',
        id: 'm1',
        createdAt: expect.any(Date),
      }),
    ])
  })

  it('does not let an empty TEXT_MESSAGE_START id replace parentMessageId', async () => {
    const persistence = memoryPersistence()
    const adapter = {
      kind: 'text',
      name: 'mock',
      model: 'test-model',
      '~types': {},
      chatStream: () =>
        (async function* () {
          yield ev.runStarted()
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId: '',
            timestamp: 1,
          }
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'call_1',
            toolCallName: 'search',
            toolName: 'search',
            parentMessageId: 'stream-assistant',
            timestamp: 1,
          }
          yield ev.text('Half a stor')
          throw new Error('crash mid-stream')
        })(),
      structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    } as unknown as AnyTextAdapter

    await expect(
      collect(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'hi' }],
          runId: 'r1',
          threadId: 't1',
          middleware: [
            withPersistence(persistence, { snapshotStreaming: true }),
          ],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow('crash mid-stream')

    expect(await persistence.stores.messages!.loadThread('t1')).toEqual([
      { role: 'user', content: 'hi' },
      expect.objectContaining({
        role: 'assistant',
        content: 'Half a stor',
        id: 'stream-assistant',
        createdAt: expect.any(Date),
      }),
    ])
  })

  it('resets streaming state on an empty-id TEXT_MESSAGE_START between turns', async () => {
    const persistence = memoryPersistence()
    let call = 0
    const adapter = {
      kind: 'text',
      name: 'mock',
      model: 'test-model',
      '~types': {},
      chatStream: () => {
        call++
        if (call === 1) {
          return (async function* () {
            yield ev.runStarted()
            yield {
              type: EventType.TEXT_MESSAGE_START,
              messageId: '',
              timestamp: 1,
            }
            yield ev.text('Let me search.')
            yield {
              type: EventType.TOOL_CALL_START,
              toolCallId: 'call_1',
              toolCallName: 'search',
              toolName: 'search',
              parentMessageId: 'assistant-turn-1',
              timestamp: 1,
            }
            yield {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: 'call_1',
              delta: '{}',
              timestamp: 1,
            }
            yield {
              type: EventType.RUN_FINISHED,
              runId: 'r1',
              threadId: 't1',
              finishReason: 'tool_calls',
              timestamp: 1,
            }
          })()
        }
        return (async function* () {
          yield ev.runStarted()
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId: '',
            timestamp: 1,
          }
          yield ev.text('The answer is 42.')
          throw new Error('crash mid-stream')
        })()
      },
      structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    } as unknown as AnyTextAdapter

    await expect(
      collect(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'search' }],
          tools: [serverSearchTool()],
          runId: 'r1',
          threadId: 't1',
          middleware: [
            withPersistence(persistence, {
              snapshotStreaming: true,
              snapshotIntervalMs: 0,
            }),
          ],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow('crash mid-stream')

    // The empty-id start on turn 2 still resets the per-turn accumulator: the
    // crash-window snapshot holds only turn-2 text, and it must not inherit
    // turn 1's tool-call id — two persisted messages may never share an id.
    const thread = await persistence.stores.messages!.loadThread('t1')
    expect(findAssistantToolCall(thread, 'call_1')?.id).toBe('assistant-turn-1')
    const terminal = thread.at(-1)
    expect(terminal).toMatchObject({
      role: 'assistant',
      content: 'The answer is 42.',
    })
    expect(terminal).not.toHaveProperty('id')
  })

  it('stamps the terminal assistant turn with its stream messageId', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([
      [
        ev.runStarted(),
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'assistant-42',
          role: 'assistant' as const,
          timestamp: 1,
        },
        ev.text('hello'),
        ev.runFinished('r1', 't1', {
          promptTokens: 20,
          completionTokens: 4,
          totalTokens: 24,
        }),
      ],
    ])

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    // Identity round-trip: the persisted assistant turn keeps the stream id, so
    // `modelMessagesToUIMessages` reuses it and a reload can resume in place.
    expect(await persistence.stores.messages!.loadThread('t1')).toEqual([
      { role: 'user', content: 'hi' },
      expect.objectContaining({
        role: 'assistant',
        content: 'hello',
        id: 'assistant-42',
        createdAt: expect.any(Date),
      }),
    ])
  })

  it('persists a tool-call turn under the stream messageId', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([
      [
        ev.runStarted(),
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'stream-assistant',
          role: 'assistant',
          timestamp: 1,
        },
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: 'call_1',
          toolCallName: 'search',
          toolName: 'search',
          parentMessageId: 'stream-assistant',
          timestamp: 1,
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: 'call_1',
          delta: '{}',
          timestamp: 1,
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'r1',
          threadId: 't1',
          finishReason: 'tool_calls',
          timestamp: 1,
          usage: {
            promptTokens: 10,
            completionTokens: 2,
            totalTokens: 12,
          },
        },
      ],
      [
        ev.runStarted(),
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'stream-final',
          role: 'assistant',
          timestamp: 1,
        },
        ev.text('done'),
        ev.runFinished(),
      ],
    ])

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'search' }],
        tools: [serverSearchTool()],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const thread = await persistence.stores.messages!.loadThread('t1')
    const toolTurn = findAssistantToolCall(thread, 'call_1')
    expect(toolTurn?.id).toBe('stream-assistant')
    expect(toolTurn?.createdAt).toBeInstanceOf(Date)
    expect(thread).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          content: 'done',
          id: 'stream-final',
        }),
      ]),
    )
  })

  it('does not duplicate a tool-call turn when the loop stops', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([
      [
        ev.runStarted(),
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'stream-tool',
          role: 'assistant',
          timestamp: 1,
        },
        ev.text('checking'),
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: 'call_1',
          toolCallName: 'search',
          toolName: 'search',
          parentMessageId: 'stream-tool',
          timestamp: 1,
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: 'call_1',
          delta: '{}',
          timestamp: 1,
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'r1',
          threadId: 't1',
          finishReason: 'tool_calls',
          timestamp: 1,
        },
      ],
    ])

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'search' }],
        tools: [serverSearchTool()],
        agentLoopStrategy: () => false,
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const turns = (await persistence.stores.messages!.loadThread('t1')).filter(
      (message) =>
        message.role === 'assistant' && message.content === 'checking',
    )
    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({
      id: 'stream-tool',
      toolCalls: [expect.objectContaining({ id: 'call_1' })],
    })
  })

  it('stamps createdAt at TEXT_MESSAGE_START, not at iteration start', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    try {
      let call = 0
      const persistence = memoryPersistence()
      const adapter = {
        kind: 'text',
        name: 'mock',
        model: 'test-model',
        '~types': {},
        chatStream: () => {
          call += 1
          return (async function* () {
            if (call === 1) {
              yield ev.runStarted()
              await vi.advanceTimersByTimeAsync(5_000)
              yield {
                type: EventType.TEXT_MESSAGE_START,
                messageId: 'stream-assistant',
                role: 'assistant',
                timestamp: 1,
              } satisfies AdapterYieldChunk
              yield {
                type: EventType.TOOL_CALL_START,
                toolCallId: 'call_1',
                toolCallName: 'search',
                toolName: 'search',
                parentMessageId: 'stream-assistant',
                timestamp: 1,
              } satisfies AdapterYieldChunk
              yield {
                type: EventType.TOOL_CALL_ARGS,
                toolCallId: 'call_1',
                delta: '{}',
                timestamp: 1,
              } satisfies AdapterYieldChunk
              yield {
                type: EventType.RUN_FINISHED,
                runId: 'r1',
                threadId: 't1',
                finishReason: 'tool_calls',
                timestamp: 1,
              } satisfies AdapterYieldChunk
              return
            }
            yield ev.runStarted()
            yield {
              type: EventType.TEXT_MESSAGE_START,
              messageId: 'stream-final',
              role: 'assistant',
              timestamp: 1,
            } satisfies StreamChunk
            yield ev.text('done')
            yield ev.runFinished()
          })()
        },
        structuredOutput: async () => ({ data: {}, rawText: '{}' }),
      } as unknown as AnyTextAdapter

      await collect(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'search' }],
          tools: [serverSearchTool()],
          runId: 'r1',
          threadId: 't1',
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      )

      const toolTurn = findAssistantToolCall(
        await persistence.stores.messages!.loadThread('t1'),
        'call_1',
      )
      expect(toolTurn?.createdAt).toEqual(new Date('2026-01-01T00:00:05.000Z'))
    } finally {
      vi.useRealTimers()
    }
  })

  it('persists native-combined output as structured output', async () => {
    const persistence = memoryPersistence()
    const raw = '{"name":"Ada"}'
    const { adapter } = mockAdapter([
      [
        ev.runStarted(),
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'structured-native',
          role: 'assistant',
          timestamp: 1,
        },
        ev.text(raw),
        ev.runFinished(),
      ],
    ])
    adapter.supportsCombinedToolsAndSchema = () => true

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        runId: 'r1',
        threadId: 't1',
        stream: true,
        outputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(await persistence.stores.messages!.loadThread('t1')).toEqual([
      { role: 'user', content: 'extract' },
      expect.objectContaining({
        id: 'structured-native',
        role: 'assistant',
        content: raw,
        structuredOutput: {
          type: 'structured-output',
          status: 'complete',
          raw,
          data: { name: 'Ada' },
          partial: { name: 'Ada' },
        },
      }),
    ])
  })

  it('persists event-sourced harness output as a distinct structured-output message', async () => {
    const persistence = memoryPersistence()
    const raw = '{"name":"Ada"}'
    const { adapter } = mockAdapter([
      [
        ev.runStarted(),
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'harness-prose',
          role: 'assistant',
          timestamp: 1,
        },
        ev.text('looking around'),
        {
          type: EventType.CUSTOM,
          name: 'structured-output.start',
          value: { messageId: 'msg-so' },
          timestamp: 1,
        },
        {
          type: EventType.CUSTOM,
          name: 'structured-output.complete',
          value: { object: { name: 'Ada' }, raw, messageId: 'msg-so' },
          timestamp: 1,
        },
        ev.runFinished(),
      ],
    ])
    adapter.supportsCombinedToolsAndSchema = () => true
    adapter.combinedStructuredOutputSource = () => 'event'

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        runId: 'r1',
        threadId: 't1',
        stream: true,
        outputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(await persistence.stores.messages!.loadThread('t1')).toEqual([
      { role: 'user', content: 'extract' },
      expect.objectContaining({
        id: 'harness-prose',
        role: 'assistant',
        content: 'looking around',
      }),
      expect.objectContaining({
        id: 'msg-so',
        role: 'assistant',
        content: raw,
        structuredOutput: {
          type: 'structured-output',
          status: 'complete',
          raw,
          data: { name: 'Ada' },
          partial: { name: 'Ada' },
        },
      }),
    ])
  })

  it('keeps event-sourced output on one message when complete reuses the text id', async () => {
    const persistence = memoryPersistence()
    const raw = '{"name":"Ada"}'
    const { adapter } = mockAdapter([
      [
        ev.runStarted(),
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'harness-prose',
          role: 'assistant',
          timestamp: 1,
        },
        ev.text(raw),
        {
          type: EventType.CUSTOM,
          name: 'structured-output.start',
          value: { messageId: 'harness-prose' },
          timestamp: 1,
        },
        {
          type: EventType.CUSTOM,
          name: 'structured-output.complete',
          value: { object: { name: 'Ada' }, raw, messageId: 'harness-prose' },
          timestamp: 1,
        },
        ev.runFinished(),
      ],
    ])
    adapter.supportsCombinedToolsAndSchema = () => true
    adapter.combinedStructuredOutputSource = () => 'event'

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        runId: 'r1',
        threadId: 't1',
        stream: true,
        outputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(await persistence.stores.messages!.loadThread('t1')).toEqual([
      { role: 'user', content: 'extract' },
      expect.objectContaining({
        id: 'harness-prose',
        role: 'assistant',
        content: raw,
        structuredOutput: {
          type: 'structured-output',
          status: 'complete',
          raw,
          data: { name: 'Ada' },
          partial: { name: 'Ada' },
        },
      }),
    ])
  })

  it('uses the complete event messageId when start omits it', async () => {
    const persistence = memoryPersistence()
    const raw = '{"name":"Ada"}'
    const { adapter } = mockAdapter([
      [
        ev.runStarted(),
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'harness-prose',
          role: 'assistant',
          timestamp: 1,
        },
        ev.text('looking around'),
        {
          type: EventType.CUSTOM,
          name: 'structured-output.complete',
          value: { object: { name: 'Ada' }, raw, messageId: 'msg-so' },
          timestamp: 1,
        },
        ev.runFinished(),
      ],
    ])
    adapter.supportsCombinedToolsAndSchema = () => true
    adapter.combinedStructuredOutputSource = () => 'event'

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        runId: 'r1',
        threadId: 't1',
        stream: true,
        outputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(await persistence.stores.messages!.loadThread('t1')).toEqual([
      { role: 'user', content: 'extract' },
      expect.objectContaining({
        id: 'harness-prose',
        role: 'assistant',
        content: 'looking around',
      }),
      expect.objectContaining({
        id: 'msg-so',
        role: 'assistant',
        content: raw,
        structuredOutput: expect.objectContaining({ raw }),
      }),
    ])
  })

  it('persists thinking on a completed assistant message', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([
      [
        ev.runStarted(),
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'think-msg',
          role: 'assistant',
          timestamp: 1,
        },
        {
          type: EventType.STEP_STARTED,
          stepName: 'think-1',
          timestamp: 1,
        },
        {
          type: EventType.REASONING_MESSAGE_CONTENT,
          messageId: 'reasoning-1',
          delta: 'Need a name.',
          timestamp: 1,
        },
        {
          type: EventType.STEP_FINISHED,
          stepName: 'think-1',
          timestamp: 1,
        },
        ev.text('Ada'),
        ev.runFinished(),
      ],
    ])

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'name her' }],
        runId: 'r1',
        threadId: 't1',
        stream: true,
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(await persistence.stores.messages!.loadThread('t1')).toEqual([
      { role: 'user', content: 'name her' },
      expect.objectContaining({
        id: 'think-msg',
        role: 'assistant',
        content: 'Ada',
        thinking: [{ content: 'Need a name.' }],
      }),
    ])
  })

  it('persists serialized structured data when raw output is empty', async () => {
    const persistence = memoryPersistence()
    const raw = '{"name":"Ada"}'
    const { adapter } = mockAdapter([])
    adapter.structuredOutput = async () => ({
      data: { name: 'Ada' },
      rawText: '',
    })

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        runId: 'r1',
        threadId: 't1',
        stream: true,
        outputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(await persistence.stores.messages!.loadThread('t1')).toEqual([
      { role: 'user', content: 'extract' },
      expect.objectContaining({
        role: 'assistant',
        content: raw,
        structuredOutput: expect.objectContaining({ raw }),
      }),
    ])
  })

  it('preserves message ids and cumulative usage through structured output', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([
      [
        ev.runStarted(),
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'agent-tool',
          role: 'assistant',
          timestamp: 1,
        },
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: 'call_1',
          toolCallName: 'search',
          toolName: 'search',
          parentMessageId: 'agent-tool',
          timestamp: 1,
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: 'call_1',
          delta: '{}',
          timestamp: 1,
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'r1',
          threadId: 't1',
          finishReason: 'tool_calls',
          timestamp: 1,
          usage: {
            promptTokens: 10,
            completionTokens: 2,
            totalTokens: 12,
          },
        },
      ],
      [
        ev.runStarted(),
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'agent-final',
          role: 'assistant',
          timestamp: 1,
        },
        ev.text('hello'),
        ev.runFinished('r1', 't1', {
          promptTokens: 20,
          completionTokens: 4,
          totalTokens: 24,
        }),
      ],
    ])
    adapter.structuredOutput = async () => ({
      data: { name: 'Ada' },
      rawText: '{"name":"Ada"}',
      usage: {
        promptTokens: 5,
        completionTokens: 1,
        totalTokens: 6,
      },
    })

    const chunks = await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        tools: [serverSearchTool()],
        runId: 'r1',
        threadId: 't1',
        stream: true,
        outputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const thread = await persistence.stores.messages!.loadThread('t1')
    const start = chunks.find(
      (chunk) =>
        chunk.type === EventType.CUSTOM &&
        chunk.name === 'structured-output.start',
    )
    const messageId =
      start?.type === EventType.CUSTOM &&
      start.value &&
      typeof start.value === 'object' &&
      'messageId' in start.value &&
      typeof start.value.messageId === 'string'
        ? start.value.messageId
        : undefined
    const terminal = thread.find(
      (message) =>
        message.role === 'assistant' && message.content === '{"name":"Ada"}',
    )
    const agentFinal = thread.find(
      (message) => message.role === 'assistant' && message.content === 'hello',
    )
    expect(messageId).toBeDefined()
    expect(agentFinal).toMatchObject({ id: 'agent-final' })
    expect(terminal).toMatchObject({
      id: messageId,
      structuredOutput: {
        type: 'structured-output',
        status: 'complete',
        raw: '{"name":"Ada"}',
        data: { name: 'Ada' },
        partial: { name: 'Ada' },
      },
    })
    expect(thread.indexOf(agentFinal!)).toBeLessThan(thread.indexOf(terminal!))
    expect((await persistence.stores.runs!.get('r1'))?.usage).toEqual({
      promptTokens: 35,
      completionTokens: 7,
      totalTokens: 42,
    })
  })

  it('records an interrupt and marks the run interrupted', async () => {
    const persistence = memoryPersistence()
    const { adapter } = mockAdapter([[ev.runStarted(), ev.interrupted()]])

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect((await persistence.stores.runs!.get('r1'))?.status).toBe(
      'interrupted',
    )
    expect(await persistence.stores.interrupts!.listPending('t1')).toHaveLength(
      1,
    )
  })

  it('blocks normal new input while a thread has pending interrupts', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[ev.runStarted(), ev.interrupted()]])

    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const next = mockAdapter([[ev.text('SHOULD NOT RUN')]])
    const blockedChunks = await collect(
      chat({
        adapter: next.adapter,
        messages: [{ role: 'user', content: 'new input' }],
        runId: 'r2',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )
    const blockedError = blockedChunks.find(
      (chunk) => chunk.type === EventType.RUN_ERROR,
    )
    expect(interruptErrorsOf(blockedError)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'item',
          interruptId: 'interrupt-1',
          code: 'unknown-interrupt',
        }),
        expect.objectContaining({
          scope: 'batch',
          code: 'incomplete-batch',
        }),
      ]),
    )
    expect(next.calls.length).toBe(0)
  })

  it('requires resume entries to match all pending interrupts', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[ev.runStarted(), ev.interrupted()]])

    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const next = mockAdapter([[ev.text('SHOULD NOT RUN')]])
    const mismatchChunks = await collect(
      chat({
        adapter: next.adapter,
        messages: [{ role: 'user', content: 'new input' }],
        runId: 'r2',
        threadId: 't1',
        resume: [{ interruptId: 'other-interrupt', status: 'resolved' }],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )
    const mismatchError = mismatchChunks.find(
      (chunk) => chunk.type === EventType.RUN_ERROR,
    )
    expect(interruptErrorsOf(mismatchError)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'item',
          interruptId: 'interrupt-1',
          code: 'unknown-interrupt',
        }),
        expect.objectContaining({
          scope: 'batch',
          code: 'incomplete-batch',
        }),
      ]),
    )
    expect(next.calls.length).toBe(0)
  })

  it('applies matching resume entries and then allows new input', async () => {
    const persistence = memoryPersistence()
    const first = mockAdapter([[ev.runStarted(), ev.interrupted()]])

    await collect(
      chat({
        adapter: first.adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    const next = mockAdapter([[ev.runStarted('r2', 't1'), ev.text('fresh')]])
    const chunks = await collect(
      chat({
        adapter: next.adapter,
        messages: [{ role: 'user', content: 'new input' }],
        runId: 'r2',
        threadId: 't1',
        // The engine requires the interrupted run's id to correlate the resume.
        parentRunId: 'r1',
        resume: [
          {
            interruptId: 'interrupt-1',
            status: 'resolved',
            payload: { approved: true },
          },
        ],
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(next.calls.length).toBe(1)
    expect(
      chunks.some((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT),
    ).toBe(true)
    expect(
      (await persistence.stores.interrupts!.get('interrupt-1'))?.status,
    ).toBe('resolved')
  })

  it('persists messages without requiring a run store', async () => {
    const full = memoryPersistence()
    const persistence = defineAIPersistence({
      stores: { messages: full.stores.messages },
    })
    const { adapter } = mockAdapter([
      [ev.runStarted(), ev.text('hello'), ev.runFinished()],
    ])

    await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(await persistence.stores.messages!.loadThread('t1')).not.toEqual([])
  })

  it('is a no-op without the middleware: the stream is unchanged', async () => {
    const { adapter } = mockAdapter([
      [ev.runStarted(), ev.text('plain'), ev.runFinished()],
    ])
    const chunks = await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
      }) as AsyncIterable<StreamChunk>,
    )
    expect(chunks.every((c) => !('cursor' in c))).toBe(true)
  })
})
