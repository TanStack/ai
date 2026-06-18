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
    const { events } = memoryPersistence()
    await events!.append('r1', 1, text('a'))
    await events!.append('r1', 2, text('b'))
    await events!.append('r1', 3, text('c'))

    const timeline = await loadRunHistory(events!, 'r1')
    expect(
      timeline.map((c) =>
        c.type === 'TEXT_MESSAGE_CONTENT' ? c.delta : c.type,
      ),
    ).toEqual(['a', 'b', 'c'])
  })

  it('supports paging via afterSeq', async () => {
    const { events } = memoryPersistence()
    await events!.append('r1', 1, text('a'))
    await events!.append('r1', 2, text('b'))
    const timeline = await loadRunHistory(events!, 'r1', { afterSeq: 1 })
    expect(timeline).toHaveLength(1)
  })

  it('returns an empty timeline for an unknown run', async () => {
    const { events } = memoryPersistence()
    expect(await loadRunHistory(events!, 'nope')).toEqual([])
  })
})
