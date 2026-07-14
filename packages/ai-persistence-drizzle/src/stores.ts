/**
 * AIPersistence store implementations over a Drizzle sqlite database.
 *
 * Each method mirrors the semantics of the reference in-memory backend
 * (`@tanstack/ai-persistence`'s `memory.ts`). JSON columns are handled by
 * Drizzle's `text({ mode: 'json' })`; blob bytes by `blob({ mode: 'buffer' })`.
 */
import {
  canonicalInterruptJson,
  canonicalizeInterruptResolutions,
  cloneAndDeepFreezeJson,
} from '@tanstack/ai'
import { and, asc, eq, gt, gte, lt } from 'drizzle-orm'
import {
  InterruptStoreCorruptionError,
  hasExactInterruptIds,
  projectInterruptRecovery,
} from '@tanstack/ai-persistence'
import {
  artifacts,
  blobs,
  interruptBatches,
  interrupts,
  messages,
  metadata,
  runs,
} from './schema'
import type { SQL } from 'drizzle-orm'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import type {
  InterruptBinding,
  InterruptRecoveryQuery,
  ModelMessage,
  RunAgentResumeItem,
} from '@tanstack/ai'
import type {
  ArtifactRecord,
  ArtifactStore,
  BlobBody,
  BlobListOptions,
  BlobListPage,
  BlobObject,
  BlobRecord,
  BlobStore,
  InterruptBatchRecord,
  InterruptRecord,
  InterruptStore,
  MessageStore,
  MetadataStore,
  RunRecord,
  RunStore,
} from '@tanstack/ai-persistence'

/**
 * Any Drizzle sqlite database (better-sqlite3, libsql, node:sqlite proxy, D1, …).
 *
 * Typed as the schema-agnostic slice of the query builder we actually use, so a
 * BYO `db` constructed with any `{ schema }` is assignable regardless of its
 * `TFullSchema` (which is invariant on the full `BaseSQLiteDatabase`).
 */
export type DrizzleDb = Pick<
  BaseSQLiteDatabase<'sync' | 'async', unknown>,
  'select' | 'insert' | 'update' | 'delete'
>

/** Required atomic transaction boundary for Drizzle interrupt operations. */
export interface DrizzleTransactionExecutor {
  transaction: <T>(work: () => Promise<T>) => Promise<T>
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/**
 * Smallest string strictly greater than every string that starts with `prefix`,
 * used as the exclusive upper bound of a literal prefix range scan. Increments
 * the last non-`U+FFFF` UTF-16 code unit (carrying over trailing `U+FFFF`s).
 * Returns `undefined` when no finite bound exists — an empty prefix, or a prefix
 * consisting solely of `U+FFFF` — in which case the caller omits the upper bound.
 */
function prefixUpperBound(prefix: string): string | undefined {
  let i = prefix.length - 1
  while (i >= 0 && prefix.charCodeAt(i) === 0xffff) i--
  if (i < 0) return undefined
  return prefix.slice(0, i) + String.fromCharCode(prefix.charCodeAt(i) + 1)
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength))
  copy.set(bytes)
  return copy
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

async function bytesFromStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader()
  const chunks: Array<Uint8Array> = []
  let total = 0
  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(copyBytes(value))
      total += value.byteLength
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(new ArrayBuffer(total))
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function bytesFromBlobBody(
  body: BlobBody,
): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof body === 'string') return textEncoder.encode(body)
  if (body instanceof ArrayBuffer) return new Uint8Array(body.slice(0))
  if (ArrayBuffer.isView(body)) {
    return copyBytes(
      new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
    )
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return new Uint8Array(await body.arrayBuffer())
  }
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    return bytesFromStream(body)
  }
  throw new TypeError('Unsupported blob body.')
}

export function createMessageStore(db: DrizzleDb): MessageStore {
  return {
    async loadThread(threadId) {
      const rows = await db
        .select({ messagesJson: messages.messagesJson })
        .from(messages)
        .where(eq(messages.threadId, threadId))
      return rows[0]?.messagesJson ?? []
    },
    async saveThread(threadId, msgs: Array<ModelMessage>) {
      await db
        .insert(messages)
        .values({ threadId, messagesJson: msgs })
        .onConflictDoUpdate({
          target: messages.threadId,
          set: { messagesJson: msgs },
        })
    },
  }
}

