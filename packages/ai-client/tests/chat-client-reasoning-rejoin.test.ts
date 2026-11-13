import { expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { ChatClient } from '../src/chat-client'
import type { ResumableConnectConnectionAdapter } from '../src/connection-adapters'
import type { StreamChunk, UIMessage } from '@tanstack/ai/client'

// chat() stamps this on every adapter chunk. On REASONING_MESSAGE_START it
// makes the processor create the assistant message before any rebuild trigger.
const callMetadata = {
  tanstack: {
    source: { provider: 'openai', api: 'responses', model: 'example-model' },
  },
}

const reasonings: Array<{
  name: string
  chunks: Array<StreamChunk>
  thinking: { content: string; signature?: string }
}> = [
  {
    name: 'readable reasoning',
    chunks: [
      { type: EventType.REASONING_START, messageId: 'thinking', timestamp: 2 },
      {
        type: EventType.REASONING_MESSAGE_START,
        messageId: 'thinking',
        role: 'reasoning',
        timestamp: 2,
      },
      {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: 'thinking',
        delta: 'Inspect the files.',
        timestamp: 2,
      },
      {
        type: EventType.REASONING_MESSAGE_END,
        messageId: 'thinking',
        timestamp: 2,
      },
      { type: EventType.REASONING_END, messageId: 'thinking', timestamp: 2 },
    ],
    thinking: { content: 'Inspect the files.' },
  },
  {
    name: 'encrypted-only reasoning',
    chunks: [
      { type: EventType.REASONING_START, messageId: 'thinking', timestamp: 2 },
      {
        type: EventType.REASONING_MESSAGE_START,
        messageId: 'thinking',
        role: 'reasoning',
        timestamp: 2,
      },
      {
        type: EventType.REASONING_MESSAGE_END,
        messageId: 'thinking',
        timestamp: 2,
      },
      { type: EventType.REASONING_END, messageId: 'thinking', timestamp: 2 },
      {
        type: EventType.REASONING_ENCRYPTED_VALUE,
        subtype: 'message',
        entityId: 'thinking',
        encryptedValue: 'signature',
        timestamp: 2,
      },
    ],
    thinking: { content: '', signature: 'signature' },
  },
]

const hydratedTails: Array<{ name: string; tail: Array<UIMessage> }> = [
  { name: 'a user turn', tail: [] },
  {
    name: 'an in-flight assistant',
    tail: [
      {
        id: 'partial',
        role: 'assistant',
        parts: [{ type: 'thinking', content: 'Inspect' }],
      },
    ],
  },
]

const cases = reasonings.flatMap((reasoning) =>
  hydratedTails.map((hydrated) => ({ reasoning, hydrated })),
)

it.each(cases)(
  'keeps the thread when replay starts with $reasoning.name and hydrate ends with $hydrated.name',
  async ({ reasoning, hydrated }) => {
    const replay: Array<StreamChunk> = [
      {
        type: EventType.RUN_STARTED,
        runId: 'r1',
        threadId: 't1',
        timestamp: 1,
      },
      ...reasoning.chunks,
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
    // chat() runs the tool itself, so the tool result is not an adapter chunk.
    const stamped = replay.map((chunk) =>
      chunk.type === EventType.TOOL_CALL_RESULT
        ? chunk
        : { ...chunk, metadata: callMetadata },
    )
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
            ...hydrated.tail,
          ],
          activeRun: { runId: 'r1' },
          interrupts: null,
        }
      },
      async *joinRun() {
        yield* stamped
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
        expect(client.getMessages()).not.toHaveLength(0)
        expect(client.getIsLoading()).toBe(false)
      })
      await client.sendMessage('Change the title.')
      const assistants = sent.filter((message) => message.role === 'assistant')
      expect(assistants).toHaveLength(1)
      expect(assistants[0]!.id).not.toBe('partial')
      expect(assistants[0]!.parts).toContainEqual(
        expect.objectContaining({ type: 'thinking', ...reasoning.thinking }),
      )
      expect(assistants[0]!.parts).toContainEqual(
        expect.objectContaining({
          type: 'tool-call',
          id: 'read',
          output: 'file contents',
        }),
      )
      expect(assistants[0]!.parts).toContainEqual(
        expect.objectContaining({ type: 'text', content: 'Built the app.' }),
      )
    } finally {
      client.dispose()
    }
  },
)
