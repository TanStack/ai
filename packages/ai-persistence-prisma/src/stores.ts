/**
 * AIPersistence store implementations over a Prisma `PrismaClient`.
 *
 * Each method mirrors the reference in-memory backend
 * (`@tanstack/ai-persistence`'s `memory.ts`) and the sibling Drizzle backend
 * (`@tanstack/ai-persistence-drizzle`'s `stores.ts`), including the
 * insert-if-absent `InterruptStore.create` and `RunStore.createOrResume`
 * semantics (`upsert` with an empty `update`). JSON-valued columns use
 * provider-neutral Prisma `String` fields, so they are serialized with
 * `JSON.stringify`/`JSON.parse` here.
 */
import type {
  InterruptRow,
  RunRow,
  TanstackAiDelegates,
} from './model-contract'
import type { ModelMessage } from '@tanstack/ai'
import type {
  InterruptRecord,
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunRecord,
  RunStatus,
  RunStore,
} from '@tanstack/ai-persistence'

export function createMessageStore({
  message,
}: TanstackAiDelegates): MessageStore {
  return {
    async loadThread(threadId) {
      const row = await message.findUnique({ where: { threadId } })
      if (!row) return []
      return JSON.parse(row.messagesJson) as Array<ModelMessage>
    },
    async saveThread(threadId, msgs: Array<ModelMessage>) {
      const messagesJson = JSON.stringify(msgs)
      await message.upsert({
        where: { threadId },
        create: { threadId, messagesJson },
        update: { messagesJson },
      })
    },
  }
}

function mapRun(row: RunRow): RunRecord {
  return {
    runId: row.runId,
    threadId: row.threadId,
    status: row.status as RunStatus,
    startedAt: Number(row.startedAt),
    ...(row.finishedAt != null ? { finishedAt: Number(row.finishedAt) } : {}),
    ...(row.error != null ? { error: row.error } : {}),
    ...(row.usageJson != null
      ? { usage: JSON.parse(row.usageJson) as RunRecord['usage'] }
      : {}),
  }
}

export function createRunStore({ run }: TanstackAiDelegates): RunStore {
  const store: RunStore = {
    async createOrResume(input) {
      const existing = await store.get(input.runId)
      if (existing) return existing
      const record: RunRecord = {
        runId: input.runId,
        threadId: input.threadId,
        status: input.status ?? 'running',
        startedAt: input.startedAt,
      }
      // Upsert with an empty update = insert-if-absent (never overwrites an
      // existing run), matching the reference createOrResume semantics.
      await run.upsert({
        where: { runId: record.runId },
        create: {
          runId: record.runId,
          threadId: record.threadId,
          status: record.status,
          startedAt: BigInt(record.startedAt),
        },
        update: {},
      })
      return (await store.get(input.runId)) ?? record
    },
    async update(runId, patch) {
      const data: {
        status?: RunStatus
        finishedAt?: bigint
        error?: string
        usageJson?: string
      } = {}
      if (patch.status !== undefined) data.status = patch.status
      if (patch.finishedAt !== undefined)
        data.finishedAt = BigInt(patch.finishedAt)
      if (patch.error !== undefined) data.error = patch.error
      if (patch.usage !== undefined)
        data.usageJson = JSON.stringify(patch.usage)
      if (Object.keys(data).length === 0) return
      // updateMany no-ops (does not throw) when the run does not exist.
      await run.updateMany({ where: { runId }, data })
    },
    async get(runId) {
      const row = await run.findUnique({ where: { runId } })
      return row ? mapRun(row) : null
    },
  }
  return store
}

function mapInterrupt(row: InterruptRow): InterruptRecord {
  return {
    interruptId: row.interruptId,
    runId: row.runId,
    threadId: row.threadId,
    status: row.status as InterruptRecord['status'],
    requestedAt: Number(row.requestedAt),
    ...(row.resolvedAt != null ? { resolvedAt: Number(row.resolvedAt) } : {}),
    payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
    ...(row.responseJson != null
      ? { response: JSON.parse(row.responseJson) as unknown }
      : {}),
  }
}

export function createInterruptStore({
  interrupt,
}: TanstackAiDelegates): InterruptStore {
  return {
    async create(record) {
      await interrupt.upsert({
        where: { interruptId: record.interruptId },
        create: {
          interruptId: record.interruptId,
          runId: record.runId,
          threadId: record.threadId,
          status: 'pending',
          requestedAt: BigInt(record.requestedAt),
          payloadJson: JSON.stringify(record.payload),
          responseJson:
            record.response == null ? null : JSON.stringify(record.response),
        },
        update: {},
      })
    },
    async resolve(interruptId, response) {
      await interrupt.updateMany({
        where: { interruptId },
        data: {
          status: 'resolved',
          resolvedAt: BigInt(Date.now()),
          responseJson: response == null ? null : JSON.stringify(response),
        },
      })
    },
    async cancel(interruptId) {
      await interrupt.updateMany({
        where: { interruptId },
        data: { status: 'cancelled', resolvedAt: BigInt(Date.now()) },
      })
    },
    async get(interruptId) {
      const row = await interrupt.findUnique({ where: { interruptId } })
      return row ? mapInterrupt(row) : null
    },
    async list(threadId) {
      const rows = await interrupt.findMany({
        where: { threadId },
        orderBy: { requestedAt: 'asc' },
      })
      return rows.map(mapInterrupt)
    },
    async listPending(threadId) {
      const rows = await interrupt.findMany({
        where: { threadId, status: 'pending' },
        orderBy: { requestedAt: 'asc' },
      })
      return rows.map(mapInterrupt)
    },
    async listByRun(runId) {
      const rows = await interrupt.findMany({
        where: { runId },
        orderBy: { requestedAt: 'asc' },
      })
      return rows.map(mapInterrupt)
    },
    async listPendingByRun(runId) {
      const rows = await interrupt.findMany({
        where: { runId, status: 'pending' },
        orderBy: { requestedAt: 'asc' },
      })
      return rows.map(mapInterrupt)
    },
  }
}

function assertStorableMetadata(value: unknown): void {
  if (value == null) {
    throw new TypeError(
      `TanStack AI metadata values must be defined, non-null JSON; received ${
        value === undefined ? '`undefined`' : '`null`'
      }. Use \`delete(scope, key)\` to clear a value.`,
    )
  }
}

export function createMetadataStore({
  metadata,
}: TanstackAiDelegates): MetadataStore {
  return {
    async get(scope, key) {
      const row = await metadata.findUnique({
        where: { scope_key: { scope, key } },
      })
      return row ? (JSON.parse(row.valueJson) as unknown) : null
    },
    async set(scope, key, value) {
      // SQL backends store JSON text in a NOT NULL column and cannot persist a
      // nullish value: `JSON.stringify(undefined)` is `undefined` (no string),
      // and the sibling Drizzle backend binds a JS `null` as SQL NULL — both
      // violate NOT NULL. Reject nullish with a clear error (consistent across
      // the SQL backends) instead of a cryptic driver failure. Unlike the
      // in-memory reference, which round-trips nullish; use `delete` to clear.
      assertStorableMetadata(value)
      const valueJson = JSON.stringify(value)
      await metadata.upsert({
        where: { scope_key: { scope, key } },
        create: { scope, key, valueJson },
        update: { valueJson },
      })
    },
    async delete(scope, key) {
      await metadata.deleteMany({ where: { scope, key } })
    },
  }
}