function mapRun(row: typeof runs.$inferSelect): RunRecord {
  return {
    runId: row.runId,
    threadId: row.threadId,
    status: row.status,
    startedAt: row.startedAt,
    ...(row.finishedAt != null ? { finishedAt: row.finishedAt } : {}),
    ...(row.error != null ? { error: row.error } : {}),
    ...(row.usageJson != null ? { usage: row.usageJson } : {}),
  }
}

export function createRunStore(db: DrizzleDb): RunStore {
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
      await db
        .insert(runs)
        .values({
          runId: record.runId,
          threadId: record.threadId,
          status: record.status,
          startedAt: record.startedAt,
        })
        .onConflictDoNothing({ target: runs.runId })
      return (await store.get(input.runId)) ?? record
    },
    async update(runId, patch) {
      const set: Partial<typeof runs.$inferInsert> = {}
      if (patch.status !== undefined) set.status = patch.status
      if (patch.finishedAt !== undefined) set.finishedAt = patch.finishedAt
      if (patch.error !== undefined) set.error = patch.error
      if (patch.usage !== undefined) set.usageJson = patch.usage
      if (Object.keys(set).length === 0) return
      await db.update(runs).set(set).where(eq(runs.runId, runId))
    },
    async get(runId) {
      const rows = await db.select().from(runs).where(eq(runs.runId, runId))
      const row = rows[0]
      return row ? mapRun(row) : null
    },
  }
  return store
}

function corrupt(message: string): never {
  throw new InterruptStoreCorruptionError(message)
}

function decodeBinding(
  value: unknown,
  correlation: {
    interruptId: string
    interruptedRunId: string
    generation: number
    responseSchemaHash: string
  },
): InterruptBinding {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('kind' in value) ||
    !('interruptId' in value) ||
    !('interruptedRunId' in value) ||
    !('generation' in value) ||
    !('responseSchemaHash' in value) ||
    typeof value.interruptId !== 'string' ||
    typeof value.interruptedRunId !== 'string' ||
    typeof value.generation !== 'number' ||
    typeof value.responseSchemaHash !== 'string'
  ) {
    return corrupt('Stored interrupt binding is malformed.')
  }
  const expiresAt = 'expiresAt' in value ? value.expiresAt : undefined
  if (
    expiresAt !== undefined &&
    (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt)))
  ) {
    return corrupt('Stored interrupt expiry is malformed.')
  }
  if (
    value.interruptId !== correlation.interruptId ||
    value.interruptedRunId !== correlation.interruptedRunId ||
    value.generation !== correlation.generation ||
    value.responseSchemaHash !== correlation.responseSchemaHash
  ) {
    return corrupt('Stored interrupt binding correlation is inconsistent.')
  }

  if (value.kind === 'generic') {
    return {
      kind: 'generic',
      interruptId: value.interruptId,
      interruptedRunId: value.interruptedRunId,
      generation: value.generation,
      responseSchemaHash: value.responseSchemaHash,
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    }
  }
  if (
    value.kind === 'client-tool-execution' &&
    'toolName' in value &&
    'toolCallId' in value &&
    'outputSchemaHash' in value &&
    typeof value.toolName === 'string' &&
    typeof value.toolCallId === 'string' &&
    typeof value.outputSchemaHash === 'string'
  ) {
    return {
      kind: 'client-tool-execution',
      interruptId: value.interruptId,
      interruptedRunId: value.interruptedRunId,
      generation: value.generation,
      toolName: value.toolName,
      toolCallId: value.toolCallId,
      outputSchemaHash: value.outputSchemaHash,
      responseSchemaHash: value.responseSchemaHash,
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    }
  }
  if (
    value.kind === 'tool-approval' &&
    'toolName' in value &&
    'toolCallId' in value &&
    'originalArgs' in value &&
    'inputSchemaHash' in value &&
    'approvalSchemaHash' in value &&
    typeof value.toolName === 'string' &&
    typeof value.toolCallId === 'string' &&
    typeof value.inputSchemaHash === 'string' &&
    typeof value.approvalSchemaHash === 'string'
  ) {
    return {
      kind: 'tool-approval',
      interruptId: value.interruptId,
      interruptedRunId: value.interruptedRunId,
      generation: value.generation,
      toolName: value.toolName,
      toolCallId: value.toolCallId,
      originalArgs: value.originalArgs,
      inputSchemaHash: value.inputSchemaHash,
      approvalSchemaHash: value.approvalSchemaHash,
      responseSchemaHash: value.responseSchemaHash,
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    }
  }
  return corrupt('Stored interrupt binding kind is malformed.')
}

