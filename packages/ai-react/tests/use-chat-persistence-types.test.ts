/**
 * Type-level tests for the `persistence` / `threadId` pairing on useChat.
 * These assertions are pure types. They never invoke the hook at runtime.
 */

import { describe, it } from 'vitest'
import type { ChatClientPersistence } from '@tanstack/ai-client'
import type { UseChatOptions } from '../src/types'

const connection = {} as never
const persistence = {} as ChatClientPersistence

function typeCheck(_options: UseChatOptions) {}

describe('useChat persistence requires a threadId', () => {
  it('rejects persistence: true without a threadId', () => {
    const _typeCheck = () => {
      // @ts-expect-error threadId is required whenever persistence is on
      typeCheck({ connection, persistence: true })
    }
    void _typeCheck
  })

  it('rejects a storage adapter without a threadId', () => {
    const _typeCheck = () => {
      // @ts-expect-error threadId is required whenever persistence is on
      typeCheck({ connection, persistence })
    }
    void _typeCheck
  })

  it('accepts persistence when a threadId is supplied', () => {
    const _typeCheck = () => {
      typeCheck({ connection, persistence: true, threadId: 'support-42' })
      typeCheck({ connection, persistence, threadId: 'support-42' })
    }
    void _typeCheck
  })

  it('leaves threadId optional for ephemeral chats', () => {
    const _typeCheck = () => {
      typeCheck({ connection })
      typeCheck({ connection, persistence: false })
      typeCheck({ connection, threadId: 'support-42' })
    }
    void _typeCheck
  })

  it('does not list `id` on UseChatOptions. `threadId` is present', () => {
    type Opts = UseChatOptions<readonly []>
    // @ts-expect-error id is not a useChat option
    type _Id = Opts['id']
    type _ThreadId = Opts['threadId']
    const threadId: _ThreadId = 'support-42'
    void threadId
  })
})

describe('useChat history paging types', () => {
  it('accepts history.pageSize with persistence: true and a threadId', () => {
    const _typeCheck = () => {
      typeCheck({
        connection,
        persistence: true,
        threadId: 'support-42',
        history: { pageSize: 50 },
      })
    }
    void _typeCheck
  })

  it('rejects history on a storage adapter', () => {
    const _typeCheck = () => {
      // @ts-expect-error history is only valid with persistence: true
      typeCheck({
        connection,
        persistence,
        threadId: 'support-42',
        history: { pageSize: 50 },
      })
    }
    void _typeCheck
  })
})
