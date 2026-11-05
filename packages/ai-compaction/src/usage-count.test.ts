import { describe, expect, it } from 'vitest'
import type { ModelMessage } from '@tanstack/ai'
import { hashMessages } from './usage-count'

describe('hashMessages', () => {
  it('gives the same hash for a message whose keys come back in another order', async () => {
    const saved = {
      role: 'assistant',
      content: 'hi',
      metadata: { b: 1, a: { y: 2, x: 3 } },
      id: 'm1',
    } as ModelMessage
    const loaded = {
      id: 'm1',
      role: 'assistant',
      content: 'hi',
      metadata: { a: { x: 3, y: 2 }, b: 1 },
    } as ModelMessage

    expect(await hashMessages([loaded])).toBe(await hashMessages([saved]))
  })

  it('still tells a changed message and a reordered list apart', async () => {
    const one = { role: 'user', content: 'one' } as ModelMessage
    const two = { role: 'user', content: 'two' } as ModelMessage

    expect(await hashMessages([one])).not.toBe(await hashMessages([two]))
    expect(await hashMessages([one, two])).not.toBe(
      await hashMessages([two, one]),
    )
  })
})
