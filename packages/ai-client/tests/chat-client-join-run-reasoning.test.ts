import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { ChatClient } from '../src/chat-client'
import { createUIMessage } from './test-utils'
import type { ResumableConnectConnectionAdapter } from '../src/connection-adapters'
import type { StreamChunk, UIMessage } from '@tanstack/ai/client'

/**
 * A reasoning model writes its thinking step to the delivery log before any
 * text: `REASONING_*` and `STEP_FINISHED` chunks, then `TEXT_MESSAGE_START`.
 * On a rejoin the reasoning chunks already create the assistant message, so
 * the rebuild drop has to run on them, not on the later text chunk.
 */
const reasonedReply: Array<StreamChunk> = [
  { type: EventType.RUN_STARTED, runId: 'r1', threadId: 't1', timestamp: 1 },
  {
    type: EventType.REASONING_MESSAGE_START,
    messageId: 'reasoning-1',
    role: 'reasoning',
    timestamp: 2,
  },
  { type: EventType.STEP_STARTED, stepName: 'step-1', timestamp: 3 },
  {
    type: EventType.REASONING_MESSAGE_END,
    messageId: 'reasoning-1',
    timestamp: 4,
  },
  {
    type: EventType.REASONING_ENCRYPTED_VALUE,
    subtype: 'message',
    entityId: 'step-1',
    encryptedValue: 'opaque',
    timestamp: 5,
  },
  {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'assistant-1',
    role: 'assistant',
    timestamp: 6,
  },
  {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'assistant-1',
    delta: 'Hello!',
    timestamp: 7,
  },
  { type: EventType.TEXT_MESSAGE_END, messageId: 'assistant-1', timestamp: 8 },
  { type: EventType.RUN_FINISHED, runId: 'r1', threadId: 't1', timestamp: 9 },
]

function assistantText(messages: Array<UIMessage>): string {
  return messages
    .filter((message) => message.role === 'assistant')
    .flatMap((message) => message.parts)
    .map((part) => (part.type === 'text' ? part.content : ''))
    .join('')
}

describe('joinRun replay of a run that reasons before it answers', () => {
  it('keeps the assistant message the reasoning chunks created', async () => {
    const connection: ResumableConnectConnectionAdapter = {
      connect: async function* () {},
      joinRun: async function* () {
        yield* reasonedReply
      },
      hydrate: () =>
        Promise.resolve({
          messages: [],
          activeRun: { runId: 'r1' },
          interrupts: null,
        }),
    }

    let messages: Array<UIMessage> = []
    const client = new ChatClient({
      threadId: 't1',
      connection,
      persistence: true,
      initialMessages: [createUIMessage('user-1', 'hi')],
      onMessagesChange: (next) => {
        messages = next
      },
    })
    client.attach()

    await vi.waitFor(() => {
      expect(assistantText(messages)).toBe('Hello!')
    })
    expect(messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ])

    client.dispose()
  })
})
