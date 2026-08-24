import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createLovableSummarize,
  lovableSummarize,
} from '../src/adapters/summarize'

describe('Lovable summarize adapter', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates a summarize adapter with kind summarize', () => {
    const adapter = createLovableSummarize('google/gemini-3.7-flash', 'k')

    expect(adapter.kind).toBe('summarize')
    expect(adapter.name).toBe('lovable')
    expect(adapter.model).toBe('google/gemini-3.7-flash')
  })

  it('creates a summarize adapter from LOVABLE_API_KEY', () => {
    vi.stubEnv('LOVABLE_API_KEY', 'env-key')

    const adapter = lovableSummarize('openai/gpt-5.5')

    expect(adapter.kind).toBe('summarize')
    expect(adapter.name).toBe('lovable')
  })
})
