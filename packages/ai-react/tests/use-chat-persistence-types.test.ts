/**
 * Type-level tests for the `persistence` / `threadId` pairing on useChat.
 * These assertions are pure types. They never invoke the hook at runtime.
 */

import { describe, it } from 'vitest'
import { useChat } from '../src/use-chat'
import type { ChatClientPersistence } from '@tanstack/ai-client'
import type { UseChatOptions } from '../src/types'

const connection = {} as never
const persistence = {} as ChatClientPersistence

describe('useChat persistence requires a threadId', () => {
  it('rejects persistence: true without a threadId', () => {
    const _typeCheck = () => {
      // @ts-expect-error threadId is required whenever persistence is on
      useChat({ connection, persistence: true })
    }
    void _typeCheck
  })

  it('rejects a storage adapter without a threadId', () => {
    const _typeCheck = () => {
      // @ts-expect-error threadId is required whenever persistence is on
      useChat({ connection, persistence })
    }
    void _typeCheck
  })

  it('accepts persistence when a threadId is supplied', () => {
    const _typeCheck = () => {
      useChat({ connection, persistence: true, threadId: 'support-42' })
      useChat({ connection, persistence, threadId: 'support-42' })
    }
    void _typeCheck
  })

  it('leaves threadId optional for ephemeral chats', () => {
    const _typeCheck = () => {
      useChat({ connection })
      useChat({ connection, persistence: false })
      useChat({ connection, threadId: 'support-42' })
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
