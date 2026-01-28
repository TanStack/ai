import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildOllamaUsage } from '../src/usage'
import type { ChatResponse } from 'ollama'

describe('Ollama usage extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts basic token usage from response', () => {
    const response = {
      model: 'llama3.2',
      message: { role: 'assistant', content: 'Hello world' },
      done: true,
      prompt_eval_count: 100,
      eval_count: 50,
      total_duration: 1000000000,
      load_duration: 100000000,
      prompt_eval_duration: 200000000,
      eval_duration: 700000000,
    } as unknown as ChatResponse

    const usage = buildOllamaUsage(response)

    expect(usage).toBeDefined()
    expect(usage).toMatchObject({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    })
  })

  it('extracts provider-specific duration details', () => {
    const response = {
      model: 'llama3.2',
      message: { role: 'assistant', content: 'Hello world' },
      done: true,
      prompt_eval_count: 100,
      eval_count: 50,
      total_duration: 1000000000,
      load_duration: 100000000,
      prompt_eval_duration: 200000000,
      eval_duration: 700000000,
    } as unknown as ChatResponse

    const usage = buildOllamaUsage(response)

    expect(usage).toBeDefined()
    expect(usage?.providerUsageDetails).toMatchObject({
      loadDuration: 100000000,
      promptEvalDuration: 200000000,
      evalDuration: 700000000,
      totalDuration: 1000000000,
    })
  })

  it('handles response with zero token counts', () => {
    const response = {
      model: 'llama3.2',
      message: { role: 'assistant', content: '' },
      done: true,
      prompt_eval_count: 0,
      eval_count: 0,
      total_duration: 0,
      load_duration: 0,
      prompt_eval_duration: 0,
      eval_duration: 0,
    } as unknown as ChatResponse

    const usage = buildOllamaUsage(response)

    // When both token counts are 0, usage should be undefined
    expect(usage).toBeUndefined()
  })

  it('omits provider details when durations are zero', () => {
    const response = {
      model: 'llama3.2',
      message: { role: 'assistant', content: 'Hello world' },
      done: true,
      prompt_eval_count: 100,
      eval_count: 50,
      total_duration: 0,
      load_duration: 0,
      prompt_eval_duration: 0,
      eval_duration: 0,
    } as unknown as ChatResponse

    const usage = buildOllamaUsage(response)

    expect(usage).toBeDefined()
    expect(usage).toMatchObject({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    })
    // providerUsageDetails should be undefined when all durations are 0
    expect(usage?.providerUsageDetails).toBeUndefined()
  })

  it('extracts partial duration details', () => {
    const response = {
      model: 'llama3.2',
      message: { role: 'assistant', content: 'Hello world' },
      done: true,
      prompt_eval_count: 100,
      eval_count: 50,
      total_duration: 1000000000,
      load_duration: 0,
      prompt_eval_duration: 200000000,
      eval_duration: 0,
    } as unknown as ChatResponse

    const usage = buildOllamaUsage(response)

    expect(usage).toBeDefined()
    // Should only have non-zero duration fields
    expect(usage?.providerUsageDetails).toEqual({
      promptEvalDuration: 200000000,
      totalDuration: 1000000000,
    })
  })
})
