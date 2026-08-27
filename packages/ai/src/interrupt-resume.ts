import {
  INTERRUPT_BINDING_VERSION,
  canonicalizeInterruptResolutions,
} from './interrupts'
import {
  canonicalInterruptJson,
  digestInterruptJson,
} from './interrupt-serialization'
import {
  hashSchemaInput,
  normalizeApprovalSchema,
} from './activities/chat/tools/approval-schema'
import {
  isStandardSchema,
  validateWithStandardSchema,
} from './activities/chat/tools/schema-converter'
import type {
  InterruptBinding,
  InterruptSubmissionError,
  ItemInterruptErrorCode,
  ToolApprovalResolution,
  UnopenedInterruptBinding,
} from './interrupts'
import type {
  ChatMiddlewareConfig,
  ChatResumeToolState,
} from './activities/chat/middleware/types'
import type {
  GenericInterruptRequest,
  InterruptDefinition,
} from './interrupt-definition'
import type { Interrupt, RunAgentResumeItem } from './types'

export const INTERRUPT_BINDING_METADATA_KEY = 'tanstack:interruptBinding'

const interruptBindingMetadataKey = INTERRUPT_BINDING_METADATA_KEY

/** The persistence-neutral shape required to validate an interrupt resume. */
export interface PendingInterruptResumeRecord {
  interruptId: string
  payload: unknown
  binding: InterruptBinding
  /** Present for a first-party generic interrupt. */
  genericRequest?: GenericInterruptRequest<
    InterruptDefinition<any, any, any, any>
  >
}

export interface ValidateInterruptResumeBatchInput {
  threadId: string
  interruptedRunId: string
  generation: number
  pending: ReadonlyArray<PendingInterruptResumeRecord>
  resume?: ReadonlyArray<RunAgentResumeItem>
  tools: ChatMiddlewareConfig['tools']
  now?: number
}

export interface ValidatedInterruptResumeBatch {
  errors: ReadonlyArray<InterruptSubmissionError>
  resolutions?: ReadonlyArray<RunAgentResumeItem>
  canonicalResolutions?: string
  fingerprint?: string
  resumeToolState?: ChatResumeToolState
}

export class InterruptResumeValidationError extends Error {
  override readonly name = 'InterruptResumeValidationError'

