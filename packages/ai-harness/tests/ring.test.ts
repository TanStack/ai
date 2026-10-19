import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { EventRing } from '../src/ring'
import type { SessionEvent } from '../src/types'

function event(cursor: number): SessionEvent {
  return {
    cursor: String(cursor),
    threadId: 't',
    operationId: 'op-1',
    event: { type: EventType.RUN_STARTED, threadId: 't', runId: 'r' },
  }
}

/** Push events with the cursors and threads given, each `size` bytes. */
function ringOf(
  maxBytes: number,
  items: Array<[cursor: number, thread: string]>,
  size = 10,
) {
  const ring = new EventRing({ maxBytes })
  for (const [cursor, thread] of items) {
    ring.push({ thread, entry: event(cursor), size })
  }
  return ring
}

const cursors = (read: { entries: Array<SessionEvent> }) =>
  read.entries.map((entry) => Number(entry.cursor))

describe('EventRing', () => {
  it('reads the events after a cursor, also with gaps between cursors', () => {
    const ring = ringOf(1000, [
      [2, 'a'],
      [5, 'a'],
      [9, 'a'],
    ])
    expect(cursors(ring.after(0))).toEqual([2, 5, 9])
    expect(cursors(ring.after(2))).toEqual([5, 9])
    expect(cursors(ring.after(3))).toEqual([5, 9])
    expect(cursors(ring.after(9))).toEqual([])
    expect(ring.after(0).gap).toBe(false)
  })

  it('drops the oldest events over the byte cap', () => {
    const ring = ringOf(25, [
      [1, 'a'],
      [2, 'a'],
      [3, 'a'],
      [4, 'a'],
    ])
    expect(cursors(ring.after(0))).toEqual([3, 4])
    expect(ring.bytes).toBe(20)
    expect(ring.length).toBe(2)
    expect(ring.from).toBe(2)
  })

  it('keeps the newest event when it alone is over the cap', () => {
    const ring = ringOf(5, [
      [1, 'a'],
      [2, 'a'],
    ])
    expect(cursors(ring.after(0))).toEqual([2])
    expect(ring.bytes).toBe(10)
  })

  it('reports a gap for a cursor older than the oldest kept event', () => {
    const ring = ringOf(20, [
      [1, 'a'],
      [2, 'a'],
      [3, 'a'],
    ])
    // Event 1 is gone: a reader at 0 missed it, a reader at 1 did not.
    expect(ring.after(0)).toMatchObject({ gap: true })
    expect(ring.after(1)).toMatchObject({ gap: false })
    expect(cursors(ring.after(1))).toEqual([2, 3])
  })

  it('reports a gap before the start cursor', () => {
    const ring = new EventRing({ maxBytes: 100, from: 7 })
    ring.push({ thread: 'a', entry: event(8), size: 1 })
    expect(ring.after(6).gap).toBe(true)
    expect(ring.after(7)).toEqual({ entries: [event(8)], gap: false })
  })

  it('reads the events of one thread only, and drops them in order', () => {
    const ring = ringOf(40, [
      [1, 'a'],
      [2, 'b'],
      [3, 'a'],
      [4, 'b'],
      [5, 'a'],
      [6, 'b'],
    ])
    // Events 1 and 2 are gone.
    expect(cursors(ring.after(0, 'a'))).toEqual([3, 5])
    expect(cursors(ring.after(3, 'a'))).toEqual([5])
    expect(cursors(ring.after(0, 'b'))).toEqual([4, 6])
    expect(cursors(ring.after(0, 'c'))).toEqual([])
  })

  it('keeps the order through many pushes and drops', () => {
    const ring = new EventRing({ maxBytes: 30 })
    for (let cursor = 1; cursor <= 1000; cursor++) {
      ring.push({
        thread: cursor % 2 ? 'a' : 'b',
        entry: event(cursor),
        size: 10,
      })
    }
    expect(cursors(ring.after(0))).toEqual([998, 999, 1000])
    expect(cursors(ring.after(0, 'a'))).toEqual([999])
    expect(cursors(ring.after(0, 'b'))).toEqual([998, 1000])
    expect(ring.from).toBe(997)
  })
})
