import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { ChatClient } from '../src/chat-client'
import { createUIMessage } from './test-utils'
import type { ResumableConnectConnectionAdapter } from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai/client'
import type {
  ChatClientPersistence,
  ChatPersistedState,
  UIMessage,
} from '../src/types'

function memoryPersistence(initial: ChatPersistedState): ChatClientPersistence {
  let value: ChatPersistedState | undefined = initial
  return {
    getItem: () => value,
    setItem: (_id, state) => {
      value = state
    },
    removeItem: () => {
      value = undefined
    },
  }
}

describe('joinRun subagent replay', () => {
  it('rebuilds one subagent card from the stream instead of keeping the partial text', async () => {
    const partial: UIMessage = {
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        {
          type: 'subagent',
          subagent: {
            id: 'child-1',
            name: 'researcher',
            status: 'running',
            messages: [
              {
                id: 'note-1',
                role: 'assistant',
                parts: [{ type: 'text', content: 'Hel' }],
              },
            ],
          },
        },
      ],
    }
    const replay: Array<StreamChunk> = [
      {
        type: EventType.RUN_STARTED,
        runId: 'r1',
        threadId: 't1',
        timestamp: 1,
      },
      {
        type: EventType.SUBAGENT_STARTED,
        subagentRunId: 'child-1',
        name: 'researcher',
        timestamp: 2,
      },
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'note-1',
        role: 'assistant',
        timestamp: 3,
        subagentRunId: 'child-1',
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'note-1',
        delta: 'Hello notes',
        timestamp: 4,
        subagentRunId: 'child-1',
      },
      {
        type: EventType.SUBAGENT_FINISHED,
        subagentRunId: 'child-1',
        timestamp: 5,
      },
      {
        type: EventType.RUN_FINISHED,
        runId: 'r1',
        threadId: 't1',
        timestamp: 6,
      },
    ]
    const joinRun = vi.fn(async function* () {
      for (const chunk of replay) yield chunk
    })
    const connection: ResumableConnectConnectionAdapter = {
      async *connect() {
        yield {
          type: EventType.RUN_FINISHED,
          runId: 'unused',
          threadId: 't1',
          timestamp: 9,
        }
      },
      joinRun,
    }
    const client = new ChatClient({
      threadId: 't1',
      connection,
      persistence: memoryPersistence({
        messages: [
          createUIMessage('user-1', 'research squids', 'user'),
          partial,
        ],
        resume: { resumeState: { threadId: 't1', runId: 'r1' } },
      }),
    })
    client.attach()

    await vi.waitFor(() => {
      const assistant = client
        .getMessages()
        .find((message) => message.role === 'assistant')
      const cards = assistant?.parts.filter((part) => part.type === 'subagent')
      expect(cards).toHaveLength(1)
      const card = cards?.[0]
      if (card?.type !== 'subagent') throw new Error('missing card')
      expect(card.subagent.status).toBe('finished')
      expect(card.subagent.messages[0]?.parts[0]).toMatchObject({
        type: 'text',
        content: 'Hello notes',
      })
    })
  })
})
