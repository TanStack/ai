import { describe, expect, it } from 'vitest'
import { normalizeQueueOption } from '../src/chat-client'

describe('normalizeQueueOption', () => {
  it('defaults to queue + fifo + reject', () => {
    expect(normalizeQueueOption(undefined)).toEqual({
      whenBusy: 'queue',
      drain: 'fifo',
      onOverflow: 'reject',
    })
  })

  it('treats a string as whenBusy shorthand', () => {
    expect(normalizeQueueOption('interrupt')).toMatchObject({
      whenBusy: 'interrupt',
      drain: 'fifo',
    })
  })

  it('carries a function as strategy and forces fifo', () => {
    const fn = () => ({ action: 'enqueue' as const })
    const cfg = normalizeQueueOption(fn)
    expect(cfg.strategy).toBe(fn)
    expect(cfg.drain).toBe('fifo')
  })

  it('merges a config object over defaults', () => {
    expect(normalizeQueueOption({ whenBusy: 'drop', maxSize: 3 })).toEqual({
      whenBusy: 'drop',
      drain: 'fifo',
      onOverflow: 'reject',
      maxSize: 3,
    })
  })
})
