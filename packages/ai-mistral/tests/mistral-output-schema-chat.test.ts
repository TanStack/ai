import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockComplete } = vi.hoisted(() => ({
  mockComplete: vi.fn<(...args: Array<unknown>) => unknown>(),
}))

vi.mock('@mistralai/mistralai', () => {
  return {
    Mistral: class {
      chat = {
        complete: (...args: Array<unknown>) => mockComplete(...args),
      }
    },
    HTTPClient: class {
      addHook() {}
    },
  }
})

const { chat } = await import('@tanstack/ai')
const { createMistralText } = await import('../src/adapters/text')

describe('chat({ outputSchema }) with Mistral', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('widens optional enums after the engine fills required', async () => {
    const sseBody =
      [
        {
          id: 'cmpl-text',
          model: 'mistral-large-latest',
          object: 'chat.completion.chunk',
          created: 0,
          choices: [
            {
              index: 0,
              delta: { content: 'Working.' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'cmpl-text',
          model: 'mistral-large-latest',
          object: 'chat.completion.chunk',
          created: 0,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: 8,
            completion_tokens: 2,
            total_tokens: 10,
          },
        },
      ]
        .map((chunk) => `data: ${JSON.stringify(chunk)}`)
        .join('\n\n') + '\n\ndata: [DONE]\n\n'

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sseBody))
            controller.close()
          },
        }),
      }),
    )
    mockComplete.mockReset().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ mode: null, note: null }),
          },
        },
      ],
    })
    const adapter = createMistralText('mistral-large-latest', 'test-api-key')

    const result = await chat({
      adapter,
      messages: [{ role: 'user', content: 'Return structured output' }],
      outputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['canary'] },
          note: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
        required: ['note'],
        additionalProperties: false,
      },
    })

    expect(mockComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        responseFormat: {
          type: 'json_schema',
          jsonSchema: {
            name: 'structured_output',
            schemaDefinition: expect.objectContaining({
              required: ['mode', 'note'],
              properties: expect.objectContaining({
                mode: expect.objectContaining({
                  type: ['string', 'null'],
                  enum: ['canary', null],
                }),
                note: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              }),
            }),
            strict: true,
          },
        },
      }),
    )
    expect(result).toEqual({ note: null })
  })
})
