import { expectTypeOf, it } from 'vitest'
import type AnthropicSdkV112 from '@anthropic-ai/sdk-v112'
import type { AnthropicVertex } from '@anthropic-ai/vertex-sdk'
import type { AnthropicMessagesClient } from '../src'
import { AnthropicTextAdapter } from '../src'

type V112MessagesClient = {
  readonly beta: {
    readonly messages: Pick<AnthropicSdkV112['beta']['messages'], 'create'>
  }
}

it('accepts the official Vertex client', () => {
  expectTypeOf<AnthropicVertex>().toExtend<AnthropicMessagesClient>()
})

it('accepts clients backed by a newer Anthropic SDK version', () => {
  expectTypeOf<V112MessagesClient>().toExtend<AnthropicMessagesClient>()
})

it('accepts request flags with an injected client', () => {
  const client: AnthropicMessagesClient = {
    beta: { messages: { create: () => undefined } },
  }
  const adapter = new AnthropicTextAdapter(
    { client, oauth: true, allowEmptySignature: true, provider: 'gateway' },
    'claude-sonnet-5',
  )
  expectTypeOf(adapter.provider).toEqualTypeOf<string>()
})
