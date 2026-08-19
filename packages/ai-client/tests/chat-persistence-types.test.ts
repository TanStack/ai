/**
 * Type-level tests for the `persistence` / `threadId` pairing on ChatClient.
 * These assertions are pure types. They never construct a client at runtime.
 *
 * Persistence that is on (`true` or a storage adapter) requires a `threadId`.
 * Do not apply a plain `Omit` to `ChatClientOptions` later: that collapses the
 * union and the requirement disappears. Use `DistributedOmit`.
 */

import { describe, it } from 'vitest'
import { createChatClientOptions } from '../src/types'
import type { ChatClientOptions, ChatClientPersistence } from '../src/types'

const connection = {
  async *connect() {},
}
const persistence = {} as ChatClientPersistence

describe('ChatClient persistence requires a threadId', () => {
  it('rejects persistence: true without a threadId', () => {
    const _typeCheck = () => {
      // @ts-expect-error threadId is required whenever persistence is on
      createChatClientOptions({ connection, persistence: true })
    }
    void _typeCheck
  })

  it('rejects a storage adapter without a threadId', () => {
    const _typeCheck = () => {
      // @ts-expect-error threadId is required whenever persistence is on
      createChatClientOptions({ connection, persistence })
    }
    void _typeCheck
  })

  it('accepts persistence when a threadId is supplied', () => {
    const _typeCheck = () => {
      createChatClientOptions({
        connection,
        persistence: true,
        threadId: 'support-42',
      })
      createChatClientOptions({
        connection,
        persistence,
        threadId: 'support-42',
      })
    }
    void _typeCheck
  })

  it('leaves threadId optional for ephemeral chats', () => {
    const _typeCheck = () => {
      createChatClientOptions({ connection })
      createChatClientOptions({ connection, persistence: false })
      createChatClientOptions({ connection, threadId: 'support-42' })
    }
    void _typeCheck
  })

  it('rejects `id` next to a required `threadId`', () => {
    const _typeCheck = () => {
      createChatClientOptions({
        connection,
        persistence: true,
        threadId: 'support-42',
        // @ts-expect-error id is not a ChatClient option
        id: 'legacy',
      })
    }
    void _typeCheck
  })

  it('does not list `id` on ChatClientOptions. `threadId` is present', () => {
    type Opts = ChatClientOptions<readonly []>
    // @ts-expect-error id is not a ChatClient option
    type _Id = Opts['id']
    type _ThreadId = Opts['threadId']
    const threadId: _ThreadId = 'support-42'
    void threadId
  })
})
