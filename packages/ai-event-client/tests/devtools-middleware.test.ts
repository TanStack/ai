import { afterEach, describe, expect, it, vi } from 'vitest'
import { aiEventClient } from '../src/index'
import { devtoolsMiddleware } from '../src/devtools-middleware'

function ctx() {
  return {
    requestId: 'req-1',
    streamId: 'stream-1',
    runId: 'run-1',
    threadId: 'thread-1',
    provider: 'openai',
    model: 'gpt-5.5',
    source: 'server' as const,
    systemPrompts: [] as Array<string>,
    messageCount: 1,
    hasTools: false,
    streaming: true,
    messages: [],
    createId: (prefix: string) => `${prefix}-1`,
  }
}

function send<T extends { type: string }>(
  mw: ReturnType<typeof devtoolsMiddleware>,
  chunk: T,
) {
  mw.onChunk?.(ctx(), chunk)
}

function toolResultEvents<T extends { type: string }>(chunks: Array<T>) {
  const emit = vi
    .spyOn(aiEventClient, 'emit')
    .mockImplementation(() => undefined)
  const mw = devtoolsMiddleware()
  for (const chunk of chunks) send(mw, chunk)
  return emit.mock.calls
    .filter(([name]) => name === 'text:chunk:tool-result')
    .map(([, payload]) => payload)
}

describe('devtoolsMiddleware spec events', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('accumulates thinking from REASONING_MESSAGE_CONTENT, not STEP_FINISHED', () => {
    const emit = vi
      .spyOn(aiEventClient, 'emit')
      .mockImplementation(() => undefined)
    const mw = devtoolsMiddleware()

    send(mw, {
      type: 'REASONING_MESSAGE_CONTENT',
      messageId: 'r-1',
      delta: 'think-a',
    })
    send(mw, {
      type: 'REASONING_MESSAGE_CONTENT',
      messageId: 'r-1',
      delta: ' think-b',
    })
    send(mw, {
      type: 'STEP_FINISHED',
      stepName: 's-1',
      content: 'ignored',
      delta: 'ignored',
    })

    const thinking = emit.mock.calls.filter(
      ([name]) => name === 'text:chunk:thinking',
    )
    expect(thinking).toHaveLength(2)
    expect(thinking[1]?.[1]).toMatchObject({
      content: 'think-a think-b',
      delta: ' think-b',
    })
  })

  it('accumulates TEXT_MESSAGE_CONTENT from delta only', () => {
    const emit = vi
      .spyOn(aiEventClient, 'emit')
      .mockImplementation(() => undefined)
    const mw = devtoolsMiddleware()

    send(mw, {
      type: 'TEXT_MESSAGE_CONTENT',
      delta: 'Hello ',
      content: 'stale accumulated extra',
    })
    send(mw, {
      type: 'TEXT_MESSAGE_CONTENT',
      delta: 'world',
    })

    const content = emit.mock.calls.filter(
      ([name]) => name === 'text:chunk:content',
    )
    expect(content).toHaveLength(2)
    expect(content[1]?.[1]).toMatchObject({
      content: 'Hello world',
      delta: 'world',
    })
  })

  it('surfaces tool results from TOOL_CALL_RESULT.content, not TOOL_CALL_END.result', () => {
    const results = toolResultEvents([
      { type: 'TOOL_CALL_END', toolCallId: 'tc-1', result: 'should-not-emit' },
      { type: 'TOOL_CALL_RESULT', toolCallId: 'tc-1', content: '{"ok":true}' },
    ])

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      toolCallId: 'tc-1',
      result: '{"ok":true}',
    })
  })

  it('sends only the app keys of TOOL_CALL_RESULT.metadata', () => {
    const results = toolResultEvents([
      {
        type: 'TOOL_CALL_RESULT',
        toolCallId: 'tc-1',
        content: '{"ok":true}',
        metadata: {
          sources: ['https://example.com/a'],
          tanstack: { state: 'output-available' },
        },
      },
    ])

    expect(results[0]).toMatchObject({
      metadata: { sources: ['https://example.com/a'] },
    })
    expect(results[0]).not.toHaveProperty('metadata.tanstack')
  })

  it('sends no metadata field when the result has no app keys', () => {
    const results = toolResultEvents([
      {
        type: 'TOOL_CALL_RESULT',
        toolCallId: 'tc-1',
        content: '{"ok":true}',
        metadata: { tanstack: { state: 'output-available' } },
      },
    ])

    expect(results[0]).not.toHaveProperty('metadata')
  })

  it('rebuilds RUN_FINISHED usage from spec token usage', () => {
    const emit = vi
      .spyOn(aiEventClient, 'emit')
      .mockImplementation(() => undefined)
    const mw = devtoolsMiddleware()

    send(mw, {
      type: 'RUN_FINISHED',
      threadId: 'thread-1',
      runId: 'run-1',
      usage: [
        {
          inputTokens: 10,
          outputTokens: 4,
          totalTokens: 14,
          reasoningTokens: 2,
        },
      ],
      metadata: { tanstack: { usage: { cost: 0.01 } } },
    })

    const usage = emit.mock.calls.find(([name]) => name === 'text:usage')
    expect(usage?.[1]).toMatchObject({
      usage: {
        promptTokens: 10,
        completionTokens: 4,
        totalTokens: 14,
        completionTokensDetails: { reasoningTokens: 2 },
        cost: 0.01,
      },
    })
  })

  it('sends text:usage for a RUN_ERROR that carries usage', () => {
    const emit = vi
      .spyOn(aiEventClient, 'emit')
      .mockImplementation(() => undefined)
    const mw = devtoolsMiddleware()

    send(mw, {
      type: 'RUN_ERROR',
      message: 'max_tokens',
      usage: { promptTokens: 10, completionTokens: 4096, totalTokens: 4106 },
    })

    const usage = emit.mock.calls.find(([name]) => name === 'text:usage')
    expect(usage?.[1]).toMatchObject({
      usage: { promptTokens: 10, completionTokens: 4096, totalTokens: 4106 },
    })
  })
})
