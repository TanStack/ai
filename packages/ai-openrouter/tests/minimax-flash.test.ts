import { describe, expect, it } from 'vitest'
import { HTTPClient } from '@openrouter/sdk'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenRouterTextAdapter } from '../src/adapters/text'
import {
  OPENROUTER_ALL_CHAT_MODELS,
  OPENROUTER_CHAT_MODELS,
  OPENROUTER_MODEL_REASONING,
} from '../src/model-meta'
import type { ModelMessage, ReasoningLevel } from '@tanstack/ai'
import type { OpenRouterTextModels } from '../src/adapters/text'

const model = 'minimax/minimax-m3.1-flash:free'
const logger = resolveDebugOption(false)

async function request(
  id: OpenRouterTextModels = model,
  reasoning?: ReasoningLevel,
  messages: Array<ModelMessage> = [{ role: 'user', content: 'Hello' }],
) {
  let body: Record<string, any> | undefined
  const httpClient = new HTTPClient({
    fetcher: async (input) => {
      if (!(input instanceof Request)) throw new Error('Expected SDK Request')
      body = JSON.parse(await input.text())
      return new Response('data: [DONE]\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      })
    },
  })
  const adapter = new OpenRouterTextAdapter(
    { apiKey: 'test-key', httpClient },
    id,
  )
  const events = []
  for await (const event of adapter.chatStream({
    logger,
    model: id,
    messages,
    reasoning: reasoning ? { level: reasoning, summary: true } : undefined,
    tools: [
      {
        name: 'lookup',
        description: 'Look up a value',
        inputSchema: {
          type: 'object',
          properties: { value: { type: 'string' } },
        },
      },
    ],
    toolChoice: 'required',
  }))
    events.push(event)
  expect(events.filter((event) => event.type === 'RUN_ERROR')).toEqual([])
  expect(body).toBeDefined()
  return body!
}

describe('MiniMax Flash through the real OpenRouter SDK', () => {
  it('offers Flash then M3 while retaining legacy request ids', () => {
    expect(
      OPENROUTER_CHAT_MODELS.filter((id) => id.startsWith('minimax/')),
    ).toEqual([model, 'minimax/minimax-m3'])
    expect(OPENROUTER_ALL_CHAT_MODELS).toContain('minimax/minimax-m2.7')
    const capability = OPENROUTER_MODEL_REASONING[model]
    if (!capability) throw new Error('Flash reasoning metadata missing')
    expect(Object.keys(capability.levels)).toEqual([
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ])
  })

  it('omits effort by default and serializes tools', async () => {
    const body = await request()
    expect(body.model).toBe(model)
    expect(body).not.toHaveProperty('reasoning')
    expect(body).not.toHaveProperty('reasoning_effort')
    expect(body.tool_choice).toBe('required')
    expect(body.tools[0].function).toMatchObject({
      name: 'lookup',
      parameters: { type: 'object' },
    })
  })

  it.each(['low', 'medium', 'high', 'xhigh', 'max'] as const)(
    'serializes explicit %s effort',
    async (effort) => {
      expect((await request(model, effort)).reasoning).toEqual({ effort })
    },
  )

  it('preserves assistant thinking, tool ids/results and image history', async () => {
    const messages: Array<ModelMessage> = [
      {
        role: 'assistant',
        content: '',
        thinking: [{ content: 'Need the value' }],
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'lookup', arguments: '{"value":"x"}' },
          },
        ],
      },
      { role: 'tool', toolCallId: 'call_1', content: '{"value":"x"}' },
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/image.png' },
          },
          {
            type: 'image',
            source: { type: 'data', value: 'aGVsbG8=', mimeType: 'image/png' },
          },
        ],
      },
    ]
    const before = JSON.stringify(messages)
    const body = await request(model, undefined, messages)
    expect(body.messages[0]).toMatchObject({
      role: 'assistant',
      reasoning_details: [{ type: 'reasoning.text', text: 'Need the value' }],
      tool_calls: [
        {
          id: 'call_1',
          function: { name: 'lookup', arguments: '{"value":"x"}' },
        },
      ],
    })
    expect(body.messages[1]).toMatchObject({
      role: 'tool',
      tool_call_id: 'call_1',
      content: '{"value":"x"}',
    })
    expect(body.messages[2].content).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'https://example.com/image.png', detail: 'auto' },
      },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,aGVsbG8=', detail: 'auto' },
      },
    ])
    expect(JSON.stringify(messages)).toBe(before)
  })

  it.each([
    'minimax/minimax-m3',
    'minimax/minimax-m2.7',
    'openai/gpt-5.5',
  ] as const)('does not rewrite saved %s selections', async (id) => {
    expect((await request(id)).model).toBe(id)
  })
})
