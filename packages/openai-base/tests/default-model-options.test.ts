import { describe, expect, it } from 'vitest'
import { OpenAIBaseChatCompletionsTextAdapter } from '../src/adapters/chat-completions-text'
import { OpenAIBaseResponsesTextAdapter } from '../src/adapters/responses-text'
import { stubClient } from './stub-client'

type TestProviderOptions = { temperature?: number; user?: string }

class ChatAdapter extends OpenAIBaseChatCompletionsTextAdapter<
  string,
  TestProviderOptions
> {
  constructor(defaultModelOptions?: TestProviderOptions) {
    super('test-model', 'openai-base', stubClient({}), { defaultModelOptions })
  }
}

class ResponsesAdapter extends OpenAIBaseResponsesTextAdapter<
  string,
  TestProviderOptions
> {
  constructor(defaultModelOptions?: TestProviderOptions) {
    super('test-model', 'openai-base', stubClient({}), { defaultModelOptions })
  }
}

const adapters = [
  ['chat completions', (o?: TestProviderOptions) => new ChatAdapter(o)],
  ['responses', (o?: TestProviderOptions) => new ResponsesAdapter(o)],
] as const

describe.each(adapters)('%s adapter defaultModelOptions', (_name, create) => {
  it('stores the defaults from the constructor options', () => {
    const adapter = create({ temperature: 0.2, user: 'u-1' })

    expect(adapter.defaultModelOptions).toEqual({
      temperature: 0.2,
      user: 'u-1',
    })
  })

  it('is undefined when the options do not set it', () => {
    expect(create().defaultModelOptions).toBeUndefined()
  })
})
