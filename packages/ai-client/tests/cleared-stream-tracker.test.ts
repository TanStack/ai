import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { ClearedStreamTracker } from '../src/cleared-stream-tracker'
import { createUIMessage } from './test-utils'
import type { StreamChunk } from '@tanstack/ai/client'

function runStarted(runId: string): StreamChunk {
  return { type: EventType.RUN_STARTED, threadId: 'thread-1', runId }
}

function runFinished(runId: string): StreamChunk {
  return { type: EventType.RUN_FINISHED, threadId: 'thread-1', runId }
}

function runError(message: string = 'boom'): StreamChunk {
  return { type: EventType.RUN_ERROR, message }
}

function textContent(messageId: string): StreamChunk {
  return { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: 'hi' }
}

function toolCallStart(
  toolCallId: string,
  parentMessageId?: string,
): StreamChunk {
  return {
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName: 'tool',
    toolName: 'tool',
    ...(parentMessageId ? { parentMessageId } : {}),
  }
}

describe('ClearedStreamTracker', () => {
  it('does not filter chunks before a clear', () => {
    const tracker = new ClearedStreamTracker()

    expect(tracker.shouldIgnoreChunk(runStarted('run-1'))).toBe(false)
    expect(tracker.shouldIgnoreChunk(textContent('message-1'))).toBe(false)
  })

  it('filters cleared message, run, runless, and tool-call chunks', () => {
    const tracker = new ClearedStreamTracker()
    tracker.snapshotClear({
      messages: [createUIMessage('parent-message')],
      activeRunIds: new Set(['run-1']),
      currentRunId: null,
    })

    expect(tracker.shouldIgnoreChunk(runStarted('run-1'))).toBe(true)
    expect(tracker.shouldIgnoreChunk(textContent('late-message'))).toBe(true)
    expect(
      tracker.shouldIgnoreChunk(toolCallStart('tool-1', 'parent-message')),
    ).toBe(true)
    expect(tracker.shouldIgnoreChunk(toolCallStart('tool-1'))).toBe(true)
    expect(tracker.shouldIgnoreChunk(textContent('parent-message'))).toBe(true)
  })

  it('forgets settled runs and advances across multiple cleared runs', () => {
    const tracker = new ClearedStreamTracker()
    tracker.snapshotClear({
      messages: [],
      activeRunIds: new Set(['run-1', 'run-2']),
      currentRunId: null,
    })
    tracker.shouldIgnoreChunk(runStarted('run-1'))
    tracker.shouldIgnoreChunk(runStarted('run-2'))

    tracker.onRunSettled('run-2')

    expect(tracker.shouldIgnoreChunk(runFinished('run-2'))).toBe(false)
    expect(tracker.shouldIgnoreChunk(textContent('late-run-1'))).toBe(true)
    expect(tracker.takeRunlessRunId()).toBe('run-1')
    expect(tracker.takeRunlessRunId()).toBeNull()
  })

  it('clears active runless tracking after a session error without reviving known ids', () => {
    const tracker = new ClearedStreamTracker()
    tracker.snapshotClear({
      messages: [createUIMessage('cleared-message')],
      activeRunIds: new Set(['run-1']),
      currentRunId: null,
    })
    tracker.shouldIgnoreChunk(runStarted('run-1'))
    expect(tracker.shouldIgnoreChunk(runError())).toBe(true)

    tracker.onSessionRunError()

    expect(tracker.shouldIgnoreChunk(textContent('fresh-message'))).toBe(false)
    expect(tracker.shouldIgnoreChunk(textContent('cleared-message'))).toBe(true)
  })

  it('resetActiveRuns keeps durable cleared ids while removing runless attribution', () => {
    const tracker = new ClearedStreamTracker()
    tracker.snapshotClear({
      messages: [createUIMessage('cleared-message')],
      activeRunIds: new Set(['run-1']),
      currentRunId: null,
    })
    tracker.shouldIgnoreChunk(runStarted('run-1'))

    tracker.resetActiveRuns()

    expect(tracker.shouldIgnoreChunk(textContent('fresh-message'))).toBe(false)
    expect(tracker.shouldIgnoreChunk(runStarted('run-1'))).toBe(true)
    expect(tracker.shouldIgnoreChunk(textContent('cleared-message'))).toBe(true)
  })
})
