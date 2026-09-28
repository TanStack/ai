import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { toSessionUpdate } from '../src/agent'
import type { StreamChunk } from '@tanstack/ai'

const child = (event: Record<string, unknown>): StreamChunk =>
  ({ subagentRunId: 'child-1', timestamp: 1, ...event }) as StreamChunk

describe('toSessionUpdate for child agents', () => {
  it('shows child tool calls like the lead tool calls', () => {
    expect(
      toSessionUpdate(
        child({
          type: EventType.TOOL_CALL_START,
          toolCallId: 'edit-1',
          toolCallName: 'Edit',
        }),
      ),
    ).toEqual({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'edit-1',
      name: 'Edit',
      title: 'Edit',
      status: 'in_progress',
    })
    expect(
      toSessionUpdate(
        child({
          type: EventType.TOOL_CALL_RESULT,
          messageId: 'm',
          toolCallId: 'edit-1',
          content: 'ok',
        }),
      ),
    ).toEqual({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'edit-1',
      status: 'completed',
    })
  })

  it('keeps child text and thoughts out of the main message', () => {
    expect(
      toSessionUpdate(
        child({
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'm',
          delta: 'hi',
        }),
      ),
    ).toBeUndefined()
    expect(
      toSessionUpdate(
        child({
          type: EventType.REASONING_MESSAGE_CONTENT,
          messageId: 'r',
          delta: 'hmm',
        }),
      ),
    ).toBeUndefined()
  })
})
