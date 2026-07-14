import {
  canonicalInterruptJson,
  canonicalizeInterruptResolutions,
  compileJsonSchema202012,
  defineChatMiddleware,
  digestInterruptJson,
  hashSchemaInput,
  isStandardSchema,
  normalizeApprovalSchema,
  validateWithStandardSchema,
} from '@tanstack/ai'
import { base64ToUint8Array } from '@tanstack/ai-utils'
import {
  InterruptsCapability,
  LocksCapability,
  PersistenceCapability,
  provideInterrupts,
  provideLocks,
  providePersistence,
} from './capabilities'
import {
  validateChatPersistenceStores,
  validateGenerationPersistenceStores,
} from './types'
import type {
  AbortInfo,
  ChatMiddleware,
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  ChatResumeToolState,
  ErrorInfo,
  FinishInfo,
  GenerationAbortInfo,
  GenerationErrorInfo,
  GenerationFinishInfo,
  GenerationMiddleware,
  GenerationMiddlewareContext,
  Interrupt,
  InterruptBinding,
  InterruptRecoveryStateV1,
  InterruptSubmissionError,
  ItemInterruptErrorCode,
  PersistedArtifactActivity,
  PersistedArtifactRef,
  PersistedArtifactRole,
  RunAgentResumeItem,
  StreamChunk,
  TokenUsage,
  ToolApprovalResolution,
  UnopenedInterruptBinding,
} from '@tanstack/ai'
import type {
  AIPersistence,
  AIPersistenceStores,
  ArtifactRecord,
  BlobBody,
  InterruptRecord,
  RunStore,
} from './types'

export interface WithPersistenceOptions {
  extractArtifacts?: (
    input: GenerationArtifactExtractionInput,
  ) =>
    | Array<GenerationArtifactDescriptor | PersistedArtifactRef>
    | Promise<Array<GenerationArtifactDescriptor | PersistedArtifactRef>>
  nameArtifact?: (input: GenerationArtifactNameInput) => string
}

export interface GenerationArtifactDescriptor {
  role: PersistedArtifactRole
  path: string
  mediaType?: PersistedArtifactRef['source']['mediaType']
  mimeType?: string
  bytes?: BlobBody
  url?: string
  json?: unknown
  name?: string
  jobId?: string
  expiresAt?: string | Date
}

export interface GenerationArtifactExtractionInput {
  activity: PersistedArtifactActivity
  provider: string
  model: string
  threadId: string
  runId: string
  inputs: unknown
  result: unknown
}

export interface GenerationArtifactNameInput {
  descriptor: GenerationArtifactDescriptor
  activity: PersistedArtifactActivity
  provider: string
  model: string
  threadId: string
  runId: string
  index: number
}

const runState = new WeakMap<
  object,
  { merged: boolean; interrupted: boolean }
>()

const interruptBindingMetadataKey = 'tanstack:interruptBinding'

export interface ValidateInterruptResumeBatchInput {
  threadId: string
  interruptedRunId: string
  generation: number
  pending: ReadonlyArray<InterruptRecord>
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

  constructor(
    readonly errors: ReadonlyArray<InterruptSubmissionError>,
    readonly recovery?: InterruptRecoveryStateV1,
  ) {
    super(errors.map((error) => error.message).join(' '))
  }
}

export class InterruptReplaySignal extends Error {
  override readonly name = 'InterruptReplaySignal'

