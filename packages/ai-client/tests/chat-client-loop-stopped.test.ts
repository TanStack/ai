import { describe, expect, it } from 'vitest'
import { EventType, type StreamChunk } from '@tanstack/ai/client'
import { ChatClient } from '../src/chat-client'
import type { SubscribeConnectionAdapter } from '../src/connection-adapters'

function finished(loopStopped: boolean): StreamChunk {
  return {
    type: EventType.RUN_FINISHED,
    runId: 'run-1',
    threadId: 'thread-1',
    timestamp: 1,
    metadata: {
      tanstack: {
        finishReason: 'tool_calls',
        ...(loopStopped ? { loopStopped: true as const } : {}),
      },
    },
  }
}

function subscribeConnection(chunk: StreamChunk): SubscribeConnectionAdapter {
  return {
    async *subscribe() {
      yield {
        type: EventType.RUN_STARTED,
        runId: 'run-1',
        threadId: 'thread-1',
        timestamp: 0,
      }
      yield chunk
    },
    send: async () => {},
  }
}

describe('loopStopped on a subscribe connection', () => {
  it('resolves sendMessage when the loop stops on tool_calls', async () => {
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: subscribeConnection(finished(true)),
    })

    await client.sendMessage('hi')

    expect(client.getIsLoading()).toBe(false)
    expect(client.getSnapshot().status).toBe('ready')
  })
})
