import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import { memoryPersistence } from '../src/memory'
import { loadRunHistory } from '../src/history'

const text = (delta: string): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_CONTENT,
  messageId: 'm1',
  delta,
  timestamp: 1,
})

describe('loadRunHistory', () => {
  it('projects a persisted run into an ordered StreamChunk timeline', async () => {
    const { publicEvents, internalEvents } = memoryPersistence().stores
    await publicEvents!.append({
      runId: 'r1',
      expectedSeq: 0,
      event: text('a'),
    })
    await internalEvents!.append({
      runId: 'r1',
      expectedSeq: 0,
      namespace: 'checkpoint',
      type: 'saved',
      payload: { hidden: true },
    })
    await publicEvents!.append({
      runId: 'r1',
      expectedSeq: 1,
      event: text('b'),
    })

    const timeline = await loadRunHistory(publicEvents!, 'r1')
    expect(
      timeline.map((c) =>
        c.type === 'TEXT_MESSAGE_CONTENT' ? c.delta : c.type,
      ),
    ).toEqual(['a', 'b'])
  })

  it('supports paging via afterSeq', async () => {
    const { publicEvents } = memoryPersistence().stores
    await publicEvents!.append({
      runId: 'r1',
      expectedSeq: 0,
      event: text('a'),
    })
    await publicEvents!.append({
      runId: 'r1',
      expectedSeq: 1,
      event: text('b'),
    })
    const timeline = await loadRunHistory(publicEvents!, 'r1', { afterSeq: 1 })
    expect(timeline).toHaveLength(1)
  })

  it('returns an empty timeline for an unknown run', async () => {
    const { publicEvents } = memoryPersistence().stores
    expect(await loadRunHistory(publicEvents!, 'nope')).toEqual([])
  })
})
