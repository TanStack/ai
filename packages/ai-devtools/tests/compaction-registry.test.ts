import { describe, expect, it } from 'vitest'
import {
  applyCompactionEvent,
  clearCompactionRegistry,
  compactionEventsForHook,
  createCompactionRegistryState,
} from '../src/store/compaction-registry'
import type { CompactionLifecycleInput } from '../src/store/compaction-registry'

function input(
  overrides: Partial<CompactionLifecycleInput> & { timestamp?: number },
): CompactionLifecycleInput {
  return {
    timestamp: 1,
    messagesBefore: 8,
    messagesAfter: 3,
    reusedCheckpoint: false,
    ...overrides,
  }
}

describe('compaction registry', () => {
  it('accumulates started, state, and ended events', () => {
    const state = createCompactionRegistryState()
    applyCompactionEvent(
      state,
      'started',
      input({
        before: 400,
        messagesBefore: 8,
        timestamp: 10,
        hookId: 'hook-1',
      }),
    )
    applyCompactionEvent(
      state,
      'state',
      input({
        before: 400,
        after: 180,
        hookId: 'hook-1',
        timestamp: 11,
        strategyKey: 'evict-oldest:half:maxTokens=400',
        maxTokens: 400,
        dropped: [{ role: 'user', tokens: 40, text: 'old' }],
        result: [{ role: 'user', tokens: 10, text: 'omitted' }],
      }),
    )
    applyCompactionEvent(
      state,
      'ended',
      input({
        after: 180,
        messagesAfter: 3,
        durationMs: 12,
        hookId: 'hook-1',
        timestamp: 12,
      }),
    )
    expect(state.events.map((event) => event.kind)).toEqual([
      'started',
      'state',
      'ended',
    ])
    expect(state.events[1]).toMatchObject({
      kind: 'state',
      before: 400,
      after: 180,
      strategyKey: 'evict-oldest:half:maxTokens=400',
    })
    expect(state.events[1]?.dropped?.[0]?.text).toBe('old')
    expect(state.events[2]?.durationMs).toBe(12)
  })

  it('filters events for a hook and falls back to all', () => {
    const state = createCompactionRegistryState()
    applyCompactionEvent(
      state,
      'state',
      input({ before: 1, after: 1, hookId: 'a', timestamp: 1 }),
    )
    applyCompactionEvent(
      state,
      'state',
      input({ before: 2, after: 1, hookId: 'b', timestamp: 2 }),
    )
    expect(
      compactionEventsForHook(state, { id: 'b' }).map((event) => event.hookId),
    ).toEqual(['b'])
    expect(
      compactionEventsForHook(state, { id: 'missing' }).map(
        (event) => event.hookId,
      ),
    ).toEqual(['a', 'b'])
  })

  it('clears the registry', () => {
    const state = createCompactionRegistryState()
    applyCompactionEvent(state, 'started', input({ before: 1 }))
    clearCompactionRegistry(state)
    expect(state.events).toEqual([])
  })
})
