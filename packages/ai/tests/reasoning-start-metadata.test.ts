import { describe, expect, it } from 'vitest'
import { StreamProcessor } from '../src/activities/chat/stream/processor'
import { EventType } from '../src/types'

describe('REASONING_MESSAGE_START metadata', () => {
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
})
