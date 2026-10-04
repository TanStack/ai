import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAITextAdapter } from '../src/adapters/text'
import type { OpenAIChatModel } from '../src/model-meta'
import type { ReasoningRequest } from '@tanstack/ai'

const logger = resolveDebugOption(false)

/** The adapter, with its SDK client in reach, so a test can stub it. */
class TestAdapter<
  TModel extends OpenAIChatModel,
> extends OpenAITextAdapter<TModel> {
  get sdk() {
    return this.client
  }
}

async function* noEvents() {}

/** The `reasoning` field of the Responses request for one call. */
async function reasoningFor(
  model: OpenAIChatModel,
  reasoning: ReasoningRequest | undefined,
) {
  const adapter = new TestAdapter({ apiKey: 'test' }, model)
  const create = vi.fn().mockResolvedValue(noEvents())
  adapter.sdk.responses.create = create as typeof adapter.sdk.responses.create
  for await (const _chunk of adapter.chatStream({
    logger,
    model,
    messages: [{ role: 'user', content: 'hi' }],
    ...(reasoning ? { reasoning } : {}),
  })) {
    // Drain the stream.
  }
  const [body] = create.mock.calls[0] ?? []
  return (body as Record<string, unknown>).reasoning
}

describe('OpenAI chat({ reasoning })', () => {
  it('sends the effort and asks for a summary', async () => {
    expect(
      await reasoningFor('gpt-5.2', { level: 'high', summary: true }),
    ).toEqual({
      effort: 'high',
      summary: 'auto',
    })
  })

  it('sends no summary when summary is false', async () => {
    expect(
      await reasoningFor('gpt-5.2', { level: 'low', summary: false }),
    ).toEqual({
      effort: 'low',
    })
  })

  it('sends none for off, on a model that can stop thinking', async () => {
    expect(
      await reasoningFor('gpt-5.2', { level: 'off', summary: true }),
    ).toEqual({
      effort: 'none',
    })
  })

  it('clamps a level the model does not have', async () => {
    // gpt-5.2 tops out at xhigh.
    expect(
      await reasoningFor('gpt-5.2', { level: 'max', summary: true }),
    ).toEqual({
      effort: 'xhigh',
      summary: 'auto',
    })
  })

  it('sends nothing without the option, or for a model that does not reason', async () => {
    expect(await reasoningFor('gpt-5.2', undefined)).toBeUndefined()
    expect(
      await reasoningFor('gpt-4.1', { level: 'high', summary: true }),
    ).toBeUndefined()
  })
})
