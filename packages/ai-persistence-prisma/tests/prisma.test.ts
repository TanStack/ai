import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { EventType } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import { prismaPersistence } from '../src/index'
import type { PrismaRawClient } from '../src/index'

/** A fake PrismaClient backed by node:sqlite (raw escape hatches only). */
function fakePrisma(): PrismaRawClient {
  const db = new DatabaseSync(':memory:')
  const client: PrismaRawClient = {
    $queryRawUnsafe: <T,>(sql: string, ...params: Array<unknown>) =>
      Promise.resolve(db.prepare(sql).all(...(params as Array<never>)) as T),
    $executeRawUnsafe: (sql: string, ...params: Array<unknown>) => {
      db.prepare(sql).run(...(params as Array<never>))
      return Promise.resolve(0)
    },
    $transaction: (fn) => fn(client),
  }
  return client
}

const text = (delta: string): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_CONTENT,
  messageId: 'm1',
  delta,
  timestamp: 1,
})

describe('prismaPersistence (sqlite dialect, raw escape hatches)', () => {
  it('persists via $queryRawUnsafe / $executeRawUnsafe', async () => {
    const p = prismaPersistence({ prisma: fakePrisma(), dialect: 'sqlite' })
    await p.runs!.createOrResume({ runId: 'r1', threadId: 't1', startedAt: 1 })
    await p.events!.append('r1', 1, text('a'))

    expect((await p.runs!.get('r1'))?.status).toBe('running')
    const deltas: Array<string> = []
    for await (const e of p.events!.read('r1')) {
      if (e.event.type === 'TEXT_MESSAGE_CONTENT') deltas.push(e.event.delta)
    }
    expect(deltas).toEqual(['a'])
  })
})
