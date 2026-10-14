import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { CloudflareTextAdapter } from '../src/adapters/text'
import type { ReasoningRequest } from '@tanstack/ai'

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
