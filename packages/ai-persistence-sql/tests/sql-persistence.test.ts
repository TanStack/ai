import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import {
  AppendConflictError,
  createApprovalController,
} from '@tanstack/ai-persistence'
import type { StreamChunk } from '@tanstack/ai'
import { createSqlPersistence } from '../src/sql-persistence'
import { ddl, migrate } from '../src/migrations'
import { createTestSqliteDriver } from './sqlite-driver'
import type { SqlDriver } from '../src/driver'

const text = (delta: string): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_CONTENT,
  messageId: 'm1',
  delta,
  timestamp: 1,
})

const textWithMetadata = (
  delta: string,
  metadata: Record<string, unknown>,
): StreamChunk => Object.assign(text(delta), { metadata })

function createInsertRaceDriver(opts: {
  table: 'public_events' | 'internal_events'
  persistedPayload: unknown
}): SqlDriver {
  const base = createTestSqliteDriver()
  let raced = false
  let aborted = false
  const makeDriver = (inTransaction: boolean): SqlDriver => ({
    dialect: base.dialect,
    async query(sql, params) {
      if (inTransaction && aborted) {
        throw new Error('current transaction is aborted')
      }
      return base.query(sql, params)
    },
    transaction: async (fn) => {
      aborted = false
      try {
        return await fn(makeDriver(true))
      } finally {
        aborted = false
      }
    },
    async exec(sql, params = []) {
      if (inTransaction && aborted) {
        throw new Error('current transaction is aborted')
      }
      if (!raced && sql.includes(`INSERT INTO ${opts.table}`)) {
        raced = true
        if (opts.table === 'public_events') {
          await base.exec(
            'INSERT INTO public_events (run_id, seq, event) VALUES (?, ?, ?)',
            [params[0], params[1], JSON.stringify(opts.persistedPayload)],
          )
        } else {
          await base.exec(
            'INSERT INTO internal_events (run_id, namespace, seq, type, payload) VALUES (?, ?, ?, ?, ?)',
            [
              params[0],
              params[1],
              params[2],
              params[3],
              JSON.stringify(opts.persistedPayload),
            ],
          )
        }
        if (!sql.includes('ON CONFLICT')) {
          aborted = true
          throw new Error('simulated unique constraint violation')
        }
      }
      await base.exec(sql, params)
    },
  })
  return makeDriver(false)
}

function createRecordingDriver(): SqlDriver & {
  statements: Array<string>
  queueQueryRows: (rows: Array<Record<string, unknown>>) => void
} {
  const statements: Array<string> = []
  const queuedRows: Array<Array<Record<string, unknown>>> = []
  const driver: SqlDriver & {
    statements: Array<string>
    queueQueryRows: (rows: Array<Record<string, unknown>>) => void
  } = {
    dialect: 'mysql' as SqlDriver['dialect'],
    statements,
    queueQueryRows(rows) {
      queuedRows.push(rows)
    },
    async exec(sql) {
      statements.push(sql)
    },
    async query(sql) {
      statements.push(sql)
      return (queuedRows.shift() ?? []) as Array<any>
    },
    async transaction(fn) {
      return fn(driver)
    },
  }
  return driver
}

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

  it('creates only the small durable primitive tables', async () => {
    const driver = createTestSqliteDriver()
    await migrate(driver)

    const rows = await driver.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    expect(rows.map((r) => r.name)).toEqual([
      '_tanstack_ai_migrations',
      'internal_events',
      'interrupts',
      'messages',
      'metadata',
      'public_events',
      'runs',
    ])
    expect(rows.map((r) => r.name)).not.toEqual(
      expect.arrayContaining([
        'approvals',
        'artifacts',
        'checkpoints',
        'mcp_credentials',
        'mcp_sessions',
        'message_threads',
        'run_events',
        'sandbox_processes',
        'workflow_checkpoints',
      ]),
    )
  })

  it('handles concurrent migration marker insertion idempotently', async () => {
    const base = createTestSqliteDriver()
    let migrationReads = 0
    let releaseReads: (() => void) | undefined
    const bothReadsReached = new Promise<void>((resolve) => {
      releaseReads = resolve
    })
    const driver: SqlDriver = {
      dialect: base.dialect,
      exec: base.exec,
      transaction: base.transaction,
      async query(sql, params) {
        if (sql === 'SELECT version FROM _tanstack_ai_migrations') {
          migrationReads += 1
          if (migrationReads === 2) releaseReads?.()
          await bothReadsReached
        }
        return base.query(sql, params)
      },
    }

    await Promise.all([migrate(driver), migrate(driver)])

    const rows = await base.query<{ version: number }>(
      'SELECT version FROM _tanstack_ai_migrations',
    )
    expect(rows.map((row) => Number(row.version))).toEqual([1])
  })
})

