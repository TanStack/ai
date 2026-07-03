/**
 * SQL implementations for the small durable persistence primitives. Dialect
 * differences stay in placeholder syntax; JSON payloads are stored as TEXT for
 * portability across SQLite, Postgres, D1, Drizzle, and Prisma raw drivers.
 */
import { AppendConflictError } from '@tanstack/ai-persistence'
import {
  identifier,
  insertDoNothingPrefix,
  insertDoNothingSuffix,
  param,
  upsertUpdateSuffix,
} from './driver'
import type {
  ApprovalRecord,
  ApprovalStore,
  InternalEventStore,
  InterruptRecord,
  InterruptStore,
  MessageStore,
  MetadataStore,
  PersistedInternalEvent,
  PersistedPublicEvent,
  PublicEventStore,
  RunRecord,
  RunStatus,
  RunStore,
} from '@tanstack/ai-persistence'
import type { ModelMessage, StreamChunk, TokenUsage } from '@tanstack/ai'
import type { SqlDriver } from './driver'

const num = (v: unknown): number => Number(v)
const str = (v: unknown): string => String(v)

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableJsonValue(item))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableJsonValue(item)]),
    )
  }
  return value
}

const sameJson = (a: unknown, b: unknown): boolean =>
  JSON.stringify(stableJsonValue(a)) === JSON.stringify(stableJsonValue(b))

function encodeCursor(...parts: Array<string | number>): string {
  return Buffer.from(parts.join(':'), 'utf8').toString('base64url')
}

export function createMessageStore(driver: SqlDriver): MessageStore {
  const p = (i: number) => param(driver.dialect, i)
  return {
    async loadThread(threadId) {
      const rows = await driver.query<{ messages: string }>(
        `SELECT messages FROM messages WHERE thread_id = ${p(1)}`,
        [threadId],
      )
      const row = rows[0]
      return row ? (JSON.parse(row.messages) as Array<ModelMessage>) : []
    },
    async saveThread(threadId, messages) {
      const serialized = JSON.stringify(messages)
      await driver.exec(
        `INSERT INTO messages (thread_id, messages) VALUES (${p(1)}, ${p(
          2,
        )})${upsertUpdateSuffix(
          driver.dialect,
          ['thread_id'],
          [`messages = ${p(3)}`],
        )}`,
        [threadId, serialized, serialized],
      )
    },
  }
}

function mapRun(row: Record<string, unknown>): RunRecord {
  return {
    runId: str(row.run_id),
    threadId: str(row.thread_id),
    status: str(row.status) as RunStatus,
    startedAt: num(row.started_at),
    ...(row.finished_at != null ? { finishedAt: num(row.finished_at) } : {}),
    ...(row.error != null ? { error: str(row.error) } : {}),
    ...(row.usage != null
      ? { usage: JSON.parse(str(row.usage)) as TokenUsage }
      : {}),
  }
}

export function createRunStore(driver: SqlDriver): RunStore {
  const p = (i: number) => param(driver.dialect, i)
  const usageKey = identifier(driver.dialect, 'usage')
  const runColumns = [
    'run_id',
    'thread_id',
    'status',
    'started_at',
    'finished_at',
    'error',
    usageKey,
  ].join(', ')
  return {
    async createOrResume(input) {
      const existing = await this.get(input.runId)
      if (existing) return existing
      const record: RunRecord = {
        runId: input.runId,
        threadId: input.threadId,
        status: input.status ?? 'running',
        startedAt: input.startedAt,
      }
      await driver.exec(
        `${insertDoNothingPrefix(
          driver.dialect,
        )} runs (run_id, thread_id, status, started_at) VALUES (${p(
          1,
        )}, ${p(2)}, ${p(3)}, ${p(4)})${insertDoNothingSuffix(driver.dialect, [
          'run_id',
        ])}`,
        [record.runId, record.threadId, record.status, record.startedAt],
      )
      return (await this.get(input.runId)) ?? record
    },
    async update(runId, patch) {
      const sets: Array<string> = []
      const values: Array<unknown> = []
      let i = 1
      if (patch.status !== undefined) {
        sets.push(`status = ${p(i++)}`)
        values.push(patch.status)
      }
      if (patch.finishedAt !== undefined) {
        sets.push(`finished_at = ${p(i++)}`)
        values.push(patch.finishedAt)
      }
      if (patch.error !== undefined) {
        sets.push(`error = ${p(i++)}`)
        values.push(patch.error)
      }
      if (patch.usage !== undefined) {
        sets.push(`${usageKey} = ${p(i++)}`)
        values.push(JSON.stringify(patch.usage))
      }
      if (!sets.length) return
      values.push(runId)
      await driver.exec(
        `UPDATE runs SET ${sets.join(', ')} WHERE run_id = ${p(i)}`,
        values,
      )
    },
    async get(runId) {
      const rows = await driver.query(
        `SELECT ${runColumns} FROM runs WHERE run_id = ${p(1)}`,
        [runId],
      )
      const row = rows[0]
      return row ? mapRun(row) : null
    },
  }
}

