import { describe, expect, it } from 'vitest'
import {
  applyMemoryEvent,
  applyMemorySnapshot,
  clearMemoryRegistry,
  createMemoryRegistryState,
  memoryScopeKey,
} from '../src/store/memory-registry'
import type { MemorySnapshotEvent } from '@tanstack/ai-event-client'

const SCOPE = { sessionId: 'session-1' }

describe('memory registry', () => {
  it('accumulates the operation timeline per scope', () => {
    const state = createMemoryRegistryState()

    applyMemoryEvent(state, {
      type: 'retrieve:started',
      scope: SCOPE,
      adapter: 'in-memory',
      query: 'What is my name?',
      timestamp: 10,
    })
    applyMemoryEvent(state, {
      type: 'retrieve:completed',
      scope: SCOPE,
      adapter: 'in-memory',
      fragmentCount: 2,
      hasTools: false,
      systemPromptChars: 128,
      durationMs: 5,
      timestamp: 12,
    })
    applyMemoryEvent(state, {
      type: 'persist:completed',
      scope: SCOPE,
      adapter: 'in-memory',
      receiptCount: 2,
      okCount: 2,
      durationMs: 3,
      timestamp: 20,
    })

    const entry = state.scopes[memoryScopeKey(SCOPE)]
    expect(entry).toBeDefined()
    expect(entry!.adapter).toBe('in-memory')
    expect(entry!.lastActivity).toBe(20)
    expect(entry!.events).toHaveLength(3)
    expect(entry!.events[0]).toMatchObject({
      type: 'retrieve:started',
      query: 'What is my name?',
    })
    expect(entry!.events[1]).toMatchObject({
      type: 'retrieve:completed',
      fragmentCount: 2,
      systemPromptChars: 128,
    })
    expect(entry!.events[2]).toMatchObject({
      type: 'persist:completed',
      okCount: 2,
      receiptCount: 2,
    })
  })

  it('records error events with phase and message', () => {
    const state = createMemoryRegistryState()
    applyMemoryEvent(state, {
      type: 'error',
      scope: SCOPE,
      adapter: 'in-memory',
      phase: 'recall',
      error: { name: 'Error', message: 'boom' },
      timestamp: 1,
    })
    const entry = state.scopes[memoryScopeKey(SCOPE)]
    expect(entry!.events[0]).toMatchObject({
      type: 'error',
      phase: 'recall',
      error: { message: 'boom' },
    })
  })

  it('replaces the snapshot on memory:snapshot', () => {
    const state = createMemoryRegistryState()
    const snapshot: MemorySnapshotEvent = {
      scope: SCOPE,
      adapter: 'in-memory',
      takenAt: '2026-07-22T00:00:00.000Z',
      data: {
        records: [
          { id: 'r1', text: 'My name is Jack', kind: 'message', role: 'user' },
        ],
      },
      facts: [{ id: 'r1', text: 'My name is Jack', source: 'user' }],
      timestamp: 30,
    }
    applyMemorySnapshot(state, snapshot)

    const entry = state.scopes[memoryScopeKey(SCOPE)]
    expect(entry!.snapshot?.takenAt).toBe('2026-07-22T00:00:00.000Z')
    expect(entry!.snapshot?.facts).toHaveLength(1)

    // A newer snapshot fully replaces the prior one.
    applyMemorySnapshot(state, { ...snapshot, facts: [], timestamp: 40 })
    expect(state.scopes[memoryScopeKey(SCOPE)]!.snapshot?.facts).toEqual([])
    expect(state.scopes[memoryScopeKey(SCOPE)]!.lastActivity).toBe(40)
  })

  it('isolates scopes and buckets missing sessionId to (unknown)', () => {
    const state = createMemoryRegistryState()
    applyMemoryEvent(state, {
      type: 'persist:started',
      scope: { sessionId: 'a' },
      adapter: 'in-memory',
      timestamp: 1,
    })
    applyMemoryEvent(state, {
      type: 'error',
      scope: { sessionId: '' },
      adapter: 'in-memory',
      phase: 'save',
      error: { name: 'Error', message: 'x' },
      timestamp: 2,
    })
    expect(Object.keys(state.scopes).sort()).toEqual(['(unknown)', 'a'])
  })

  it('clears the registry', () => {
    const state = createMemoryRegistryState()
    applyMemoryEvent(state, {
      type: 'persist:started',
      scope: SCOPE,
      adapter: 'in-memory',
      timestamp: 1,
    })
    clearMemoryRegistry(state)
    expect(state.scopes).toEqual({})
  })
})