function validateNativeDescriptor(value: unknown, interruptId: string): void {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('id' in value) ||
    !('reason' in value) ||
    value.id !== interruptId ||
    typeof value.reason !== 'string'
  ) {
    corrupt('Stored interrupt descriptor correlation is inconsistent.')
  }
}

function mapInterrupt(row: typeof interrupts.$inferSelect): InterruptRecord {
  const binding = decodeBinding(row.bindingJson, {
    interruptId: row.interruptId,
    interruptedRunId: row.runId,
    generation: row.generation,
    responseSchemaHash: row.responseSchemaHash,
  })
  if (row.generation > 0) {
    validateNativeDescriptor(row.payloadJson, row.interruptId)
  }
  return {
    interruptId: row.interruptId,
    runId: row.runId,
    threadId: row.threadId,
    generation: row.generation,
    status: row.status,
    requestedAt: row.requestedAt,
    ...(row.resolvedAt != null ? { resolvedAt: row.resolvedAt } : {}),
    payload: row.payloadJson,
    binding,
    ...(row.responseJson != null ? { response: row.responseJson } : {}),
  }
}

function decodeStringArray(value: unknown, field: string): Array<string> {
  if (!Array.isArray(value)) return corrupt(`Stored ${field} is malformed.`)
  const strings: Array<string> = []
  for (const item of value) {
    if (typeof item !== 'string') {
      return corrupt(`Stored ${field} is malformed.`)
    }
    strings.push(item)
  }
  if (!hasExactInterruptIds(strings, strings)) {
    return corrupt(`Stored ${field} contains duplicate IDs.`)
  }
  return strings
}

function decodeResolution(value: unknown): RunAgentResumeItem {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('interruptId' in value) ||
    !('status' in value) ||
    typeof value.interruptId !== 'string' ||
    (value.status !== 'resolved' && value.status !== 'cancelled')
  ) {
    return corrupt('Stored interrupt resolution is malformed.')
  }
  return {
    interruptId: value.interruptId,
    status: value.status,
    ...('payload' in value ? { payload: value.payload } : {}),
  }
}

function decodeResolutions(value: unknown): Array<RunAgentResumeItem> {
  if (!Array.isArray(value)) {
    return corrupt('Stored interrupt resolutions are malformed.')
  }
  return value.map(decodeResolution)
}

function mapInterruptBatch(
  row: typeof interruptBatches.$inferSelect,
): InterruptBatchRecord {
  const expectedInterruptIds = decodeStringArray(
    row.expectedInterruptIdsJson,
    'expected interrupt IDs',
  )
  const resolutions = decodeResolutions(row.resolutionsJson)
  const candidate = canonicalizeInterruptResolutions(resolutions)
  if (
    !hasExactInterruptIds(
      expectedInterruptIds,
      resolutions.map((resolution) => resolution.interruptId),
    ) ||
    candidate.fingerprint !== row.fingerprint ||
    candidate.canonicalResolutions !== row.canonicalResolutions
  ) {
    return corrupt('Stored interrupt batch identity is inconsistent.')
  }
  return {
    threadId: row.threadId,
    interruptedRunId: row.interruptedRunId,
    generation: row.generation,
    expectedInterruptIds,
    fingerprint: row.fingerprint,
    canonicalResolutions: row.canonicalResolutions,
    resolutions,
    continuationRunId: row.continuationRunId,
    committedAt: row.committedAt,
  }
}