  constructor(readonly errors: ReadonlyArray<InterruptSubmissionError>) {
    super(errors.map((error) => error.message).join(' '))
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

function stringField(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  return typeof value[key] === 'string' ? value[key] : undefined
}

function normalizeIssuePath(
  path: ReadonlyArray<unknown> | undefined,
): ReadonlyArray<string | number> | undefined {
  if (!path) return undefined
  return path.map((segment) => {
    const shouldSkipSegment =
      typeof segment === 'string' || typeof segment === 'number'
    if (shouldSkipSegment) {
      return segment
    }
    const record = objectValue(segment)
    const key = record?.key
    return typeof key === 'number' ? key : String(key ?? segment)
  })
}

export function interruptItemError(
  input: Pick<
    ValidateInterruptResumeBatchInput,
    'threadId' | 'interruptedRunId' | 'generation'
  >,
  interruptId: string,
  code: ItemInterruptErrorCode,
  message: string,
  options?: {
    path?: ReadonlyArray<string | number>
    source?: 'client' | 'server'
    retryable?: boolean
  },
): InterruptSubmissionError {
  return {
    scope: 'item',
    threadId: input.threadId,
    interruptedRunId: input.interruptedRunId,
    generation: input.generation,
    interruptId,
    code,
    message,
    source: options?.source ?? 'client',
    retryable: options?.retryable ?? false,
    ...(options?.path ? { path: options.path } : {}),
  }
}

async function validateSchemaValue(input: {
  schema: unknown
  value: unknown
  onIssue: (message: string, path?: ReadonlyArray<string | number>) => void
}): Promise<void> {
  if (isStandardSchema(input.schema)) {
    const result = await validateWithStandardSchema<unknown>(
      input.schema,
      input.value,
    )
    if (!result.success) {
      for (const issue of result.issues) {
        input.onIssue(issue.message, normalizeIssuePath(issue.path))
      }
    }
    return
  }
}

type RuntimeTool = ChatMiddlewareConfig['tools'][number] & {
  approvalSchema?: Parameters<typeof normalizeApprovalSchema>[0]
}

function runtimeTool(
  tools: ChatMiddlewareConfig['tools'],
  name: string,
): RuntimeTool | undefined {
  return tools.find((tool) => tool.name === name) as RuntimeTool | undefined
}

async function parseSchemaValue(
  schema: unknown,
  value: unknown,
): Promise<{ success: true; data: unknown } | { success: false }> {
  if (!isStandardSchema(schema)) return { success: true, data: value }
  const result = await validateWithStandardSchema<unknown>(schema, value)
  return result.success
    ? { success: true, data: result.data }
    : { success: false }
}

function descriptorResponseSchema(
  record: PendingInterruptResumeRecord,
): unknown {
  return objectValue(record.payload)?.responseSchema
}

function schemaHash(schema: unknown): string {
  return digestInterruptJson(canonicalInterruptJson(schema))
}

async function pushSchemaIssues(input: {
  request: ValidateInterruptResumeBatchInput
  errors: Array<InterruptSubmissionError>
  interruptId: string
  schema: unknown
  value: unknown
  code: ItemInterruptErrorCode
  label: string
}): Promise<void> {
  try {
    await validateSchemaValue({
      schema: input.schema,
      value: input.value,
      onIssue: (message, path) => {
        input.errors.push(
          interruptItemError(
            input.request,
            input.interruptId,
            input.code,
            `${input.label}: ${message}`,
            { path },
          ),
        )
      },
    })
  } catch (error) {
    input.errors.push(
      interruptItemError(
        input.request,
        input.interruptId,
        'invalid-response-schema',
        `${input.label} could not be validated: ${error instanceof Error ? error.message : String(error)}`,
        { source: 'server' },
      ),
    )
  }
}

function validateDescriptorSchema(
  input: ValidateInterruptResumeBatchInput,
  record: PendingInterruptResumeRecord,
  binding: InterruptBinding,
  errors: Array<InterruptSubmissionError>,
): unknown {
  const schema = descriptorResponseSchema(record)
  const responseSchemaHash = binding.responseSchemaHash
  const isMissingSchema =
    schema === undefined && responseSchemaHash === undefined
  if (isMissingSchema) {
    return undefined
  }
  const isIncompleteSchema =
    schema === undefined ||
    responseSchemaHash === undefined ||
    schemaHash(schema) !== responseSchemaHash
  if (isIncompleteSchema) {
    errors.push(
      interruptItemError(
        input,
        record.interruptId,
        'invalid-response-schema',
        `Interrupt ${record.interruptId} response schema no longer matches its binding.`,
        { source: 'server' },
      ),
    )
  }
  return schema
}

function indexResumeEntries(
  resume: ReadonlyArray<RunAgentResumeItem> | undefined,
): {
  resumeById: Map<string, RunAgentResumeItem>
  duplicates: Array<string>
} {
  const resumeById = new Map<string, RunAgentResumeItem>()
  const counts = new Map<string, number>()
  for (const entry of resume ?? []) {
    counts.set(entry.interruptId, (counts.get(entry.interruptId) ?? 0) + 1)
    if (!resumeById.has(entry.interruptId)) {
      resumeById.set(entry.interruptId, entry)
    }
  }
  const duplicates: Array<string> = []
  for (const [interruptId, count] of counts) {
    if (count > 1) duplicates.push(interruptId)
  }
  return { resumeById, duplicates }
}

function validateBindingCorrelation(
  input: ValidateInterruptResumeBatchInput,
  record: PendingInterruptResumeRecord,
  errors: Array<InterruptSubmissionError>,
): void {
  const binding = record.binding
  const hasBinding =
    binding.interruptedRunId !== input.interruptedRunId ||
    binding.generation !== input.generation ||
    binding.interruptId !== record.interruptId
  if (hasBinding) {
    errors.push(
      interruptItemError(
        input,
        record.interruptId,
        'stale',
        `Interrupt ${record.interruptId} has stale correlation metadata.`,
        { source: 'server' },
      ),
    )
  }
}

function validateBindingExpiry(
  input: ValidateInterruptResumeBatchInput,
  record: PendingInterruptResumeRecord,
  errors: Array<InterruptSubmissionError>,
): void {
  const expiresAtValue = record.binding.expiresAt
  if (expiresAtValue === undefined) return
  const expiresAt = Date.parse(expiresAtValue)
  if (!Number.isFinite(expiresAt)) {
    errors.push(
      interruptItemError(
        input,
        record.interruptId,
        'invalid-payload',
        `Interrupt ${record.interruptId} has an invalid expiresAt.`,
        { source: 'server' },
      ),
    )
    return
  }
  if (expiresAt <= (input.now ?? Date.now())) {
    errors.push(
      interruptItemError(
        input,
        record.interruptId,
        'expired',
        `Interrupt ${record.interruptId} has expired.`,
        { source: 'server' },
      ),
    )
  }
}

function validateResumeStatus(
  input: ValidateInterruptResumeBatchInput,
  record: PendingInterruptResumeRecord,
  entry: RunAgentResumeItem,
  errors: Array<InterruptSubmissionError>,
): boolean {
  const entryStatus: unknown = entry.status
  const shouldSkipEntryStatus =
    entryStatus === 'resolved' || entryStatus === 'cancelled'
  if (shouldSkipEntryStatus) return true
  errors.push(
    interruptItemError(
      input,
      record.interruptId,
      'invalid-payload',
      `Interrupt ${record.interruptId} has invalid status ${String(entryStatus)}.`,
    ),
  )
  return false
}

function validateCancelledHasNoPayload(
  input: ValidateInterruptResumeBatchInput,
  record: PendingInterruptResumeRecord,
  entry: RunAgentResumeItem,
  errors: Array<InterruptSubmissionError>,
): void {
  if (entry.payload === undefined) return
  errors.push(
    interruptItemError(
      input,
      record.interruptId,
      'invalid-payload',
      `Cancelled interrupt ${record.interruptId} must not include a payload.`,
    ),
  )
}

async function validateGenericResumeItem(
  input: ValidateInterruptResumeBatchInput,
  record: PendingInterruptResumeRecord,
  entry: RunAgentResumeItem,
  binding: InterruptBinding,
  responseSchema: unknown,
  errors: Array<InterruptSubmissionError>,
): Promise<void> {
  const genericRequest = record.genericRequest
  if (genericRequest !== undefined) {
    const batchIndex =
      binding.kind === 'generic' ? binding.batchIndex : undefined
    const isInvalidBinding =
      binding.kind !== 'generic' ||
      binding.definitionId !== genericRequest.definition.id ||
      binding.key !== genericRequest.key ||
      binding.interruptId !== record.interruptId ||
      batchIndex === undefined ||
      !Number.isInteger(batchIndex) ||
      batchIndex < 0
    if (isInvalidBinding) {
      errors.push(
        interruptItemError(
          input,
          record.interruptId,
          'stale',
          `Generic interrupt ${record.interruptId} has stale definition metadata.`,
          { source: 'server' },
        ),
      )
    }
  }
  if (entry.status === 'cancelled') {
    validateCancelledHasNoPayload(input, record, entry, errors)
    return
  }
  if (genericRequest !== undefined) {
    await pushSchemaIssues({
      request: input,
      errors,
      interruptId: record.interruptId,
      schema: genericRequest.definition.responseSchema,
      value: entry.payload,
      code: 'invalid-payload',
      label: `Interrupt ${record.interruptId} payload is invalid`,
    })
    return
  }
  if (responseSchema !== undefined) {
    await pushSchemaIssues({
      request: input,
      errors,
      interruptId: record.interruptId,
      schema: responseSchema,
      value: entry.payload,
      code: 'invalid-payload',
      label: `Interrupt ${record.interruptId} payload is invalid`,
    })
  }
}

function detectToolSchemaDrift(
  input: ValidateInterruptResumeBatchInput,
  record: PendingInterruptResumeRecord,
  binding: InterruptBinding,
  tool: RuntimeTool,
  errors: Array<InterruptSubmissionError>,
): {
  approval: ReturnType<typeof normalizeApprovalSchema> | undefined
  drifted: boolean
} {
  if (binding.kind === 'client-tool-execution') {
    if (hashSchemaInput(tool.outputSchema) === binding.outputSchemaHash) {
      return { approval: undefined, drifted: false }
    }
    errors.push(
      interruptItemError(
        input,
        record.interruptId,
        'stale',
        `Tool ${binding.toolName} output schema has changed.`,
        { source: 'server' },
      ),
    )
    return { approval: undefined, drifted: true }
  }
  let approval: ReturnType<typeof normalizeApprovalSchema> | undefined
  try {
    approval = normalizeApprovalSchema(tool.approvalSchema, tool.inputSchema)
  } catch {
    errors.push(
      interruptItemError(
        input,
        record.interruptId,
        'stale',
        `Tool ${tool.name} approval schema is unavailable.`,
        { source: 'server' },
      ),
    )
    return { approval: undefined, drifted: true }
  }
  const hasApproval =
    approval !== undefined &&
    (hashSchemaInput(tool.inputSchema) !== binding.inputSchemaHash ||
      approval.approvalSchemaHash !== binding.approvalSchemaHash ||
      approval.responseSchemaHash !== binding.responseSchemaHash)
  if (hasApproval) {
    errors.push(
      interruptItemError(
        input,
        record.interruptId,
        'stale',
        `Tool ${tool.name} approval schema has changed.`,
        { source: 'server' },
      ),
    )
    return { approval, drifted: true }
  }
  return { approval, drifted: false }
}

async function validateClientToolPayload(
  input: ValidateInterruptResumeBatchInput,
  record: PendingInterruptResumeRecord,
  entry: RunAgentResumeItem,
  tool: RuntimeTool,
  responseSchema: unknown,
  errors: Array<InterruptSubmissionError>,
): Promise<void> {
  if (responseSchema !== undefined) {
    await pushSchemaIssues({
      request: input,
      errors,
      interruptId: record.interruptId,
      schema: responseSchema,
      value: entry.payload,
      code: 'invalid-tool-output',
      label: `Tool ${tool.name} output is invalid`,
    })
  }
  if (tool.outputSchema !== undefined) {
    await pushSchemaIssues({
      request: input,
      errors,
      interruptId: record.interruptId,
      schema: tool.outputSchema,
      value: entry.payload,
      code: 'invalid-tool-output',
      label: `Tool ${tool.name} output is invalid`,
    })
  }
}

async function validateApprovalPayload(
  input: ValidateInterruptResumeBatchInput,
  record: PendingInterruptResumeRecord,
  entry: RunAgentResumeItem,
  tool: RuntimeTool,
  approval: ReturnType<typeof normalizeApprovalSchema>,
  errors: Array<InterruptSubmissionError>,
): Promise<void> {
  const envelope = objectValue(entry.payload)
  const approved =
    typeof entry.payload === 'boolean'
      ? entry.payload
      : typeof envelope?.approved === 'boolean'
        ? envelope.approved
        : undefined
  if (approved === undefined) {
    errors.push(
      interruptItemError(
        input,
        record.interruptId,
        'invalid-payload',
        `Approval ${record.interruptId} must be a boolean or decision envelope.`,
      ),
    )
    return
  }
  if (envelope) {
    await pushSchemaIssues({
      request: input,
      errors,
      interruptId: record.interruptId,
      schema: approval.responseSchema,
      value: entry.payload,
      code: 'invalid-payload',
      label: `Approval ${record.interruptId} envelope is invalid`,
    })
  }
  const hasApproved = approved && envelope?.editedArgs !== undefined
  if (hasApproved) {
    if (tool.inputSchema === undefined) {
      errors.push(
        interruptItemError(
          input,
          record.interruptId,
          'invalid-edited-args',
          `Approval ${record.interruptId} cannot edit arguments without an input schema.`,
        ),
      )
    } else {
      await pushSchemaIssues({
        request: input,
        errors,
        interruptId: record.interruptId,
        schema: tool.inputSchema,
        value: envelope.editedArgs,
        code: 'invalid-edited-args',
        label: `Approval ${record.interruptId} edited arguments are invalid`,
      })
    }
  }
  const branch = approved ? approval.branches.approve : approval.branches.reject
  if (!branch) return
  if (!envelope) {
    errors.push(
      interruptItemError(
        input,
        record.interruptId,
        'invalid-payload',
        `Approval ${record.interruptId} requires a payload for the ${approved ? 'approve' : 'reject'} decision.`,
      ),
    )
    return
  }
  await pushSchemaIssues({
    request: input,
    errors,
    interruptId: record.interruptId,
    schema: branch.source,
    value: envelope.payload,
    code: 'invalid-payload',
    label: `Approval ${record.interruptId} payload is invalid`,
  })
}

async function validateToolResumeItem(
  input: ValidateInterruptResumeBatchInput,
  record: PendingInterruptResumeRecord,
  entry: RunAgentResumeItem,
  binding: InterruptBinding,
  responseSchema: unknown,
  errors: Array<InterruptSubmissionError>,
): Promise<void> {
  if (entry.status === 'cancelled') {
    validateCancelledHasNoPayload(input, record, entry, errors)
    return
  }
  if (binding.kind === 'generic') return
  const tool = runtimeTool(input.tools, binding.toolName)
  if (!tool) {
    errors.push(
      interruptItemError(
        input,
        record.interruptId,
        'stale',
        `Tool ${binding.toolName} is unavailable for interrupt ${record.interruptId}.`,
        { source: 'server' },
      ),
    )
    return
  }
  const { approval, drifted } = detectToolSchemaDrift(
    input,
    record,
    binding,
    tool,
    errors,
  )
  if (drifted) return
  if (binding.kind === 'client-tool-execution') {
    await validateClientToolPayload(
      input,
      record,
      entry,
      tool,
      responseSchema,
      errors,
    )
    return
  }
  if (approval === undefined) return
  await validateApprovalPayload(input, record, entry, tool, approval, errors)
}

async function validateOnePendingRecord(input: {
  request: ValidateInterruptResumeBatchInput
  record: PendingInterruptResumeRecord
  entry: RunAgentResumeItem | undefined
  genericBatchSatisfied: boolean
  errors: Array<InterruptSubmissionError>
  markIncomplete: () => void
}): Promise<void> {
  const { request, record, entry, errors } = input
  const binding = record.binding
  if (!entry) {
    const hasInput =
      input.genericBatchSatisfied && binding.kind === 'client-tool-execution'
    if (hasInput) {
      return
    }
    input.markIncomplete()
    errors.push(
      interruptItemError(
        request,
        record.interruptId,
        'unknown-interrupt',
        `Missing resume entry for interrupt ${record.interruptId}.`,
      ),
    )
  }
  validateBindingCorrelation(request, record, errors)
  validateBindingExpiry(request, record, errors)
  const responseSchema = validateDescriptorSchema(
    request,
    record,
    binding,
    errors,
  )
  if (!entry) return
  if (!validateResumeStatus(request, record, entry, errors)) return
  if (binding.kind === 'generic') {
    await validateGenericResumeItem(
      request,
      record,
      entry,
      binding,
      responseSchema,
      errors,
    )
    return
  }
  await validateToolResumeItem(
    request,
    record,
    entry,
    binding,
    responseSchema,
    errors,
  )
}

function recordUnknownResumeEntries(
  input: ValidateInterruptResumeBatchInput,
  pendingById: ReadonlyMap<string, PendingInterruptResumeRecord>,
  group: (interruptId: string) => Array<InterruptSubmissionError>,
): boolean {
  let incomplete = false
  for (const entry of input.resume ?? []) {
    if (pendingById.has(entry.interruptId)) continue
    incomplete = true
    group(entry.interruptId).push(
      interruptItemError(
        input,
        entry.interruptId,
        'unknown-interrupt',
        `Resume entry references unknown interrupt ${entry.interruptId}.`,
      ),
    )
  }
  return incomplete
}

function approvalResolutionFromEntry(
  entry: RunAgentResumeItem,
): ToolApprovalResolution {
  const envelope = objectValue(entry.payload)
  if (typeof entry.payload === 'boolean') return entry.payload
  if (envelope?.approved === true) {
    return {
      approved: true,
      ...(envelope.editedArgs !== undefined
        ? { editedArgs: envelope.editedArgs }
        : {}),
      ...(envelope.payload !== undefined ? { payload: envelope.payload } : {}),
    }
  }
  return {
    approved: false,
    ...(envelope?.payload !== undefined ? { payload: envelope.payload } : {}),
  }
}

async function materializeGenericResolution(
  input: ValidateInterruptResumeBatchInput,
  record: PendingInterruptResumeRecord,
  entry: RunAgentResumeItem,
  genericInterrupts: Map<
    string,
    | { interruptId: string; status: 'resolved'; payload: unknown }
    | { interruptId: string; status: 'cancelled' }
  >,
): Promise<ValidatedInterruptResumeBatch | undefined> {
  if (entry.status !== 'resolved') {
    genericInterrupts.set(record.interruptId, {
      interruptId: record.interruptId,
      status: 'cancelled',
    })
    return undefined
  }
  if (record.genericRequest === undefined) {
    genericInterrupts.set(record.interruptId, {
      interruptId: record.interruptId,
      status: 'resolved',
      payload: entry.payload,
    })
    return undefined
  }
  const parsed = await parseSchemaValue(
    record.genericRequest.definition.responseSchema,
    entry.payload,
  )
  if (!parsed.success) {
    return {
      errors: [
        interruptItemError(
          input,
          record.interruptId,
          'invalid-payload',
          `Interrupt ${record.interruptId} payload is invalid.`,
        ),
      ],
    }
  }
  genericInterrupts.set(record.interruptId, {
    interruptId: record.interruptId,
    status: 'resolved',
    payload: parsed.data,
  })
  return undefined
}

async function materializeResumeToolState(
  input: ValidateInterruptResumeBatchInput,
  resumeById: ReadonlyMap<string, RunAgentResumeItem>,
): Promise<ValidatedInterruptResumeBatch> {
  const canonical = canonicalizeInterruptResolutions(input.resume ?? [])
  const approvals = new Map<string, ToolApprovalResolution>()
  const clientToolResults = new Map<string, unknown>()
  const genericInterrupts = new Map<
    string,
    | { interruptId: string; status: 'resolved'; payload: unknown }
    | { interruptId: string; status: 'cancelled' }
  >()
  const deniedToolResults = new Map<string, unknown>()
  const cancelledToolCallIds = new Set<string>()

  for (const record of input.pending) {
    const entry = resumeById.get(record.interruptId)
    if (!entry) continue
    const binding = record.binding
    if (binding.kind === 'generic') {
      const failed = await materializeGenericResolution(
        input,
        record,
        entry,
        genericInterrupts,
      )
      if (failed) return failed
      continue
    }
    if (entry.status === 'cancelled') {
      cancelledToolCallIds.add(binding.toolCallId)
      continue
    }
    if (binding.kind === 'client-tool-execution') {
      clientToolResults.set(binding.toolCallId, entry.payload)
      continue
    }
    const resolution = approvalResolutionFromEntry(entry)
    approvals.set(binding.toolCallId, resolution)
    const isApproved =
      resolution === false ||
      (typeof resolution === 'object' && !resolution.approved)
    if (isApproved) {
      deniedToolResults.set(
        binding.toolCallId,
        typeof resolution === 'object' ? resolution.payload : undefined,
      )
    }
  }

  return {
    errors: [],
    resolutions: canonical.resolutions,
    canonicalResolutions: canonical.canonicalResolutions,
    fingerprint: canonical.fingerprint,
    resumeToolState: {
      approvals,
      clientToolResults,
      genericInterrupts,
      deniedToolResults,
      cancelledToolCallIds,
    },
  }
}

export async function validateInterruptResumeBatch(
  input: ValidateInterruptResumeBatchInput,
): Promise<ValidatedInterruptResumeBatch> {
  const grouped = new Map<string, Array<InterruptSubmissionError>>()
  const batchErrors: Array<InterruptSubmissionError> = []
  const group = (interruptId: string): Array<InterruptSubmissionError> => {
    const existing = grouped.get(interruptId)
    if (existing) return existing
    const created: Array<InterruptSubmissionError> = []
    grouped.set(interruptId, created)
    return created
  }
  const pendingById = new Map(
    input.pending.map((record) => [record.interruptId, record]),
  )
  const { resumeById, duplicates } = indexResumeEntries(input.resume)
  for (const interruptId of duplicates) {
    group(interruptId).push(
      interruptItemError(
        input,
        interruptId,
        'conflict',
        `Interrupt ${interruptId} has duplicate resume entries.`,
      ),
    )
  }

  const pendingGenerics = input.pending.filter(
    (record) => record.binding.kind === 'generic',
  )
  const genericBatchSatisfied =
    pendingGenerics.length > 0 &&
    pendingGenerics.every((record) => resumeById.has(record.interruptId))

  let incomplete = false
  for (const record of input.pending) {
    await validateOnePendingRecord({
      request: input,
      record,
      entry: resumeById.get(record.interruptId),
      genericBatchSatisfied,
      errors: group(record.interruptId),
      markIncomplete: () => {
        incomplete = true
      },
    })
  }

  if (recordUnknownResumeEntries(input, pendingById, group)) {
    incomplete = true
  }

  if (incomplete) {
    batchErrors.push({
      scope: 'batch',
      threadId: input.threadId,
      interruptedRunId: input.interruptedRunId,
      generation: input.generation,
      code: 'incomplete-batch',
      message:
        'Resume entries must resolve or cancel the complete interrupt batch.',
      source: 'client',
      retryable: false,
      interruptIds: input.pending.map((record) => record.interruptId),
    })
  }

  const itemErrors = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, errors]) => errors)
  if (itemErrors.length > 0) {
    batchErrors.push({
      scope: 'batch',
      threadId: input.threadId,
      interruptedRunId: input.interruptedRunId,
      generation: input.generation,
      code: 'item-validation-failed',
      message: 'One or more interrupt resolutions are invalid.',
      source: 'client',
      retryable: false,
      interruptIds: input.pending.map((record) => record.interruptId),
    })
    return { errors: [...itemErrors, ...batchErrors] }
  }

  return materializeResumeToolState(input, resumeById)
}

