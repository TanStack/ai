import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createVercelGatewaySummarize,
  vercelGatewaySummarize,
} from '../src/adapters/summarize'

describe('Vercel Gateway summarize adapter', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates a summarize adapter with kind summarize', () => {
    const adapter = createVercelGatewaySummarize('anthropic/claude-opus-5', 'k')

    expect(adapter.kind).toBe('summarize')
    expect(adapter.name).toBe('vercel-gateway')
    expect(adapter.model).toBe('anthropic/claude-opus-5')
  })

  it('creates a summarize adapter from AI_GATEWAY_API_KEY', () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'env-key')

    const adapter = vercelGatewaySummarize('openai/gpt-5.5')

    expect(adapter.kind).toBe('summarize')
    expect(adapter.name).toBe('vercel-gateway')
  })
})
