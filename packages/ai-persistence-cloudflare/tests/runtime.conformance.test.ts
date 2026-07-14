/// <reference types="@cloudflare/workers-types" />
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Miniflare } from 'miniflare'
import {
  runInterruptStoreConformance,
  runPersistenceConformance,
} from '@tanstack/ai-persistence/testkit'
import { composePersistence } from '@tanstack/ai-persistence'
import { cloudflarePersistence, d1Migrations } from '../src/index'
import { createD1InterruptStore } from '../src/d1'
import type { AIPersistence, InterruptStore } from '@tanstack/ai-persistence'
import type { InterruptConformanceHarness } from '@tanstack/ai-persistence/testkit'

interface RuntimeBindings {
  AI_DB: D1Database
  AI_BUCKET: R2Bucket
}

function migrationStatements(sql: string): Array<string> {
  return sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
}

async function applyMigrations(d1: D1Database): Promise<void> {
  for (const migration of d1Migrations) {
    await d1.batch(
      migrationStatements(migration.sql).map((statement) =>
        d1.prepare(statement),
      ),
    )
  }
}

describe('Cloudflare persistence on Miniflare bindings', () => {
  let miniflare: Miniflare
  let persistence: AIPersistence
  let d1: D1Database

  beforeAll(async () => {
    miniflare = new Miniflare({
      compatibilityDate: '2026-06-24',
      d1Databases: ['AI_DB'],
      modules: true,
      r2Buckets: ['AI_BUCKET'],
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    const bindings = await miniflare.getBindings<RuntimeBindings>()
    d1 = bindings.AI_DB
    await applyMigrations(d1)
    persistence = cloudflarePersistence({
      d1: bindings.AI_DB,
      r2: bindings.AI_BUCKET,
    })
  }, 30_000)

  afterAll(async () => {
    await miniflare.dispose()
  })

  runPersistenceConformance('cloudflare-d1-r2', () => persistence)

  runInterruptStoreConformance(
    async (): Promise<InterruptConformanceHarness> => {
      await d1.exec('DROP TRIGGER IF EXISTS fail_interrupt_transition')
      await d1.batch([
        d1.prepare('DELETE FROM interrupt_batches'),
        d1.prepare('DELETE FROM interrupts'),
      ])
      let now = Date.parse('2026-07-13T10:00:00.000Z')
      let pendingFailureSetup: Promise<D1ExecResult> | undefined
      const createBase = () =>
        createD1InterruptStore(d1, {
          clock: () => now,
        })
      const base = createBase()
      const store: InterruptStore = {
        create: (record) => base.create(record),
        resolve: (interruptId, response) => base.resolve(interruptId, response),
        cancel: (interruptId) => base.cancel(interruptId),
        get: (interruptId) => base.get(interruptId),
        list: (threadId) => base.list(threadId),
        listPending: (threadId) => base.listPending(threadId),
        listByRun: (runId) => base.listByRun(runId),
        listPendingByRun: (runId) => base.listPendingByRun(runId),
        openInterruptBatch: (input) => base.openInterruptBatch(input),
        async commitInterruptResolutions(input) {
          if (pendingFailureSetup) {
            await pendingFailureSetup
            pendingFailureSetup = undefined
          }
          return base.commitInterruptResolutions(input)
        },
        getInterruptRecoveryState: (input) =>
          base.getInterruptRecoveryState(input),
      }

      return {
        getStore: () => store,
        advanceBy(milliseconds) {
          now += milliseconds
        },
        async inspect(interruptedRunId) {
          const [rows, batch] = await Promise.all([
            d1
              .prepare(
                'SELECT status FROM interrupts WHERE run_id = ? ORDER BY interrupt_id',
              )
              .bind(interruptedRunId)
              .all<{ status: string }>(),
            d1
              .prepare(
                'SELECT COUNT(*) AS count FROM interrupt_batches WHERE interrupted_run_id = ?',
              )
              .bind(interruptedRunId)
              .first<number>('count'),
          ])
          return {
            statuses: rows.results.map((row) => row.status),
            batchCount: batch ?? -1,
          }
        },
        failTransitionOnce(interruptId) {
          const escapedInterruptId = interruptId.replaceAll("'", "''")
          pendingFailureSetup = d1.exec(`
            CREATE TRIGGER fail_interrupt_transition
            BEFORE UPDATE OF status ON interrupts
            WHEN OLD.interrupt_id = '${escapedInterruptId}'
              AND NEW.status <> OLD.status
            BEGIN
              SELECT RAISE(ABORT, 'injected interrupt transition failure');
            END;
          `)
        },
        reopen: () => Promise.resolve(createBase()),
      }
    },
  )

  it('composes a custom interrupt store while retaining D1 runs', () => {
    const baseInterrupts = persistence.stores.interrupts
    if (!baseInterrupts) throw new Error('D1 interrupt store missing')
    const customInterrupts: InterruptStore = {
      ...baseInterrupts,
    }
    const composed = composePersistence(persistence, {
      overrides: { interrupts: customInterrupts },
    })

    expect(composed.stores.interrupts).toBe(customInterrupts)
    expect(composed.stores.runs).toBe(persistence.stores.runs)
  })

  it('removes only stores explicitly disabled by an override', () => {
    const composed = composePersistence(persistence, {
      overrides: { interrupts: false },
    })

    expect('interrupts' in composed.stores).toBe(false)
    expect(composed.stores.runs).toBe(persistence.stores.runs)
    expect(composed.stores.messages).toBe(persistence.stores.messages)
  })
})
