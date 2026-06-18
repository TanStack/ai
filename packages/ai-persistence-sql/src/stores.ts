/**
 * One SQL implementation of every persistence store, written against the
 * minimal {@link SqlDriver}. Dialect differences are confined to placeholder
 * syntax ({@link param}) and column types (handled in migrations). JSON is
 * stored/read as TEXT and bytes as base64 TEXT for cross-dialect portability
 * (Postgres BIGINT comes back as a string, so numeric reads go through Number).
 */
import { param } from './driver'
import type { SqlDriver } from './driver'
import type {
  ApprovalRecord,
  ApprovalStore,
  ArtifactRecord,
  ArtifactStore,
  EventLog,
  MessageStore,
  PersistedEvent,
  RunRecord,
  RunStatus,
  RunStore,
} from '@tanstack/ai-persistence'
import type { ModelMessage, StreamChunk, TokenUsage } from '@tanstack/ai'

const num = (v: unknown): number => Number(v)
const str = (v: unknown): string => String(v)

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}
function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

export function createMessageStore(driver: SqlDriver): MessageStore {
  const p = (i: number) => param(driver.dialect, i)
  return {
    async loadThread(threadId) {
      const rows = await driver.query<{ messages: string }>(
        `SELECT messages FROM message_threads WHERE thread_id = ${p(1)}`,
        [threadId],
      )
      const row = rows[0]
      if (!row) return []
      return JSON.parse(row.messages) as Array<ModelMessage>
    },
    async saveThread(threadId, messages) {
      await driver.exec(
        `INSERT INTO message_threads (thread_id, messages) VALUES (${p(1)}, ${p(
          2,
        )}) ON CONFLICT (thread_id) DO UPDATE SET messages = ${p(3)}`,
        [threadId, JSON.stringify(messages), JSON.stringify(messages)],
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
        `INSERT INTO runs (run_id, thread_id, status, started_at) VALUES (${p(
          1,
        )}, ${p(2)}, ${p(3)}, ${p(4)}) ON CONFLICT (run_id) DO NOTHING`,
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
        sets.push(`usage = ${p(i++)}`)
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
        `SELECT * FROM runs WHERE run_id = ${p(1)}`,
        [runId],
      )
      const row = rows[0]
      return row ? mapRun(row) : null
    },
  }
}

export function createEventLog(driver: SqlDriver): EventLog {
  const p = (i: number) => param(driver.dialect, i)
  return {
    async append(runId, seq, event) {
      await driver.exec(
        `INSERT INTO run_events (run_id, seq, event) VALUES (${p(1)}, ${p(
          2,
        )}, ${p(3)}) ON CONFLICT (run_id, seq) DO NOTHING`,
        [runId, seq, JSON.stringify(event)],
      )
    },
    read(runId, opts) {
      const after = opts?.afterSeq
      const sql =
        after === undefined
          ? `SELECT seq, event FROM run_events WHERE run_id = ${p(
              1,
            )} ORDER BY seq ASC`
          : `SELECT seq, event FROM run_events WHERE run_id = ${p(
              1,
            )} AND seq > ${p(2)} ORDER BY seq ASC`
      const values = after === undefined ? [runId] : [runId, after]
      return (async function* (): AsyncIterable<PersistedEvent> {
        const rows = await driver.query<{ seq: number; event: string }>(
          sql,
          values,
        )
        for (const row of rows) {
          yield {
            seq: num(row.seq),
            event: JSON.parse(str(row.event)) as StreamChunk,
          }
        }
      })()
    },
    async hasRun(runId) {
      const rows = await driver.query(
        `SELECT 1 AS one FROM run_events WHERE run_id = ${p(1)} LIMIT 1`,
        [runId],
      )
      return rows.length > 0
    },
    async latestSeq(runId) {
      const rows = await driver.query<{ max_seq: number | null }>(
        `SELECT MAX(seq) AS max_seq FROM run_events WHERE run_id = ${p(1)}`,
        [runId],
      )
      const max = rows[0]?.max_seq
      return max == null ? 0 : num(max)
    },
  }
}

function mapApproval(row: Record<string, unknown>): ApprovalRecord {
  return {
    approvalId: str(row.approval_id),
    runId: str(row.run_id),
    threadId: str(row.thread_id),
    status: str(row.status) as ApprovalRecord['status'],
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
        `INSERT INTO approvals (approval_id, run_id, thread_id, status, requested_at, payload)
         VALUES (${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)})
         ON CONFLICT (approval_id) DO NOTHING`,
        [
          record.approvalId,
          record.runId,
          record.threadId,
          record.status,
          record.requestedAt,
          JSON.stringify(record.payload),
        ],
      )
    },
    async resolve(approvalId, granted) {
      await driver.exec(
        `UPDATE approvals SET status = ${p(1)}, resolved_at = ${p(
          2,
        )} WHERE approval_id = ${p(3)}`,
        [granted ? 'granted' : 'denied', Date.now(), approvalId],
      )
    },
    async get(approvalId) {
      const rows = await driver.query(
        `SELECT * FROM approvals WHERE approval_id = ${p(1)}`,
        [approvalId],
      )
      const row = rows[0]
      return row ? mapApproval(row) : null
    },
    async decisionsForThread(threadId) {
      const rows = await driver.query(
        `SELECT approval_id, status FROM approvals WHERE thread_id = ${p(
          1,
        )} AND status <> 'pending'`,
        [threadId],
      )
      const decisions = new Map<string, boolean>()
      for (const row of rows) {
        decisions.set(str(row.approval_id), str(row.status) === 'granted')
      }
      return decisions
    },
  }
}

function mapArtifact(row: Record<string, unknown>): ArtifactRecord {
  return {
    artifactId: str(row.artifact_id),
    runId: str(row.run_id),
    threadId: str(row.thread_id),
    name: str(row.name),
    mimeType: str(row.mime_type),
    size: num(row.size),
    ...(row.bytes_b64 != null ? { bytes: fromBase64(str(row.bytes_b64)) } : {}),
    ...(row.external_url != null ? { externalUrl: str(row.external_url) } : {}),
    createdAt: num(row.created_at),
  }
}

export function createArtifactStore(driver: SqlDriver): ArtifactStore {
  const p = (i: number) => param(driver.dialect, i)
  return {
    async save(record) {
      await driver.exec(
        `INSERT INTO artifacts (artifact_id, run_id, thread_id, name, mime_type, size, bytes_b64, external_url, created_at)
         VALUES (${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}, ${p(
           7,
         )}, ${p(8)}, ${p(9)})
         ON CONFLICT (artifact_id) DO NOTHING`,
        [
          record.artifactId,
          record.runId,
          record.threadId,
          record.name,
          record.mimeType,
          record.size,
          record.bytes ? toBase64(record.bytes) : null,
          record.externalUrl ?? null,
          record.createdAt,
        ],
      )
    },
    async get(artifactId) {
      const rows = await driver.query(
        `SELECT * FROM artifacts WHERE artifact_id = ${p(1)}`,
        [artifactId],
      )
      const row = rows[0]
      return row ? mapArtifact(row) : null
    },
    async list(runId) {
      const rows = await driver.query(
        `SELECT * FROM artifacts WHERE run_id = ${p(1)} ORDER BY created_at ASC`,
        [runId],
      )
      return rows.map(mapArtifact)
    },
  }
}
