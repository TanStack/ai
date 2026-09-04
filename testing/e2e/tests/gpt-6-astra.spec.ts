import { chat } from '@tanstack/ai'
import {
  createOpenaiChat,
  createOpenaiChatCompletions,
} from '@tanstack/ai-openai'
import { test, expect } from './fixtures'

for (const endpoint of ['Responses', 'Chat Completions'] as const) {
  test(`GPT-6 Astra streams through ${endpoint}`, async ({
    aimockPort,
    testId,
  }) => {
    const payloads: Array<Record<string, unknown>> = []
    const config = {
      baseURL: `http://127.0.0.1:${aimockPort}/v1`,
      defaultHeaders: { 'X-Test-Id': testId },
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        payloads.push(JSON.parse(String(init?.body)))
        return fetch(url, init)
      },
    }
    const adapter =
      endpoint === 'Responses'
        ? createOpenaiChat('gpt-6-astra', 'e2e-dummy', config)
        : createOpenaiChatCompletions('gpt-6-astra', 'e2e-dummy', config)
    let text = ''
    let finished = false
    for await (const chunk of chat({
      adapter,
      messages: [{ role: 'user', content: '[gpt-6-astra] recommend a guitar' }],
      modelOptions:
        endpoint === 'Responses'
          ? { reasoning: { effort: 'max' }, temperature: 0.3, top_p: 0.8 }
          : { reasoning_effort: 'max', max_completion_tokens: 128 },
    })) {
      expect(chunk.type).not.toBe('RUN_ERROR')
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') text += chunk.delta
      if (chunk.type === 'RUN_FINISHED') finished = true
    }
    expect(text).toContain('Fender Stratocaster')
    expect(finished).toBe(true)
    expect(payloads).toHaveLength(1)
    expect(payloads[0]).toMatchObject(
      endpoint === 'Responses'
        ? {
            model: 'gpt-6-astra',
            reasoning: { effort: 'max' },
            include: ['reasoning.encrypted_content'],
          }
        : {
            model: 'gpt-6-astra',
            reasoning_effort: 'max',
            max_completion_tokens: 128,
          },
    )
    expect(payloads[0]).not.toHaveProperty('temperature')
    expect(payloads[0]).not.toHaveProperty('top_p')
  })
}
