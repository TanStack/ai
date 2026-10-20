import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { VercelGatewayTextAdapter } from '../src/adapters/text'
import { VercelGatewayResponsesTextAdapter } from '../src/adapters/responses-text'
import {
  VERCEL_GATEWAY_CHAT_MODELS,
  VERCEL_GATEWAY_ALL_CHAT_MODELS,
} from '../src/model-meta'
import type { ModelMessage, ReasoningLevel } from '@tanstack/ai'
import type { VercelGatewayChatModel } from '../src/model-meta'

const model = 'minimax/minimax-m3.1-flash'
async function request(
  api: 'chat' | 'responses',
  id: VercelGatewayChatModel = model,
  reasoning?: ReasoningLevel,
  messages: Array<ModelMessage> = [{ role: 'user', content: 'Hello' }],
) {
  let body: Record<string, any> | undefined
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body))
    return new Response('', {
      headers: { 'content-type': 'text/event-stream' },
    })
  }
  const adapter =
    api === 'chat'
      ? new VercelGatewayTextAdapter({ apiKey: 'test-key', fetch }, id)
      : new VercelGatewayResponsesTextAdapter({ apiKey: 'test-key', fetch }, id)
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

describe('MiniMax Flash through the real Vercel Gateway SDK', () => {
  it('offers Flash then M3 and preserves legacy IDs', () => {
    expect(
      VERCEL_GATEWAY_CHAT_MODELS.filter((id) => id.startsWith('minimax/')),
    ).toEqual([model, 'minimax/minimax-m3'])
    expect(VERCEL_GATEWAY_ALL_CHAT_MODELS).toContain('minimax/minimax-m2.7')
  })
  describe.each(['chat', 'responses'] as const)('%s', (api) => {
    it('omits effort by default and sends tools', async () => {
      const body = await request(api)
      expect(body.model).toBe(model)
      expect(body).not.toHaveProperty('reasoning_effort')
      expect(body).not.toHaveProperty('reasoning')
      expect(body.tool_choice).toBe('required')
      expect(body.tools).toHaveLength(1)
    })
    it.each(['low', 'medium', 'high', 'xhigh', 'max'] as const)(
      'sends explicit %s effort',
      async (effort) => {
        const body = await request(api, model, effort)
        expect(body.reasoning.effort).toBe(effort)
      },
    )
    it.each([
      'minimax/minimax-m3',
      'minimax/minimax-m2.7',
      'openai/gpt-5.5',
    ] as const)('preserves saved %s', async (id) => {
      expect((await request(api, id)).model).toBe(id)
    })
  })
  it('replays signed reasoning, tool results, and images through the default Responses route', async () => {
    const body = await request('responses', model, undefined, [
      {
        role: 'assistant',
        content: '',
        thinking: [{ content: 'Need the value', signature: '{"id":"rs_1"}' }],
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
    expect(body.input).toContainEqual(
      expect.objectContaining({
        type: 'reasoning',
        id: 'rs_1',
        summary: [{ type: 'summary_text', text: 'Need the value' }],
      }),
    )
    expect(body.input).toContainEqual(
      expect.objectContaining({
        type: 'function_call',
        call_id: 'call_1',
        name: 'lookup',
        arguments: '{}',
      }),
    )
    expect(body.input).toContainEqual(
      expect.objectContaining({
        type: 'function_call_output',
        call_id: 'call_1',
        output: '42',
      }),
    )
    expect(body.input.at(-1).content).toEqual([
      {
        type: 'input_image',
        image_url: 'https://example.com/image.png',
        detail: 'auto',
      },
      {
        type: 'input_image',
        image_url: 'data:image/png;base64,aGVsbG8=',
        detail: 'auto',
      },
    ])
  })
})
