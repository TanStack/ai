import {
  canonicalInterruptJson,
  canonicalizeInterruptResolutions,
  cloneAndDeepFreezeJson,
} from '@tanstack/ai'
import { drizzle } from 'drizzle-orm/d1'
import { drizzlePersistence, schema } from '@tanstack/ai-persistence-drizzle'
import {
  InterruptStoreCorruptionError,
  hasExactInterruptIds,
  projectInterruptRecovery,
} from '@tanstack/ai-persistence'
import type {
  InterruptBinding,
  InterruptRecoveryQuery,
  RunAgentResumeItem,
} from '@tanstack/ai'
import type {
  InterruptBatchRecord,
  InterruptRecord,
  InterruptStore,
} from '@tanstack/ai-persistence'

interface D1InterruptRow {
  interrupt_id: string
  run_id: string
  thread_id: string
  generation: number
  status: string
  requested_at: number
  resolved_at: number | null
  payload_json: string
  binding_json: string
  response_schema_hash: string
  response_json: string | null
}

interface D1InterruptBatchRow {
  interrupted_run_id: string
  thread_id: string
  generation: number
  expected_interrupt_ids_json: string
  fingerprint: string
  canonical_resolutions: string
  resolutions_json: string
  continuation_run_id: string
  committed_at: number
}

type D1RecoveryRow = D1InterruptRow | D1InterruptBatchRow

export interface D1InterruptStoreOptions {
  /** Override wall-clock time, primarily for deterministic runtimes/tests. */
  clock?: () => number
}

function corrupt(message: string, options?: ErrorOptions): never {
  throw new InterruptStoreCorruptionError(message, options)
}

function parseJson(value: string, field: string): unknown {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed
  } catch (error) {
    return corrupt(`Stored ${field} is not valid JSON.`, { cause: error })
  }
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

