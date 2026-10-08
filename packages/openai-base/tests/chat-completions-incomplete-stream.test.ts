import { describe, expect, it, vi } from 'vitest'
import OpenAI from 'openai'
import { chat } from '@tanstack/ai'
import { OpenAIBaseChatCompletionsTextAdapter } from '../src/adapters/chat-completions-text'
import type { StreamChunk } from '@tanstack/ai'

const usage = { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }
const envelope = {
  id: 'chatcmpl-eof',
  object: 'chat.completion.chunk',
  created: 1,
  model: 'test-model',
}
const textChunk = {
  ...envelope,
  choices: [{ index: 0, delta: { content: 'partial' }, finish_reason: null }],
}
const usageChunk = { ...envelope, choices: [], usage }

class SSEAdapter extends OpenAIBaseChatCompletionsTextAdapter<string> {
  constructor(chunks: Array<Record<string, unknown>>, done = false) {
    const body =
      chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') +
      (done ? 'data: [DONE]\n\n' : '')
    super(
      'test-model',
      'test-provider',
      new OpenAI({
        apiKey: 'test-placeholder',
        maxRetries: 0,
        fetch: async () =>
          new Response(body, {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
      }),
    )
  }

  protected override extractReasoning(chunk: unknown) {
    if (
      chunk &&
      typeof chunk === 'object' &&
      'reasoning' in chunk &&
      typeof chunk.reasoning === 'string'
    ) {
      return { text: chunk.reasoning }
    }
    return undefined
  }
}

/**
 * Runs SSE chunks through the real OpenAI SDK and chat() to observe completion.
 * `done` appends the protocol's [DONE] marker. `cancel` aborts after the first
 * text delta so tests can distinguish caller cancellation from incomplete EOF.
 *
 * @returns Emitted events and spies for terminal hooks and server tool execution.
 */
async function observe(
  chunks: Array<Record<string, unknown>>,
  { done = false, cancel = false } = {},
) {
  const onFinish = vi.fn()
  const onError = vi.fn()
  const onAbort = vi.fn()
  const execute = vi.fn(() => 'result')
  const controller = new AbortController()
  const events: Array<StreamChunk> = []
  for await (const event of chat({
    adapter: new SSEAdapter(chunks, done),
    messages: [{ role: 'user', content: 'Reply' }],
    tools: [{ name: 'lookup', description: 'Look up an item', execute }],
    abortController: controller,
    debug: false,
    middleware: [{ name: 'observe', onFinish, onError, onAbort }],
  })) {
    events.push(event)
    if (cancel && event.type === 'TEXT_MESSAGE_CONTENT') controller.abort()
  }
  return { events, onFinish, onError, onAbort, execute }
}

describe('Chat Completions completion policy with the real SDK', () => {
  it.each([
    ['bare EOF', [textChunk], false],
    ['SDK-consumed DONE without a completion chunk', [textChunk], true],
    ['usage before more content', [usageChunk, textChunk], false],
    ['usage attached to content', [{ ...textChunk, usage }], false],
    [
      'empty choices without usage',
      [textChunk, { ...envelope, choices: [] }],
      false,
    ],
  ])(
    'reports %s as incomplete and retains partial text',
    async (_name, chunks, done) => {
      const result = await observe(chunks, { done })
      expect(result.events.map((event) => event.type)).toEqual([
        'RUN_STARTED',
        'TEXT_MESSAGE_START',
        'TEXT_MESSAGE_CONTENT',
        'TEXT_MESSAGE_END',
        'RUN_ERROR',
      ])
      expect(result.events[2]).toMatchObject({ delta: 'partial' })
      expect(result.events.at(-1)).toMatchObject({ code: 'incomplete-stream' })
      expect(result.onError).toHaveBeenCalledTimes(1)
      expect(result.onFinish).not.toHaveBeenCalled()
      expect(result.onAbort).not.toHaveBeenCalled()
    },
  )

  it('retains normal trailing usage', async () => {
    const result = await observe(
      [
        textChunk,
        {
          ...envelope,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        },
        usageChunk,
      ],
      { done: true },
    )
    expect(result.events.at(-1)).toMatchObject({
      type: 'RUN_FINISHED',
      usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
    })
    expect(result.onFinish).toHaveBeenCalledTimes(1)
    expect(result.onFinish.mock.calls[0]?.[1]).toMatchObject({
      finishReason: 'stop',
      content: 'partial',
      usage: { totalTokens: 12 },
    })
    expect(result.onError).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    'preserves the usage-only tail fallback (DONE: %s)',
    async (done) => {
      const result = await observe([textChunk, usageChunk], { done })
      expect(result.events.at(-1)).toMatchObject({ type: 'RUN_FINISHED' })
      expect(result.onFinish).toHaveBeenCalledTimes(1)
      expect(result.onError).not.toHaveBeenCalled()
    },
  )

  it('closes unfinished reasoning and tool lifecycles without executing the tool', async () => {
    const result = await observe([
      {
        ...envelope,
        reasoning: 'partial thought',
        choices: [{ index: 0, delta: {}, finish_reason: null }],
      },
      {
        ...envelope,
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_lookup',
                  type: 'function',
                  function: { name: 'lookup', arguments: '{}' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
    ])
    const types = result.events.map((event) => event.type)
    for (const type of [
      'TOOL_CALL_START',
      'TOOL_CALL_END',
      'REASONING_START',
      'REASONING_END',
      'REASONING_MESSAGE_START',
      'REASONING_MESSAGE_END',
      'STEP_STARTED',
      'STEP_FINISHED',
    ]) {
      expect(types.filter((value) => value === type)).toHaveLength(1)
    }
    expect(result.events.at(-1)).toMatchObject({
      type: 'RUN_ERROR',
      code: 'incomplete-stream',
    })
    expect(types).not.toContain('RUN_FINISHED')
    expect(result.execute).not.toHaveBeenCalled()
    expect(result.onFinish).not.toHaveBeenCalled()
    expect(result.onError).toHaveBeenCalledTimes(1)
  })

  it('keeps caller cancellation on the abort path', async () => {
    const result = await observe([textChunk], { cancel: true })
    expect(result.onAbort).toHaveBeenCalledTimes(1)
    expect(result.onFinish).not.toHaveBeenCalled()
    expect(result.onError).not.toHaveBeenCalled()
    expect(result.events.some((event) => event.type === 'RUN_ERROR')).toBe(
      false,
    )
  })
})