export function createInterruptStore(
  db: DrizzleDb,
  transactionExecutor: DrizzleTransactionExecutor,
  clock: () => number = Date.now,
): InterruptStore {
  const rowsForRun = async (runId: string) =>
    (
      await db
        .select()
        .from(interrupts)
        .where(eq(interrupts.runId, runId))
        .orderBy(asc(interrupts.requestedAt), asc(interrupts.interruptId))
    ).map(mapInterrupt)

  const readBatch = async (
    interruptedRunId: string,
  ): Promise<InterruptBatchRecord | null> => {
    const rows = await db
      .select()
      .from(interruptBatches)
      .where(eq(interruptBatches.interruptedRunId, interruptedRunId))
    return rows[0] ? mapInterruptBatch(rows[0]) : null
  }

  const recovery = async (input: InterruptRecoveryQuery) => {
    const rows = (await rowsForRun(input.interruptedRunId)).filter(
      (row) => row.threadId === input.threadId,
    )
    const batch = await readBatch(input.interruptedRunId)
    const correlatedBatch = batch?.threadId === input.threadId ? batch : null
    const generations = new Set(rows.map((row) => row.generation))
    if (generations.size > 1) {
      return corrupt('Stored interrupt rows mix generations.')
    }
    if (
      correlatedBatch &&
      (rows.length === 0 ||
        rows.some(
          (row) =>
            row.generation !== correlatedBatch.generation ||
            row.runId !== correlatedBatch.interruptedRunId,
        ) ||
        !hasExactInterruptIds(
          correlatedBatch.expectedInterruptIds,
          rows.map((row) => row.interruptId),
        ))
    ) {
      return corrupt('Stored interrupt batch correlation is inconsistent.')
    }
    return projectInterruptRecovery({
      query: input,
      rows,
      batch: correlatedBatch,
      now: clock(),
      includeResolutions: true,
    })
  }

  const store: InterruptStore = {
    async create(record) {
      const generation = record.generation ?? 0
      const binding = decodeBinding(
        cloneAndDeepFreezeJson(
          record.binding ?? {
            kind: 'generic',
            interruptId: record.interruptId,
            interruptedRunId: record.runId,
            generation,
            responseSchemaHash: 'legacy:unknown',
          },
        ),
        {
          interruptId: record.interruptId,
          interruptedRunId: record.runId,
          generation,
          responseSchemaHash:
            record.binding?.responseSchemaHash ?? 'legacy:unknown',
        },
      )
      await db
        .insert(interrupts)
        .values({
          interruptId: record.interruptId,
          runId: record.runId,
          threadId: record.threadId,
          generation,
          status: record.status,
          requestedAt: record.requestedAt,
          payloadJson: cloneAndDeepFreezeJson(record.payload),
          bindingJson: binding,
          responseSchemaHash: binding.responseSchemaHash,
          responseJson: record.response ?? null,
        })
        .onConflictDoNothing({ target: interrupts.interruptId })
    },
    async resolve(interruptId, response) {
      const set: Partial<typeof interrupts.$inferInsert> = {
        status: 'resolved',
        resolvedAt: clock(),
      }
      if (response !== undefined) set.responseJson = response
      await db
        .update(interrupts)
        .set(set)
        .where(eq(interrupts.interruptId, interruptId))
    },
    async cancel(interruptId) {
      await db
        .update(interrupts)
        .set({ status: 'cancelled', resolvedAt: clock() })
        .where(eq(interrupts.interruptId, interruptId))
    },
    async get(interruptId) {
      const rows = await db
        .select()
        .from(interrupts)
        .where(eq(interrupts.interruptId, interruptId))
      const row = rows[0]
      return row ? mapInterrupt(row) : null
    },
    async list(threadId) {
      const rows = await db
        .select()
        .from(interrupts)
        .where(eq(interrupts.threadId, threadId))
        .orderBy(asc(interrupts.requestedAt))
      return rows.map(mapInterrupt)
    },
    async listPending(threadId) {
      const rows = await db
        .select()
        .from(interrupts)
        .where(
          and(
            eq(interrupts.threadId, threadId),
            eq(interrupts.status, 'pending'),
          ),
        )
        .orderBy(asc(interrupts.requestedAt))
      return rows.map(mapInterrupt)
    },
    async listByRun(runId) {
      return rowsForRun(runId)
    },
    async listPendingByRun(runId) {
      const rows = await db
        .select()
        .from(interrupts)
        .where(
          and(eq(interrupts.runId, runId), eq(interrupts.status, 'pending')),
        )
        .orderBy(asc(interrupts.requestedAt))
      return rows.map(mapInterrupt)
    },
    async openInterruptBatch(input) {
      const descriptors = cloneAndDeepFreezeJson(input.descriptors)
      const unopenedBindings = cloneAndDeepFreezeJson(input.bindings)
      const descriptorIds = descriptors.map((descriptor) => descriptor.id)
      const bindingIds = unopenedBindings.map((binding) => binding.interruptId)
      if (
        descriptorIds.length === 0 ||
        !hasExactInterruptIds(descriptorIds, bindingIds)
      ) {
        throw new TypeError(
          'Interrupt descriptors and bindings must contain the same exact nonempty IDs.',
        )
      }
      for (const descriptor of descriptors) {
        validateNativeDescriptor(descriptor, descriptor.id)
      }

      return transactionExecutor.transaction(async () => {
        if (await readBatch(input.interruptedRunId)) {
          throw new Error('Cannot reopen a committed interrupt batch.')
        }
        const existing = await rowsForRun(input.interruptedRunId)
        if (existing.length > 0) {
          const generation = existing[0]?.generation
          const requestedBindings = unopenedBindings
            .map((binding) => ({
              ...binding,
              interruptedRunId: input.interruptedRunId,
              generation,
            }))
            .sort((left, right) =>
              left.interruptId.localeCompare(right.interruptId),
            )
          const existingBindings = existing
            .map((row) => row.binding)
            .sort((left, right) =>
              left.interruptId.localeCompare(right.interruptId),
            )
          const existingDescriptors = existing
            .map((row) => row.payload)
            .sort((left, right) => {
              if (
                left !== null &&
                typeof left === 'object' &&
                'id' in left &&
                typeof left.id === 'string' &&
                right !== null &&
                typeof right === 'object' &&
                'id' in right &&
                typeof right.id === 'string'
              ) {
                return left.id.localeCompare(right.id)
              }
              return 0
            })
          const requestedDescriptors = [...descriptors].sort((left, right) =>
            left.id.localeCompare(right.id),
          )
          if (
            generation !== undefined &&
            existing.every(
              (row) =>
                row.threadId === input.threadId &&
                row.generation === generation &&
                row.status === 'pending',
            ) &&
            hasExactInterruptIds(
              descriptorIds,
              existing.map((row) => row.interruptId),
            ) &&
            canonicalInterruptJson(existingDescriptors) ===
              canonicalInterruptJson(requestedDescriptors) &&
            canonicalInterruptJson(existingBindings) ===
              canonicalInterruptJson(requestedBindings)
          ) {
            return { generation, descriptors }
          }
          throw new Error('An incompatible interrupt batch is already open.')
        }

        const generation = 1
        const byId = new Map(
          unopenedBindings.map((binding) => [binding.interruptId, binding]),
        )
        const requestedAt = clock()
        const values: Array<typeof interrupts.$inferInsert> = []
        for (const descriptor of descriptors) {
          const unopened = byId.get(descriptor.id)
          if (!unopened) {
            throw new Error(`Missing binding for interrupt: ${descriptor.id}`)
          }
          const proposedBinding = cloneAndDeepFreezeJson({
            ...unopened,
            interruptedRunId: input.interruptedRunId,
            generation,
          })
          const binding = decodeBinding(proposedBinding, {
            interruptId: descriptor.id,
            interruptedRunId: input.interruptedRunId,
            generation,
            responseSchemaHash: proposedBinding.responseSchemaHash,
          })
          values.push({
            interruptId: descriptor.id,
            runId: input.interruptedRunId,
            threadId: input.threadId,
            generation,
            status: 'pending',
            requestedAt,
            payloadJson: descriptor,
            bindingJson: binding,
            responseSchemaHash: binding.responseSchemaHash,
          })
        }
        await db.insert(interrupts).values(values).onConflictDoNothing()
        const inserted = await rowsForRun(input.interruptedRunId)
        if (
          !hasExactInterruptIds(
            descriptorIds,
            inserted.map((row) => row.interruptId),
          ) ||
          inserted.some(
            (row) =>
              row.threadId !== input.threadId ||
              row.generation !== generation ||
              row.status !== 'pending',
          )
        ) {
          throw new Error('Interrupt IDs conflict with an existing batch.')
        }
        return { generation, descriptors }
      })
    },
    async commitInterruptResolutions(input) {
      return transactionExecutor.transaction(async () => {
        const candidate = canonicalizeInterruptResolutions(input.resolutions)
        if (
          candidate.fingerprint !== input.fingerprint ||
          candidate.canonicalResolutions !== input.canonicalResolutions
        ) {
          throw new TypeError(
            'Interrupt batch identity does not match its resolutions.',
          )
        }

        const existingWinner = await readBatch(input.interruptedRunId)
        if (existingWinner) {
          return existingWinner.threadId === input.threadId &&
            existingWinner.fingerprint === input.fingerprint &&
            existingWinner.canonicalResolutions === input.canonicalResolutions
            ? {
                status: 'replayed',
                continuationRunId: existingWinner.continuationRunId,
              }
            : {
                status: 'conflict',
                authoritativeState: await recovery({
                  threadId: input.threadId,
                  interruptedRunId: input.interruptedRunId,
                  knownGeneration: input.expectedGeneration,
                }),
              }
        }

        const pending = (await rowsForRun(input.interruptedRunId)).filter(
          (row) => row.status === 'pending',
        )
        const resolutionIds = candidate.resolutions.map(
          (resolution) => resolution.interruptId,
        )
        if (
          !hasExactInterruptIds(
            input.expectedInterruptIds,
            pending.map((row) => row.interruptId),
          ) ||
          !hasExactInterruptIds(input.expectedInterruptIds, resolutionIds) ||
          pending.some(
            (row) =>
              row.threadId !== input.threadId ||
              row.generation !== input.expectedGeneration ||
              (row.binding.expiresAt !== undefined &&
                Date.parse(row.binding.expiresAt) <= clock()),
          )
        ) {
          return {
            status: 'conflict',
            authoritativeState: await recovery({
              threadId: input.threadId,
              interruptedRunId: input.interruptedRunId,
              knownGeneration: input.expectedGeneration,
            }),
          }
        }

        const committedAt = clock()
        await db
          .insert(interruptBatches)
          .values({
            interruptedRunId: input.interruptedRunId,
            threadId: input.threadId,
            generation: input.expectedGeneration,
            expectedInterruptIdsJson: cloneAndDeepFreezeJson(
              input.expectedInterruptIds,
            ),
            fingerprint: candidate.fingerprint,
            canonicalResolutions: candidate.canonicalResolutions,
            resolutionsJson: candidate.resolutions,
            continuationRunId: input.continuationRunId,
            committedAt,
          })
          .onConflictDoNothing({ target: interruptBatches.interruptedRunId })

        const winner = await readBatch(input.interruptedRunId)
        if (!winner) {
          return corrupt('Interrupt winner insert did not persist a row.')
        }
        if (
          winner.threadId !== input.threadId ||
          winner.fingerprint !== input.fingerprint ||
          winner.canonicalResolutions !== input.canonicalResolutions
        ) {
          return {
            status: 'conflict',
            authoritativeState: await recovery({
              threadId: input.threadId,
              interruptedRunId: input.interruptedRunId,
              knownGeneration: input.expectedGeneration,
            }),
          }
        }
        if (winner.continuationRunId !== input.continuationRunId) {
          return {
            status: 'replayed',
            continuationRunId: winner.continuationRunId,
          }
        }

        for (const resolution of candidate.resolutions) {
          const status =
            resolution.status === 'cancelled' ? 'cancelled' : 'resolved'
          await db
            .update(interrupts)
            .set({
              status,
              resolvedAt: committedAt,
              responseJson: resolution,
            })
            .where(
              and(
                eq(interrupts.interruptId, resolution.interruptId),
                eq(interrupts.runId, input.interruptedRunId),
                eq(interrupts.threadId, input.threadId),
                eq(interrupts.generation, input.expectedGeneration),
                eq(interrupts.status, 'pending'),
              ),
            )
          const transitioned = await store.get(resolution.interruptId)
          if (
            !transitioned ||
            transitioned.status !== status ||
            transitioned.resolvedAt !== committedAt ||
            canonicalInterruptJson(transitioned.response) !==
              canonicalInterruptJson(resolution)
          ) {
            throw new Error(
              `Pending interrupt changed: ${resolution.interruptId}`,
            )
          }
        }
        return {
          status: 'committed',
          continuationRunId: input.continuationRunId,
        }
      })
    },
    async getInterruptRecoveryState(input) {
      return transactionExecutor.transaction(() => recovery(input))
    },
  }
  return store
}

