/// <reference types="@cloudflare/workers-types" />
import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { EventType } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import { cloudflarePersistence, createD1Driver } from '../src/index'

/**
 * A fake D1Database backed by node:sqlite. D1 is SQLite-compatible, so this
 * exercises the real D1 driver + SQL stores end-to-end without a Workers runtime.
 */
function fakeD1(): D1Database {
  const db = new DatabaseSync(':memory:')
  const prepare = (sql: string) => {
    let bound: Array<unknown> = []
    const api = {
      bind: (...values: Array<unknown>) => {
        bound = values
        return api
      },
      run: () => {
        db.prepare(sql).run(...(bound as Array<never>))
        return Promise.resolve({ success: true })
      },
      all: () =>
        Promise.resolve({
          results: db.prepare(sql).all(...(bound as Array<never>)),
        }),
      first: () => Promise.resolve(null),
      raw: () => Promise.resolve([]),
    }
    return api
  }
  return { prepare } as unknown as D1Database
}

const text = (delta: string): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_CONTENT,
  messageId: 'm1',
  delta,
  timestamp: 1,
})

describe('cloudflarePersistence (D1 via fake backed by node:sqlite)', () => {
  it('round-trips runs and events through the D1 driver', async () => {
    const p = cloudflarePersistence({ d1: fakeD1() })
    await p.runs!.createOrResume({ runId: 'r1', threadId: 't1', startedAt: 1 })
    await p.events!.append('r1', 1, text('a'))
    await p.events!.append('r1', 2, text('b'))

    expect((await p.runs!.get('r1'))?.status).toBe('running')
    expect(await p.events!.latestSeq('r1')).toBe(2)

    const deltas: Array<string> = []
    for await (const e of p.events!.read('r1', { afterSeq: 0 })) {
      if (e.event.type === 'TEXT_MESSAGE_CONTENT') deltas.push(e.event.delta)
    }
    expect(deltas).toEqual(['a', 'b'])
  })

  it('createD1Driver reports the sqlite dialect', () => {
    expect(createD1Driver(fakeD1()).dialect).toBe('sqlite')
  })
})
