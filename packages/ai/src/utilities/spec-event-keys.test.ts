import { describe, expect, it } from 'vitest'
import { EventType } from '../types'
import { specKeysFor, isSpecTopLevelKey } from './spec-event-keys'

describe('specKeysFor', () => {
  it('allows metadata on every event and usage on RUN_FINISHED / RUN_ERROR', () => {
    expect(isSpecTopLevelKey(EventType.RUN_FINISHED, 'usage')).toBe(true)
    expect(isSpecTopLevelKey(EventType.RUN_ERROR, 'usage')).toBe(true)
    expect(isSpecTopLevelKey(EventType.RUN_STARTED, 'metadata')).toBe(true)
    expect(isSpecTopLevelKey(EventType.CUSTOM, 'name')).toBe(true)
  })

  it('rejects TanStack extras', () => {
    expect(isSpecTopLevelKey(EventType.RUN_FINISHED, 'finishReason')).toBe(
      false,
    )
    expect(isSpecTopLevelKey(EventType.RUN_FINISHED, 'model')).toBe(false)
    expect(isSpecTopLevelKey(EventType.TOOL_CALL_START, 'toolName')).toBe(true)
    expect(isSpecTopLevelKey(EventType.TOOL_CALL_START, 'index')).toBe(false)
    expect(isSpecTopLevelKey(EventType.TEXT_MESSAGE_CONTENT, 'content')).toBe(
      false,
    )
    expect(isSpecTopLevelKey(EventType.TOOL_CALL_ARGS, 'args')).toBe(false)
    expect(isSpecTopLevelKey(EventType.TOOL_CALL_END, 'input')).toBe(true)
    expect(isSpecTopLevelKey(EventType.TOOL_CALL_END, 'result')).toBe(false)
    expect(isSpecTopLevelKey(EventType.RUN_ERROR, 'error')).toBe(false)
    expect(
      isSpecTopLevelKey(EventType.RUN_ERROR, 'tanstack:interruptErrors'),
    ).toBe(false)
    expect(isSpecTopLevelKey(EventType.STATE_SNAPSHOT, 'state')).toBe(false)
    expect(isSpecTopLevelKey(EventType.CUSTOM, 'threadId')).toBe(false)
    expect(specKeysFor(EventType.RUN_ERROR).has('threadId')).toBe(false)
  })
})
