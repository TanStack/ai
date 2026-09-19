import { describe, expect, it } from 'vitest'
import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { openaiCompatible } from '../src/compatible/index'

function setup(api: 'chat-completions' | 'responses', name?: string) {
  const requests: Array<Record<string, unknown>> = []
  const provider = openaiCompatible({
    api,
    name: 'custom-provider',
    baseURL: 'https://never-called.invalid/v1',
    apiKey: 'synthetic-test-key',
    models: ['test-model'],
    maxRetries: 0,
    fetch: async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)))
      return new Response('data: [DONE]\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      })
    },
  })
  return {
    requests,
    adapter: new ChatStreamSummarizeAdapter(
      provider('test-model'),
      'test-model',
      name,
    ),
  }
}

describe('compatible summarize token limits on the wire', () => {
  for (const api of ['chat-completions', 'responses'] as const) {
    const key = api === 'responses' ? 'max_output_tokens' : 'max_tokens'
    for (const name of [undefined, 'custom-provider', 'openai']) {
      for (const stream of [false, true]) {
        it(`${api}, name=${name}, stream=${stream}: forwards maxLength`, async () => {
          const { adapter, requests } = setup(api, name)
          const options = {
            model: 'test-model',
            text: 'Synthetic input.',
            maxLength: 73,
            logger: resolveDebugOption(false),
          }
          if (stream) {
            for await (const _chunk of adapter.summarizeStream(options)) {
              // Consume the full stream so the SDK request is made.
            }
          } else {
            await adapter.summarize(options)
          }
          expect(requests).toHaveLength(1)
          expect(requests[0]?.[key]).toBe(73)
          const wrongKey =
            api === 'responses' ? 'max_tokens' : 'max_output_tokens'
          expect(requests[0]).not.toHaveProperty(wrongKey)
        })
      }
    }

    it(`${api}: preserves the caller's explicit limit`, async () => {
      const { adapter, requests } = setup(api)
      const modelOptions = { [key]: 41 }
      await adapter.summarize({
        model: 'test-model',
        text: 'Synthetic input.',
        maxLength: 73,
        modelOptions,
        logger: resolveDebugOption(false),
      })
      expect(requests[0]?.[key]).toBe(41)
      expect(modelOptions).toEqual({ [key]: 41 })
    })

    it(`${api}: does not add a limit when maxLength is absent`, async () => {
      const { adapter, requests } = setup(api)
      await adapter.summarize({
        model: 'test-model',
        text: 'Synthetic input.',
        logger: resolveDebugOption(false),
      })
      expect(requests[0]).not.toHaveProperty(key)
    })
  }
})