function publicEventFromRow(
  runId: string,
  row: { seq: number; event: string },
): PersistedPublicEvent {
  const seq = num(row.seq)
  return {
    seq,
    event: JSON.parse(str(row.event)) as StreamChunk,
    cursor: encodeCursor(seq, runId),
  }
}

export function createEventLog(driver: SqlDriver): PublicEventStore {
  const p = (i: number) => param(driver.dialect, i)
  async function readAt(
    tx: SqlDriver,
    runId: string,
    seq: number,
  ): Promise<PersistedPublicEvent | null> {
    const rows = await tx.query<{ seq: number; event: string }>(
      `SELECT seq, event FROM public_events WHERE run_id = ${p(
        1,
      )} AND seq = ${p(2)}`,
      [runId, seq],
    )
    const row = rows[0]
    return row ? publicEventFromRow(runId, row) : null
  }
  async function latest(tx: SqlDriver, runId: string): Promise<number> {
    const rows = await tx.query<{ max_seq: number | null }>(
      `SELECT MAX(seq) AS max_seq FROM public_events WHERE run_id = ${p(1)}`,
      [runId],
    )
    const max = rows[0]?.max_seq
    return max == null ? 0 : num(max)
  }
  return {
    append(input) {
      return driver.transaction(async (tx) => {
        const targetSeq = input.expectedSeq + 1
        const existingAtTarget = await readAt(tx, input.runId, targetSeq)
        if (existingAtTarget) {
          if (sameJson(existingAtTarget.event, input.event)) {
            return existingAtTarget
          }
          throw new AppendConflictError(
            `Public event append conflict for run ${input.runId} at seq ${targetSeq}`,
          )
        }

        const current = await latest(tx, input.runId)
        if (current !== input.expectedSeq) {
          throw new AppendConflictError(
            `Public event append conflict for run ${input.runId}: expected latest seq ${input.expectedSeq}, got ${current}`,
          )
        }

        await tx.exec(
          `${insertDoNothingPrefix(
            tx.dialect,
          )} public_events (run_id, seq, event) VALUES (${p(
            1,
          )}, ${p(2)}, ${p(3)})${insertDoNothingSuffix(tx.dialect, [
            'run_id',
            'seq',
          ])}`,
          [input.runId, targetSeq, JSON.stringify(input.event)],
        )
        const persisted = await readAt(tx, input.runId, targetSeq)
        if (!persisted || !sameJson(persisted.event, input.event)) {
          throw new AppendConflictError(
            `Public event append conflict for run ${input.runId} at seq ${targetSeq}`,
          )
        }
        return persisted
      })
    },
    read(runId, opts) {
      const after = opts?.afterSeq
      const sql =
        after === undefined
          ? `SELECT seq, event FROM public_events WHERE run_id = ${p(
              1,
            )} ORDER BY seq ASC`
          : `SELECT seq, event FROM public_events WHERE run_id = ${p(
              1,
            )} AND seq > ${p(2)} ORDER BY seq ASC`
      const values = after === undefined ? [runId] : [runId, after]
      return (async function* (): AsyncIterable<PersistedPublicEvent> {
        const rows = await driver.query<{ seq: number; event: string }>(
          sql,
          values,
        )
        for (const row of rows) yield publicEventFromRow(runId, row)
      })()
    },
    async hasRun(runId) {
      const rows = await driver.query(
        `SELECT 1 AS one FROM public_events WHERE run_id = ${p(1)} LIMIT 1`,
        [runId],
      )
      return rows.length > 0
    },
    latestSeq(runId) {
      return latest(driver, runId)
    },
  }
}

