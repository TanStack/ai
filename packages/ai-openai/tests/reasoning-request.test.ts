import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAITextAdapter } from '../src/adapters/text'
import { azureOpenaiText } from '../src'
import type { OpenAIModelId } from '../src/adapters/text'
import type { ModelReasoning, ReasoningRequest } from '@tanstack/ai'

const logger = resolveDebugOption(false)

/** The adapter, with its SDK client in reach, so a test can stub it. */
class TestAdapter<
  TModel extends OpenAIModelId,
> extends OpenAITextAdapter<TModel> {
  get sdk() {
    return this.client
  }
}

async function* noEvents() {}

/** The `reasoning` field of the Responses request for one call. */
async function reasoningFor(
  model: OpenAIModelId,
  reasoning: ReasoningRequest | undefined,
  config?: ModelReasoning,
) {
  const adapter = new TestAdapter(
    { apiKey: 'test', ...(config !== undefined ? { reasoning: config } : {}) },
    model,
  )
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

describe('OpenAI reasoning from the config', () => {
  const high: ReasoningRequest = { level: 'high', summary: true }

  it('sends the effort for a model id that the table does not have', async () => {
    expect(
      await reasoningFor('gpt-5.3-codex', high, {
        map: { off: 'none', xhigh: 'xhigh' },
        budget: false,
      }),
    ).toEqual({ effort: 'high', summary: 'auto' })
  })

  it('sends nothing for reasoning: false, also on a known model', async () => {
    expect(await reasoningFor('gpt-5.2', high, false)).toBeUndefined()
  })

  it('clamps the level with the config, not with the table', async () => {
    // The table gives gpt-5.2 xhigh. This config tops out at high.
    expect(
      await reasoningFor(
        'gpt-5.2',
        { level: 'xhigh', summary: false },
        { budget: false },
      ),
    ).toEqual({ effort: 'high' })
  })

  it('azureOpenaiText sends the effort only with the config', async () => {
    const bodies: Array<Record<string, unknown>> = []
    const fetcher: typeof fetch = async (input, init) => {
      bodies.push(JSON.parse(await new Request(input, init).text()))
      return Response.json({
        id: 'r',
        status: 'completed',
        output: [],
      })
    }
    for (const reasoning of [{ budget: false }, undefined]) {
      const adapter = azureOpenaiText('gpt-5.5', {
        resourceName: 'test',
        apiKey: 'key',
        fetch: fetcher,
        ...(reasoning ? { reasoning } : {}),
      })
      for await (const _chunk of adapter.chatStream({
        logger,
        model: 'gpt-5.5',
        messages: [{ role: 'user', content: 'hi' }],
        reasoning: high,
      })) {
        // Drain the stream.
      }
    }
    expect(bodies[0]?.reasoning).toEqual({ effort: 'high', summary: 'auto' })
    expect(bodies[1]).not.toHaveProperty('reasoning')
  })
})
