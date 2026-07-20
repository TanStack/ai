// Type-only probe — verifies that UseChatOptions's ChatTransport XOR
// survives DistributedOmit. These assertions exercise type errors at
// compile time; the test file body is empty.
import { describe, expectTypeOf, it } from 'vitest'
import type { ChatFetcher, ConnectionAdapter } from '@tanstack/ai-client'
import type { UseChatOptions } from '../src/types'

describe('UseChatOptions XOR', () => {
  it('rejects neither / both, accepts exactly one', () => {
    // Accept connection only
    expectTypeOf<{
      connection: ConnectionAdapter
    }>().toMatchTypeOf<UseChatOptions>()
    // Accept fetcher only
    expectTypeOf<{ fetcher: ChatFetcher }>().toMatchTypeOf<UseChatOptions>()
    // Reject empty
    expectTypeOf<{}>().not.toMatchTypeOf<UseChatOptions>()
    // Reject both
    expectTypeOf<{
      connection: ConnectionAdapter
      fetcher: ChatFetcher
    }>().not.toMatchTypeOf<UseChatOptions>()
  })
})