export type LegacyEventLog = Omit<PublicEventStore, 'append'> & {
  append: {
    (runId: string, seq: number, event: StreamChunk): Promise<void>
    (input: {
      runId: string
      expectedSeq: number
      event: StreamChunk
    }): Promise<PersistedPublicEvent>
  }
}

export function createLegacyEventLog(driver: SqlDriver): LegacyEventLog {
  const store = createEventLog(driver)
  const p = (i: number) => param(driver.dialect, i)
  function append(runId: string, seq: number, event: StreamChunk): Promise<void>
  function append(input: {
    runId: string
    expectedSeq: number
    event: StreamChunk
  }): Promise<PersistedPublicEvent>
  async function append(
    inputOrRunId:
      | string
      | { runId: string; expectedSeq: number; event: StreamChunk },
    seq?: number,
    event?: StreamChunk,
  ): Promise<void | PersistedPublicEvent> {
    if (typeof inputOrRunId !== 'string') return store.append(inputOrRunId)
    if (seq === undefined || event === undefined) {
      throw new Error(`Legacy event append requires runId, seq, and event.`)
    }
    await driver.exec(
      `${insertDoNothingPrefix(
        driver.dialect,
      )} public_events (run_id, seq, event) VALUES (${p(
        1,
      )}, ${p(2)}, ${p(3)})${insertDoNothingSuffix(driver.dialect, [
        'run_id',
        'seq',
      ])}`,
      [inputOrRunId, seq, JSON.stringify(event)],
    )
  }
  return {
    append,
    read: store.read,
    hasRun: store.hasRun,
    latestSeq: store.latestSeq,
  }
}

function internalEventFromRow(
  runId: string,
  row: { seq: number; namespace: string; type: string; payload: string },
): PersistedInternalEvent {
  const seq = num(row.seq)
  const namespace = str(row.namespace)
  return {
    seq,
    namespace,
    type: str(row.type),
    payload: JSON.parse(str(row.payload)),
    cursor: encodeCursor(seq, runId, namespace),
  }
}

export function createInternalEventStore(
  driver: SqlDriver,
): InternalEventStore {
  const p = (i: number) => param(driver.dialect, i)
  async function readAt(
    tx: SqlDriver,
    runId: string,
    namespace: string,
    seq: number,
  ): Promise<PersistedInternalEvent | null> {
    const rows = await tx.query<{
      seq: number
      namespace: string
      type: string
      payload: string
    }>(
      `SELECT seq, namespace, type, payload FROM internal_events WHERE run_id = ${p(
        1,
      )} AND namespace = ${p(2)} AND seq = ${p(3)}`,
      [runId, namespace, seq],
    )
    const row = rows[0]
    return row ? internalEventFromRow(runId, row) : null
  }
  async function latest(
    tx: SqlDriver,
    runId: string,
    namespace?: string,
  ): Promise<number> {
    const sql =
      namespace === undefined
        ? `SELECT MAX(seq) AS max_seq FROM internal_events WHERE run_id = ${p(
            1,
          )}`
        : `SELECT MAX(seq) AS max_seq FROM internal_events WHERE run_id = ${p(
            1,
          )} AND namespace = ${p(2)}`
    const values = namespace === undefined ? [runId] : [runId, namespace]
    const rows = await tx.query<{ max_seq: number | null }>(sql, values)
    const max = rows[0]?.max_seq
    return max == null ? 0 : num(max)
  }
  return {
    append(input) {
      return driver.transaction(async (tx) => {
        const targetSeq = input.expectedSeq + 1
        const existingAtTarget = await readAt(
          tx,
          input.runId,
          input.namespace,
          targetSeq,
        )
        if (existingAtTarget) {
          if (
            existingAtTarget.type === input.type &&
            sameJson(existingAtTarget.payload, input.payload)
          ) {
            return existingAtTarget
          }
          throw new AppendConflictError(
            `Internal event append conflict for run ${input.runId}, namespace ${input.namespace}, seq ${targetSeq}`,
          )
        }

        const current = await latest(tx, input.runId, input.namespace)
        if (current !== input.expectedSeq) {
          throw new AppendConflictError(
            `Internal event append conflict for run ${input.runId}, namespace ${input.namespace}: expected latest seq ${input.expectedSeq}, got ${current}`,
          )
        }

        await tx.exec(
          `${insertDoNothingPrefix(
            tx.dialect,
          )} internal_events (run_id, namespace, seq, type, payload) VALUES (${p(
            1,
          )}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)})${insertDoNothingSuffix(
            tx.dialect,
            ['run_id', 'namespace', 'seq'],
          )}`,
          [
            input.runId,
            input.namespace,
            targetSeq,
            input.type,
            JSON.stringify(input.payload),
          ],
        )
        const persisted = await readAt(
          tx,
          input.runId,
          input.namespace,
          targetSeq,
        )
        if (
          !persisted ||
          persisted.type !== input.type ||
          !sameJson(persisted.payload, input.payload)
        ) {
          throw new AppendConflictError(
            `Internal event append conflict for run ${input.runId}, namespace ${input.namespace}, seq ${targetSeq}`,
          )
        }
        return persisted
      })
    },
    read(runId, opts) {
      const values: Array<unknown> = [runId]
      const filters = [`run_id = ${p(1)}`]
      let i = 2
      if (opts?.namespace !== undefined) {
        filters.push(`namespace = ${p(i++)}`)
        values.push(opts.namespace)
      }
      if (opts?.afterSeq !== undefined) {
        filters.push(`seq > ${p(i++)}`)
        values.push(opts.afterSeq)
      }
      const sql = `SELECT seq, namespace, type, payload FROM internal_events WHERE ${filters.join(
        ' AND ',
      )} ORDER BY namespace ASC, seq ASC`
      return (async function* (): AsyncIterable<PersistedInternalEvent> {
        const rows = await driver.query<{
          seq: number
          namespace: string
          type: string
          payload: string
        }>(sql, values)
        for (const row of rows) yield internalEventFromRow(runId, row)
      })()
    },
    latestSeq(runId, namespace) {
      return latest(driver, runId, namespace)
    },
  }
}