function isSupportedBindingVersion(raw: Record<string, unknown>): boolean {
  const version = raw['v']
  if (version === undefined) return true
  return version === INTERRUPT_BINDING_VERSION
}

function readGenericUnopenedBinding(
  raw: Record<string, unknown>,
  interruptId: string,
  responseSchemaHash: string | undefined,
  expiresAt: string | undefined,
): UnopenedInterruptBinding | undefined {
  const definitionId = stringField(raw, 'definitionId')
  const key = stringField(raw, 'key')
  const batchIndex = raw['batchIndex']
  const payloadSchemaHash = stringField(raw, 'payloadSchemaHash')
  const hasFirstPartyFields =
    definitionId !== undefined ||
    key !== undefined ||
    batchIndex !== undefined ||
    payloadSchemaHash !== undefined
  const isInvalidHasFirstPartyFields =
    hasFirstPartyFields &&
    (!definitionId ||
      !key ||
      typeof batchIndex !== 'number' ||
      !Number.isInteger(batchIndex) ||
      batchIndex < 0)
  if (isInvalidHasFirstPartyFields) {
    return undefined
  }
  return {
    v: INTERRUPT_BINDING_VERSION,
    kind: 'generic',
    interruptId,
    ...(responseSchemaHash ? { responseSchemaHash } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(definitionId ? { definitionId } : {}),
    ...(key ? { key } : {}),
    ...(typeof batchIndex === 'number' ? { batchIndex } : {}),
    ...(payloadSchemaHash ? { payloadSchemaHash } : {}),
  }
}

function readClientToolUnopenedBinding(
  interruptId: string,
  toolName: string,
  toolCallId: string,
  responseSchemaHash: string,
  expiresAt: string | undefined,
  raw: Record<string, unknown>,
): UnopenedInterruptBinding | undefined {
  const outputSchemaHash = stringField(raw, 'outputSchemaHash')
  if (!outputSchemaHash) return undefined
  return {
    v: INTERRUPT_BINDING_VERSION,
    kind: 'client-tool-execution',
    interruptId,
    toolName,
    toolCallId,
    outputSchemaHash,
    responseSchemaHash,
    ...(expiresAt ? { expiresAt } : {}),
  }
}

function readToolApprovalUnopenedBinding(
  interruptId: string,
  toolName: string,
  toolCallId: string,
  responseSchemaHash: string,
  expiresAt: string | undefined,
  raw: Record<string, unknown>,
): UnopenedInterruptBinding | undefined {
  const inputSchemaHash = stringField(raw, 'inputSchemaHash')
  const approvalSchemaHash = stringField(raw, 'approvalSchemaHash')
  const shouldSkipInputSchemaHash = !inputSchemaHash || !approvalSchemaHash
  if (shouldSkipInputSchemaHash) return undefined
  return {
    v: INTERRUPT_BINDING_VERSION,
    kind: 'tool-approval',
    interruptId,
    toolName,
    toolCallId,
    originalArgs: raw.originalArgs,
    inputSchemaHash,
    approvalSchemaHash,
    responseSchemaHash,
    ...(expiresAt ? { expiresAt } : {}),
  }
}

export function readUnopenedInterruptBinding(
  descriptor: Interrupt,
): UnopenedInterruptBinding | undefined {
  const metadata = objectValue(descriptor.metadata)
  const raw = metadata
    ? objectValue(metadata[interruptBindingMetadataKey])
    : null
  const shouldSkipRaw =
    !raw || stringField(raw, 'interruptId') !== descriptor.id
  if (shouldSkipRaw) {
    return undefined
  }
  if (!isSupportedBindingVersion(raw)) return undefined
  const kind = stringField(raw, 'kind')
  const interruptId = stringField(raw, 'interruptId')
  const responseSchemaHash = stringField(raw, 'responseSchemaHash')
  const expiresAt = stringField(raw, 'expiresAt')
  const shouldSkipInterruptId = !interruptId || responseSchemaHash === ''
  if (shouldSkipInterruptId) return undefined
  const isInvalidExpiresAt =
    expiresAt !== undefined && !Number.isFinite(Date.parse(expiresAt))
  if (isInvalidExpiresAt) {
    return undefined
  }
  if (kind === 'generic') {
    return readGenericUnopenedBinding(
      raw,
      interruptId,
      responseSchemaHash,
      expiresAt,
    )
  }
  if (!responseSchemaHash) return undefined
  const toolName = stringField(raw, 'toolName')
  const toolCallId = stringField(raw, 'toolCallId')
  const shouldSkipToolName = !toolName || !toolCallId
  if (shouldSkipToolName) return undefined
  if (kind === 'client-tool-execution') {
    return readClientToolUnopenedBinding(
      interruptId,
      toolName,
      toolCallId,
      responseSchemaHash,
      expiresAt,
      raw,
    )
  }
  if (kind === 'tool-approval') {
    return readToolApprovalUnopenedBinding(
      interruptId,
      toolName,
      toolCallId,
      responseSchemaHash,
      expiresAt,
      raw,
    )
  }
  return undefined
}

export function withInterruptBinding(
  descriptor: Interrupt,
  binding: UnopenedInterruptBinding | InterruptBinding,
): Interrupt {
  return {
    ...descriptor,
    metadata: {
      ...descriptor.metadata,
      [interruptBindingMetadataKey]: {
        ...binding,
        v: INTERRUPT_BINDING_VERSION,
        interruptId: descriptor.id,
      },
    },
  }
}

export function readInterruptBinding(
  descriptor: Interrupt,
): InterruptBinding | undefined {
  const unopened = readUnopenedInterruptBinding(descriptor)
  if (!unopened) return undefined
  const metadata = objectValue(descriptor.metadata)
  const raw = metadata
    ? objectValue(metadata[interruptBindingMetadataKey])
    : null
  if (!raw) return undefined
  const interruptedRunId = stringField(raw, 'interruptedRunId')
  const generation = raw['generation']
  const isInvalidInterruptedRunId =
    !interruptedRunId ||
    typeof generation !== 'number' ||
    !Number.isInteger(generation) ||
    generation < 0
  if (isInvalidInterruptedRunId) {
    return undefined
  }
  return { ...unopened, interruptedRunId, generation }
}

export function withoutInterruptBinding(descriptor: Interrupt): Interrupt {
  const metadata = objectValue(descriptor.metadata)
  const shouldSkipMetadata =
    !metadata || !(interruptBindingMetadataKey in metadata)
  if (shouldSkipMetadata) return descriptor
  const publicMetadata = { ...metadata }
  delete publicMetadata[interruptBindingMetadataKey]
  return { ...descriptor, metadata: publicMetadata }
}
