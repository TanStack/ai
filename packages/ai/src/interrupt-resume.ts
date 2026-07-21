import { canonicalizeInterruptResolutions } from './interrupts'
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
import { compileJsonSchema202012 } from './activities/chat/tools/json-schema-validator'
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
import type { Interrupt, RunAgentResumeItem } from './types'

const interruptBindingMetadataKey = 'tanstack:interruptBinding'

/** The persistence-neutral shape required to validate an interrupt resume. */
export interface PendingInterruptResumeRecord {
  interruptId: string
  payload: unknown
  binding: InterruptBinding
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
    if (typeof segment === 'string' || typeof segment === 'number') {
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

  const validate = compileJsonSchema202012(input.schema)
  for (const issue of validate(input.value)) {
    input.onIssue(issue.message, issue.path)
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
  if (
    schema === undefined ||
    schemaHash(schema) !== binding.responseSchemaHash
  ) {
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

/**
 * Validate and translate a complete interrupt batch before any tool executes.
 * Used by ephemeral chat resume; a durable layer may share the same validator.
 */
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
  const resumeById = new Map<string, RunAgentResumeItem>()
  const counts = new Map<string, number>()
  for (const entry of input.resume ?? []) {
    counts.set(entry.interruptId, (counts.get(entry.interruptId) ?? 0) + 1)
    if (!resumeById.has(entry.interruptId))
      resumeById.set(entry.interruptId, entry)
  }

  for (const [interruptId, count] of counts) {
    if (count > 1) {
      group(interruptId).push(
        interruptItemError(
          input,
          interruptId,
          'conflict',
          `Interrupt ${interruptId} has duplicate resume entries.`,
        ),
      )
    }
  }

  let incomplete = false
  for (const record of input.pending) {
    const errors = group(record.interruptId)
    const entry = resumeById.get(record.interruptId)
    const binding = record.binding
    if (!entry) {
      incomplete = true
      errors.push(
        interruptItemError(
          input,
          record.interruptId,
          'unknown-interrupt',
          `Missing resume entry for interrupt ${record.interruptId}.`,
        ),
      )
    }
    if (
      binding.interruptedRunId !== input.interruptedRunId ||
      binding.generation !== input.generation ||
      binding.interruptId !== record.interruptId
    ) {
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
    if (
      binding.expiresAt !== undefined &&
      Date.parse(binding.expiresAt) <= (input.now ?? Date.now())
    ) {
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

    const responseSchema = validateDescriptorSchema(
      input,
      record,
      binding,
      errors,
    )
    if (!entry) continue
    const entryStatus: unknown = entry.status
    if (entryStatus !== 'resolved' && entryStatus !== 'cancelled') {
      errors.push(
        interruptItemError(
          input,
          record.interruptId,
          'invalid-payload',
          `Interrupt ${record.interruptId} has invalid status ${String(entryStatus)}.`,
        ),
      )
      continue
    }
    if (binding.kind === 'generic') {
      if (entry.status === 'cancelled') {
        if (entry.payload !== undefined) {
          errors.push(
            interruptItemError(
              input,
              record.interruptId,
              'invalid-payload',
              `Cancelled interrupt ${record.interruptId} must not include a payload.`,
            ),
          )
        }
      } else if (responseSchema !== undefined) {
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
      continue
    }

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
      continue
    }

    let approval: ReturnType<typeof normalizeApprovalSchema> | undefined
    let schemaDrifted = false
    if (binding.kind === 'client-tool-execution') {
      if (hashSchemaInput(tool.outputSchema) !== binding.outputSchemaHash) {
        errors.push(
          interruptItemError(
            input,
            record.interruptId,
            'stale',
            `Tool ${binding.toolName} output schema has changed.`,
            { source: 'server' },
          ),
        )
        schemaDrifted = true
      }
    } else {
      try {
        approval = normalizeApprovalSchema(
          tool.approvalSchema,
          tool.inputSchema,
        )
      } catch {
        errors.push(
          interruptItemError(
            input,
            record.interruptId,
            'stale',
            `Tool ${binding.toolName} approval schema is unavailable.`,
            { source: 'server' },
          ),
        )
        schemaDrifted = true
      }
      if (
        approval !== undefined &&
        (hashSchemaInput(tool.inputSchema) !== binding.inputSchemaHash ||
          approval.approvalSchemaHash !== binding.approvalSchemaHash ||
          approval.responseSchemaHash !== binding.responseSchemaHash)
      ) {
        errors.push(
          interruptItemError(
            input,
            record.interruptId,
            'stale',
            `Tool ${binding.toolName} approval schema has changed.`,
            { source: 'server' },
          ),
        )
        schemaDrifted = true
      }
    }

    if (entry.status === 'cancelled') {
      if (entry.payload !== undefined) {
        errors.push(
          interruptItemError(
            input,
            record.interruptId,
            'invalid-payload',
            `Cancelled interrupt ${record.interruptId} must not include a payload.`,
          ),
        )
      }
      continue
    }
    if (schemaDrifted) continue

    if (binding.kind === 'client-tool-execution') {
      if (responseSchema !== undefined) {
        await pushSchemaIssues({
          request: input,
          errors,
          interruptId: record.interruptId,
          schema: responseSchema,
          value: entry.payload,
          code: 'invalid-tool-output',
          label: `Tool ${binding.toolName} output is invalid`,
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
          label: `Tool ${binding.toolName} output is invalid`,
        })
      }
      continue
    }

    if (approval === undefined) continue
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
      continue
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
    if (approved && envelope?.editedArgs !== undefined) {
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
    const branch = approved
      ? approval.branches.approve
      : approval.branches.reject
    if (branch) {
      if (!envelope) {
        errors.push(
          interruptItemError(
            input,
            record.interruptId,
            'invalid-payload',
            `Approval ${record.interruptId} requires a payload for the ${approved ? 'approve' : 'reject'} decision.`,
          ),
        )
      } else {
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
    }
  }

  for (const entry of input.resume ?? []) {
    if (!pendingById.has(entry.interruptId)) {
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
      genericInterrupts.set(
        record.interruptId,
        entry.status === 'resolved'
          ? {
              interruptId: record.interruptId,
              status: 'resolved',
              payload: entry.payload,
            }
          : { interruptId: record.interruptId, status: 'cancelled' },
      )
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
    const envelope = objectValue(entry.payload)
    const resolution: ToolApprovalResolution =
      typeof entry.payload === 'boolean'
        ? entry.payload
        : envelope?.approved === true
          ? {
              approved: true,
              ...(envelope.editedArgs !== undefined
                ? { editedArgs: envelope.editedArgs }
                : {}),
              ...(envelope.payload !== undefined
                ? { payload: envelope.payload }
                : {}),
            }
          : {
              approved: false,
              ...(envelope?.payload !== undefined
                ? { payload: envelope.payload }
                : {}),
            }
    approvals.set(binding.toolCallId, resolution)
    if (
      resolution === false ||
      (typeof resolution === 'object' && !resolution.approved)
    ) {
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

export function readUnopenedInterruptBinding(
  descriptor: Interrupt,
): UnopenedInterruptBinding | undefined {
  const metadata = objectValue(descriptor.metadata)
  const raw = metadata
    ? objectValue(metadata[interruptBindingMetadataKey])
    : null
  if (!raw || stringField(raw, 'interruptId') !== descriptor.id)
    return undefined
  const kind = stringField(raw, 'kind')
  const interruptId = stringField(raw, 'interruptId')
  const responseSchemaHash = stringField(raw, 'responseSchemaHash')
  const expiresAt = stringField(raw, 'expiresAt')
  if (!interruptId || !responseSchemaHash) return undefined
  if (kind === 'generic') {
    return {
      kind,
      interruptId,
      responseSchemaHash,
      ...(expiresAt ? { expiresAt } : {}),
    }
  }
  const toolName = stringField(raw, 'toolName')
  const toolCallId = stringField(raw, 'toolCallId')
  if (!toolName || !toolCallId) return undefined
  if (kind === 'client-tool-execution') {
    const outputSchemaHash = stringField(raw, 'outputSchemaHash')
    if (!outputSchemaHash) return undefined
    return {
      kind,
      interruptId,
      toolName,
      toolCallId,
      outputSchemaHash,
      responseSchemaHash,
      ...(expiresAt ? { expiresAt } : {}),
    }
  }
  if (kind === 'tool-approval') {
    const inputSchemaHash = stringField(raw, 'inputSchemaHash')
    const approvalSchemaHash = stringField(raw, 'approvalSchemaHash')
    if (!inputSchemaHash || !approvalSchemaHash) return undefined
    return {
      kind,
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
  return undefined
}

export function withoutInterruptBinding(descriptor: Interrupt): Interrupt {
  const metadata = objectValue(descriptor.metadata)
  if (!metadata || !(interruptBindingMetadataKey in metadata)) return descriptor
  const publicMetadata = { ...metadata }
  delete publicMetadata[interruptBindingMetadataKey]
  return { ...descriptor, metadata: publicMetadata }
}
