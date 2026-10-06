import { describe, expect, it } from 'vitest'
import { ClearedStreamTracker } from '../src/cleared-stream-tracker'
import type { StreamChunk } from '@tanstack/ai/client'

describe('ClearedStreamTracker', () => {
  it.each([
    { type: 'TEXT_MESSAGE_START', messageId: 'late-msg', role: 'assistant' },
    { type: 'TEXT_MESSAGE_CHUNK', messageId: 'late-msg', delta: 'hi' },
    { type: 'TOOL_CALL_CHUNK', toolCallId: 'tc-late', toolCallName: 'x' },
  ])('ignores a runless $type from a run cleared mid-stream', (fields) => {
    const tracker = new ClearedStreamTracker()
    tracker.onRunStarted('run-1')
    tracker.snapshotClear({
      messages: [],
      activeRunIds: new Set(['run-1']),
      currentRunId: 'run-1',
    })

    expect(
      tracker.shouldIgnoreChunk({
        ...fields,
        timestamp: Date.now(),
      } as StreamChunk),
    ).toBe(true)
  })
})
