import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createLLMGatewayText } from '../src/adapters/text'
import {
  LLMGATEWAY_CHAT_MODELS,
  LLMGATEWAY_ALL_CHAT_MODELS,
} from '../src/model-meta'
import type { ModelMessage, ReasoningLevel } from '@tanstack/ai'

const model = 'minimax-m3.1-flash'
async function request(
  id = model,
  reasoning?: ReasoningLevel,
  messages: Array<ModelMessage> = [{ role: 'user', content: 'Hello' }],
) {
  let body: Record<string, any> | undefined
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body))
    return new Response('data: [DONE]\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    })
  }
  const adapter = createLLMGatewayText(id, 'test-key', { fetch })
  const events = []
  for await (const event of adapter.chatStream({
    logger: resolveDebugOption(false),
    model: id,
    messages,
    reasoning: reasoning ? { level: reasoning, summary: true } : undefined,
    tools: [{ name: 'lookup', description: 'Look up a value' }],
    toolChoice: 'required',
  }))
    events.push(event)
  expect(events.filter((event) => event.type === 'RUN_ERROR')).toEqual([])
  expect(body).toBeDefined()
  return body!
}

describe('MiniMax Flash through the real LLM Gateway SDK transport', () => {
  it('offers Flash then M3 and preserves legacy IDs', () => {
    expect(
      LLMGATEWAY_CHAT_MODELS.filter((id) => id.startsWith('minimax')),
    ).toEqual([model, 'minimax-m3'])
    expect(LLMGATEWAY_ALL_CHAT_MODELS).toContain('minimax-m2.5')
  })
  it('omits effort by default and sends tools', async () => {
    const body = await request()
    expect(body.model).toBe(model)
    expect(body).not.toHaveProperty('reasoning_effort')
    expect(body.tool_choice).toBe('required')
    expect(body.tools[0].function.name).toBe('lookup')
  })
  it.each(['low', 'medium', 'high', 'xhigh', 'max'] as const)(
    'sends explicit %s effort unchanged',
    async (effort) => {
      expect((await request(model, effort)).reasoning_effort).toBe(effort)
    },
  )
  it('preserves thinking, tool history, URL and inline images', async () => {
    const body = await request(model, undefined, [
      {
        role: 'assistant',
        content: '',
        thinking: [{ content: 'Need the value' }],
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'lookup', arguments: '{}' },
          },
        ],
      },
      { role: 'tool', toolCallId: 'call_1', content: '42' },
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
    ])
    expect(body.messages[0]).toMatchObject({
      reasoning_content: 'Need the value',
      tool_calls: [{ id: 'call_1' }],
    })
    expect(body.messages[1]).toMatchObject({
      tool_call_id: 'call_1',
      content: '42',
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
  })
  it.each([
    'minimax-m3',
    'minimax-m2.5',
    'custom/saved-model',
    'gpt-5.6-terra',
  ])('preserves explicit %s', async (id) => {
    expect((await request(id)).model).toBe(id)
  })
})
