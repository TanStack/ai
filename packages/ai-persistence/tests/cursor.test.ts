import { describe, expect, it } from 'vitest'
import {
  RunSequence,
  decodeCursor,
  encodeCursor,
  isValidCursor,
} from '../src/cursor'

describe('encodeCursor / decodeCursor', () => {
  it('round-trips a runId and sequence', () => {
    const cursor = encodeCursor('run-1', 42)
    expect(decodeCursor(cursor)).toEqual({ runId: 'run-1', seq: 42 })
  })

  it('is opaque (not the raw "runId:seq")', () => {
    const cursor = encodeCursor('run-1', 42)
    expect(cursor).not.toContain('run-1')
    expect(cursor).not.toBe('run-1:42')
  })

  it('round-trips runIds that contain the delimiter', () => {
    const cursor = encodeCursor('thread:run:1', 7)
    expect(decodeCursor(cursor)).toEqual({ runId: 'thread:run:1', seq: 7 })
  })

  it('orders by sequence within a run via the decoded seq', () => {
    const a = decodeCursor(encodeCursor('r', 1)).seq
    const b = decodeCursor(encodeCursor('r', 2)).seq
    expect(b).toBeGreaterThan(a)
  })
})

describe('isValidCursor', () => {
  it('accepts a value produced by encodeCursor', () => {
    expect(isValidCursor(encodeCursor('run-1', 1))).toBe(true)
  })

  it('rejects arbitrary / malformed strings', () => {
    expect(isValidCursor('not-a-cursor')).toBe(false)
    expect(isValidCursor('')).toBe(false)
  })
})

describe('RunSequence', () => {
  it('hands out monotonically increasing sequence numbers', () => {
    const seq = new RunSequence('run-1')
    expect(seq.next()).toBe(1)
    expect(seq.next()).toBe(2)
    expect(seq.next()).toBe(3)
    expect(seq.current()).toBe(3)
  })

  it('resumes after an initial sequence (so resumed runs keep climbing)', () => {
    const seq = new RunSequence('run-1', 10)
    expect(seq.next()).toBe(11)
    expect(seq.current()).toBe(11)
  })

  it('toCursor encodes the current sequence for this run', () => {
    const seq = new RunSequence('run-1')
    seq.next() // 1
    seq.next() // 2
    expect(decodeCursor(seq.toCursor())).toEqual({ runId: 'run-1', seq: 2 })
  })
})
