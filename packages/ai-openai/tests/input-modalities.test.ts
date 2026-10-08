import { describe, expect, it } from 'vitest'
import { OpenAITextAdapter } from '../src/adapters/text'
import { OpenAIChatCompletionsTextAdapter } from '../src/adapters/text-chat-completions'

// Constructing the SDK client makes no network call.
const config = { apiKey: 'sk-test' }

describe('OpenAI text adapter inputModalities', () => {
  it('gives the input list of each known model', () => {
    expect(new OpenAITextAdapter(config, 'gpt-5.2').inputModalities).toEqual([
      'text',
      'image',
      'document',
    ])
    expect(new OpenAITextAdapter(config, 'gpt-audio').inputModalities).toEqual([
      'text',
      'audio',
    ])
  })

  it('is undefined for a model the metadata does not list', () => {
    // A catalog id, or a model id newer than this package.
    const adapter = new OpenAITextAdapter(config, 'gpt-unknown-9000')

    expect(adapter.inputModalities).toBeUndefined()
  })

  it('gives the same list on the Chat Completions adapter', () => {
    const adapter = new OpenAIChatCompletionsTextAdapter(config, 'gpt-audio')

    expect(adapter.inputModalities).toEqual(['text', 'audio'])
  })
})