function mapInterrupt(row: Record<string, unknown>): InterruptRecord {
  return {
    interruptId: str(row.interrupt_id),
    runId: str(row.run_id),
    threadId: str(row.thread_id),
    status: str(row.status) as InterruptRecord['status'],
    requestedAt: num(row.requested_at),
    ...(row.resolved_at != null ? { resolvedAt: num(row.resolved_at) } : {}),
    payload: JSON.parse(str(row.payload)) as Record<string, unknown>,
    ...(row.response != null
      ? { response: JSON.parse(str(row.response)) }
      : {}),
  }
}

export function createInterruptStore(driver: SqlDriver): InterruptStore {
  const p = (i: number) => param(driver.dialect, i)
  return {
    async create(record) {
      await driver.exec(
        `${insertDoNothingPrefix(
          driver.dialect,
        )} interrupts (interrupt_id, run_id, thread_id, status, requested_at, payload, response)
         VALUES (${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}, ${p(7)})
         ${insertDoNothingSuffix(driver.dialect, ['interrupt_id'])}`,
        [
          record.interruptId,
          record.runId,
          record.threadId,
          record.status,
          record.requestedAt,
          JSON.stringify(record.payload),
          record.response === undefined
            ? null
            : JSON.stringify(record.response),
        ],
      )
    },
    async resolve(interruptId, response) {
      await driver.exec(
        `UPDATE interrupts SET status = ${p(1)}, resolved_at = ${p(
          2,
        )}, response = ${p(3)} WHERE interrupt_id = ${p(4)}`,
        [
          'resolved',
          Date.now(),
          response === undefined ? null : JSON.stringify(response),
          interruptId,
        ],
      )
    },
    async cancel(interruptId) {
      await driver.exec(
        `UPDATE interrupts SET status = ${p(1)}, resolved_at = ${p(
          2,
        )} WHERE interrupt_id = ${p(3)}`,
        ['cancelled', Date.now(), interruptId],
      )
    },
    async get(interruptId) {
      const rows = await driver.query(
        `SELECT * FROM interrupts WHERE interrupt_id = ${p(1)}`,
        [interruptId],
      )
      const row = rows[0]
      return row ? mapInterrupt(row) : null
    },
    async list(threadId) {
      const rows = await driver.query(
        `SELECT * FROM interrupts WHERE thread_id = ${p(
          1,
        )} ORDER BY requested_at ASC`,
        [threadId],
      )
      return rows.map(mapInterrupt)
    },
    async listPending(threadId) {
      const rows = await driver.query(
        `SELECT * FROM interrupts WHERE thread_id = ${p(
          1,
        )} AND status = 'pending' ORDER BY requested_at ASC`,
        [threadId],
      )
      return rows.map(mapInterrupt)
    },
    async listByRun(runId) {
      const rows = await driver.query(
        `SELECT * FROM interrupts WHERE run_id = ${p(
          1,
        )} ORDER BY requested_at ASC`,
        [runId],
      )
      return rows.map(mapInterrupt)
    },
    async listPendingByRun(runId) {
      const rows = await driver.query(
        `SELECT * FROM interrupts WHERE run_id = ${p(
          1,
        )} AND status = 'pending' ORDER BY requested_at ASC`,
        [runId],
      )
      return rows.map(mapInterrupt)
    },
  }
}