describe('mysql dialect SQL generation', () => {
  it('uses MySQL-safe binary key columns and LONGTEXT payload columns in DDL', () => {
    const statements = ddl('mysql' as SqlDriver['dialect'])
    const schema = statements.join('\n')
    const mysqlKey = 'VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin'

    expect(schema).toContain(`run_id ${mysqlKey} PRIMARY KEY`)
    expect(schema).toContain(`thread_id ${mysqlKey} PRIMARY KEY`)
    expect(schema).toContain(`interrupt_id ${mysqlKey} PRIMARY KEY`)
    expect(schema).toContain(`namespace ${mysqlKey} NOT NULL`)
    expect(schema).toContain(`\`key\` ${mysqlKey} NOT NULL`)
    expect(schema).toContain('PRIMARY KEY (scope, `key`)')
    expect(schema).toContain('error LONGTEXT')
    expect(schema).toContain('`usage` LONGTEXT')
    expect(schema).toContain('event LONGTEXT NOT NULL')
    expect(schema).toContain('payload LONGTEXT NOT NULL')
    expect(schema).toContain('messages LONGTEXT NOT NULL')
    expect(schema).toContain('response LONGTEXT')
    expect(schema).toContain('value LONGTEXT NOT NULL')
    expect(schema).not.toContain('TEXT PRIMARY KEY')
    expect(schema).not.toContain(' key VARCHAR(191)')
  })

  it('uses no-op upsert for MySQL migration markers', async () => {
    const driver = createRecordingDriver()
    await migrate(driver)

    expect(driver.statements.join('\n')).toContain(
      'INSERT INTO _tanstack_ai_migrations',
    )
    expect(driver.statements.join('\n')).toContain(
      'ON DUPLICATE KEY UPDATE version = version',
    )
    expect(driver.statements.join('\n')).not.toContain('INSERT IGNORE')
    expect(driver.statements.join('\n')).not.toContain('ON CONFLICT')
  })

  it('emits MySQL-compatible no-op insert and upsert SQL for stores', async () => {
    const driver = createRecordingDriver()
    const persistence = createSqlPersistence(driver, { migrate: false })

    driver.queueQueryRows([])
    driver.queueQueryRows([
      {
        run_id: 'r1',
        thread_id: 't1',
        status: 'running',
        started_at: 1,
      },
    ])
    await persistence.stores.runs!.createOrResume({
      runId: 'r1',
      threadId: 't1',
      startedAt: 1,
    })
    await persistence.stores.runs!.update('r1', {
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    })

    await persistence.stores.messages!.saveThread('t1', [
      { role: 'user', content: 'hi' },
    ])
    await persistence.stores.metadata!.set('scope', 'key', { ok: true })
    await persistence.stores.metadata!.get('scope', 'key')
    await persistence.stores.metadata!.delete('scope', 'key')
    await persistence.stores.interrupts!.create({
      interruptId: 'i1',
      runId: 'r1',
      threadId: 't1',
      status: 'pending',
      requestedAt: 1,
      payload: { kind: 'input' },
    })
    await persistence.approvals!.create({
      approvalId: 'a1',
      runId: 'r1',
      threadId: 't1',
      status: 'pending',
      requestedAt: 1,
      payload: { kind: 'approval' },
    })
    await persistence.events!.append('r1', 1, text('legacy'))

    driver.queueQueryRows([])
    driver.queueQueryRows([{ max_seq: 0 }])
    driver.queueQueryRows([
      {
        seq: 1,
        event: JSON.stringify(text('public')),
      },
    ])
    await persistence.stores.publicEvents!.append({
      runId: 'r1',
      expectedSeq: 0,
      event: text('public'),
    })

    driver.queueQueryRows([])
    driver.queueQueryRows([{ max_seq: 0 }])
    driver.queueQueryRows([
      {
        seq: 1,
        namespace: 'agent',
        type: 'step',
        payload: JSON.stringify({ ok: true }),
      },
    ])
    await persistence.stores.internalEvents!.append({
      runId: 'r1',
      namespace: 'agent',
      expectedSeq: 0,
      type: 'step',
      payload: { ok: true },
    })

    const sql = driver.statements.join('\n')
    expect(sql).toContain('INSERT INTO runs')
    expect(sql).toContain(
      'SELECT run_id, thread_id, status, started_at, finished_at, error, `usage` FROM runs WHERE run_id = ?',
    )
    expect(sql).toContain('UPDATE runs SET `usage` = ? WHERE run_id = ?')
    expect(sql).toContain('ON DUPLICATE KEY UPDATE run_id = run_id')
    expect(sql).toContain('INSERT INTO interrupts')
    expect(sql).toContain('ON DUPLICATE KEY UPDATE interrupt_id = interrupt_id')
    expect(sql).toContain('INSERT INTO public_events')
    expect(sql).toContain('INSERT INTO internal_events')
    expect(sql).toContain('INSERT INTO metadata (scope, `key`, value) VALUES')
    expect(sql).toContain(
      'SELECT value FROM metadata WHERE scope = ? AND `key` = ?',
    )
    expect(sql).toContain('DELETE FROM metadata WHERE scope = ? AND `key` = ?')
    expect(sql).toContain('ON DUPLICATE KEY UPDATE messages = ?')
    expect(sql).toContain('ON DUPLICATE KEY UPDATE value = ?')
    expect(sql).not.toContain('INSERT IGNORE')
    expect(sql).not.toContain('ON CONFLICT')
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

  it('public event append detects conflicting target rows', async () => {
    const p = createSqlPersistence(createTestSqliteDriver())
    await p.stores.publicEvents!.append({
      runId: 'r1',
      expectedSeq: 0,
      event: text('a'),
    })

    await expect(
      p.stores.publicEvents!.append({
        runId: 'r1',
        expectedSeq: 0,
        event: text('different'),
      }),
    ).rejects.toBeInstanceOf(AppendConflictError)
  })

  it('public event append enforces expected sequence and permits identical retry', async () => {
    const p = createSqlPersistence(createTestSqliteDriver())
    const first = await p.stores.publicEvents!.append({
      runId: 'r1',
      expectedSeq: 0,
      event: text('a'),
    })
    const retry = await p.stores.publicEvents!.append({
      runId: 'r1',
      expectedSeq: 0,
      event: text('a'),
    })
    expect(retry).toEqual(first)

    await expect(
      p.stores.publicEvents!.append({
        runId: 'r1',
        expectedSeq: 0,
        event: text('b'),
      }),
    ).rejects.toBeInstanceOf(AppendConflictError)
    await expect(
      p.stores.publicEvents!.append({
        runId: 'r1',
        expectedSeq: 2,
        event: text('c'),
      }),
    ).rejects.toBeInstanceOf(AppendConflictError)
  })

  it('public event idempotent retry ignores JSON object key order', async () => {
    const p = createSqlPersistence(createTestSqliteDriver())
    const first = await p.stores.publicEvents!.append({
      runId: 'r1',
      expectedSeq: 0,
      event: textWithMetadata('a', { a: 1, b: 2 }),
    })
    const retry = await p.stores.publicEvents!.append({
      runId: 'r1',
      expectedSeq: 0,
      event: textWithMetadata('a', { b: 2, a: 1 }),
    })

    expect(retry).toEqual(first)
  })

  it('public event append normalizes insert races to CAS outcomes', async () => {
    const event = text('winner')
    const idempotent = createSqlPersistence(
      createInsertRaceDriver({
        table: 'public_events',
        persistedPayload: event,
      }),
    )

    await expect(
      idempotent.stores.publicEvents!.append({
        runId: 'r1',
        expectedSeq: 0,
        event,
      }),
    ).resolves.toMatchObject({ seq: 1, event })

    const conflicting = createSqlPersistence(
      createInsertRaceDriver({
        table: 'public_events',
        persistedPayload: text('other'),
      }),
    )
    await expect(
      conflicting.stores.publicEvents!.append({
        runId: 'r1',
        expectedSeq: 0,
        event,
      }),
    ).rejects.toBeInstanceOf(AppendConflictError)
  })

  it('internal event append enforces expected sequence per run and namespace', async () => {
    const p = createSqlPersistence(createTestSqliteDriver())
    const first = await p.stores.internalEvents!.append({
      runId: 'r1',
      namespace: 'agent',
      expectedSeq: 0,
      type: 'step',
      payload: { n: 1 },
    })
    const retry = await p.stores.internalEvents!.append({
      runId: 'r1',
      namespace: 'agent',
      expectedSeq: 0,
      type: 'step',
      payload: { n: 1 },
    })
    expect(retry).toEqual(first)

    await p.stores.internalEvents!.append({
      runId: 'r1',
      namespace: 'tools',
      expectedSeq: 0,
      type: 'call',
      payload: { tool: 'search' },
    })
    expect(await p.stores.internalEvents!.latestSeq('r1', 'agent')).toBe(1)
    expect(await p.stores.internalEvents!.latestSeq('r1', 'tools')).toBe(1)
    expect(await p.stores.internalEvents!.latestSeq('r1')).toBe(1)

    await expect(
      p.stores.internalEvents!.append({
        runId: 'r1',
        namespace: 'agent',
        expectedSeq: 0,
        type: 'step',
        payload: { n: 2 },
      }),
    ).rejects.toBeInstanceOf(AppendConflictError)

    const agentEvents = []
    for await (const event of p.stores.internalEvents!.read('r1', {
      namespace: 'agent',
    })) {
      agentEvents.push(event)
    }
    expect(agentEvents.map((event) => event.payload)).toEqual([{ n: 1 }])
  })

  it('internal event idempotent retry ignores JSON object key order', async () => {
    const p = createSqlPersistence(createTestSqliteDriver())
    const first = await p.stores.internalEvents!.append({
      runId: 'r1',
      namespace: 'agent',
      expectedSeq: 0,
      type: 'step',
      payload: { a: 1, b: 2 },
    })
    const retry = await p.stores.internalEvents!.append({
      runId: 'r1',
      namespace: 'agent',
      expectedSeq: 0,
      type: 'step',
      payload: { b: 2, a: 1 },
    })

    expect(retry).toEqual(first)
  })

  it('internal event append normalizes insert races to CAS outcomes', async () => {
    const idempotent = createSqlPersistence(
      createInsertRaceDriver({
        table: 'internal_events',
        persistedPayload: { n: 1 },
      }),
    )

    await expect(
      idempotent.stores.internalEvents!.append({
        runId: 'r1',
        namespace: 'agent',
        expectedSeq: 0,
        type: 'step',
        payload: { n: 1 },
      }),
    ).resolves.toMatchObject({
      seq: 1,
      namespace: 'agent',
      type: 'step',
      payload: { n: 1 },
    })

    const conflicting = createSqlPersistence(
      createInsertRaceDriver({
        table: 'internal_events',
        persistedPayload: { n: 2 },
      }),
    )
    await expect(
      conflicting.stores.internalEvents!.append({
        runId: 'r1',
        namespace: 'agent',
        expectedSeq: 0,
        type: 'step',
        payload: { n: 1 },
      }),
    ).rejects.toBeInstanceOf(AppendConflictError)
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

  it('passes SQL approval compatibility store into the deprecated approval controller', async () => {
    const p = createSqlPersistence(createTestSqliteDriver())
    const controller = createApprovalController({ store: p.approvals })

    await controller.request({
      approvalId: 'a1',
      runId: 'r1',
      threadId: 't1',
      requestedAt: 1,
      payload: { command: 'rm' },
    })
    await controller.resolve('a1', false)

    expect((await controller.decisionsForThread('t1')).get('a1')).toBe(false)
  })

  it('keeps generic interrupts out of legacy approval decisions and maps responses', async () => {
    const p = createSqlPersistence(createTestSqliteDriver())
    await p.stores.interrupts!.create({
      interruptId: 'interrupt-1',
      runId: 'r1',
      threadId: 't1',
      status: 'pending',
      requestedAt: 1,
      payload: { kind: 'generic' },
    })
    await p.stores.interrupts!.resolve('interrupt-1', { ok: true })

    expect((await p.stores.interrupts!.get('interrupt-1'))?.response).toEqual({
      ok: true,
    })
    expect(await p.approvals!.decisionsForThread('t1')).toEqual(new Map())
  })

  it('creates, lists, resolves, cancels, and queries blocking interrupts', async () => {
    const p = createSqlPersistence(createTestSqliteDriver())
    await p.stores.interrupts!.create({
      interruptId: 'i1',
      runId: 'r1',
      threadId: 't1',
      status: 'pending',
      requestedAt: 1,
      payload: { kind: 'approval' },
    })
    await p.stores.interrupts!.create({
      interruptId: 'i2',
      runId: 'r2',
      threadId: 't1',
      status: 'pending',
      requestedAt: 2,
      payload: { kind: 'input' },
    })

    expect((await p.stores.interrupts!.list('t1')).map((i) => i.runId)).toEqual(
      ['r1', 'r2'],
    )
    expect(
      (await p.stores.interrupts!.listPending('t1')).map((i) => i.interruptId),
    ).toEqual(['i1', 'i2'])

    await p.stores.interrupts!.resolve('i1', { approved: true })
    await p.stores.interrupts!.cancel('i2')
    expect(await p.stores.interrupts!.listPending('t1')).toEqual([])
    expect((await p.stores.interrupts!.get('i1'))?.response).toEqual({
      approved: true,
    })
    expect((await p.stores.interrupts!.get('i2'))?.status).toBe('cancelled')
  })

  it('lists interrupts and pending interrupts by run', async () => {
    const p = createSqlPersistence(createTestSqliteDriver())
    await p.stores.interrupts!.create({
      interruptId: 'i1',
      runId: 'r1',
      threadId: 't1',
      status: 'pending',
      requestedAt: 1,
      payload: { kind: 'approval' },
    })
    await p.stores.interrupts!.create({
      interruptId: 'i2',
      runId: 'r1',
      threadId: 't2',
      status: 'pending',
      requestedAt: 2,
      payload: { kind: 'input' },
    })
    await p.stores.interrupts!.create({
      interruptId: 'i3',
      runId: 'r2',
      threadId: 't1',
      status: 'pending',
      requestedAt: 3,
      payload: { kind: 'other' },
    })

    await p.stores.interrupts!.cancel('i2')

    expect(
      (await p.stores.interrupts!.listByRun('r1')).map(
        (interrupt) => interrupt.interruptId,
      ),
    ).toEqual(['i1', 'i2'])
    expect(
      (await p.stores.interrupts!.listPendingByRun('r1')).map(
        (interrupt) => interrupt.interruptId,
      ),
    ).toEqual(['i1'])
  })

  it('stores app-owned namespaced metadata', async () => {
    const p = createSqlPersistence(createTestSqliteDriver())
    await p.stores.metadata!.set('app:user:u1', 'theme', 'dark')
    await p.stores.metadata!.set('app:user:u2', 'theme', 'light')

    expect(await p.stores.metadata!.get('app:user:u1', 'theme')).toBe('dark')
    expect(await p.stores.metadata!.get('app:user:u2', 'theme')).toBe('light')

    await p.stores.metadata!.delete('app:user:u1', 'theme')
    expect(await p.stores.metadata!.get('app:user:u1', 'theme')).toBeNull()
    expect(await p.stores.metadata!.get('app:user:u2', 'theme')).toBe('light')
  })

  it('does not expose artifact compatibility as a base SQL store', () => {
    const p = createSqlPersistence(createTestSqliteDriver())
    expect(p.stores.artifacts).toBeUndefined()
  })
})
