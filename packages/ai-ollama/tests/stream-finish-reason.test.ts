import { afterEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createOllamaChat } from '../src/adapters/text'

afterEach(() => vi.unstubAllGlobals())

describe('Ollama stream finish reason', () => {
  it.each([
    { doneReason: 'length', toolCall: false, expected: 'length' },
    { doneReason: 'length', toolCall: true, expected: 'length' },
    { doneReason: 'stop', toolCall: false, expected: 'stop' },
    { doneReason: 'stop', toolCall: true, expected: 'tool_calls' },
    { doneReason: undefined, toolCall: false, expected: 'stop' },
    { doneReason: undefined, toolCall: true, expected: 'tool_calls' },
  ])(
    'maps $doneReason with toolCall=$toolCall to $expected',
    async ({ doneReason, toolCall, expected }) => {
      const lines = [
        {
          message: {
            role: 'assistant',
            content: 'Partial answer',
            ...(toolCall && {
              tool_calls: [{ function: { name: 'lookup', arguments: {} } }],
            }),
          },
          done: false,
        },
        {
          message: { role: 'assistant', content: '' },
          done: true,
          done_reason: doneReason,
          prompt_eval_count: 14,
          eval_count: 5,
        },
      ]
      const fetch = vi.fn(
        async () =>
          new Response(
            lines.map((line) => JSON.stringify(line) + '\n').join(''),
            { headers: { 'content-type': 'application/x-ndjson' } },
          ),
      )
      vi.stubGlobal('fetch', fetch)
      const adapter = createOllamaChat('llama3.2', 'http://ollama.test')
      const messages = [{ role: 'user' as const, content: 'Reply' }]
      const chunks = []
      for await (const chunk of adapter.chatStream({
        threadId: 'ollama-finish-reason',
        logger: resolveDebugOption(false),
        model: adapter.model,
        messages,
      }))
        chunks.push(chunk)

      expect(chunks.at(-1)).toMatchObject({
        type: 'RUN_FINISHED',
        finishReason: expected,
      })

      if (doneReason === 'length') {
        const execute = vi.fn(() => 'result')
        const events = []
        for await (const event of chat({
          threadId: 'ollama-finish-reason',
          adapter,
          messages,
          tools: [{ name: 'lookup', description: 'Look up an item', execute }],
          modelOptions: { model: adapter.model, options: { num_predict: 5 } },
          debug: false,
        }))
          events.push(event)

        expect(events.at(-1)).toMatchObject({
          type: 'RUN_FINISHED',
          metadata: { tanstack: { finishReason: 'length' } },
        })
        expect(events.some((event) => event.type === 'RUN_ERROR')).toBe(false)
        expect(execute).not.toHaveBeenCalled()
        expect(fetch).toHaveBeenCalledTimes(2)
      }
    },
  )
})