function mapApproval(row: Record<string, unknown>): ApprovalRecord {
  const status = str(row.status)
  return {
    approvalId: str(row.interrupt_id),
    runId: str(row.run_id),
    threadId: str(row.thread_id),
    status:
      status === 'resolved'
        ? 'granted'
        : status === 'cancelled'
          ? 'denied'
          : 'pending',
    requestedAt: num(row.requested_at),
    ...(row.resolved_at != null ? { resolvedAt: num(row.resolved_at) } : {}),
    payload: JSON.parse(str(row.payload)) as Record<string, unknown>,
  }
}

export function createApprovalStore(driver: SqlDriver): ApprovalStore {
  const p = (i: number) => param(driver.dialect, i)
  return {
    async create(record) {
      await driver.exec(
        `${insertDoNothingPrefix(
          driver.dialect,
        )} interrupts (interrupt_id, run_id, thread_id, status, requested_at, payload, response)
         VALUES (${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}, ${p(7)})
         ${insertDoNothingSuffix(driver.dialect, ['interrupt_id'])}`,
        [
          record.approvalId,
          record.runId,
          record.threadId,
          record.status === 'pending'
            ? 'pending'
            : record.status === 'granted'
              ? 'resolved'
              : 'cancelled',
          record.requestedAt,
          JSON.stringify({ ...record.payload, compatibility: 'approval' }),
          null,
        ],
      )
    },
    async resolve(approvalId, granted) {
      await driver.exec(
        `UPDATE interrupts SET status = ${p(1)}, resolved_at = ${p(
          2,
        )} WHERE interrupt_id = ${p(3)}`,
        [granted ? 'resolved' : 'cancelled', Date.now(), approvalId],
      )
    },
    async get(approvalId) {
      const rows = await driver.query(
        `SELECT * FROM interrupts WHERE interrupt_id = ${p(1)}`,
        [approvalId],
      )
      const row = rows[0]
      return row ? mapApproval(row) : null
    },
    async decisionsForThread(threadId) {
      const rows = await driver.query(
        `SELECT interrupt_id, status, payload FROM interrupts WHERE thread_id = ${p(
          1,
        )} AND status <> 'pending'`,
        [threadId],
      )
      const decisions = new Map<string, boolean>()
      for (const row of rows) {
        const payload = JSON.parse(str(row.payload)) as Record<string, unknown>
        if (payload.compatibility !== 'approval') continue
        decisions.set(str(row.interrupt_id), str(row.status) === 'resolved')
      }
      return decisions
    },
  }
}

export function createMetadataStore(driver: SqlDriver): MetadataStore {
  const p = (i: number) => param(driver.dialect, i)
  const metadataKey = identifier(driver.dialect, 'key')
  return {
    async get(scope, key) {
      const rows = await driver.query<{ value: string }>(
        `SELECT value FROM metadata WHERE scope = ${p(
          1,
        )} AND ${metadataKey} = ${p(2)}`,
        [scope, key],
      )
      const row = rows[0]
      return row ? JSON.parse(str(row.value)) : null
    },
    async set(scope, key, value) {
      const serialized = JSON.stringify(value)
      await driver.exec(
        `INSERT INTO metadata (scope, ${metadataKey}, value) VALUES (${p(
          1,
        )}, ${p(2)}, ${p(3)})${upsertUpdateSuffix(
          driver.dialect,
          ['scope', metadataKey],
          [`value = ${p(4)}`],
        )}`,
        [scope, key, serialized, serialized],
      )
    },
    async delete(scope, key) {
      await driver.exec(
        `DELETE FROM metadata WHERE scope = ${p(
          1,
        )} AND ${metadataKey} = ${p(2)}`,
        [scope, key],
      )
    },
  }
}
