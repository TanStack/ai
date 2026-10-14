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
