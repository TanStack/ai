import { chat } from '@tanstack/ai'
import { createGeminiChat } from '@tanstack/ai-gemini'
import { createGeminiTextInteractions } from '@tanstack/ai-gemini/experimental'
import { vertexText } from '@tanstack/ai-vertex'
import { vertexE2eConfig } from '../src/lib/vertex-e2e'
import { test, expect } from './fixtures'

const model = 'gemini-3.8-flash'

const adapters = [
  {
    name: 'Gemini',
    create: (baseUrl: string, headers: Record<string, string>) =>
      createGeminiChat(model, 'e2e-dummy', {
        httpOptions: { baseUrl, headers },
      }),
  },
  {
    name: 'Gemini Interactions',
    create: (baseUrl: string, headers: Record<string, string>) =>
      createGeminiTextInteractions(model, 'e2e-dummy', {
        httpOptions: { baseUrl, headers },
      }),
  },
  {
    name: 'Vertex',
    create: (baseUrl: string, headers: Record<string, string>) =>
      vertexText(model, vertexE2eConfig(baseUrl, headers)),
  },
]

for (const { name, create } of adapters) {
  test(`${name} streams with gemini-3.8-flash on the wire`, async ({
    aimockPort,
    testId,
  }) => {
    const baseUrl = `http://127.0.0.1:${aimockPort}`
    const adapter = create(baseUrl, { 'X-Test-Id': testId })
    let text = ''
    let finished = false
    for await (const chunk of chat({
      adapter,
      messages: [
        { role: 'user', content: '[gemini-3.8-flash] recommend a guitar' },
      ],
    })) {
      expect(chunk.type).not.toBe('RUN_ERROR')
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') text += chunk.delta
      if (chunk.type === 'RUN_FINISHED') finished = true
    }
    expect(text).toContain('Fender Stratocaster')
    expect(finished).toBe(true)
  })
}
