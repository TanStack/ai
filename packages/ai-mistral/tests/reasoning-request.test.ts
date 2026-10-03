import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createMistralText } from '../src/adapters/text'
import type { ReasoningRequest } from '@tanstack/ai'
import type { MISTRAL_CHAT_MODELS } from '../src/model-meta'

const logger = resolveDebugOption(false)

/** Run one streaming call and return the JSON body it sent. */
async function send(
  model: (typeof MISTRAL_CHAT_MODELS)[number],
  reasoning: ReasoningRequest | undefined,
) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
        controller.close()
      },
    }),
  })
  vi.stubGlobal('fetch', fetchMock)
  const adapter = createMistralText(model, 'test-key')
  for await (const _chunk of adapter.chatStream({
    logger,
    model,
    messages: [{ role: 'user', content: 'hi' }],
    ...(reasoning ? { reasoning } : {}),
  })) {
    // Drain the stream.
  }
  const [, init] = fetchMock.mock.calls[0] ?? []
  return JSON.parse(init.body) as Record<string, unknown>
}

const on = (level: ReasoningRequest['level']): ReasoningRequest => ({
  level,
  summary: true,
})

describe('Mistral chat({ reasoning }) request shape', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('effort models: reasoning_effort, and none for off', async () => {
    expect(await send('mistral-small-latest', on('high'))).toMatchObject({
      reasoning_effort: 'high',
    })
    expect(await send('mistral-small-latest', on('off'))).toMatchObject({
      reasoning_effort: 'none',
    })
  })

  it('Magistral: prompt_mode reasoning, and nothing for off', async () => {
    const high = await send('magistral-medium-latest', on('medium'))
    expect(high.prompt_mode).toBe('reasoning')
    expect(high).not.toHaveProperty('reasoning_effort')
    const off = await send('magistral-medium-latest', on('off'))
    expect(off).not.toHaveProperty('prompt_mode')
  })

  it('sends no reasoning fields without a request', async () => {
    const body = await send('mistral-small-latest', undefined)
    expect(body).not.toHaveProperty('reasoning_effort')
    expect(body).not.toHaveProperty('prompt_mode')
  })
})