export function createMetadataStore(db: DrizzleDb): MetadataStore {
  return {
    async get(scope, key) {
      const rows = await db
        .select({ valueJson: metadata.valueJson })
        .from(metadata)
        .where(and(eq(metadata.scope, scope), eq(metadata.key, key)))
      const row = rows[0]
      return row ? row.valueJson : null
    },
    async set(scope, key, value) {
      await db
        .insert(metadata)
        .values({ scope, key, valueJson: value })
        .onConflictDoUpdate({
          target: [metadata.scope, metadata.key],
          set: { valueJson: value },
        })
    },
    async delete(scope, key) {
      await db
        .delete(metadata)
        .where(and(eq(metadata.scope, scope), eq(metadata.key, key)))
    },
  }
}

function mapArtifact(row: typeof artifacts.$inferSelect): ArtifactRecord {
  return {
    artifactId: row.artifactId,
    runId: row.runId,
    threadId: row.threadId,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
    ...(row.externalUrl != null ? { externalUrl: row.externalUrl } : {}),
    createdAt: row.createdAt,
  }
}

export function createArtifactStore(db: DrizzleDb): ArtifactStore {
  return {
    async save(record) {
      const values = {
        artifactId: record.artifactId,
        runId: record.runId,
        threadId: record.threadId,
        name: record.name,
        mimeType: record.mimeType,
        size: record.size,
        externalUrl: record.externalUrl ?? null,
        createdAt: record.createdAt,
      }
      await db
        .insert(artifacts)
        .values(values)
        .onConflictDoUpdate({
          target: artifacts.artifactId,
          set: {
            runId: values.runId,
            threadId: values.threadId,
            name: values.name,
            mimeType: values.mimeType,
            size: values.size,
            externalUrl: values.externalUrl,
            createdAt: values.createdAt,
          },
        })
    },
    async get(artifactId) {
      const rows = await db
        .select()
        .from(artifacts)
        .where(eq(artifacts.artifactId, artifactId))
      const row = rows[0]
      return row ? mapArtifact(row) : null
    },
    async list(runId) {
      const rows = await db
        .select()
        .from(artifacts)
        .where(eq(artifacts.runId, runId))
        .orderBy(asc(artifacts.createdAt), asc(artifacts.artifactId))
      return rows.map(mapArtifact)
    },
    async delete(artifactId) {
      await db.delete(artifacts).where(eq(artifacts.artifactId, artifactId))
    },
    async deleteForRun(runId) {
      await db.delete(artifacts).where(eq(artifacts.runId, runId))
    },
  }
}

