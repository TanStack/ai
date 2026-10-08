import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { chat } from '@tanstack/ai'
import { createMistralText } from '../src/adapters/text'
import type { ModelReasoning, ReasoningRequest } from '@tanstack/ai'
import type { MistralModelId } from '../src/adapters/text'

const logger = resolveDebugOption(false)

/** Run one streaming call and return the JSON body it sent. */
async function send(
  model: MistralModelId,
  reasoning: ReasoningRequest | undefined,
  config?: ModelReasoning,
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
  const adapter = createMistralText(
    model,
    'test-key',
    config !== undefined ? { reasoning: config } : {},
  )
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

describe('Mistral reasoning from the config', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const effort: ModelReasoning = {
    map: { off: 'none', minimal: null, low: null, medium: null, high: 'high' },
    budget: false,
  }

  it('sends reasoning_effort for a model id that the table does not have', async () => {
    expect(await send('mistral-medium-2509', on('high'), effort)).toMatchObject(
      { reasoning_effort: 'high' },
    )
  })

  it('sends prompt_mode for a record with no level map', async () => {
    const body = await send('magistral-small-2509', on('medium'), {
      budget: false,
    })
    expect(body.prompt_mode).toBe('reasoning')
  })

  it('sends no reasoning field for reasoning: false, also on a known model', async () => {
    const body = await send('mistral-small-latest', on('high'), false)
    expect(body).not.toHaveProperty('reasoning_effort')
    expect(body).not.toHaveProperty('prompt_mode')
  })

  it('clamps the level with the config, not with the table', async () => {
    // This config has only off and high, so low moves up to high.
    expect(await send('mistral-small-latest', on('low'), effort)).toMatchObject(
      { reasoning_effort: 'high' },
    )
  })

  it('takes every level in the types with a reasoning config', () => {
    const id: string = 'mistral-medium-2509'
    // Type-level only: chat() is never iterated, so no request goes out.
    chat({
      adapter: createMistralText(id, 'k', { reasoning: effort }),
      messages: [{ role: 'user', content: 'hi' }],
      reasoning: 'max',
    })
    chat({
      adapter: createMistralText(id, 'k'),
      messages: [{ role: 'user', content: 'hi' }],
      // @ts-expect-error - no reasoning data for this id
      reasoning: 'high',
    })
  })
})