  constructor(readonly continuationRunId: string) {
    super(`Interrupt resolutions already committed by ${continuationRunId}.`)
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

function itemError(
  input: ValidateInterruptResumeBatchInput,
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

function descriptorResponseSchema(record: InterruptRecord): unknown {
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
          itemError(
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
      itemError(
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
  record: InterruptRecord,
  binding: InterruptBinding,
  errors: Array<InterruptSubmissionError>,
): unknown {
  const schema = descriptorResponseSchema(record)
  if (
    schema === undefined ||
    schemaHash(schema) !== binding.responseSchemaHash
  ) {
    errors.push(
      itemError(
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
    if (!resumeById.has(entry.interruptId)) {
      resumeById.set(entry.interruptId, entry)
    }
  }

  for (const [interruptId, count] of counts) {
    if (count > 1) {
      group(interruptId).push(
        itemError(
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
        itemError(
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
        itemError(
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
        itemError(
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
        itemError(
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
            itemError(
              input,
              record.interruptId,
              'invalid-payload',
              `Cancelled interrupt ${record.interruptId} must not include a payload.`,
            ),
          )
        }
        continue
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
      continue
    }

    const tool = runtimeTool(input.tools, binding.toolName)
    if (!tool) {
      errors.push(
        itemError(
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
          itemError(
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
          itemError(
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
          itemError(
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
          itemError(
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
        itemError(
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
          itemError(
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
    if (branch && envelope) {
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

  for (const entry of input.resume ?? []) {
    if (!pendingById.has(entry.interruptId)) {
      incomplete = true
      group(entry.interruptId).push(
        itemError(
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
    | {
        interruptId: string
        status: 'cancelled'
      }
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

function readUnopenedInterruptBinding(
  descriptor: Interrupt,
): UnopenedInterruptBinding | undefined {
  const metadata = objectValue(descriptor.metadata)
  const raw = metadata
    ? objectValue(metadata[interruptBindingMetadataKey])
    : null
  if (!raw || stringField(raw, 'interruptId') !== descriptor.id) {
    return undefined
  }
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

function withoutInterruptBinding(descriptor: Interrupt): Interrupt {
  const metadata = objectValue(descriptor.metadata)
  if (!metadata || !(interruptBindingMetadataKey in metadata)) {
    return descriptor
  }
  const publicMetadata = { ...metadata }
  delete publicMetadata[interruptBindingMetadataKey]
  return { ...descriptor, metadata: publicMetadata }
}

function batchError(input: {
  threadId: string
  interruptedRunId: string
  generation: number
  interruptIds: ReadonlyArray<string>
  code:
    | 'stale'
    | 'conflict'
    | 'persistence-required'
    | 'server'
    | 'invalid-response-schema'
  message: string
  retryable?: boolean
}): InterruptSubmissionError {
  return {
    scope: 'batch',
    threadId: input.threadId,
    interruptedRunId: input.interruptedRunId,
    generation: input.generation,
    interruptIds: input.interruptIds,
    code: input.code,
    message: input.message,
    source: 'server',
    retryable: input.retryable ?? false,
  }
}

function isArtifactRef(value: unknown): value is PersistedArtifactRef {
  const record = objectValue(value)
  return !!record && typeof record.artifactId === 'string'
}

function mediaActivity(
  activity: GenerationMiddlewareContext['activity'],
): PersistedArtifactActivity | undefined {
  return activity === 'image' ||
    activity === 'audio' ||
    activity === 'tts' ||
    activity === 'video' ||
    activity === 'transcription'
    ? activity
    : undefined
}

function parseDataUrl(
  value: string,
): { mimeType: string; bytes: Uint8Array } | undefined {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(value)
  if (!match) return undefined
  const mimeType = match[1] || 'application/octet-stream'
  const payload = decodeURIComponent(match[3] ?? '')
  return {
    mimeType,
    bytes: match[2]
      ? base64ToUint8Array(payload)
      : new TextEncoder().encode(payload),
  }
}

function extensionForMime(mimeType: string | undefined): string {
  if (mimeType === undefined) return 'bin'

  switch (mimeType) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'audio/wav':
      return 'wav'
    case 'audio/mpeg':
      return 'mp3'
    case 'audio/mp3':
      return 'mp3'
    case 'video/mp4':
      return 'mp4'
    case 'application/json':
      return 'json'
    default:
      return 'bin'
  }
}

function defaultArtifactName(
  descriptor: GenerationArtifactDescriptor,
  activity: PersistedArtifactActivity,
  index: number,
): string {
  const ext = extensionForMime(descriptor.mimeType)
  return `${activity}-${descriptor.role}-${descriptor.mediaType ?? 'artifact'}-${index}.${ext}`
}

function sourcePartDescriptors(
  part: unknown,
  role: PersistedArtifactRole,
  path: string,
): Array<GenerationArtifactDescriptor> {
  const record = objectValue(part)
  const type = stringField(record ?? {}, 'type')
  const source = objectValue(record?.source)
  if (
    !record ||
    !source ||
    (type !== 'image' && type !== 'audio' && type !== 'video')
  ) {
    return []
  }
  const sourceType = stringField(source, 'type')
  const mimeType = stringField(source, 'mimeType') ?? `${type}/mpeg`
  if (sourceType === 'data') {
    const value = stringField(source, 'value')
    if (!value) return []
    return [
      {
        role,
        path,
        mediaType: type,
        mimeType,
        bytes: base64ToUint8Array(value),
      },
    ]
  }
  if (sourceType === 'url') {
    const value = stringField(source, 'value')
    if (!value) return []
    return [{ role, path, mediaType: type, mimeType, url: value }]
  }
  return []
}

function promptInputDescriptors(
  inputs: unknown,
): Array<GenerationArtifactDescriptor> {
  const prompt = objectValue(inputs)?.prompt
  if (!Array.isArray(prompt)) return []

  const counts: Record<string, number> = { image: 0, audio: 0, video: 0 }
  const descriptors: Array<GenerationArtifactDescriptor> = []
  for (const part of prompt) {
    const type = stringField(objectValue(part) ?? {}, 'type')
    if (type !== 'image' && type !== 'audio' && type !== 'video') continue
    const index = counts[type] ?? 0
    counts[type] = index + 1
    descriptors.push(
      ...sourcePartDescriptors(part, 'input', `prompt.${type}s.${index}`),
    )
  }
  return descriptors
}

function generatedMediaDescriptor(args: {
  role: PersistedArtifactRole
  path: string
  mediaType: 'image' | 'audio' | 'video'
  mimeType: string
  media: unknown
  jobId?: string
  expiresAt?: string | Date
}): GenerationArtifactDescriptor | undefined {
  const media = objectValue(args.media)
  if (!media) return undefined
  const b64Json = stringField(media, 'b64Json')
  if (b64Json) {
    return {
      role: args.role,
      path: args.path,
      mediaType: args.mediaType,
      mimeType: stringField(media, 'contentType') ?? args.mimeType,
      bytes: base64ToUint8Array(b64Json),
      jobId: args.jobId,
      expiresAt: args.expiresAt,
    }
  }
  const url = stringField(media, 'url')
  if (url) {
    return {
      role: args.role,
      path: args.path,
      mediaType: args.mediaType,
      mimeType: stringField(media, 'contentType') ?? args.mimeType,
      url,
      jobId: args.jobId,
      expiresAt: args.expiresAt,
    }
  }
  return undefined
}

function builtInArtifactDescriptors(
  activity: PersistedArtifactActivity,
  inputs: unknown,
  result: unknown,
): Array<GenerationArtifactDescriptor> {
  const descriptors = promptInputDescriptors(inputs)
  const output = objectValue(result)
  if (!output) return descriptors

  if (activity === 'image' && Array.isArray(output.images)) {
    output.images.forEach((image, index) => {
      const descriptor = generatedMediaDescriptor({
        role: 'output',
        path: `images.${index}`,
        mediaType: 'image',
        mimeType: 'image/png',
        media: image,
      })
      if (descriptor) descriptors.push(descriptor)
    })
  }

  if (activity === 'audio') {
    const descriptor = generatedMediaDescriptor({
      role: 'output',
      path: 'audio',
      mediaType: 'audio',
      mimeType: 'audio/mpeg',
      media: output.audio,
    })
    if (descriptor) descriptors.push(descriptor)
  }

  if (activity === 'tts') {
    const audio = stringField(output, 'audio')
    if (audio) {
      const format = stringField(output, 'format')
      descriptors.push({
        role: 'output',
        path: 'audio',
        mediaType: 'audio',
        mimeType:
          stringField(output, 'contentType') ??
          (format ? `audio/${format}` : 'audio/mpeg'),
        bytes: base64ToUint8Array(audio),
      })
    }
  }

  if (activity === 'video' && typeof output.url === 'string') {
    descriptors.push({
      role: 'output',
      path: 'video',
      mediaType: 'video',
      mimeType: 'video/mp4',
      url: output.url,
      jobId: stringField(output, 'jobId'),
      expiresAt:
        output.expiresAt instanceof Date ? output.expiresAt : undefined,
    })
  }

  if (activity === 'transcription') {
    const audio = objectValue(inputs)?.audio
    if (typeof audio === 'string') {
      const data = parseDataUrl(audio)
      descriptors.push({
        role: 'input',
        path: 'audio',
        mediaType: 'audio',
        mimeType: data?.mimeType ?? 'audio/mpeg',
        bytes: data?.bytes ?? base64ToUint8Array(audio),
      })
    } else if (audio instanceof ArrayBuffer) {
      descriptors.push({
        role: 'input',
        path: 'audio',
        mediaType: 'audio',
        mimeType: 'audio/mpeg',
        bytes: audio.slice(0),
      })
    } else if (typeof Blob !== 'undefined' && audio instanceof Blob) {
      descriptors.push({
        role: 'input',
        path: 'audio',
        mediaType: 'audio',
        mimeType: audio.type || 'audio/mpeg',
        bytes: audio,
      })
    }
    if (Array.isArray(output.segments) || Array.isArray(output.words)) {
      descriptors.push({
        role: 'output',
        path: 'transcription',
        mediaType: 'json',
        mimeType: 'application/json',
        json: output,
      })
    }
  }

  return descriptors
}

async function descriptorBody(
  descriptor: GenerationArtifactDescriptor,
): Promise<{
  body: BlobBody
  size: number
  mimeType: string
  externalUrl?: string
}> {
  if (descriptor.json !== undefined) {
    const body = JSON.stringify(descriptor.json)
    return {
      body,
      size: new TextEncoder().encode(body).byteLength,
      mimeType: descriptor.mimeType ?? 'application/json',
    }
  }

  if (descriptor.bytes !== undefined) {
    const body = descriptor.bytes
    let size: number
    if (typeof body === 'string') {
      size = new TextEncoder().encode(body).byteLength
    } else if (body instanceof ArrayBuffer) {
      size = body.byteLength
    } else if (ArrayBuffer.isView(body)) {
      size = body.byteLength
    } else if (typeof Blob !== 'undefined' && body instanceof Blob) {
      size = body.size
    } else {
      size = 0
    }
    return {
      body,
      size,
      mimeType: descriptor.mimeType ?? 'application/octet-stream',
    }
  }

  if (descriptor.url) {
    const data = parseDataUrl(descriptor.url)
    if (data) {
      return {
        body: data.bytes,
        size: data.bytes.byteLength,
        mimeType: descriptor.mimeType ?? data.mimeType,
      }
    }
    const response = await fetch(descriptor.url)
    if (!response.ok) {
      throw new Error(
        `Failed to persist artifact from ${descriptor.url}: HTTP ${response.status}`,
      )
    }
    const body = await response.arrayBuffer()
    return {
      body,
      size: body.byteLength,
      mimeType:
        descriptor.mimeType ??
        response.headers.get('content-type') ??
        'application/octet-stream',
      externalUrl: descriptor.url,
    }
  }

  throw new Error(
    `Artifact descriptor ${descriptor.path} has no bytes, url, or json.`,
  )
}

async function persistGenerationArtifacts(
  persistence: AIPersistence,
  opts: WithPersistenceOptions | undefined,
  ctx: GenerationMiddlewareContext,
  result: unknown,
): Promise<Array<PersistedArtifactRef>> {
  const activity = mediaActivity(ctx.activity)
  if (!activity) return []

  const threadId = ctx.threadId ?? ctx.requestId
  const runId = ctx.runId ?? ctx.requestId
  const extractionInput: GenerationArtifactExtractionInput = {
    activity,
    provider: ctx.provider,
    model: ctx.model,
    threadId,
    runId,
    inputs: ctx.artifactInputs,
    result,
  }
  const extracted =
    opts?.extractArtifacts !== undefined
      ? await opts.extractArtifacts(extractionInput)
      : builtInArtifactDescriptors(activity, ctx.artifactInputs, result)

  if (extracted.length === 0) return []

  const existingRefs = extracted.filter(isArtifactRef)
  const descriptors = extracted.filter(
    (item): item is GenerationArtifactDescriptor => !isArtifactRef(item),
  )
  if (descriptors.length === 0) return existingRefs

  if (!persistence.stores.artifacts || !persistence.stores.blobs) {
    throw new Error(
      'Generation artifact persistence requires stores.artifacts and stores.blobs.',
    )
  }

  const refs: Array<PersistedArtifactRef> = [...existingRefs]
  for (const [index, descriptor] of descriptors.entries()) {
    const artifactId = ctx.createId('artifact')
    const { body, size, mimeType, externalUrl } =
      await descriptorBody(descriptor)
    const key = `artifacts/${runId}/${artifactId}`
    await persistence.stores.blobs.put(key, body, {
      contentType: mimeType,
      customMetadata: {
        runId,
        threadId,
        role: descriptor.role,
        activity,
        path: descriptor.path,
      },
    })
    const createdAtMs = Date.now()
    const name =
      opts?.nameArtifact?.({
        descriptor: { ...descriptor, mimeType },
        activity,
        provider: ctx.provider,
        model: ctx.model,
        threadId,
        runId,
        index,
      }) ??
      descriptor.name ??
      defaultArtifactName({ ...descriptor, mimeType }, activity, index)
    const record: ArtifactRecord = {
      artifactId,
      runId,
      threadId,
      name,
      mimeType,
      size,
      externalUrl,
      createdAt: createdAtMs,
    }
    await persistence.stores.artifacts.save(record)
    refs.push({
      role: descriptor.role,
      artifactId,
      threadId,
      runId,
      name,
      mimeType,
      size,
      createdAt: new Date(createdAtMs).toISOString(),
      ...(externalUrl ? { externalUrl } : {}),
      source: {
        activity,
        path: descriptor.path,
        provider: ctx.provider,
        model: ctx.model,
        mediaType: descriptor.mediaType,
        jobId: descriptor.jobId,
        expiresAt:
          descriptor.expiresAt instanceof Date
            ? descriptor.expiresAt.toISOString()
            : descriptor.expiresAt,
      },
    })
  }

  return refs
}

// ---------------------------------------------------------------------------
// Shared store / feature plan
// ---------------------------------------------------------------------------

interface PersistencePlan {
  wantsMessages: boolean
  wantsInterrupts: boolean
  wantsLocks: boolean
  wantsArtifactPersistence: boolean
  runs: AIPersistence['stores']['runs']
}

function resolvePersistencePlan(persistence: AIPersistence): PersistencePlan {
  const wantsMessages = persistence.stores.messages !== undefined
  const wantsInterrupts = persistence.stores.interrupts !== undefined
  const wantsLocks = persistence.stores.locks !== undefined
  const wantsArtifactPersistence =
    persistence.stores.artifacts !== undefined &&
    persistence.stores.blobs !== undefined

  return {
    wantsMessages,
    wantsInterrupts,
    wantsLocks,
    wantsArtifactPersistence,
    runs: persistence.stores.runs,
  }
}

type StoreIsDefinitelyPresent<
  TStores extends AIPersistenceStores,
  TKey extends keyof AIPersistenceStores,
> = TKey extends keyof TStores
  ? object extends Pick<TStores, TKey>
    ? false
    : [Exclude<TStores[TKey], undefined>] extends [never]
      ? false
      : true
  : false

type StoreIsDefinitelyAbsent<
  TStores extends AIPersistenceStores,
  TKey extends keyof AIPersistenceStores,
> = TKey extends keyof TStores
  ? [Exclude<TStores[TKey], undefined>] extends [never]
    ? true
    : false
  : true

type InvalidChatPersistence<TStores extends AIPersistenceStores> =
  StoreIsDefinitelyPresent<TStores, 'interrupts'> extends true
    ? StoreIsDefinitelyAbsent<TStores, 'runs'>
    : false

type InvalidGenerationPersistence<TStores extends AIPersistenceStores> =
  StoreIsDefinitelyPresent<TStores, 'artifacts'> extends true
    ? StoreIsDefinitelyAbsent<TStores, 'blobs'>
    : StoreIsDefinitelyPresent<TStores, 'blobs'> extends true
      ? StoreIsDefinitelyAbsent<TStores, 'artifacts'>
      : false

type ValidChatPersistence<TStores extends AIPersistenceStores> =
  InvalidChatPersistence<TStores> extends true ? never : unknown

type ValidGenerationPersistence<TStores extends AIPersistenceStores> =
  InvalidGenerationPersistence<TStores> extends true ? never : unknown

async function createOrResumeRun(
  runs: RunStore | undefined,
  runId: string,
  threadId: string,
): Promise<void> {
  await runs?.createOrResume({
    runId,
    threadId,
    startedAt: Date.now(),
  })
}

async function completeRun(
  runs: RunStore | undefined,
  runId: string,
  usage?: TokenUsage,
): Promise<void> {
  await runs?.update(runId, {
    status: 'completed',
    finishedAt: Date.now(),
    ...(usage ? { usage } : {}),
  })
}

async function failRun(
  runs: RunStore | undefined,
  runId: string,
  error: unknown,
): Promise<void> {
  await runs?.update(runId, {
    status: 'failed',
    finishedAt: Date.now(),
    error: error instanceof Error ? error.message : String(error),
  })
}

async function interruptRun(
  runs: RunStore | undefined,
  runId: string,
): Promise<void> {
  await runs?.update(runId, {
    status: 'interrupted',
    finishedAt: Date.now(),
  })
}

// ---------------------------------------------------------------------------
// Chat middleware
// ---------------------------------------------------------------------------

/**
 * Chat-only persistence middleware. Provides durable **state** for `chat()`:
 * thread messages, run records, interrupts, and locks. Delivery durability
 * (replaying a disconnected/reloaded stream) lives on the transport layer via
 * `StreamDurability`, not here. Interrupt terminals are enriched only with the
 * store-issued run/generation correlation required by the public binding.
 */
export function withChatPersistence<TStores extends AIPersistenceStores>(
  persistence: AIPersistence<TStores> & ValidChatPersistence<TStores>,
): ChatMiddleware
export function withChatPersistence(
  persistence: AIPersistence,
): ChatMiddleware {
  validateChatPersistenceStores(persistence)
  const plan = resolvePersistencePlan(persistence)
  const { wantsMessages, wantsInterrupts, wantsLocks, runs } = plan

  const provides = [
    PersistenceCapability,
    ...(wantsInterrupts ? [InterruptsCapability] : []),
    ...(wantsLocks ? [LocksCapability] : []),
  ]

  return defineChatMiddleware({
    name: 'chat-persistence',
    provides,
    setup(ctx: ChatMiddlewareContext) {
      providePersistence(ctx, persistence)

      runState.set(ctx, {
        merged: false,
        interrupted: false,
      })

      if (wantsInterrupts && persistence.stores.interrupts) {
        provideInterrupts(ctx, persistence.stores.interrupts)
      }
      if (wantsLocks && persistence.stores.locks) {
        provideLocks(ctx, persistence.stores.locks)
      }
    },

    async onConfig(ctx: ChatMiddlewareContext, config: ChatMiddlewareConfig) {
      if (ctx.phase !== 'init') return

      let resumeToolState: ChatResumeToolState | undefined

      if (wantsInterrupts && persistence.stores.interrupts) {
        const pending = ctx.parentRunId
          ? await persistence.stores.interrupts.listByRun(ctx.parentRunId)
          : await persistence.stores.interrupts.listPending(ctx.threadId)
        const interruptedRunId =
          ctx.parentRunId ?? pending[0]?.runId ?? ctx.runId
        const generation = pending[0]?.generation ?? 0
        if (pending.length > 0 || (config.resume?.length ?? 0) > 0) {
          if (!ctx.parentRunId) {
            throw new InterruptResumeValidationError([
              batchError({
                threadId: ctx.threadId,
                interruptedRunId,
                generation,
                interruptIds: pending.map((record) => record.interruptId),
                code: 'stale',
                message:
                  'Interrupt continuation requires parentRunId to identify the interrupted run.',
              }),
            ])
          }
          const validated = await validateInterruptResumeBatch({
            threadId: ctx.threadId,
            interruptedRunId,
            generation,
            pending,
            resume: config.resume,
            tools: config.tools,
          })
          if (validated.errors.length > 0) {
            throw new InterruptResumeValidationError(validated.errors)
          }
          if (
            !validated.resolutions ||
            validated.canonicalResolutions === undefined ||
            validated.fingerprint === undefined
          ) {
            throw new InterruptResumeValidationError([
              batchError({
                threadId: ctx.threadId,
                interruptedRunId,
                generation,
                interruptIds: pending.map((record) => record.interruptId),
                code: 'server',
                message:
                  'Validated interrupt batch is missing canonical commit data.',
              }),
            ])
          }
          const expectedInterruptIds = pending
            .map((record) => record.interruptId)
            .sort((left, right) => left.localeCompare(right))
          const commit =
            await persistence.stores.interrupts.commitInterruptResolutions({
              threadId: ctx.threadId,
              interruptedRunId,
              continuationRunId: ctx.runId,
              expectedGeneration: generation,
              expectedInterruptIds,
              resolutions: validated.resolutions,
              canonicalResolutions: validated.canonicalResolutions,
              fingerprint: validated.fingerprint,
            })
          if (commit.status === 'replayed') {
            throw new InterruptReplaySignal(commit.continuationRunId)
          }
          if (commit.status === 'conflict') {
            throw new InterruptResumeValidationError(
              [
                batchError({
                  threadId: ctx.threadId,
                  interruptedRunId,
                  generation,
                  interruptIds: expectedInterruptIds,
                  code: 'conflict',
                  message:
                    'Interrupt resolutions conflict with the authoritative committed batch.',
                }),
              ],
              commit.authoritativeState,
            )
          }
          resumeToolState = validated.resumeToolState
        }
      }

      await createOrResumeRun(runs, ctx.runId, ctx.threadId)

      if (!wantsMessages || !persistence.stores.messages) {
        return resumeToolState ? { resumeToolState } : undefined
      }
      const state = runState.get(ctx)
      if (state?.merged) {
        return resumeToolState ? { resumeToolState } : undefined
      }
      if (state) state.merged = true

      const stored = await persistence.stores.messages.loadThread(ctx.threadId)
      const merged = config.messages.length > 0 ? config.messages : stored
      return {
        messages: merged,
        ...(resumeToolState ? { resumeToolState } : {}),
      }
    },

    async onChunk(ctx: ChatMiddlewareContext, chunk: StreamChunk) {
      // Persist the interrupt boundary before returning it. The only stream
      // projection added here is the store-issued run/generation correlation;
      // delivery durability remains a transport-layer concern.
      if (
        chunk.type !== 'RUN_FINISHED' ||
        chunk.outcome?.type !== 'interrupt'
      ) {
        return
      }
      const state = runState.get(ctx)
      if (!state) return

      const interruptIds = chunk.outcome.interrupts.map(
        (interrupt) => interrupt.id,
      )
      if (!wantsInterrupts || !persistence.stores.interrupts) {
        throw new InterruptResumeValidationError([
          batchError({
            threadId: ctx.threadId,
            interruptedRunId: ctx.runId,
            generation: 0,
            interruptIds,
            code: 'persistence-required',
            message:
              'Interrupt terminal events require an atomic interrupt persistence store.',
          }),
        ])
      }
      const bindings: Array<UnopenedInterruptBinding> = []
      const descriptors: Array<Interrupt> = []
      const bindingErrors: Array<InterruptSubmissionError> = []
      for (const interrupt of chunk.outcome.interrupts) {
        const binding = readUnopenedInterruptBinding(interrupt)
        if (!binding) {
          bindingErrors.push(
            itemError(
              {
                threadId: ctx.threadId,
                interruptedRunId: ctx.runId,
                generation: 0,
                pending: [],
                tools: [],
              },
              interrupt.id,
              'invalid-response-schema',
              `Interrupt ${interrupt.id} is missing a valid server binding.`,
              { source: 'server' },
            ),
          )
          continue
        }
        bindings.push(binding)
        descriptors.push(withoutInterruptBinding(interrupt))
      }
      if (bindingErrors.length > 0) {
        throw new InterruptResumeValidationError(bindingErrors)
      }
      let opened: Awaited<
        ReturnType<typeof persistence.stores.interrupts.openInterruptBatch>
      >
      try {
        opened = await persistence.stores.interrupts.openInterruptBatch({
          threadId: ctx.threadId,
          interruptedRunId: ctx.runId,
          descriptors,
          bindings,
        })
      } catch (error) {
        if (error instanceof InterruptResumeValidationError) throw error
        throw new InterruptResumeValidationError([
          batchError({
            threadId: ctx.threadId,
            interruptedRunId: ctx.runId,
            generation: 0,
            interruptIds,
            code: 'server',
            message: `Failed to persist interrupt batch: ${error instanceof Error ? error.message : String(error)}`,
            retryable: true,
          }),
        ])
      }
      await interruptRun(runs, ctx.runId)
      if (wantsMessages && persistence.stores.messages) {
        await persistence.stores.messages.saveThread(ctx.threadId, [
          ...ctx.messages,
        ])
      }
      state.interrupted = true
      const openedBindings = new Map<string, InterruptBinding>(
        bindings.map((binding) => [
          binding.interruptId,
          {
            ...binding,
            interruptedRunId: ctx.runId,
            generation: opened.generation,
          } satisfies InterruptBinding,
        ]),
      )
      return {
        ...chunk,
        outcome: {
          ...chunk.outcome,
          interrupts: chunk.outcome.interrupts.map((interrupt) => {
            const binding = openedBindings.get(interrupt.id)
            return binding
              ? {
                  ...interrupt,
                  metadata: {
                    ...interrupt.metadata,
                    [interruptBindingMetadataKey]: binding,
                  },
                }
              : interrupt
          }),
        },
      }
    },

    async onFinish(ctx: ChatMiddlewareContext, info: FinishInfo) {
      if (runState.get(ctx)?.interrupted) return
      await completeRun(runs, ctx.runId, info.usage)
      if (wantsMessages && persistence.stores.messages) {
        await persistence.stores.messages.saveThread(ctx.threadId, [
          ...ctx.messages,
        ])
      }
    },

    async onError(ctx: ChatMiddlewareContext, info: ErrorInfo) {
      await failRun(runs, ctx.runId, info.error)
    },

    async onAbort(ctx: ChatMiddlewareContext, _info: AbortInfo) {
      await interruptRun(runs, ctx.runId)
    },
  })
}

// ---------------------------------------------------------------------------
// Generation middleware
// ---------------------------------------------------------------------------

/**
 * Generation-only persistence middleware. Tracks run status and optionally
 * persists media artifacts/blobs for image, audio, TTS, video, and
 * transcription activities.
 */
export function withGenerationPersistence<TStores extends AIPersistenceStores>(
  persistence: AIPersistence<TStores> & ValidGenerationPersistence<TStores>,
  opts?: WithPersistenceOptions,
): GenerationMiddleware
export function withGenerationPersistence(
  persistence: AIPersistence,
  opts?: WithPersistenceOptions,
): GenerationMiddleware {
  validateGenerationPersistenceStores(persistence)
  const plan = resolvePersistencePlan(persistence)
  const { wantsArtifactPersistence, runs } = plan

  return {
    name: 'generation-persistence',

    async onStart(ctx: GenerationMiddlewareContext) {
      await createOrResumeRun(
        runs,
        ctx.runId ?? ctx.requestId,
        ctx.threadId ?? ctx.requestId,
      )
      if (!wantsArtifactPersistence) return
      ctx.resultTransforms?.push(async (result) => {
        const refs = await persistGenerationArtifacts(
          persistence,
          opts,
          ctx,
          result,
        )
        if (refs.length === 0) return undefined
        const existing = objectValue(result)?.artifacts
        return {
          ...(objectValue(result) ?? {}),
          artifacts: [...(Array.isArray(existing) ? existing : []), ...refs],
        }
      })
    },

    async onFinish(
      ctx: GenerationMiddlewareContext,
      info: GenerationFinishInfo,
    ) {
      await completeRun(runs, ctx.runId ?? ctx.requestId, info.usage)
    },

    async onError(ctx: GenerationMiddlewareContext, info: GenerationErrorInfo) {
      await failRun(runs, ctx.runId ?? ctx.requestId, info.error)
    },

    async onAbort(
      ctx: GenerationMiddlewareContext,
      _info: GenerationAbortInfo,
    ) {
      await interruptRun(runs, ctx.runId ?? ctx.requestId)
    },
  }
}
