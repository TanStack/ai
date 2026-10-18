import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { wireFrame } from '../src/wire'
import type { StreamChunk } from '@tanstack/ai'
import type { SessionEvent } from '../src/types'

const entryOf = (event: Record<string, unknown>): SessionEvent => ({
  cursor: '7',
  threadId: 't1',
  operationId: 'op-1',
  event: event as unknown as StreamChunk,
})

describe('wireFrame', () => {
  it('sends the event as an AG-UI wire chunk, and keeps subagentRunId', () => {
    const entry = entryOf({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'm1',
      delta: 'hi',
      timestamp: 1,
      // Not AG-UI keys of this event: the wire moves them to the metadata.
      threadId: 'thread-1',
      runId: 'run-1',
      subagentRunId: 'child-1',
    })
    expect(JSON.parse(wireFrame(entry))).toEqual({
      type: 'harness.event',
      cursor: '7',
      threadId: 't1',
      operationId: 'op-1',
      event: {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'm1',
        delta: 'hi',
        timestamp: 1,
        subagentRunId: 'child-1',
        metadata: { tanstack: { threadId: 'thread-1', runId: 'run-1' } },
      },
    })
  })

  it('keeps parentRunId on RUN_STARTED, where AG-UI has it', () => {
    const entry = entryOf({
      type: EventType.RUN_STARTED,
      threadId: 'thread-1',
      runId: 'run-2',
      parentRunId: 'run-1',
      timestamp: 1,
    })
    expect(JSON.parse(wireFrame(entry)).event).toEqual({
      type: EventType.RUN_STARTED,
      threadId: 'thread-1',
      runId: 'run-2',
      parentRunId: 'run-1',
      timestamp: 1,
    })
  })

  it('encodes one entry object once', () => {
    const entry = entryOf({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'm1',
      delta: 'first',
      timestamp: 1,
    })
    const first = wireFrame(entry)
    // A second call reads the cache: a change to the object does not show.
    ;(entry.event as unknown as { delta: string }).delta = 'changed'
    expect(wireFrame(entry)).toBe(first)
    // Another object with the same content is encoded again.
    expect(wireFrame({ ...entry })).toContain('changed')
  })
})
