import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { chat } from '@tanstack/ai'
import {
  CloudflareTextAdapter,
  createCloudflareText,
} from '../src/adapters/text'
import type { ModelReasoning, ReasoningRequest } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = '@cf/deepseek-ai/deepseek-v4-flash-0731'

class Probe extends CloudflareTextAdapter<typeof model> {
  request(reasoning: ReasoningRequest | undefined) {
    return this.mapOptionsToRequest({
      model,
      logger,
      messages: [{ role: 'user', content: 'hi' }],
      ...(reasoning ? { reasoning } : {}),
    })
  }
}

describe('Cloudflare chat({ reasoning }) request shape', () => {
  const adapter = new Probe({ accountId: 'a', apiKey: 'k' }, model)

  it('sends the level effort', () => {
    expect(adapter.request({ level: 'max', summary: true })).toMatchObject({
      reasoning_effort: 'max',
    })
  })

  it('sends null for off', () => {
    expect(
      adapter.request({ level: 'off', summary: true }).reasoning_effort,
    ).toBeNull()
  })

  it('sends nothing without a request', () => {
    expect(adapter.request(undefined)).not.toHaveProperty('reasoning_effort')
  })
})

describe('Cloudflare reasoning from the config', () => {
  /** The request for any model id, with `reasoning` in the config. */
  class AnyProbe extends CloudflareTextAdapter<string> {
    request(reasoning: ReasoningRequest) {
      return this.mapOptionsToRequest({
        model: this.model,
        logger,
        messages: [{ role: 'user', content: 'hi' }],
        reasoning,
      })
    }
  }
  const probe = (id: string, reasoning: ModelReasoning) =>
    new AnyProbe({ accountId: 'a', apiKey: 'k', reasoning }, id)

  it('sends the effort for a model id that the table does not have', () => {
    expect(
      probe('@cf/qwen/qwen3.6-30b-a3b', { budget: false }).request({
        level: 'high',
        summary: true,
      }),
    ).toMatchObject({ reasoning_effort: 'high' })
  })

  it('sends nothing for reasoning: false, also on a known model', () => {
    expect(
      probe(model, false).request({ level: 'high', summary: true }),
    ).not.toHaveProperty('reasoning_effort')
  })

  it('clamps the level with the config, not with the table', () => {
    // The table gives this model max. This config tops out at high.
    expect(
      probe(model, { budget: false }).request({ level: 'max', summary: true }),
    ).toMatchObject({ reasoning_effort: 'high' })
  })

  it('takes every level in the types with a reasoning config', () => {
    const reasoning: ModelReasoning = { budget: false }
    // Type-level only: chat() is never iterated, so no request goes out.
    chat({
      adapter: createCloudflareText('@cf/qwen/qwen3.6-30b-a3b', {
        accountId: 'a',
        apiKey: 'k',
        reasoning,
      }),
      messages: [{ role: 'user', content: 'hi' }],
      reasoning: 'medium',
    })
  })
})
