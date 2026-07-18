import { describe, expect, it } from 'vitest'
import { CUSTOM_EVENT, isCustomEvent } from '../src/custom-events'
import { EventType } from '../src/types'
import type { StreamChunk } from '../src/types'

describe('CUSTOM_EVENT catalog', () => {
  it('exposes the well-known agent-activity event names', () => {
    expect(CUSTOM_EVENT.FILE_CHANGED).toBe('file.changed')
    expect(CUSTOM_EVENT.PROCESS_STDOUT).toBe('process.stdout')
    expect(CUSTOM_EVENT.PROCESS_STDERR).toBe('process.stderr')
    expect(CUSTOM_EVENT.PORT_OPENED).toBe('port.opened')
    expect(CUSTOM_EVENT.APPROVAL_REQUESTED).toBe('approval-requested')
    expect(CUSTOM_EVENT.APPROVAL_RESOLVED).toBe('approval-resolved')
    expect(CUSTOM_EVENT.ARTIFACT_CREATED).toBe('artifact.created')
    expect(CUSTOM_EVENT.SANDBOX_CREATED).toBe('sandbox.created')
    expect(CUSTOM_EVENT.SANDBOX_RESUMED).toBe('sandbox.resumed')
  })

  it('pins APPROVAL_REQUESTED to the wire name the chat stream processor consumes', () => {
    // The processor's legacy/replay branch matches this exact string
    // (activities/chat/stream/processor.ts). If the catalog drifts from the
    // wire name, `isCustomEvent(chunk, CUSTOM_EVENT.APPROVAL_REQUESTED)` and
    // replay of persisted approval logs both silently stop matching.
    expect(CUSTOM_EVENT.APPROVAL_REQUESTED).toBe('approval-requested')

    // A CUSTOM chunk carrying the wire name is recognized via the catalog
    // constant — the emitter/consumer agreement the catalog exists to enforce.
    const emitted: StreamChunk = {
      type: EventType.CUSTOM,
      name: 'approval-requested',
      value: { approvalId: 'a1', title: 'Run build' },
      timestamp: 1,
    }
    expect(isCustomEvent(emitted, CUSTOM_EVENT.APPROVAL_REQUESTED)).toBe(true)
  })
})

describe('isCustomEvent', () => {
  const fileChanged: StreamChunk = {
    type: EventType.CUSTOM,
    name: CUSTOM_EVENT.FILE_CHANGED,
    value: { type: 'change', path: '/workspace/a.ts', timestamp: 1 },
    timestamp: 1,
  }

  it('returns true for a matching CUSTOM event name', () => {
    expect(isCustomEvent(fileChanged, CUSTOM_EVENT.FILE_CHANGED)).toBe(true)
  })

  it('returns false for a CUSTOM event with a different name', () => {
    expect(isCustomEvent(fileChanged, CUSTOM_EVENT.PORT_OPENED)).toBe(false)
  })

  it('returns false for a non-CUSTOM chunk', () => {
    const runStarted: StreamChunk = {
      type: EventType.RUN_STARTED,
      runId: 'r',
      threadId: 't',
      timestamp: 1,
    }
    expect(isCustomEvent(runStarted, CUSTOM_EVENT.FILE_CHANGED)).toBe(false)
  })

  it('narrows the payload type when matched', () => {
    if (isCustomEvent(fileChanged, CUSTOM_EVENT.FILE_CHANGED)) {
      // Type-level: value is FileChangedPayload — `.path` is a string.
      expect(fileChanged.value.path).toBe('/workspace/a.ts')
    }
  })
})
