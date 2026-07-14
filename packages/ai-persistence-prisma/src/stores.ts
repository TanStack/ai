/**
 * AIPersistence store implementations over a Prisma `PrismaClient`.
 *
 * Each method mirrors the semantics of the reference in-memory backend
 * (`@tanstack/ai-persistence`'s `memory.ts`) and the sibling Drizzle backend
 * (`@tanstack/ai-persistence-drizzle`'s `stores.ts`). JSON-valued columns use
 * provider-neutral Prisma `String` fields, so they are serialized with
 * `JSON.stringify`/`JSON.parse` here; blob bytes use Prisma's `Bytes`.
 */
import {
  canonicalInterruptJson,
  canonicalizeInterruptResolutions,
  cloneAndDeepFreezeJson,
} from '@tanstack/ai'
import {
  InterruptStoreCorruptionError,
  hasExactInterruptIds,
  projectInterruptRecovery,
} from '@tanstack/ai-persistence'
import type { Prisma, PrismaClient } from '@prisma/client'
import type {
  CommitInterruptResolutionsInput,
  InterruptBinding,
  InterruptCommitResult,
  InterruptRecoveryQuery,
  InterruptRecoveryStateV1,
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
  RunStatus,
  RunStore,
} from '@tanstack/ai-persistence'

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

export function createMessageStore(prisma: PrismaClient): MessageStore {
  return {
    async loadThread(threadId) {
      const row = await prisma.message.findUnique({ where: { threadId } })
      if (!row) return []
      return JSON.parse(row.messagesJson) as Array<ModelMessage>
    },
    async saveThread(threadId, msgs: Array<ModelMessage>) {
      const messagesJson = JSON.stringify(msgs)
      await prisma.message.upsert({
        where: { threadId },
        create: { threadId, messagesJson },
        update: { messagesJson },
      })
    },
  }
}

