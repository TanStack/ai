import { describe, expect, it } from 'vitest'
import { createOpenRouterText } from '../src/adapters/text'
import { createOpenRouterResponsesText } from '../src/adapters/responses-text'
import type { OpenRouterTextModels } from '../src/adapters/text'

// Both text adapters read the same model-meta map, so each case checks both.
function inputModalitiesOf(model: OpenRouterTextModels) {
  return {
    chat: createOpenRouterText(model, 'test-key').inputModalities,
    responses: createOpenRouterResponsesText(model, 'test-key').inputModalities,
  }
}

describe('OpenRouter text adapters inputModalities', () => {
  it.each([
    ['anthropic/claude-sonnet-4.5', ['text', 'image', 'document']],
    ['deepseek/deepseek-v4-pro', ['text']],
  ] as const)('reads the list of %s from model-meta', (model, expected) => {
    expect(inputModalitiesOf(model)).toEqual({
      chat: expected,
      responses: expected,
    })
  })

  it('is undefined for a model id that model-meta does not list', () => {
    // @ts-expect-error a JS caller or a cast can pass an id the types reject
    const modalities = inputModalitiesOf('unlisted/model')

    expect(modalities).toEqual({ chat: undefined, responses: undefined })
  })
})
