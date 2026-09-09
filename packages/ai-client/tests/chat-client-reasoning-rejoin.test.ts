import { expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { ChatClient } from '../src/chat-client'
import type { ResumableConnectConnectionAdapter } from '../src/connection-adapters'
import type { StreamChunk, UIMessage } from '@tanstack/ai/client'

it('keeps reasoning and tool activity when replay starts before the first text', async () => {
  const replay: Array<StreamChunk> = [
    { type: EventType.RUN_STARTED, runId: 'r1', threadId: 't1', timestamp: 1 },
    {
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'thinking',
      delta: 'Inspect the files.',
      timestamp: 2,
    },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'read',
      toolCallName: 'Read',
      timestamp: 3,
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'read',
      delta: '{}',
      timestamp: 4,
    },
    { type: EventType.TOOL_CALL_END, toolCallId: 'read', timestamp: 5 },
    {
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: 'read',
      messageId: 'result',
      content: 'file contents',
      timestamp: 6,
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'reply',
      role: 'assistant',
      timestamp: 7,
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'reply',
      delta: 'Built the app.',
      timestamp: 8,
    },
    { type: EventType.TEXT_MESSAGE_END, messageId: 'reply', timestamp: 9 },
    {
      type: EventType.RUN_FINISHED,
      runId: 'r1',
      threadId: 't1',
      timestamp: 10,
    },
  ]
  let sent: Array<UIMessage> = []
  const connection: ResumableConnectConnectionAdapter = {
    async hydrate() {
      return {
        messages: [
          {
            id: 'u1',
            role: 'user',
            parts: [{ type: 'text', content: 'Build an app.' }],
          },
          {
            id: 'partial',
            role: 'assistant',
            parts: [{ type: 'thinking', content: 'Inspect' }],
          },
        ],
        activeRun: { runId: 'r1' },
        interrupts: null,
      }
    },
    async *joinRun() {
      yield* replay
    },
    async *connect(messages) {
      sent = messages as Array<UIMessage>
    },
  }
  const client = new ChatClient({
    connection,
    threadId: 't1',
    persistence: true,
  })
  try {
    client.attach()
    await vi.waitFor(() => {
      expect(
        client.getMessages().flatMap((message) => message.parts),
      ).toContainEqual(
        expect.objectContaining({ type: 'text', content: 'Built the app.' }),
      )
    })
    await client.sendMessage('Change the title.')
    const parts = sent.flatMap((message) => message.parts)
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'thinking',
        content: 'Inspect the files.',
      }),
    )
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-call',
        id: 'read',
        output: 'file contents',
      }),
    )
    expect(parts).toContainEqual(
      expect.objectContaining({ type: 'text', content: 'Built the app.' }),
    )
    expect(sent.some((message) => message.id === 'partial')).toBe(false)
  } finally {
    client.dispose()
  }
})
