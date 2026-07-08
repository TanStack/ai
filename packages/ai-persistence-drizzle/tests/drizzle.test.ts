import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { EventType } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import { drizzlePersistence } from '../src/index'

const text = (delta: string): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_CONTENT,
  messageId: 'm1',
  delta,
  timestamp: 1,
})

describe('drizzlePersistence (sqlite dialect, $client = node:sqlite)', () => {
  it('does not create schema by default', async () => {
    const db = { $client: new DatabaseSync(':memory:') }
    const p = drizzlePersistence({ db, dialect: 'sqlite' })

    await expect(
      p.runs!.createOrResume({ runId: 'r1', threadId: 't1', startedAt: 1 }),
    ).rejects.toThrow(/no such table: runs/)
  })

  it('persists via the unwrapped Drizzle client', async () => {
    // A Drizzle sqlite db exposes its driver client at `$client`; node:sqlite's
    // DatabaseSync is prepare().run/all-shaped like better-sqlite3.
    const db = { $client: new DatabaseSync(':memory:') }
    const p = drizzlePersistence({ db, dialect: 'sqlite', migrate: true })

    await p.runs!.createOrResume({ runId: 'r1', threadId: 't1', startedAt: 1 })
    await p.events!.append('r1', 1, text('a'))
    await p.events!.append('r1', 2, text('b'))

    expect((await p.runs!.get('r1'))?.threadId).toBe('t1')
    expect(await p.events!.latestSeq('r1')).toBe(2)
  })
})
