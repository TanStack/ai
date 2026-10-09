import { describe, expect, it } from 'vitest'
import { Ollama } from 'ollama'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OllamaTextAdapter } from '../src/adapters/text'
import type { ModelMessage } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'local-model'

function sdk(events?: Array<unknown>) {
  const bodies: Array<Record<string, unknown>> = []
  const answer = {
    model: 'reported-model',
    message: { role: 'assistant', content: 'done' },
    done: true,
    done_reason: 'stop',
  }
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const body = JSON.parse(await request.text())
    bodies.push(body)
    const rows = bodies.length === 1 && events ? events : [answer]
    if (!body.stream)
      return Response.json({
        ...answer,
        message: { role: 'assistant', content: '{"ok":true}' },
      })
    return new Response(
      rows.map((row) => JSON.stringify(row) + '\n').join(''),
      { headers: { 'content-type': 'application/x-ndjson' } },
    )
  }
  return {
    bodies,
    client: new Ollama({ host: 'https://ollama.invalid', fetch: fetcher }),
  }
}

async function collect(iterable: AsyncIterable<unknown>) {
  const chunks: Array<unknown> = []
  for await (const chunk of iterable) chunks.push(chunk)
  return chunks
}

describe('Ollama replay parity', () => {
  it.each([undefined, { provider: 'ollama', api: 'ollama', model }])(
    'keeps the full ordinary SDK body for source %j',
    async (source) => {
      const mock = sdk()
      const messages: Array<ModelMessage> = [
        { role: 'user', content: 'Hello' },
        {
          role: 'assistant',
          content: 'Prior',
          ...(source && { metadata: { tanstack: { source } } }),
        },
      ]
      const original = JSON.stringify(messages)
      await collect(
        new OllamaTextAdapter(mock.client, model).chatStream({
          logger,
          model,
          messages,
          systemPrompts: ['System'],
          modelOptions: {
            model,
            options: { temperature: 0.2, top_p: 0.7, num_predict: 100 },
            keep_alive: '5m',
            logprobs: true,
            top_logprobs: 2,
          },
        }),
      )
      expect(mock.bodies).toEqual([
        {
          model,
          messages: [
            { role: 'system', content: 'System' },
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Prior' },
          ],
          options: { temperature: 0.2, top_p: 0.7, num_predict: 100 },
          keep_alive: '5m',
          logprobs: true,
          top_logprobs: 2,
          stream: true,
        },
      ])
      expect(JSON.stringify(messages)).toBe(original)
    },
  )

  it('tags its native API without fabricating a generation ID', async () => {
    const mock = sdk()
    const adapter = new OllamaTextAdapter(mock.client, model)
    const chunks = await collect(
      adapter.chatStream({
        logger,
        model,
        messages: [{ role: 'user', content: 'Go' }],
      }),
    )
    expect(adapter.api).toBe('ollama')
    expect(chunks[0]).toMatchObject({
      metadata: {
        tanstack: { source: { provider: 'ollama', api: 'ollama', model } },
      },
    })
    expect(JSON.stringify(chunks)).not.toContain('responseId')
    const result = await adapter.structuredOutput({
      chatOptions: {
        logger,
        model,
        messages: [{ role: 'user', content: 'Go' }],
      },
      outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
    })
    expect(result).toMatchObject({ data: { ok: true } })
    expect(result).not.toHaveProperty('responseId')
  })
})
