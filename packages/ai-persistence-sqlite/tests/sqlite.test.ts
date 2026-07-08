import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import { createResumeSource } from '@tanstack/ai-persistence'
import { createSqliteDriver, sqlitePersistence } from '../src/index'

const text = (delta: string): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_CONTENT,
  messageId: 'm1',
  delta,
  timestamp: 1,
})

describe('sqlitePersistence', () => {
  it('uses a supplied db handle without opening node:sqlite', async () => {
    const calls: Array<{ sql: string; params: Array<unknown> }> = []
    const db = {
      prepare: (sql: string) => ({
        run: (...params: Array<unknown>) => {
          calls.push({ sql, params })
        },
        all: (...params: Array<unknown>) => {
          calls.push({ sql, params })
          return [{ value: 'ok' }]
        },
      }),
    }

    const driver = createSqliteDriver({ db })
    await driver.exec('insert into test values (?)', ['a'])
    const rows = await driver.query('select value from test where id = ?', [1])

    expect(rows).toEqual([{ value: 'ok' }])
    expect(calls).toEqual([
      { sql: 'insert into test values (?)', params: ['a'] },
      { sql: 'select value from test where id = ?', params: [1] },
    ])
  })

  it('does not create schema by default', async () => {
    const p = sqlitePersistence()

    await expect(
      p.runs!.createOrResume({ runId: 'r1', threadId: 't1', startedAt: 1 }),
    ).rejects.toThrow(/no such table: runs/)
  })

  it('round-trips a run, events, and transcript on an in-memory db', async () => {
    const p = sqlitePersistence({ migrate: true })
    await p.runs!.createOrResume({ runId: 'r1', threadId: 't1', startedAt: 1 })
    await p.events!.append('r1', 1, text('a'))
    await p.events!.append('r1', 2, text('b'))
    await p.messages!.saveThread('t1', [{ role: 'user', content: 'hi' }])

    expect(await p.events!.latestSeq('r1')).toBe(2)
    expect((await p.runs!.get('r1'))?.status).toBe('running')
    expect(await p.messages!.loadThread('t1')).toEqual([
      { role: 'user', content: 'hi' },
    ])
  })

  it('drives the core ResumeSource: replays the tail after a cursor', async () => {
    const p = sqlitePersistence({ migrate: true })
    await p.runs!.createOrResume({ runId: 'r1', threadId: 't1', startedAt: 1 })
    await p.events!.append('r1', 1, text('a'))
    await p.events!.append('r1', 2, text('b'))
    await p.events!.append('r1', 3, text('c'))

    const source = createResumeSource(p.events!, p.runs)
    expect(await source.hasRun('r1')).toBe(true)

    const deltas: Array<string> = []
    for await (const chunk of source.replay('r1', undefined)) {
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') deltas.push(chunk.delta)
    }
    expect(deltas).toEqual(['a', 'b', 'c'])
  })
})