function validateDescriptor(value: unknown, interruptId: string): void {
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

function decodeStatus(value: string): InterruptRecord['status'] {
  if (value === 'pending' || value === 'resolved' || value === 'cancelled') {
    return value
  }
  return corrupt('Stored interrupt status is malformed.')
}

function mapInterrupt(row: D1InterruptRow): InterruptRecord {
  const payload = parseJson(row.payload_json, 'interrupt payload')
  if (row.generation > 0) validateDescriptor(payload, row.interrupt_id)
  const binding = decodeBinding(
    parseJson(row.binding_json, 'interrupt binding'),
    {
      interruptId: row.interrupt_id,
      interruptedRunId: row.run_id,
      generation: row.generation,
      responseSchemaHash: row.response_schema_hash,
    },
  )
  return {
    interruptId: row.interrupt_id,
    runId: row.run_id,
    threadId: row.thread_id,
    generation: row.generation,
    status: decodeStatus(row.status),
    requestedAt: row.requested_at,
    ...(row.resolved_at !== null ? { resolvedAt: row.resolved_at } : {}),
    payload,
    binding,
    ...(row.response_json !== null
      ? { response: parseJson(row.response_json, 'interrupt response') }
      : {}),
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

function mapBatch(row: D1InterruptBatchRow): InterruptBatchRecord {
  const expectedInterruptIds = decodeStringArray(
    parseJson(row.expected_interrupt_ids_json, 'expected interrupt IDs'),
    'expected interrupt IDs',
  )
  const resolutions = decodeResolutions(
    parseJson(row.resolutions_json, 'interrupt resolutions'),
  )
  const candidate = canonicalizeInterruptResolutions(resolutions)
  if (
    !hasExactInterruptIds(
      expectedInterruptIds,
      resolutions.map((resolution) => resolution.interruptId),
    ) ||
    candidate.fingerprint !== row.fingerprint ||
    candidate.canonicalResolutions !== row.canonical_resolutions
  ) {
    return corrupt('Stored interrupt batch identity is inconsistent.')
  }
  return {
    threadId: row.thread_id,
    interruptedRunId: row.interrupted_run_id,
    generation: row.generation,
    expectedInterruptIds,
    fingerprint: row.fingerprint,
    canonicalResolutions: row.canonical_resolutions,
    resolutions,
    continuationRunId: row.continuation_run_id,
    committedAt: row.committed_at,
  }
}

function isInterruptRow(row: D1RecoveryRow): row is D1InterruptRow {
  return 'interrupt_id' in row
}

function isBatchRow(row: D1RecoveryRow): row is D1InterruptBatchRow {
  return 'interrupted_run_id' in row
}

function inspectResults<T>(
  results: Array<D1Result<T>>,
  expectedCount: number,
): void {
  if (results.length !== expectedCount) {
    corrupt(
      `D1 batch returned ${results.length} results for ${expectedCount} statements.`,
    )
  }
  for (const result of results) {
    if (
      !Array.isArray(result.results) ||
      typeof result.meta.changes !== 'number'
    ) {
      corrupt('D1 batch returned a malformed statement result.')
    }
  }
}

function mutationChanges(result: D1Result<unknown>, label: string): number {
  if (typeof result.meta.changes !== 'number') {
    return corrupt(`D1 ${label} returned malformed change metadata.`)
  }
  return result.meta.changes
}

function requireResult<T>(
  results: Array<D1Result<T>>,
  index: number,
  label: string,
): D1Result<T> {
  const result = results[index]
  return result ?? corrupt(`D1 ${label} result is missing.`)
}

function bind(
  d1: D1Database,
  sql: string,
  values: ReadonlyArray<unknown>,
): D1PreparedStatement {
  return d1.prepare(sql).bind(...values)
}

/** Direct, atomic D1 interrupt store. */
export function createD1InterruptStore(
  d1: D1Database,
  options: D1InterruptStoreOptions = {},
): InterruptStore {
  const clock = options.clock ?? Date.now

  const readBatchAndRows = async (interruptedRunId: string) => {
    const statements = [
      bind(d1, 'SELECT * FROM interrupt_batches WHERE interrupted_run_id = ?', [
        interruptedRunId,
      ]),
      bind(
        d1,
        'SELECT * FROM interrupts WHERE run_id = ? ORDER BY requested_at, interrupt_id',
        [interruptedRunId],
      ),
    ]
    const results = await d1.batch<D1RecoveryRow>(statements)
    inspectResults(results, statements.length)
    const batchRows = results[0]?.results ?? []
    const interruptRows = results[1]?.results ?? []
    if (batchRows.length > 1) {
      return corrupt('D1 returned malformed interrupt batch rows.')
    }
    let batch: InterruptBatchRecord | null = null
    if (batchRows[0]) {
      if (!isBatchRow(batchRows[0])) {
        return corrupt('D1 returned malformed interrupt batch rows.')
      }
      batch = mapBatch(batchRows[0])
    }
    const rows: Array<InterruptRecord> = []
    for (const row of interruptRows) {
      if (!isInterruptRow(row)) {
        return corrupt('D1 returned malformed interrupt rows.')
      }
      rows.push(mapInterrupt(row))
    }
    return {
      batch,
      rows,
    }
  }

  const readRecovery = async (input: InterruptRecoveryQuery) => {
    const snapshot = await readBatchAndRows(input.interruptedRunId)
    const rows = snapshot.rows.filter((row) => row.threadId === input.threadId)
    const batch =
      snapshot.batch?.threadId === input.threadId ? snapshot.batch : null
    const generations = new Set(rows.map((row) => row.generation))
    if (generations.size > 1) {
      return corrupt('Stored interrupt rows mix generations.')
    }
    if (
      batch &&
      (rows.length === 0 ||
        rows.some((row) => row.generation !== batch.generation) ||
        !hasExactInterruptIds(
          batch.expectedInterruptIds,
          rows.map((row) => row.interruptId),
        ))
    ) {
      return corrupt('Stored interrupt batch correlation is inconsistent.')
    }
    return projectInterruptRecovery({
      query: input,
      rows,
      batch,
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
      const result = await bind(
        d1,
        `INSERT INTO interrupts (
          interrupt_id, run_id, thread_id, generation, status, requested_at,
          resolved_at, payload_json, binding_json, response_schema_hash,
          response_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(interrupt_id) DO NOTHING`,
        [
          record.interruptId,
          record.runId,
          record.threadId,
          generation,
          record.status,
          record.requestedAt,
          null,
          canonicalInterruptJson(record.payload),
          canonicalInterruptJson(binding),
          binding.responseSchemaHash,
          record.response === undefined
            ? null
            : canonicalInterruptJson(record.response),
        ],
      ).run()
      const changes = mutationChanges(result, 'legacy interrupt insert')
      if (changes !== 0 && changes !== 1) {
        corrupt('D1 legacy interrupt insert changed an unexpected row count.')
      }
    },
    async resolve(interruptId, response) {
      const hasResponse = response !== undefined
      const result = await bind(
        d1,
        `UPDATE interrupts SET
          status = 'resolved', resolved_at = ?
          ${hasResponse ? ', response_json = ?' : ''}
        WHERE interrupt_id = ?`,
        [
          clock(),
          ...(hasResponse ? [canonicalInterruptJson(response)] : []),
          interruptId,
        ],
      ).run()
      const changes = mutationChanges(result, 'legacy interrupt resolve')
      if (changes !== 0 && changes !== 1) {
        corrupt('D1 legacy interrupt resolve changed an unexpected row count.')
      }
    },
    async cancel(interruptId) {
      const result = await bind(
        d1,
        `UPDATE interrupts SET status = 'cancelled', resolved_at = ?
         WHERE interrupt_id = ?`,
        [clock(), interruptId],
      ).run()
      const changes = mutationChanges(result, 'legacy interrupt cancellation')
      if (changes !== 0 && changes !== 1) {
        corrupt(
          'D1 legacy interrupt cancellation changed an unexpected row count.',
        )
      }
    },
    async get(interruptId) {
      const result = await bind(
        d1,
        'SELECT * FROM interrupts WHERE interrupt_id = ?',
        [interruptId],
      ).all<D1InterruptRow>()
      inspectResults([result], 1)
      if (result.results.length > 1) {
        return corrupt('D1 returned duplicate interrupt IDs.')
      }
      return result.results[0] ? mapInterrupt(result.results[0]) : null
    },
    async list(threadId) {
      const result = await bind(
        d1,
        'SELECT * FROM interrupts WHERE thread_id = ? ORDER BY requested_at, interrupt_id',
        [threadId],
      ).all<D1InterruptRow>()
      inspectResults([result], 1)
      return result.results.map(mapInterrupt)
    },
    async listPending(threadId) {
      const result = await bind(
        d1,
        `SELECT * FROM interrupts
         WHERE thread_id = ? AND status = 'pending'
         ORDER BY requested_at, interrupt_id`,
        [threadId],
      ).all<D1InterruptRow>()
      inspectResults([result], 1)
      return result.results.map(mapInterrupt)
    },
    async listByRun(runId) {
      const snapshot = await readBatchAndRows(runId)
      return snapshot.rows
    },
    async listPendingByRun(runId) {
      const result = await bind(
        d1,
        `SELECT * FROM interrupts
         WHERE run_id = ? AND status = 'pending'
         ORDER BY requested_at, interrupt_id`,
        [runId],
      ).all<D1InterruptRow>()
      inspectResults([result], 1)
      return result.results.map(mapInterrupt)
    },
    async openInterruptBatch(input) {
      const descriptors = cloneAndDeepFreezeJson(input.descriptors)
      const unopenedBindings = cloneAndDeepFreezeJson(input.bindings)
      const descriptorIds = descriptors.map((descriptor) => descriptor.id)
      if (
        descriptorIds.length === 0 ||
        !hasExactInterruptIds(
          descriptorIds,
          unopenedBindings.map((binding) => binding.interruptId),
        )
      ) {
        throw new TypeError(
          'Interrupt descriptors and bindings must contain the same exact nonempty IDs.',
        )
      }
      for (const descriptor of descriptors) {
        validateDescriptor(descriptor, descriptor.id)
      }

      const snapshot = await readBatchAndRows(input.interruptedRunId)
      if (snapshot.batch) {
        throw new Error('Cannot reopen a committed interrupt batch.')
      }
      if (snapshot.rows.length > 0) {
        const generation = snapshot.rows[0]?.generation
        const requestedBindings = unopenedBindings
          .map((binding) => ({
            ...binding,
            interruptedRunId: input.interruptedRunId,
            generation,
          }))
          .sort((left, right) =>
            left.interruptId.localeCompare(right.interruptId),
          )
        const existingBindings = snapshot.rows
          .map((row) => row.binding)
          .sort((left, right) =>
            left.interruptId.localeCompare(right.interruptId),
          )
        const existingDescriptors = snapshot.rows
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
          snapshot.rows.every(
            (row) =>
              row.threadId === input.threadId &&
              row.generation === generation &&
              row.status === 'pending',
          ) &&
          hasExactInterruptIds(
            descriptorIds,
            snapshot.rows.map((row) => row.interruptId),
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
      const bindingById = new Map(
        unopenedBindings.map((binding) => [binding.interruptId, binding]),
      )
      const requestedAt = clock()
      const encoded = descriptors.map((descriptor) => {
        const unopened = bindingById.get(descriptor.id)
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
        return {
          descriptor,
          binding,
          payloadJson: canonicalInterruptJson(descriptor),
          bindingJson: canonicalInterruptJson(binding),
        }
      })
      const insertStatements = encoded.map((item) =>
        bind(
          d1,
          `INSERT INTO interrupts (
            interrupt_id, run_id, thread_id, generation, status, requested_at,
            payload_json, binding_json, response_schema_hash
          ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
          ON CONFLICT(interrupt_id) DO NOTHING`,
          [
            item.descriptor.id,
            input.interruptedRunId,
            input.threadId,
            generation,
            requestedAt,
            item.payloadJson,
            item.bindingJson,
            item.binding.responseSchemaHash,
          ],
        ),
      )
      const exactClauses = encoded
        .map(
          () =>
            '(interrupt_id = ? AND payload_json = ? AND binding_json = ? AND response_schema_hash = ?)',
        )
        .join(' OR ')
      const assertionValues: Array<unknown> = [
        input.interruptedRunId,
        input.interruptedRunId,
        encoded.length,
        input.interruptedRunId,
        input.threadId,
        generation,
      ]
      for (const item of encoded) {
        assertionValues.push(
          item.descriptor.id,
          item.payloadJson,
          item.bindingJson,
          item.binding.responseSchemaHash,
        )
      }
      assertionValues.push(encoded.length)
      const assertion = bind(
        d1,
        `INSERT INTO interrupts (
          interrupt_id, run_id, thread_id, generation, status, requested_at,
          payload_json, binding_json, response_schema_hash
        )
        SELECT NULL, '', '', 0, 'pending', 0, '{}', '{}', ''
        WHERE NOT (
          NOT EXISTS (
            SELECT 1 FROM interrupt_batches WHERE interrupted_run_id = ?
          )
          AND (SELECT COUNT(*) FROM interrupts WHERE run_id = ?) = ?
          AND (
            SELECT COUNT(*) FROM interrupts
            WHERE run_id = ? AND thread_id = ? AND generation = ?
              AND status = 'pending' AND (${exactClauses})
          ) = ?
        )`,
        assertionValues,
      )
      const statements = [...insertStatements, assertion]
      const results = await d1.batch(statements)
      inspectResults(results, statements.length)
      for (const result of results.slice(0, -1)) {
        const changes = mutationChanges(result, 'interrupt open insert')
        if (changes !== 0 && changes !== 1) {
          corrupt('D1 interrupt open changed an unexpected row count.')
        }
      }
      const openAssertionResult = requireResult(
        results,
        results.length - 1,
        'interrupt open assertion',
      )
      if (
        mutationChanges(openAssertionResult, 'interrupt open assertion') !== 0
      ) {
        corrupt('D1 interrupt open assertion unexpectedly changed a row.')
      }
      const opened = await readBatchAndRows(input.interruptedRunId)
      if (
        opened.batch ||
        !hasExactInterruptIds(
          descriptorIds,
          opened.rows.map((row) => row.interruptId),
        )
      ) {
        return corrupt('D1 interrupt open did not persist the exact batch.')
      }
      return { generation, descriptors }
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
      const resolutionIds = candidate.resolutions.map(
        (resolution) => resolution.interruptId,
      )
      if (!hasExactInterruptIds(input.expectedInterruptIds, resolutionIds)) {
        return {
          status: 'conflict',
          authoritativeState: await readRecovery({
            threadId: input.threadId,
            interruptedRunId: input.interruptedRunId,
            knownGeneration: input.expectedGeneration,
          }),
        }
      }

      const snapshot = await readBatchAndRows(input.interruptedRunId)
      if (snapshot.batch) {
        return snapshot.batch.threadId === input.threadId &&
          snapshot.batch.fingerprint === candidate.fingerprint &&
          snapshot.batch.canonicalResolutions === candidate.canonicalResolutions
          ? {
              status: 'replayed',
              continuationRunId: snapshot.batch.continuationRunId,
            }
          : {
              status: 'conflict',
              authoritativeState: await readRecovery({
                threadId: input.threadId,
                interruptedRunId: input.interruptedRunId,
                knownGeneration: input.expectedGeneration,
              }),
            }
      }
      const pending = snapshot.rows.filter((row) => row.status === 'pending')
      if (
        !hasExactInterruptIds(
          input.expectedInterruptIds,
          pending.map((row) => row.interruptId),
        ) ||
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
          authoritativeState: await readRecovery({
            threadId: input.threadId,
            interruptedRunId: input.interruptedRunId,
            knownGeneration: input.expectedGeneration,
          }),
        }
      }

      const committedAt = clock()
      const idPlaceholders = input.expectedInterruptIds.map(() => '?').join(',')
      const winnerInsert = bind(
        d1,
        `INSERT INTO interrupt_batches (
          interrupted_run_id, thread_id, generation,
          expected_interrupt_ids_json, fingerprint, canonical_resolutions,
          resolutions_json, continuation_run_id, committed_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM interrupt_batches WHERE interrupted_run_id = ?
        )
        AND (
          SELECT COUNT(*) FROM interrupts
          WHERE run_id = ? AND status = 'pending'
        ) = ?
        AND (
          SELECT COUNT(*) FROM interrupts
          WHERE run_id = ? AND thread_id = ? AND generation = ?
            AND status = 'pending'
            AND interrupt_id IN (${idPlaceholders})
            AND (
              json_extract(binding_json, '$.expiresAt') IS NULL
              OR json_extract(binding_json, '$.expiresAt') > ?
            )
        ) = ?
        ON CONFLICT(interrupted_run_id) DO NOTHING`,
        [
          input.interruptedRunId,
          input.threadId,
          input.expectedGeneration,
          canonicalInterruptJson(input.expectedInterruptIds),
          candidate.fingerprint,
          candidate.canonicalResolutions,
          candidate.canonicalResolutions,
          input.continuationRunId,
          committedAt,
          input.interruptedRunId,
          input.interruptedRunId,
          input.expectedInterruptIds.length,
          input.interruptedRunId,
          input.threadId,
          input.expectedGeneration,
          ...input.expectedInterruptIds,
          new Date(committedAt).toISOString(),
          input.expectedInterruptIds.length,
        ],
      )
      const transitionStatements = candidate.resolutions.map((resolution) => {
        const status =
          resolution.status === 'cancelled' ? 'cancelled' : 'resolved'
        return bind(
          d1,
          `UPDATE interrupts
           SET status = ?, resolved_at = ?, response_json = ?
           WHERE interrupt_id = ? AND run_id = ? AND thread_id = ?
             AND generation = ? AND status = 'pending'
             AND EXISTS (
               SELECT 1 FROM interrupt_batches
               WHERE interrupted_run_id = ? AND thread_id = ?
                 AND generation = ? AND fingerprint = ?
                 AND canonical_resolutions = ? AND continuation_run_id = ?
             )`,
          [
            status,
            committedAt,
            canonicalInterruptJson(resolution),
            resolution.interruptId,
            input.interruptedRunId,
            input.threadId,
            input.expectedGeneration,
            input.interruptedRunId,
            input.threadId,
            input.expectedGeneration,
            candidate.fingerprint,
            candidate.canonicalResolutions,
            input.continuationRunId,
          ],
        )
      })
      const finalClauses = candidate.resolutions
        .map(
          () =>
            '(interrupt_id = ? AND status = ? AND resolved_at = ? AND response_json = ?)',
        )
        .join(' OR ')
      const assertionValues: Array<unknown> = [
        input.interruptedRunId,
        input.threadId,
        input.expectedGeneration,
        candidate.fingerprint,
        candidate.canonicalResolutions,
        input.continuationRunId,
        input.interruptedRunId,
      ]
      for (const resolution of candidate.resolutions) {
        assertionValues.push(
          resolution.interruptId,
          resolution.status === 'cancelled' ? 'cancelled' : 'resolved',
          committedAt,
          canonicalInterruptJson(resolution),
        )
      }
      assertionValues.push(candidate.resolutions.length)
      const assertion = bind(
        d1,
        `INSERT INTO interrupts (
          interrupt_id, run_id, thread_id, generation, status, requested_at,
          payload_json, binding_json, response_schema_hash
        )
        SELECT NULL, '', '', 0, 'pending', 0, '{}', '{}', ''
        WHERE EXISTS (
          SELECT 1 FROM interrupt_batches
          WHERE interrupted_run_id = ? AND thread_id = ? AND generation = ?
            AND fingerprint = ? AND canonical_resolutions = ?
            AND continuation_run_id = ?
        )
        AND (
          SELECT COUNT(*) FROM interrupts
          WHERE run_id = ? AND (${finalClauses})
        ) <> ?`,
        assertionValues,
      )
      const statements = [winnerInsert, ...transitionStatements, assertion]
      const results = await d1.batch(statements)
      inspectResults(results, statements.length)
      const insertChanges = mutationChanges(
        requireResult(results, 0, 'winner insert'),
        'winner insert',
      )
      if (insertChanges === 0) {
        const authoritative = await readBatchAndRows(input.interruptedRunId)
        if (
          authoritative.batch?.threadId === input.threadId &&
          authoritative.batch.fingerprint === candidate.fingerprint &&
          authoritative.batch.canonicalResolutions ===
            candidate.canonicalResolutions
        ) {
          return {
            status: 'replayed',
            continuationRunId: authoritative.batch.continuationRunId,
          }
        }
        return {
          status: 'conflict',
          authoritativeState: await readRecovery({
            threadId: input.threadId,
            interruptedRunId: input.interruptedRunId,
            knownGeneration: input.expectedGeneration,
          }),
        }
      }
      if (insertChanges !== 1) {
        return corrupt('D1 winner insert changed an unexpected row count.')
      }
      for (const result of results.slice(1, -1)) {
        if (mutationChanges(result, 'interrupt transition') !== 1) {
          throw new Error('A D1 interrupt transition changed no rows.')
        }
      }
      const commitAssertionResult = requireResult(
        results,
        results.length - 1,
        'commit assertion',
      )
      if (mutationChanges(commitAssertionResult, 'commit assertion') !== 0) {
        return corrupt('D1 commit assertion unexpectedly changed a row.')
      }
      return {
        status: 'committed',
        continuationRunId: input.continuationRunId,
      }
    },
    getInterruptRecoveryState(input) {
      return readRecovery(input)
    },
  }
  return store
}

/** Create the structured stores owned by a migrated Cloudflare D1 binding. */
export function createD1Stores(
  d1: D1Database,
  interruptOptions?: D1InterruptStoreOptions,
) {
  const persistence = drizzlePersistence(drizzle(d1, { schema }), {
    interrupts: false,
  })
  return {
    messages: persistence.stores.messages,
    runs: persistence.stores.runs,
    interrupts: createD1InterruptStore(d1, interruptOptions),
    metadata: persistence.stores.metadata,
  }
}
