import type { AdapterYieldChunk } from '@tanstack/ai'
import { HTTPClient } from '@openrouter/sdk'
import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createOpenRouterText } from '../src/adapters/text'
import { buildOpenRouterUsage } from '../src/usage'

describe('OpenRouter structured usage', () => {
  it.each([42, 0, undefined, null])(
    'preserves reasoning count %s',
    (reasoningTokens) => {
      const usage = buildOpenRouterUsage({
        promptTokens: 10,
        completionTokens: 50,
        totalTokens: 60,
        completionTokensDetails: { reasoningTokens },
      })
      expect(usage?.completionTokensDetails).toEqual(
        reasoningTokens == null ? {} : { reasoningTokens },
      )
    },
  )

  it.each([
    ['success', '{"answer":"ok"}', 'stop', undefined],
    ['malformed', '{"answer":', 'stop', 'parse-error'],
    ['truncated', '{"answer":', 'length', 'max_tokens'],
    ['empty', '', 'stop', 'empty-response'],
  ] as const)(
    'reports received usage once on %s',
    async (_label, content, finishReason, code) => {
      const envelope = {
        id: 'gen-test',
        model: 'openai/gpt-4o-mini',
        object: 'chat.completion.chunk',
        created: 1,
      }
      const events = [
        {
          ...envelope,
          choices: [
            { index: 0, delta: { content }, finish_reason: finishReason },
          ],
        },
        {
          ...envelope,
          choices: [],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 50,
            total_tokens: 60,
            completion_tokens_details: { reasoning_tokens: 42 },
            cost: 0.002,
          },
        },
      ]
      const fetcher = vi.fn(
        async () =>
          new Response(
            `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`,
            { headers: { 'content-type': 'text/event-stream' } },
          ),
      )
      const adapter = createOpenRouterText('openai/gpt-4o-mini', 'test-key', {
        httpClient: new HTTPClient({ fetcher }),
      })
      const chunks: Array<AdapterYieldChunk> = []
      for await (const chunk of adapter.structuredOutputStream({
        chatOptions: {
          threadId: 'thread-1',
          model: 'openai/gpt-4o-mini',
          messages: [{ role: 'user', content: 'Return an answer.' }],
          logger: resolveDebugOption(false),
        },
        outputSchema: {
          type: 'object',
          properties: { answer: { type: 'string' } },
          required: ['answer'],
        },
      })) {
        chunks.push(chunk)
      }
      const terminal = chunks.at(-1)
      expect(terminal?.type).toBe(code ? 'RUN_ERROR' : 'RUN_FINISHED')
      if (terminal?.type === 'RUN_ERROR') expect(terminal.code).toBe(code)
      expect(chunks.filter((chunk) => 'usage' in chunk)).toHaveLength(1)
      expect(terminal).toMatchObject({
        usage: {
          promptTokens: 10,
          completionTokens: 50,
          totalTokens: 60,
          completionTokensDetails: { reasoningTokens: 42 },
          cost: 0.002,
        },
      })
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(chunks.filter((chunk) => chunk.type === 'CUSTOM')).toEqual(
        code
          ? []
          : [
              expect.objectContaining({
                name: 'structured-output.complete',
                value: { object: { answer: 'ok' }, raw: content },
              }),
            ],
      )
    },
  )
})

const usageWire = {
  prompt_tokens: 10,
  completion_tokens: 50,
  total_tokens: 60,
  completion_tokens_details: { reasoning_tokens: 42 },
  cost: 0.002,
}
const expectedUsage = {
  promptTokens: 10,
  completionTokens: 50,
  totalTokens: 60,
  completionTokensDetails: { reasoningTokens: 42 },
  cost: 0.002,
}
const envelope = {
  id: 'gen-test',
  model: 'openai/gpt-4o-mini',
  object: 'chat.completion.chunk',
  created: 1,
}

function sseAdapter(events: Array<Record<string, unknown>>) {
  const fetcher = vi.fn(
    async () =>
      new Response(
        `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`,
        { headers: { 'content-type': 'text/event-stream' } },
      ),
  )
  return createOpenRouterText('openai/gpt-4o-mini', 'test-key', {
    httpClient: new HTTPClient({ fetcher }),
    retryConfig: { strategy: 'none' },
  })
}

