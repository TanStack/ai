import { describe, expect, it } from 'vitest'
import { createBedrockChat } from '../src/adapters/text'
import { createBedrockResponsesText } from '../src/adapters/responses-text'
import { createBedrockConverse } from '../src/adapters/converse-text'

describe('Bedrock text adapters inputModalities', () => {
  it('reads the list of the model from the model catalog', () => {
    expect(
      createBedrockChat('google.gemma-4-31b', 'test-key').inputModalities,
    ).toEqual(['text', 'image'])
    expect(
      createBedrockResponsesText('openai.gpt-oss-120b-1:0', 'test-key')
        .inputModalities,
    ).toEqual(['text'])
    expect(
      createBedrockResponsesText('google.gemma-4-31b', 'test-key')
        .inputModalities,
    ).toEqual(['text', 'image'])
    expect(
      createBedrockConverse(
        'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        'test-key',
      ).inputModalities,
    ).toEqual(['text', 'image', 'document'])
  })

  it('is undefined for a model id that the catalog does not list', () => {
    // @ts-expect-error a JS caller or a cast can pass an id the types reject
    const adapter = createBedrockConverse('unlisted-model', 'test-key')

    expect(adapter.inputModalities).toBeUndefined()
  })
})