interface RunRow {
  runId: string
  threadId: string
  status: string
  startedAt: bigint
  finishedAt: bigint | null
  error: string | null
  usageJson: string | null
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

export function createRunStore(prisma: PrismaClient): RunStore {
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
      await prisma.run.upsert({
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
      await prisma.run.updateMany({ where: { runId }, data })
    },
    async get(runId) {
      const row = await prisma.run.findUnique({ where: { runId } })
      return row ? mapRun(row) : null
    },
  }
  return store
}

interface InterruptRow {
  interruptId: string
  runId: string
  threadId: string
  generation: number
  status: string
  requestedAt: bigint
  resolvedAt: bigint | null
  payloadJson: string
  bindingJson: string | null
  schemaHash: string | null
  responseJson: string | null
}

interface InterruptBatchRow {
  interruptedRunId: string
  threadId: string
  generation: number
  expectedInterruptIdsJson: string
  fingerprint: string
  canonicalResolutions: string
  resolutionsJson: string
  continuationRunId: string
  committedAt: bigint
}

function parseStoredJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new InterruptStoreCorruptionError(
      `Stored ${label} is not valid JSON.`,
      { cause: error },
    )
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOptionalString(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return value[key] === undefined || typeof value[key] === 'string'
}

function isInterruptBinding(value: unknown): value is InterruptBinding {
  if (
    !isRecord(value) ||
    typeof value.kind !== 'string' ||
    typeof value.interruptId !== 'string' ||
    typeof value.interruptedRunId !== 'string' ||
    typeof value.generation !== 'number' ||
    !Number.isInteger(value.generation) ||
    typeof value.responseSchemaHash !== 'string' ||
    !hasOptionalString(value, 'expiresAt')
  ) {
    return false
  }
  if (value.kind === 'generic') return true
  if (value.kind === 'client-tool-execution') {
    return (
      typeof value.toolName === 'string' &&
      typeof value.toolCallId === 'string' &&
      typeof value.outputSchemaHash === 'string'
    )
  }
  if (value.kind === 'tool-approval') {
    return (
      typeof value.toolName === 'string' &&
      typeof value.toolCallId === 'string' &&
      'originalArgs' in value &&
      typeof value.inputSchemaHash === 'string' &&
      typeof value.approvalSchemaHash === 'string'
    )
  }
  return false
}

function decodeBinding(row: InterruptRow): InterruptBinding {
  const fallback: InterruptBinding = {
    kind: 'generic',
    interruptId: row.interruptId,
    interruptedRunId: row.runId,
    generation: row.generation,
    responseSchemaHash: row.schemaHash ?? 'legacy:unknown',
  }
  const parsed =
    row.bindingJson === null
      ? fallback
      : parseStoredJson(row.bindingJson, `binding for ${row.interruptId}`)
  if (!isInterruptBinding(parsed)) {
    throw new InterruptStoreCorruptionError(
      `Stored binding for interrupt ${row.interruptId} is malformed.`,
    )
  }
  if (
    parsed.interruptId !== row.interruptId ||
    parsed.interruptedRunId !== row.runId ||
    parsed.generation !== row.generation
  ) {
    throw new InterruptStoreCorruptionError(
      `Stored binding correlation does not match interrupt ${row.interruptId}.`,
    )
  }
  if (row.schemaHash !== null && parsed.responseSchemaHash !== row.schemaHash) {
    throw new InterruptStoreCorruptionError(
      `Stored schema hash does not match interrupt ${row.interruptId}.`,
    )
  }
  return parsed
}

function decodeInterruptPayload(row: InterruptRow): unknown {
  const payload = parseStoredJson(
    row.payloadJson,
    `payload for ${row.interruptId}`,
  )
  if (isRecord(payload) && 'id' in payload && payload.id !== row.interruptId) {
    throw new InterruptStoreCorruptionError(
      `Stored payload ID does not match interrupt ${row.interruptId}.`,
    )
  }
  if (
    row.generation > 0 &&
    (!isRecord(payload) || payload.id !== row.interruptId)
  ) {
    throw new InterruptStoreCorruptionError(
      `Stored native interrupt ${row.interruptId} has no matching payload ID.`,
    )
  }
  return payload
}

function mapInterrupt(row: InterruptRow): InterruptRecord {
  if (
    !Number.isInteger(row.generation) ||
    row.generation < 0 ||
    (row.status !== 'pending' &&
      row.status !== 'resolved' &&
      row.status !== 'cancelled')
  ) {
    throw new InterruptStoreCorruptionError(
      `Stored interrupt ${row.interruptId} has invalid lifecycle fields.`,
    )
  }
  const record: InterruptRecord = {
    interruptId: row.interruptId,
    runId: row.runId,
    threadId: row.threadId,
    generation: row.generation,
    status: row.status,
    requestedAt: Number(row.requestedAt),
    ...(row.resolvedAt != null ? { resolvedAt: Number(row.resolvedAt) } : {}),
    payload: decodeInterruptPayload(row),
    binding: decodeBinding(row),
    ...(row.responseJson != null
      ? {
          response: parseStoredJson(
            row.responseJson,
            `response for ${row.interruptId}`,
          ),
        }
      : {}),
  }
  return cloneAndDeepFreezeJson(record)
}

function isResumeItem(value: unknown): value is RunAgentResumeItem {
  return (
    isRecord(value) &&
    typeof value.interruptId === 'string' &&
    (value.status === 'resolved' || value.status === 'cancelled')
  )
}

function decodeStringArray(
  value: string,
  label: string,
): ReadonlyArray<string> {
  const parsed = parseStoredJson(value, label)
  if (
    !Array.isArray(parsed) ||
    !parsed.every((item): item is string => typeof item === 'string') ||
    !hasExactInterruptIds(parsed, parsed)
  ) {
    throw new InterruptStoreCorruptionError(
      `Stored ${label} is not an exact set of string IDs.`,
    )
  }
  return cloneAndDeepFreezeJson(parsed)
}

function decodeInterruptBatch(
  row: InterruptBatchRow,
  expectedInterruptedRunId: string,
): InterruptBatchRecord {
  if (
    row.interruptedRunId !== expectedInterruptedRunId ||
    !Number.isInteger(row.generation) ||
    row.generation < 0
  ) {
    throw new InterruptStoreCorruptionError(
      `Stored interrupt batch correlation does not match ${expectedInterruptedRunId}.`,
    )
  }
  const expectedInterruptIds = decodeStringArray(
    row.expectedInterruptIdsJson,
    `expected IDs for ${row.interruptedRunId}`,
  )
  const resolutions = parseStoredJson(
    row.resolutionsJson,
    `resolutions for ${row.interruptedRunId}`,
  )
  if (!Array.isArray(resolutions) || !resolutions.every(isResumeItem)) {
    throw new InterruptStoreCorruptionError(
      `Stored resolutions for ${row.interruptedRunId} are malformed.`,
    )
  }
  const canonical = canonicalizeInterruptResolutions(resolutions)
  if (
    canonical.fingerprint !== row.fingerprint ||
    canonical.canonicalResolutions !== row.canonicalResolutions ||
    !hasExactInterruptIds(
      expectedInterruptIds,
      canonical.resolutions.map((resolution) => resolution.interruptId),
    )
  ) {
    throw new InterruptStoreCorruptionError(
      `Stored interrupt batch identity is corrupt for ${row.interruptedRunId}.`,
    )
  }
  return cloneAndDeepFreezeJson({
    threadId: row.threadId,
    interruptedRunId: row.interruptedRunId,
    generation: row.generation,
    expectedInterruptIds,
    fingerprint: row.fingerprint,
    canonicalResolutions: row.canonicalResolutions,
    resolutions: canonical.resolutions,
    continuationRunId: row.continuationRunId,
    committedAt: Number(row.committedAt),
  })
}

function legacyBindingForRow(row: InterruptRow): InterruptBinding {
  return {
    kind: 'generic',
    interruptId: row.interruptId,
    interruptedRunId: row.runId,
    generation: row.generation,
    responseSchemaHash: row.schemaHash ?? 'legacy:unknown',
  }
}

async function upgradeLegacyPendingRows(
  transaction: Prisma.TransactionClient,
  rows: ReadonlyArray<InterruptRow>,
): Promise<ReadonlyArray<InterruptRow>> {
  const upgraded: Array<InterruptRow> = []
  for (const row of rows) {
    if (row.status !== 'pending' || row.bindingJson !== null) {
      upgraded.push(row)
      continue
    }
    const binding = legacyBindingForRow(row)
    const bindingJson = canonicalInterruptJson(binding)
    const result = await transaction.interrupt.updateMany({
      where: {
        interruptId: row.interruptId,
        runId: row.runId,
        generation: row.generation,
        status: 'pending',
        bindingJson: null,
      },
      data: {
        bindingJson,
        schemaHash: binding.responseSchemaHash,
      },
    })
    if (result.count !== 1) {
      throw new Error(`Pending interrupt changed: ${row.interruptId}`)
    }
    upgraded.push({
      ...row,
      bindingJson,
      schemaHash: binding.responseSchemaHash,
    })
  }
  return upgraded
}

async function loadRowsForRun(
  transaction: Prisma.TransactionClient,
  interruptedRunId: string,
): Promise<ReadonlyArray<InterruptRecord>> {
  const rows = await transaction.interrupt.findMany({
    where: { runId: interruptedRunId },
    orderBy: [{ requestedAt: 'asc' }, { interruptId: 'asc' }],
  })
  const upgraded = await upgradeLegacyPendingRows(transaction, rows)
  return upgraded.map(mapInterrupt)
}

function validateBatchRowCorrelation(
  batch: InterruptBatchRecord,
  rows: ReadonlyArray<InterruptRecord>,
): void {
  if (
    !hasExactInterruptIds(
      batch.expectedInterruptIds,
      rows.map((row) => row.interruptId),
    ) ||
    rows.some(
      (row) =>
        row.runId !== batch.interruptedRunId ||
        row.threadId !== batch.threadId ||
        row.generation !== batch.generation ||
        row.status === 'pending',
    )
  ) {
    throw new InterruptStoreCorruptionError(
      `Stored interrupt batch correlation is corrupt for ${batch.interruptedRunId}.`,
    )
  }
}

async function recoveryInTransaction(
  transaction: Prisma.TransactionClient,
  input: InterruptRecoveryQuery,
  now: number,
): Promise<InterruptRecoveryStateV1> {
  const rows = await loadRowsForRun(transaction, input.interruptedRunId)
  const batchRow = await transaction.interruptBatch.findUnique({
    where: { interruptedRunId: input.interruptedRunId },
  })
  const batch = batchRow
    ? decodeInterruptBatch(batchRow, input.interruptedRunId)
    : null
  if (batch?.threadId === input.threadId) {
    validateBatchRowCorrelation(batch, rows)
  }
  return projectInterruptRecovery({
    query: input,
    rows: rows.filter((row) => row.threadId === input.threadId),
    batch: batch?.threadId === input.threadId ? batch : null,
    now,
    includeResolutions: true,
  })
}

async function winnerOutcome(
  transaction: Prisma.TransactionClient,
  input: CommitInterruptResolutionsInput,
  winner: InterruptBatchRecord,
  now: number,
): Promise<InterruptCommitResult> {
  const authoritativeState = await recoveryInTransaction(
    transaction,
    {
      threadId: input.threadId,
      interruptedRunId: input.interruptedRunId,
      knownGeneration: input.expectedGeneration,
    },
    now,
  )
  if (
    winner.threadId === input.threadId &&
    winner.generation === input.expectedGeneration &&
    hasExactInterruptIds(
      winner.expectedInterruptIds,
      input.expectedInterruptIds,
    ) &&
    winner.fingerprint === input.fingerprint &&
    winner.canonicalResolutions === input.canonicalResolutions
  ) {
    return {
      status: 'replayed',
      continuationRunId: winner.continuationRunId,
    }
  }
  return {
    status: 'conflict',
    authoritativeState,
  }
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === 'string'
    ? error.code
    : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isReloadableCommitRace(error: unknown): boolean {
  if (errorCode(error) === 'P2002') return true
  if (!['P1008', 'P2028', 'P2034', undefined].includes(errorCode(error))) {
    return false
  }
  return /database is locked|database is busy|write conflict|deadlock|timed out|transaction.*closed/i.test(
    errorMessage(error),
  )
}

export function createInterruptStore(
  prisma: PrismaClient,
  clock: () => number = Date.now,
): InterruptStore {
  async function readRows(
    where: Prisma.InterruptWhereInput,
  ): Promise<Array<InterruptRecord>> {
    return prisma.$transaction(async (transaction) => {
      const rows = await transaction.interrupt.findMany({
        where,
        orderBy: [{ requestedAt: 'asc' }, { interruptId: 'asc' }],
      })
      const upgraded = await upgradeLegacyPendingRows(transaction, rows)
      return upgraded.map(mapInterrupt)
    })
  }

  async function reloadWinner(
    input: CommitInterruptResolutionsInput,
  ): Promise<InterruptCommitResult | null> {
    return prisma.$transaction(async (transaction) => {
      const row = await transaction.interruptBatch.findUnique({
        where: { interruptedRunId: input.interruptedRunId },
      })
      if (!row) return null
      return winnerOutcome(
        transaction,
        input,
        decodeInterruptBatch(row, input.interruptedRunId),
        clock(),
      )
    })
  }

  const store: InterruptStore = {
    async create(record) {
      const generation = record.generation ?? 0
      const binding =
        record.binding ??
        ({
          kind: 'generic',
          interruptId: record.interruptId,
          interruptedRunId: record.runId,
          generation,
          responseSchemaHash: 'legacy:unknown',
        } as const)
      await prisma.interrupt.upsert({
        where: { interruptId: record.interruptId },
        create: {
          interruptId: record.interruptId,
          runId: record.runId,
          threadId: record.threadId,
          generation,
          status: record.status,
          requestedAt: BigInt(record.requestedAt),
          payloadJson: canonicalInterruptJson(record.payload),
          bindingJson: canonicalInterruptJson(binding),
          schemaHash: binding.responseSchemaHash,
          responseJson:
            record.response === undefined
              ? null
              : canonicalInterruptJson(record.response),
        },
        update: {},
      })
    },
    async resolve(interruptId, response) {
      await prisma.interrupt.updateMany({
        where: { interruptId },
        data: {
          status: 'resolved',
          resolvedAt: BigInt(clock()),
          ...(response === undefined
            ? {}
            : { responseJson: canonicalInterruptJson(response) }),
        },
      })
    },
    async cancel(interruptId) {
      await prisma.interrupt.updateMany({
        where: { interruptId },
        data: { status: 'cancelled', resolvedAt: BigInt(clock()) },
      })
    },
    async get(interruptId) {
      return prisma.$transaction(async (transaction) => {
        const row = await transaction.interrupt.findUnique({
          where: { interruptId },
        })
        if (!row) return null
        const [upgraded] = await upgradeLegacyPendingRows(transaction, [row])
        return upgraded ? mapInterrupt(upgraded) : null
      })
    },
    async list(threadId) {
      return readRows({ threadId })
    },
    async listPending(threadId) {
      return readRows({ threadId, status: 'pending' })
    },
    async listByRun(runId) {
      return readRows({ runId })
    },
    async listPendingByRun(runId) {
      return readRows({ runId, status: 'pending' })
    },
    async openInterruptBatch(input) {
      const descriptors = cloneAndDeepFreezeJson(input.descriptors)
      const bindings = cloneAndDeepFreezeJson(input.bindings)
      const descriptorIds = descriptors.map((descriptor) => descriptor.id)
      const bindingIds = bindings.map((binding) => binding.interruptId)
      if (
        descriptorIds.length === 0 ||
        !hasExactInterruptIds(descriptorIds, bindingIds)
      ) {
        throw new TypeError(
          'Interrupt descriptors and bindings must contain the same exact nonempty IDs.',
        )
      }

      return prisma.$transaction(async (transaction) => {
        const committed = await transaction.interruptBatch.findUnique({
          where: { interruptedRunId: input.interruptedRunId },
        })
        if (committed) {
          decodeInterruptBatch(committed, input.interruptedRunId)
          throw new Error('Cannot reopen a committed interrupt batch.')
        }

        const existing = await loadRowsForRun(
          transaction,
          input.interruptedRunId,
        )
        if (existing.length > 0) {
          const generation = existing[0]?.generation
          const existingDescriptors = [...existing]
            .sort((left, right) =>
              left.interruptId.localeCompare(right.interruptId),
            )
            .map((record) => record.payload)
          const requestedDescriptors = [...descriptors].sort((left, right) =>
            left.id.localeCompare(right.id),
          )
          const existingBindings = [...existing]
            .map((record) => record.binding)
            .sort((left, right) =>
              left.interruptId.localeCompare(right.interruptId),
            )
          const requestedBindings = bindings
            .map((binding) => ({
              ...binding,
              interruptedRunId: input.interruptedRunId,
              generation,
            }))
            .sort((left, right) =>
              left.interruptId.localeCompare(right.interruptId),
            )
          if (
            generation !== undefined &&
            hasExactInterruptIds(
              descriptorIds,
              existing.map((record) => record.interruptId),
            ) &&
            canonicalInterruptJson(existingDescriptors) ===
              canonicalInterruptJson(requestedDescriptors) &&
            canonicalInterruptJson(existingBindings) ===
              canonicalInterruptJson(requestedBindings) &&
            existing.every(
              (record) =>
                record.status === 'pending' &&
                record.threadId === input.threadId &&
                record.generation === generation,
            )
          ) {
            return { generation, descriptors }
          }
          throw new Error('An incompatible interrupt batch is already open.')
        }

        const generation = 1
        const bindingsById = new Map(
          bindings.map((binding) => [binding.interruptId, binding]),
        )
        const requestedAt = BigInt(clock())
        for (const descriptor of descriptors) {
          const unopened = bindingsById.get(descriptor.id)
          if (!unopened) {
            throw new Error(`Missing binding for interrupt: ${descriptor.id}`)
          }
          const binding = cloneAndDeepFreezeJson({
            ...unopened,
            interruptedRunId: input.interruptedRunId,
            generation,
          })
          await transaction.interrupt.create({
            data: {
              interruptId: descriptor.id,
              runId: input.interruptedRunId,
              threadId: input.threadId,
              generation,
              status: 'pending',
              requestedAt,
              payloadJson: canonicalInterruptJson(descriptor),
              bindingJson: canonicalInterruptJson(binding),
              schemaHash: binding.responseSchemaHash,
            },
          })
        }
        return { generation, descriptors }
      })
    },
    async commitInterruptResolutions(input) {
      const candidate = canonicalizeInterruptResolutions(input.resolutions)
      if (
        candidate.fingerprint !== input.fingerprint ||
        candidate.canonicalResolutions !== input.canonicalResolutions
      ) {
        throw new TypeError(
          'Interrupt batch identity does not match its resolutions.',
        )
      }

      try {
        return await prisma.$transaction(async (transaction) => {
          const winnerRow = await transaction.interruptBatch.findUnique({
            where: { interruptedRunId: input.interruptedRunId },
          })
          if (winnerRow) {
            return winnerOutcome(
              transaction,
              input,
              decodeInterruptBatch(winnerRow, input.interruptedRunId),
              clock(),
            )
          }

          const rows = await loadRowsForRun(transaction, input.interruptedRunId)
          const pending = rows.filter((row) => row.status === 'pending')
          const resolutionIds = candidate.resolutions.map(
            (resolution) => resolution.interruptId,
          )
          const now = clock()
          if (
            !hasExactInterruptIds(
              input.expectedInterruptIds,
              pending.map((record) => record.interruptId),
            ) ||
            !hasExactInterruptIds(input.expectedInterruptIds, resolutionIds) ||
            pending.some((record) => record.threadId !== input.threadId) ||
            pending.some(
              (record) => record.generation !== input.expectedGeneration,
            ) ||
            pending.some(
              (record) =>
                record.binding.expiresAt !== undefined &&
                Date.parse(record.binding.expiresAt) <= now,
            )
          ) {
            return {
              status: 'conflict',
              authoritativeState: await recoveryInTransaction(
                transaction,
                {
                  threadId: input.threadId,
                  interruptedRunId: input.interruptedRunId,
                  knownGeneration: input.expectedGeneration,
                },
                now,
              ),
            }
          }

          await transaction.interruptBatch.create({
            data: {
              interruptedRunId: input.interruptedRunId,
              threadId: input.threadId,
              generation: input.expectedGeneration,
              expectedInterruptIdsJson: canonicalInterruptJson(
                [...input.expectedInterruptIds].sort(),
              ),
              fingerprint: candidate.fingerprint,
              canonicalResolutions: candidate.canonicalResolutions,
              resolutionsJson: candidate.canonicalResolutions,
              continuationRunId: input.continuationRunId,
              committedAt: BigInt(now),
            },
          })

          for (const resolution of candidate.resolutions) {
            const transitioned = await transaction.interrupt.updateMany({
              where: {
                interruptId: resolution.interruptId,
                runId: input.interruptedRunId,
                threadId: input.threadId,
                generation: input.expectedGeneration,
                status: 'pending',
              },
              data: {
                status:
                  resolution.status === 'cancelled' ? 'cancelled' : 'resolved',
                responseJson: canonicalInterruptJson(resolution),
                resolvedAt: BigInt(now),
              },
            })
            if (transitioned.count !== 1) {
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
      } catch (error) {
        if (!isReloadableCommitRace(error)) throw error
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            const winner = await reloadWinner(input)
            if (winner) return winner
          } catch (reloadError) {
            if (!isReloadableCommitRace(reloadError)) throw reloadError
          }
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 10 * (attempt + 1))
          })
        }
        throw error
      }
    },
    async getInterruptRecoveryState(input) {
      return prisma.$transaction((transaction) =>
        recoveryInTransaction(transaction, input, clock()),
      )
    },
  }
  return store
}

export function createMetadataStore(prisma: PrismaClient): MetadataStore {
  return {
    async get(scope, key) {
      const row = await prisma.metadata.findUnique({
        where: { scope_key: { scope, key } },
      })
      return row ? (JSON.parse(row.valueJson) as unknown) : null
    },
    async set(scope, key, value) {
      const valueJson = JSON.stringify(value)
      await prisma.metadata.upsert({
        where: { scope_key: { scope, key } },
        create: { scope, key, valueJson },
        update: { valueJson },
      })
    },
    async delete(scope, key) {
      await prisma.metadata.deleteMany({ where: { scope, key } })
    },
  }
}

interface ArtifactRow {
  artifactId: string
  runId: string
  threadId: string
  name: string
  mimeType: string
  size: bigint
  externalUrl: string | null
  createdAt: bigint
}

function mapArtifact(row: ArtifactRow): ArtifactRecord {
  return {
    artifactId: row.artifactId,
    runId: row.runId,
    threadId: row.threadId,
    name: row.name,
    mimeType: row.mimeType,
    size: Number(row.size),
    ...(row.externalUrl != null ? { externalUrl: row.externalUrl } : {}),
    createdAt: Number(row.createdAt),
  }
}

export function createArtifactStore(prisma: PrismaClient): ArtifactStore {
  return {
    async save(record) {
      const data = {
        runId: record.runId,
        threadId: record.threadId,
        name: record.name,
        mimeType: record.mimeType,
        size: BigInt(record.size),
        externalUrl: record.externalUrl ?? null,
        createdAt: BigInt(record.createdAt),
      }
      await prisma.artifact.upsert({
        where: { artifactId: record.artifactId },
        create: { artifactId: record.artifactId, ...data },
        update: data,
      })
    },
    async get(artifactId) {
      const row = await prisma.artifact.findUnique({ where: { artifactId } })
      return row ? mapArtifact(row) : null
    },
    async list(runId) {
      const rows = await prisma.artifact.findMany({
        where: { runId },
        orderBy: [{ createdAt: 'asc' }, { artifactId: 'asc' }],
      })
      return rows.map(mapArtifact)
    },
    async delete(artifactId) {
      await prisma.artifact.deleteMany({ where: { artifactId } })
    },
    async deleteForRun(runId) {
      await prisma.artifact.deleteMany({ where: { runId } })
    },
  }
}

interface BlobRow {
  key: string
  contentType: string | null
  size: bigint | null
  etag: string | null
  customMetadataJson: string | null
  createdAt: bigint | null
  updatedAt: bigint | null
  body: Uint8Array | null
}

function blobRecordSnapshot(row: BlobRow): BlobRecord {
  return {
    key: row.key,
    ...(row.size != null ? { size: Number(row.size) } : {}),
    ...(row.etag != null ? { etag: row.etag } : {}),
    ...(row.contentType != null ? { contentType: row.contentType } : {}),
    ...(row.customMetadataJson != null
      ? {
          customMetadata: JSON.parse(row.customMetadataJson) as Record<
            string,
            string
          >,
        }
      : {}),
    ...(row.createdAt != null ? { createdAt: Number(row.createdAt) } : {}),
    ...(row.updatedAt != null ? { updatedAt: Number(row.updatedAt) } : {}),
  }
}

function blobObject(row: BlobRow): BlobObject {
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

export function createBlobStore(prisma: PrismaClient): BlobStore {
  const readRow = (key: string): Promise<BlobRow | null> =>
    prisma.blob.findUnique({ where: { key } })
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
        contentType: contentType ?? null,
        size: BigInt(bytes.byteLength),
        etag: crypto.randomUUID(),
        customMetadataJson: customMetadata
          ? JSON.stringify(customMetadata)
          : null,
        createdAt: existing?.createdAt ?? BigInt(now),
        updatedAt: BigInt(now),
        body: bytes,
      }
      const stored = await prisma.blob.upsert({
        where: { key },
        create: { key, ...record },
        update: record,
      })
      return blobRecordSnapshot(stored)
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
      await prisma.blob.deleteMany({ where: { key } })
    },
    async list(options?: BlobListOptions): Promise<BlobListPage> {
      const limit = options?.limit
      if (limit === 0) return { objects: [], truncated: false }
      const prefix = options?.prefix ?? ''
      // Match the prefix LITERALLY and case-sensitively to mirror the reference
      // in-memory backend's `key.startsWith(prefix)`. Prisma's `startsWith`
      // compiles to a SQL `LIKE` on sqlite, which treats `_`/`%` in the prefix
      // as wildcards and matches case-insensitively for ASCII. Instead use a
      // half-open range on the (BINARY-collated) key column — `key >= prefix AND
      // key < upperBound` — which contains no LIKE metacharacters and relies on
      // binary/byte ordering, giving literal, case-sensitive matching.
      const upperBound = prefixUpperBound(prefix)
      const rows = await prisma.blob.findMany({
        where: {
          key: {
            gte: prefix,
            ...(upperBound !== undefined ? { lt: upperBound } : {}),
            ...(options?.cursor !== undefined ? { gt: options.cursor } : {}),
          },
        },
        orderBy: { key: 'asc' },
        ...(limit === undefined ? {} : { take: limit + 1 }),
      })
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
