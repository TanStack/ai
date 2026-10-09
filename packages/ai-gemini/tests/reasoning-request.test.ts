import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { GeminiTextAdapter } from '../src/adapters/text'
import { GeminiTextInteractionsAdapter } from '../src/experimental/text-interactions/adapter'
import type { ReasoningRequest } from '@tanstack/ai'
import type { GeminiModels } from '../src/model-meta'

const mocks = vi.hoisted(() => ({
  generateContentStream: vi.fn(),
  interactionsCreate: vi.fn(),
}))

vi.mock('@google/genai', async () => {
  const actual = await vi.importActual<any>('@google/genai')
  class MockGoogleGenAI {
    models = { generateContentStream: mocks.generateContentStream }
    get interactions() {
      return { create: mocks.interactionsCreate }
    }
  }
  return { ...actual, GoogleGenAI: MockGoogleGenAI }
})

const logger = resolveDebugOption(false)

async function* noChunks() {}

/** Run one call and return the `thinkingConfig` it sent. */
async function thinkingConfig(
  model: GeminiModels,
  reasoning: ReasoningRequest | undefined,
) {
  mocks.generateContentStream.mockResolvedValue(noChunks())
  const adapter = new GeminiTextAdapter({ apiKey: 'test' }, model)
  for await (const _chunk of adapter.chatStream({
    logger,
    model,
    messages: [{ role: 'user', content: 'hi' }],
    ...(reasoning ? { reasoning } : {}),
  })) {
    // Drain the stream.
  }
  const [payload] = mocks.generateContentStream.mock.calls.at(-1) ?? []
  return payload.config.thinkingConfig
}

const on = (level: ReasoningRequest['level']): ReasoningRequest => ({
  level,
  summary: true,
})

describe('Gemini chat({ reasoning }) request shape', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends no thinkingConfig without a reasoning request', async () => {
    expect(await thinkingConfig('gemini-3.1-pro-preview', undefined)).toBe(
      undefined,
    )
  })

  it('Gemini 3: thinkingLevel from the level', async () => {
    expect(
      await thinkingConfig('gemini-3-flash-preview', on('minimal')),
    ).toEqual({ includeThoughts: true, thinkingLevel: 'MINIMAL' })
    // gemini-3.1-pro-preview has no minimal: it clamps up to LOW.
    expect(
      await thinkingConfig('gemini-3.1-pro-preview', {
        level: 'minimal',
        summary: false,
      }),
    ).toEqual({ includeThoughts: false, thinkingLevel: 'LOW' })
  })

  it('Gemini 2.5: thinkingBudget from pi table, or budgetTokens', async () => {
    expect(await thinkingConfig('gemini-2.5-pro', on('high'))).toEqual({
      includeThoughts: true,
      thinkingBudget: 32768,
    })
    expect(await thinkingConfig('gemini-2.5-flash', on('high'))).toEqual({
      includeThoughts: true,
      thinkingBudget: 24576,
    })
    expect(
      await thinkingConfig('gemini-2.5-pro', {
        level: 'low',
        summary: true,
        budgetTokens: 3000,
      }),
    ).toEqual({ includeThoughts: true, thinkingBudget: 3000 })
  })

  it('off: a zero budget', async () => {
    expect(await thinkingConfig('gemini-2.5-flash', on('off'))).toEqual({
      thinkingBudget: 0,
    })
  })
})

describe('Gemini Interactions chat({ reasoning }) request shape', () => {
  it('sends thinking_level and thinking_summaries', async () => {
    mocks.interactionsCreate.mockResolvedValue(noChunks())
    const adapter = new GeminiTextInteractionsAdapter(
      { apiKey: 'test' },
      'gemini-3.8-flash',
    )
    for await (const _chunk of adapter.chatStream({
      logger,
      model: 'gemini-3.8-flash',
      messages: [{ role: 'user', content: 'hi' }],
      reasoning: { level: 'medium', summary: false },
    })) {
      // Drain the stream.
    }
    const [body] = mocks.interactionsCreate.mock.calls[0] ?? []
    expect(body.generation_config).toEqual({
      thinking_level: 'medium',
      thinking_summaries: 'none',
    })
  })
})
