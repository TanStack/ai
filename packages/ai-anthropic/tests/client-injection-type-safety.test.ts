import { expectTypeOf, it } from 'vitest'
import type { AnthropicVertex } from '@anthropic-ai/vertex-sdk'
import type { AnthropicMessagesClient } from '../src'

it('accepts the official Vertex client', () => {
  expectTypeOf<AnthropicVertex>().toExtend<AnthropicMessagesClient>()
})
