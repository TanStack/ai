import { afterEach, describe, expect, it, vi } from 'vitest'
import { VercelGatewayTextAdapter } from '../src/adapters/text'
import { VercelGatewayResponsesTextAdapter } from '../src/adapters/responses-text'
import {
  createVercelGatewayText,
  vercelGatewayText,
} from '../src/adapters/factory'

describe('createVercelGatewayText (branching factory)', () => {
  it('defaults to the Responses adapter', () => {
    const adapter = createVercelGatewayText('openai/gpt-5.5', 'k')

    expect(adapter).toBeInstanceOf(VercelGatewayResponsesTextAdapter)
    expect(adapter.kind).toBe('text')
    expect(adapter.name).toBe('vercel-gateway')
    expect(adapter.model).toBe('openai/gpt-5.5')
  })

  it("returns the Responses adapter when api is 'responses'", () => {
    const adapter = createVercelGatewayText('openai/gpt-5.5', 'k', {
      api: 'responses',
    })

    expect(adapter).toBeInstanceOf(VercelGatewayResponsesTextAdapter)
  })

  it("returns the Chat Completions adapter when api is 'chat'", () => {
    const adapter = createVercelGatewayText('openai/gpt-5.5', 'k', {
      api: 'chat',
    })

    expect(adapter).toBeInstanceOf(VercelGatewayTextAdapter)
  })

  it("returns the Chat Completions adapter when api is 'chat-completions'", () => {
    const adapter = createVercelGatewayText('openai/gpt-5.5', 'k', {
      api: 'chat-completions',
    })

    expect(adapter).toBeInstanceOf(VercelGatewayTextAdapter)
  })
})

describe('vercelGatewayText (env-key branching factory)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads AI_GATEWAY_API_KEY and defaults to Responses', () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'env-key')

    expect(vercelGatewayText('openai/gpt-5.5')).toBeInstanceOf(
      VercelGatewayResponsesTextAdapter,
    )
    expect(
      vercelGatewayText('openai/gpt-5.5', { api: 'responses' }),
    ).toBeInstanceOf(VercelGatewayResponsesTextAdapter)
    expect(vercelGatewayText('openai/gpt-5.5', { api: 'chat' })).toBeInstanceOf(
      VercelGatewayTextAdapter,
    )
  })
})
