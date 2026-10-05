import { describe, expect, it, vi } from 'vitest'
import { Ollama } from 'ollama'
import { chat, EventType } from '@tanstack/ai'
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

const toolRow = (input: unknown, done: boolean) => ({
  model: 'reported-model',
  message: {
    role: 'assistant',
    content: '',
    tool_calls: [
      { id: 'call', function: { name: 'inspect', arguments: input, index: 0 } },
    ],
  },
  done,
  done_reason: done ? 'stop' : undefined,
})

describe('Ollama replay parity', () => {
  it.each([false, true])(
    'keeps exact terminal snapshots for doneOnly=%s',
    async (doneOnly) => {
      for (const input of [
        '',
        '  ',
        '7',
        'false',
        'null',
        '"value"',
        '[1]',
        '{"n":1e999}',
        '{"n":',
        0,
        false,
        null,
        [1],
      ]) {
        const mock = sdk(
          doneOnly
            ? [toolRow(input, true)]
            : [
                toolRow(input, false),
                {
                  model,
                  message: { role: 'assistant', content: '' },
                  done: true,
                },
              ],
        )
        const chunks = await collect(
          new OllamaTextAdapter(mock.client, model).chatStream({
            logger,
            model,
            messages: [{ role: 'user', content: 'Go' }],
          }),
        )
        const end = chunks.find(
          (chunk) =>
            typeof chunk === 'object' &&
            chunk !== null &&
            'type' in chunk &&
            chunk.type === EventType.TOOL_CALL_END,
        )
        const raw = typeof input === 'string' ? input : JSON.stringify(input)
        expect(end).toMatchObject({ args: raw })
        if (raw.trim() === '' || raw === '{"n":')
          expect(end).not.toHaveProperty('input')
        else expect(end).toMatchObject({ input: JSON.parse(raw) })
      }
    },
  )

  it.each([false, true])(
    'rejects invalid raw input before server or client dispatch for doneOnly=%s',
    async (doneOnly) => {
      for (const raw of [
        '7',
        'false',
        'null',
        '"value"',
        '[1]',
        '{"n":',
        '',
        '  ',
      ]) {
        for (const client of [false, true]) {
          const mock = sdk(
            doneOnly
              ? [toolRow(raw, true)]
              : [
                  toolRow(raw, false),
                  {
                    model,
                    message: { role: 'assistant', content: '' },
                    done: true,
                  },
                ],
          )
          const execute = vi.fn(async () => 'done')
          const chunks = await collect(
            chat({
              adapter: new OllamaTextAdapter(mock.client, model),
              messages: [{ role: 'user', content: 'Go' }],
              tools: [
                {
                  name: 'inspect',
                  description: 'Inspect input',
                  inputSchema: {
                    type: 'object',
                    properties: { optional: { type: 'string' } },
                  },
                  ...(client ? {} : { execute }),
                },
              ],
            }),
          )
          expect(execute).not.toHaveBeenCalled()
          expect(JSON.stringify(chunks)).not.toContain('client_tool_call')
        }
      }
      const mock = sdk([toolRow('{"n":', true)])
      const execute = vi.fn(async () => 'done')
      await collect(
        chat({
          adapter: new OllamaTextAdapter(mock.client, model),
          messages: [{ role: 'user', content: 'Go' }],
          tools: [
            {
              name: 'inspect',
              description: 'Inspect input',
              inputSchema: { type: 'string' },
              execute,
            },
          ],
        }),
      )
      expect(execute).not.toHaveBeenCalled()
    },
  )

  it('passes accepted authored scalars unchanged exactly once', async () => {
    for (const value of [7, false, null, 'value', [1]]) {
      const mock = sdk([toolRow(JSON.stringify(value), true)])
      const validate = vi.fn((input: unknown) => ({ value: input }))
      const execute = vi.fn(async (_input: unknown) => 'done')
      await collect(
        chat({
          adapter: new OllamaTextAdapter(mock.client, model),
          messages: [{ role: 'user', content: 'Go' }],
          tools: [
            {
              name: 'inspect',
              description: 'Inspect input',
              inputSchema: {
                '~standard': {
                  version: 1,
                  vendor: 'test',
                  validate,
                  jsonSchema: { input: () => ({}), output: () => ({}) },
                },
              },
              execute,
            },
          ],
        }),
      )
      expect(execute).toHaveBeenCalledTimes(1)
      expect(execute.mock.calls[0]?.[0]).toEqual(value)
      expect(validate).toHaveBeenCalledTimes(1)
    }
  })

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
