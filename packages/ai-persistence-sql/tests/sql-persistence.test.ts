import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import { createSqlPersistence } from '../src/sql-persistence'
import { migrate } from '../src/migrations'
import { createTestSqliteDriver } from './sqlite-driver'

const text = (delta: string): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_CONTENT,
  messageId: 'm1',
  delta,
  timestamp: 1,
})

describe('migrate', () => {
  it('is idempotent (re-running applies nothing new)', async () => {
    const driver = createTestSqliteDriver()
    await migrate(driver)
    await migrate(driver)
    const rows = await driver.query<{ version: number }>(
      'SELECT version FROM _tanstack_ai_migrations',
    )
    expect(rows.map((r) => Number(r.version))).toEqual([1])
  })
})

describe('createSqlPersistence (sqlite dialect)', () => {
  it('migrates lazily on first use and round-trips runs', async () => {
    const p = createSqlPersistence(createTestSqliteDriver())
    const run = await p.runs!.createOrResume({
      runId: 'r1',
      threadId: 't1',
      startedAt: 100,
    })
    expect(run.status).toBe('running')
    // Idempotent resume returns the same record.
    const again = await p.runs!.createOrResume({
      runId: 'r1',
      threadId: 't1',
      startedAt: 999,
    })
    expect(again.startedAt).toBe(100)

    await p.runs!.update('r1', {
      status: 'completed',
      finishedAt: 200,
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    })
    const got = await p.runs!.get('r1')
    expect(got?.status).toBe('completed')
    expect(got?.finishedAt).toBe(200)
    expect(got?.usage?.totalTokens).toBe(3)
  })

  it('appends events and replays after a sequence', async () => {
    const p = createSqlPersistence(createTestSqliteDriver())
    await p.events!.append('r1', 1, text('a'))
    await p.events!.append('r1', 2, text('b'))
    await p.events!.append('r1', 3, text('c'))
    expect(await p.events!.hasRun('r1')).toBe(true)
    expect(await p.events!.latestSeq('r1')).toBe(3)

    const seen: Array<{ seq: number; delta: string }> = []
    for await (const e of p.events!.read('r1', { afterSeq: 1 })) {
      if (e.event.type === 'TEXT_MESSAGE_CONTENT') {
        seen.push({ seq: e.seq, delta: e.event.delta })
      }
    }
    expect(seen).toEqual([
      { seq: 2, delta: 'b' },
      { seq: 3, delta: 'c' },
    ])
  })

  it('append is idempotent on (runId, seq)', async () => {
    const p = createSqlPersistence(createTestSqliteDriver())
    await p.events!.append('r1', 1, text('a'))
    await p.events!.append('r1', 1, text('a-again'))
    expect(await p.events!.latestSeq('r1')).toBe(1)
  })

  it('round-trips the thread transcript', async () => {
    const p = createSqlPersistence(createTestSqliteDriver())
    expect(await p.messages!.loadThread('t1')).toEqual([])
    await p.messages!.saveThread('t1', [{ role: 'user', content: 'hi' }])
    await p.messages!.saveThread('t1', [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ])
    expect(await p.messages!.loadThread('t1')).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ])
  })

  it('persists and resolves approvals with thread decisions', async () => {
    const p = createSqlPersistence(createTestSqliteDriver())
    await p.approvals!.create({
      approvalId: 'a1',
      runId: 'r1',
      threadId: 't1',
      status: 'pending',
      requestedAt: 1,
      payload: { command: 'rm' },
    })
    await p.approvals!.resolve('a1', true)
    expect((await p.approvals!.get('a1'))?.status).toBe('granted')
    expect((await p.approvals!.decisionsForThread('t1')).get('a1')).toBe(true)
  })

  it('stores artifacts including inline bytes', async () => {
    const p = createSqlPersistence(createTestSqliteDriver())
    await p.artifacts!.save({
      artifactId: 'art1',
      runId: 'r1',
      threadId: 't1',
      name: 'out.bin',
      mimeType: 'application/octet-stream',
      size: 3,
      bytes: new Uint8Array([1, 2, 3]),
      createdAt: 1,
    })
    const got = await p.artifacts!.get('art1')
    expect(got?.name).toBe('out.bin')
    expect(Array.from(got?.bytes ?? [])).toEqual([1, 2, 3])
    expect(await p.artifacts!.list('r1')).toHaveLength(1)
  })
})
