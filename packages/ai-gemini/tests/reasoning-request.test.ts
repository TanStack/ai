import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { GeminiTextAdapter } from '../src/adapters/text'
import { GeminiTextInteractionsAdapter } from '../src/experimental/text-interactions/adapter'
import type { ModelReasoning, ReasoningRequest } from '@tanstack/ai'
import type { GeminiTextConfig } from '../src/adapters/text'

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
  model: string,
  reasoning: ReasoningRequest | undefined,
  config: GeminiTextConfig = { apiKey: 'test' },
) {
  mocks.generateContentStream.mockResolvedValue(noChunks())
  const adapter = new GeminiTextAdapter(config, model)
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

describe('Gemini reasoning from the config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const levels: ModelReasoning = {
    map: { off: null, minimal: null, xhigh: null },
    budget: false,
  }

  it('sends thinkingLevel for a model id that the table does not have', async () => {
    expect(
      await thinkingConfig('gemini-3.5-pro-preview', on('high'), {
        apiKey: 'test',
        reasoning: levels,
      }),
    ).toEqual({ includeThoughts: true, thinkingLevel: 'HIGH' })
  })

  it('works the same in Vertex mode', async () => {
    expect(
      await thinkingConfig('gemini-3.5-pro-preview', on('low'), {
        vertexai: true,
        project: 'p',
        location: 'global',
        reasoning: levels,
      }),
    ).toEqual({ includeThoughts: true, thinkingLevel: 'LOW' })
  })

  it('sends a thinking budget for a budget model from the config', async () => {
    expect(
      await thinkingConfig('gemini-2.5-flash-preview-09-2025', on('low'), {
        apiKey: 'test',
        reasoning: { budget: true },
      }),
    ).toEqual({ includeThoughts: true, thinkingBudget: 2048 })
  })

  it('sends no thinkingConfig for reasoning: false, also on a known model', async () => {
    expect(
      await thinkingConfig('gemini-3-flash-preview', on('high'), {
        apiKey: 'test',
        reasoning: false,
      }),
    ).toBeUndefined()
  })

  it('clamps the level with the config, not with the table', async () => {
    // The table gives gemini-3-flash-preview minimal. This config has none.
    expect(
      await thinkingConfig('gemini-3-flash-preview', on('minimal'), {
        apiKey: 'test',
        reasoning: levels,
      }),
    ).toEqual({ includeThoughts: true, thinkingLevel: 'LOW' })
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