function blobRecordSnapshot(row: typeof blobs.$inferSelect): BlobRecord {
  return {
    key: row.key,
    ...(row.size != null ? { size: row.size } : {}),
    ...(row.etag != null ? { etag: row.etag } : {}),
    ...(row.contentType != null ? { contentType: row.contentType } : {}),
    ...(row.customMetadataJson != null
      ? { customMetadata: { ...row.customMetadataJson } }
      : {}),
    ...(row.createdAt != null ? { createdAt: row.createdAt } : {}),
    ...(row.updatedAt != null ? { updatedAt: row.updatedAt } : {}),
  }
}

function blobObject(row: typeof blobs.$inferSelect): BlobObject {
  const bytes = row.body
    ? copyBytes(new Uint8Array(row.body))
    : new Uint8Array()
  return {
    ...blobRecordSnapshot(row),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(copyBytes(bytes))
        controller.close()
      },
    }),
    arrayBuffer: () => Promise.resolve(bytesToArrayBuffer(bytes)),
    text: () => Promise.resolve(textDecoder.decode(bytes)),
  }
}

export function createBlobStore(db: DrizzleDb): BlobStore {
  const readRow = async (key: string) => {
    const rows = await db.select().from(blobs).where(eq(blobs.key, key))
    return rows[0] ?? null
  }
  return {
    async put(key, body, options) {
      const bytes = await bytesFromBlobBody(body)
      const existing = await readRow(key)
      const now = Date.now()
      const contentType =
        options?.contentType ??
        (typeof Blob !== 'undefined' && body instanceof Blob
          ? body.type || undefined
          : undefined)
      const customMetadata = options?.customMetadata
        ? { ...options.customMetadata }
        : undefined
      const record = {
        key,
        contentType: contentType ?? null,
        size: bytes.byteLength,
        etag: crypto.randomUUID(),
        customMetadataJson: customMetadata ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        body: bytes,
      }
      await db
        .insert(blobs)
        .values(record)
        .onConflictDoUpdate({
          target: blobs.key,
          set: {
            contentType: record.contentType,
            size: record.size,
            etag: record.etag,
            customMetadataJson: record.customMetadataJson,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            body: record.body,
          },
        })
      const stored = await readRow(key)
      return stored ? blobRecordSnapshot(stored) : blobRecordSnapshot(record)
    },
    async get(key) {
      const row = await readRow(key)
      return row ? blobObject(row) : null
    },
    async head(key) {
      const row = await readRow(key)
      return row ? blobRecordSnapshot(row) : null
    },
    async delete(key) {
      await db.delete(blobs).where(eq(blobs.key, key))
    },
    async list(options?: BlobListOptions): Promise<BlobListPage> {
      const limit = options?.limit
      if (limit === 0) return { objects: [], truncated: false }
      const prefix = options?.prefix ?? ''
      // Match the prefix LITERALLY and case-sensitively to mirror the reference
      // in-memory backend's `key.startsWith(prefix)`. A SQL `LIKE '${prefix}%'`
      // would treat `_`/`%` in the caller's prefix as wildcards and, on SQLite,
      // match case-insensitively for ASCII. Instead use a half-open range on the
      // (BINARY-collated) key column: `key >= prefix AND key < upperBound`, where
      // upperBound is the smallest string strictly greater than every key that
      // starts with `prefix`. This contains no LIKE metacharacters and relies on
      // the default binary/byte ordering, giving literal, case-sensitive matching.
      const conditions: Array<SQL> = []
      if (prefix !== '') {
        conditions.push(gte(blobs.key, prefix))
        const upperBound = prefixUpperBound(prefix)
        if (upperBound !== undefined) {
          conditions.push(lt(blobs.key, upperBound))
        }
      }
      if (options?.cursor !== undefined) {
        conditions.push(gt(blobs.key, options.cursor))
      }
      const base = db
        .select()
        .from(blobs)
        .where(and(...conditions))
        .orderBy(asc(blobs.key))
      const rows = await (limit === undefined ? base : base.limit(limit + 1))
      const pageRows = limit === undefined ? rows : rows.slice(0, limit)
      const objects = pageRows.map(blobRecordSnapshot)
      const truncated = limit !== undefined && rows.length > limit
      return {
        objects,
        ...(truncated ? { cursor: pageRows.at(-1)?.key, truncated } : {}),
      }
    },
  }
}
