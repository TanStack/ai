import { describe, expect, it } from 'vitest'
import { StreamProcessor } from '../src/activities/chat/stream/processor'
import { EventType } from '../src/types'

describe('REASONING_MESSAGE_START metadata', () => {
  it('does not create an assistant message when the start event has no metadata', () => {
    const processor = new StreamProcessor()
    processor.processChunk({
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'reasoning-1',
      role: 'reasoning',
      timestamp: 1,
    })
    expect(processor.getMessages()).toEqual([])
  })

  it('keeps custom metadata from the start event on the assistant UIMessage', () => {
    const processor = new StreamProcessor()
    processor.processChunk({
      type: EventType.RUN_STARTED,
      runId: 'run-1',
      threadId: 'thread-1',
      timestamp: 1,
    })
    processor.processChunk({
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'reasoning-1',
      role: 'reasoning',
      timestamp: 2,
      metadata: { source: 'reasoning', traceId: 'trace-1' },
    })
    processor.processChunk({
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'reasoning-1',
      delta: 'Let me think',
      timestamp: 3,
    })

    const message = processor.getMessages()[0]
    const thinking = message?.parts.find((part) => part.type === 'thinking')
    expect(thinking && 'content' in thinking ? thinking.content : '').toBe(
      'Let me think',
    )
    expect(message?.metadata).toEqual({
      source: 'reasoning',
      traceId: 'trace-1',
    })
  })

  it('keeps start metadata on the second open run', () => {
    const processor = new StreamProcessor()
    processor.processChunk({
      type: EventType.RUN_STARTED,
      runId: 'run-A',
      threadId: 'thread-1',
      timestamp: 1,
    })
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'message-A',
      role: 'assistant',
      timestamp: 2,
    })
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'message-A',
      delta: 'A output',
      timestamp: 3,
    })
    processor.processChunk({
      type: EventType.RUN_STARTED,
      runId: 'run-B',
      threadId: 'thread-1',
      timestamp: 4,
    })
    processor.processChunk({
      type: EventType.REASONING_MESSAGE_START,
      messageId: 'reasoning-B',
      role: 'reasoning',
      timestamp: 5,
      metadata: {
        source: 'reasoning',
        traceId: 'trace-b',
        tanstack: { runId: 'run-B' },
      },
    })
    processor.processChunk({
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'reasoning-B',
      delta: 'B reasoning',
      timestamp: 6,
    })

    const messages = processor.getMessages()
    expect(messages[0]?.id).toBe('message-A')
    expect(messages[0]?.metadata).toBeUndefined()
    expect(messages[1]?.metadata).toEqual({
      source: 'reasoning',
      traceId: 'trace-b',
      tanstack: { runId: 'run-B' },
    })
  })
})