async function collectChat(adapter: ReturnType<typeof sseAdapter>) {
  const chunks: Array<AdapterYieldChunk> = []
  for await (const chunk of adapter.chatStream({
    threadId: 'thread-1',
    model: 'openai/gpt-4o-mini',
    messages: [{ role: 'user', content: 'Hi' }],
    logger: resolveDebugOption(false),
  })) {
    chunks.push(chunk)
  }
  return chunks
}

describe('OpenRouter chat stream usage on RUN_ERROR', () => {
  it('reports usage on the RUN_ERROR for an unknown finish_reason', async () => {
    const chunks = await collectChat(
      sseAdapter([
        {
          ...envelope,
          choices: [
            { index: 0, delta: { content: 'hi' }, finish_reason: 'weird' },
          ],
        },
        { ...envelope, choices: [], usage: usageWire },
      ]),
    )
    const terminal = chunks.at(-1)
    expect(terminal?.type).toBe('RUN_ERROR')
    expect(terminal).toMatchObject({ usage: expectedUsage })
    expect(chunks.filter((c) => c.type === 'RUN_FINISHED')).toHaveLength(0)
  })

  it('reports usage on the RUN_ERROR for a mid-stream error after usage', async () => {
    const chunks = await collectChat(
      sseAdapter([
        {
          ...envelope,
          choices: [
            { index: 0, delta: { content: 'hi' }, finish_reason: null },
          ],
          usage: usageWire,
        },
        {
          ...envelope,
          choices: [],
          error: { code: 502, message: 'upstream died' },
        },
      ]),
    )
    const terminal = chunks.at(-1)
    expect(terminal?.type).toBe('RUN_ERROR')
    expect(terminal).toMatchObject({
      message: 'upstream died',
      usage: expectedUsage,
    })
  })

  it('reads usage on the same chunk as the stream error', async () => {
    const chunks = await collectChat(
      sseAdapter([
        {
          ...envelope,
          choices: [],
          usage: usageWire,
          error: { code: 502, message: 'upstream died' },
        },
      ]),
    )
    const terminal = chunks.at(-1)
    expect(terminal?.type).toBe('RUN_ERROR')
    expect(terminal).toMatchObject({ usage: expectedUsage })
  })
})

describe('OpenRouter structuredOutput usage on a thrown error', () => {
  it.each([
    ['truncated', '{"answer":', 'length', /maximum token limit/],
    ['empty', '', 'stop', /no content/],
    ['malformed', '{"answer":', 'stop', /Failed to parse/],
  ] as const)(
    'attaches the response usage on %s',
    async (_label, content, finishReason, message) => {
      const fetcher = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: 'gen-test',
              model: 'openai/gpt-4o-mini',
              object: 'chat.completion',
              created: 1,
              system_fingerprint: null,
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content },
                  finish_reason: finishReason,
                },
              ],
              usage: usageWire,
            }),
            { headers: { 'content-type': 'application/json' } },
          ),
      )
      const adapter = createOpenRouterText('openai/gpt-4o-mini', 'test-key', {
        httpClient: new HTTPClient({ fetcher }),
      })
      const error = await adapter
        .structuredOutput({
          chatOptions: {
            threadId: 'thread-1',
            model: 'openai/gpt-4o-mini',
            messages: [{ role: 'user', content: 'Return an answer.' }],
            logger: resolveDebugOption(false),
          },
          outputSchema: {
            type: 'object',
            properties: { answer: { type: 'string' } },
            required: ['answer'],
          },
        })
        .then(
          () => undefined,
          (e: unknown) => e,
        )
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toMatch(message)
      expect(error).toMatchObject({ usage: expectedUsage })
    },
  )
})

describe('buildOpenRouterUsage provider details', () => {
  it('keeps server tool use and BYOK in providerUsageDetails', () => {
    const usage = buildOpenRouterUsage({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      isByok: false,
      serverToolUseDetails: { toolCallsRequested: 2, webSearchRequests: 1 },
    })
    expect(usage?.providerUsageDetails).toEqual({
      isByok: false,
      serverToolUseDetails: { toolCallsRequested: 2, webSearchRequests: 1 },
    })
  })
})
