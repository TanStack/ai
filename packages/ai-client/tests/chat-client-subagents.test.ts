import { describe, expect, it } from 'vitest'
import { ChatClient } from '../src/chat-client'
import { createMockConnectionAdapter } from './test-utils'
import type { StreamChunk } from '@tanstack/ai/client'

describe('ChatClient subagents', () => {
  it('keeps useChat.subagents and part.subagent as the same object with stop', async () => {
    const chunks: Array<StreamChunk> = [
      {
        type: 'RUN_STARTED',
        runId: 'run-1',
        threadId: 'thread-1',
        timestamp: Date.now(),
      },
      {
        type: 'SUBAGENT_STARTED',
        subagentRunId: 'sub-1',
        name: 'researcher',
        timestamp: Date.now(),
      },
      {
        type: 'TEXT_MESSAGE_START',
        messageId: 'child-msg',
        role: 'assistant',
        timestamp: Date.now(),
        subagentRunId: 'sub-1',
      },
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'child-msg',
        delta: 'Hello',
        timestamp: Date.now(),
        subagentRunId: 'sub-1',
      },
      {
        type: 'SUBAGENT_FINISHED',
        subagentRunId: 'sub-1',
        timestamp: Date.now(),
      },
      {
        type: 'RUN_FINISHED',
        runId: 'run-1',
        threadId: 'thread-1',
        timestamp: Date.now(),
      },
    ]

    const client = new ChatClient({
      connection: createMockConnectionAdapter({ chunks }),
    })
    await client.sendMessage('hi')

    const assistant = client
      .getMessages()
      .find((message) => message.role === 'assistant')
    const part = assistant?.parts.find((entry) => entry.type === 'subagent')
    const subagents = client.getSubagents()

    expect(part?.type).toBe('subagent')
    if (part?.type !== 'subagent') throw new Error('expected subagent part')
    expect(subagents).toHaveLength(1)
    expect(subagents[0]).toBe(part.subagent)
    expect(typeof part.subagent.stop).toBe('function')
    expect(typeof subagents[0]?.stop).toBe('function')
    expect(part.subagent.stop).toBe(subagents[0]?.stop)
  })
})
