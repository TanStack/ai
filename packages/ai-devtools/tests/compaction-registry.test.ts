import { describe, expect, it } from 'vitest'
import {
  applyCompactionEvent,
  clearCompactionRegistry,
  compactionEventsForHook,
  createCompactionRegistryState,
} from '../src/store/compaction-registry'
import type { CompactionAppliedEvent } from '@tanstack/ai-event-client'

function applied(
  overrides: Partial<CompactionAppliedEvent> & {
    before: number
    after: number
  },
): CompactionAppliedEvent {
  return {
    timestamp: 1,
    messagesBefore: 8,
    messagesAfter: 3,
    reusedCheckpoint: false,
    ...overrides,
  }
}

describe('compaction registry', () => {
  it('accumulates compaction events', () => {
    const state = createCompactionRegistryState()
    applyCompactionEvent(
      state,
      applied({
        before: 400,
        after: 180,
        hookId: 'hook-1',
        timestamp: 10,
        strategyKey: 'evict-oldest:half:maxTokens=400',
        maxTokens: 400,
        dropped: [{ role: 'user', tokens: 40, text: 'old' }],
        result: [{ role: 'user', tokens: 10, text: 'omitted' }],
      }),
    )
    expect(state.events).toHaveLength(1)
    expect(state.events[0]).toMatchObject({
      before: 400,
      after: 180,
      hookId: 'hook-1',
      strategyKey: 'evict-oldest:half:maxTokens=400',
      maxTokens: 400,
    })
    expect(state.events[0]?.dropped?.[0]?.text).toBe('old')
    expect(state.events[0]?.result?.[0]?.text).toBe('omitted')
  })

  it('filters events for a hook and falls back to all', () => {
    const state = createCompactionRegistryState()
    applyCompactionEvent(
      state,
      applied({ before: 1, after: 1, hookId: 'a', timestamp: 1 }),
    )
    applyCompactionEvent(
      state,
      applied({ before: 2, after: 1, hookId: 'b', timestamp: 2 }),
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
    applyCompactionEvent(state, applied({ before: 1, after: 1 }))
    clearCompactionRegistry(state)
    expect(state.events).toEqual([])
  })
})
