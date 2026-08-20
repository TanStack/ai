import {
  INTERRUPT_BINDING_METADATA_KEY,
  INTERRUPT_BINDING_VERSION,
  canonicalInterruptJson,
  canonicalizeInterruptResolutions,
  cloneAndDeepFreezeJson,
  digestInterruptJson,
  genericInterruptContinuationFromDescriptor,
  hashInterruptDefinitionSchema,
  hashSchemaInput,
  isStandardSchema,
  normalizeApprovalSchema,
  readInterruptBinding,
  wrapGenericInterruptContinuation,
} from '@tanstack/ai/client'
import type {
  AnyClientTool,
  BatchInterruptError,
  Interrupt,
  InterruptBinding,
  InterruptDefinition,
  InterruptSubmissionError,
  ItemInterruptError,
  RunAgentResumeItem,
} from '@tanstack/ai/client'
import type {
  BoundInterruptBase,
  BoundInterrupts,
  ChatInterrupt,
  ChatInterruptState,
  GenericAGUIInterrupt,
  InterruptItemStatus,
  ResolvableChatInterrupt,
  UnboundInterrupt,
} from './types'

export interface InterruptManagerHydration {
  threadId: string
  interruptedRunId: string
  generation: number
  interrupts: ReadonlyArray<Interrupt>
}

export interface InterruptManagerSubmission {
  threadId: string
  interruptedRunId: string
  generation: number
  resolutions: ReadonlyArray<RunAgentResumeItem>
  canonicalResolutions: string
  fingerprint: string
}

export type InterruptManagerChangeSource = 'hydrate' | 'live'

export interface InterruptManagerOptions<
  TTools extends ReadonlyArray<AnyClientTool>,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    readonly [],
> {
  tools?: TTools
  interrupts?: TInterrupts
  submit: (submission: InterruptManagerSubmission) => Promise<void>
  onChange?: (source: InterruptManagerChangeSource) => void
}

type UnknownObject = { [key: string]: unknown }

type RuntimeKind =
  | 'generic'
  | 'tool-approval'
  | 'client-tool-execution'
  /** Carries no binding we understand — not ours to resume. */
  | 'unbound'

interface RuntimeInterrupt {
  descriptor: Interrupt
  /** `undefined` only for `unbound` items. */
  binding: InterruptBinding | undefined
  kind: RuntimeKind
  status: InterruptItemStatus
  canResolve: boolean
  error?: ItemInterruptError
  resolution?: RunAgentResumeItem
  tool?: AnyClientTool
  definition?: InterruptDefinition<any, any, any, any>
  /** Validated display payload for a registered first-party generic item. */
  payload?: unknown
  /** This binding is valid and can participate in this chat resume batch. */
  resumable: boolean
  validationGeneration: number
}

interface ValidationFailure {
  code: ItemInterruptError['code']
  message: string
  path?: ReadonlyArray<string | number>
}

type ValidationResult = { valid: true; payload: unknown } | ValidationFailure

interface TransactionToken {
  active: boolean
}

interface RuntimeInterruptCheckpoint {
  status: InterruptItemStatus
  resolution?: RunAgentResumeItem
  error?: ItemInterruptError
  validationGeneration: number
}

function isClientOwnedInterrupt(item: RuntimeInterrupt): boolean {
  return item.resumable
}

function resolutionWithContinuation(
  item: RuntimeInterrupt,
  resolution: RunAgentResumeItem,
): RunAgentResumeItem {
  const continuation = genericInterruptContinuationFromDescriptor(
    item.descriptor,
  )
  if (!continuation) return resolution
  return {
    ...resolution,
    metadata: wrapGenericInterruptContinuation(continuation),
  }
}

function isRootResolvableInterrupt<
  TTools extends ReadonlyArray<AnyClientTool>,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>>,
>(
  interrupt: ChatInterrupt<TTools, TInterrupts>,
): interrupt is ResolvableChatInterrupt<TTools, TInterrupts> {
  return 'cancel' in interrupt && 'clearResolution' in interrupt
}

const itemErrorCodes = new Set<ItemInterruptError['code']>([
  'invalid-payload',
  'invalid-edited-args',
  'invalid-tool-output',
  'invalid-response-schema',
  'unknown-interrupt',
  'expired',
  'stale',
  'conflict',
  'legacy-unsupported',
])

const batchErrorCodes = new Set<BatchInterruptError['code']>([
  'incomplete-batch',
  'item-validation-failed',
  'unsupported-bulk-operation',
  'async-resolver',
  'inactive-transaction',
  'mixed-provenance',
  'transport',
  'server',
  'protocol',
  'invalid-response-schema',
  'expired',
  'stale',
  'conflict',
  'legacy-submit-failed',
])

function isUnknownObject(value: unknown): value is UnknownObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isLegacyApprovalMetadata(value: unknown): boolean {
  return (
    isUnknownObject(value) &&
    value['kind'] === 'approval' &&
    typeof value['toolName'] === 'string' &&
    'input' in value
  )
}

function isLegacyClientToolMetadata(value: unknown): boolean {
  return (
    isUnknownObject(value) &&
    value['kind'] === 'client_tool' &&
    typeof value['toolName'] === 'string' &&
    'input' in value
  )
}

/**
 * Does this descriptor carry the pre-binding TanStack metadata marker?
 *
 * Descriptors emitted before the resume binding existed are still ours to
 * resume, so they must not be mistaken for another producer's interrupt.
 */
function isLegacyInterruptMetadata(interrupt: Interrupt): boolean {
  return (
    isLegacyApprovalMetadata(interrupt.metadata) ||
    isLegacyClientToolMetadata(interrupt.metadata)
  )
}

function getDescriptorBinding(
  interrupt: Interrupt,
): InterruptBinding | undefined {
  return readInterruptBinding(interrupt)
}

function hasReservedFirstPartyBindingMarker(interrupt: Interrupt): boolean {
  if (!isUnknownObject(interrupt.metadata)) return false
  const binding = interrupt.metadata[INTERRUPT_BINDING_METADATA_KEY]
  if (!isUnknownObject(binding)) return false
  if (
    binding['v'] !== undefined &&
    binding['v'] !== INTERRUPT_BINDING_VERSION
  ) {
    return false
  }
  return (
    binding['kind'] === 'generic' ||
    binding['kind'] === 'tool-approval' ||
    binding['kind'] === 'client-tool-execution' ||
    'definitionId' in binding ||
    'key' in binding ||
    'batchIndex' in binding ||
    'payloadSchemaHash' in binding
  )
}

function hasFirstPartyGenericMarker(interrupt: Interrupt): boolean {
  if (!isUnknownObject(interrupt.metadata)) return false
  const binding = interrupt.metadata[INTERRUPT_BINDING_METADATA_KEY]
  if (!isUnknownObject(binding) || binding['kind'] !== 'generic') return false
  return (
    'definitionId' in binding ||
    'key' in binding ||
    'batchIndex' in binding ||
    'payloadSchemaHash' in binding
  )
}

function getInterruptPayload(interrupt: Interrupt): unknown {
  return interrupt.metadata?.['tanstack:interruptPayload']
}

/**
 * Only used to route *legacy* (pre-binding) descriptors, which have no binding
 * to classify off. Current descriptors are classified by their binding alone.
 */
function isClientToolExecutionReason(reason: string): boolean {
  return (
    reason === 'tanstack:client_tool_execution' ||
    reason === 'client_tool_input'
  )
}

function responseSchemaHash(interrupt: Interrupt): string | undefined {
  if (interrupt.responseSchema === undefined) return undefined
  try {
    return digestInterruptJson(canonicalInterruptJson(interrupt.responseSchema))
  } catch {
    return undefined
  }
}

function definitionSchemaHash(
  schema: InterruptDefinition<any, any, any, any>['responseSchema'] | undefined,
): string | undefined {
  if (schema === undefined) return undefined
  try {
    return hashInterruptDefinitionSchema(schema)
  } catch {
    return undefined
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    'then' in value &&
    typeof value.then === 'function'
  )
}

function validateWithSchema(
  schema: unknown,
  value: unknown,
  code: ItemInterruptError['code'],
): ValidationResult | Promise<ValidationResult> {
  if (schema === undefined) return { valid: true, payload: value }
  if (isStandardSchema(schema)) {
    const result = schema['~standard'].validate(value)
    const normalize = (
      validation: Awaited<typeof result>,
    ): ValidationResult => {
      if (!validation.issues) {
        return { valid: true, payload: validation.value }
      }
      return {
        code,
        message: validation.issues[0]?.message ?? 'Schema validation failed.',
      }
    }
    return isPromiseLike(result)
      ? Promise.resolve(result).then(normalize)
      : normalize(result)
  }
  // A non-Standard-Schema value (a raw JSON Schema arriving over the wire) is
  // not validated by the library. The application transforms the schema and
  // validates the value itself before resolving; whatever it passes flows
  // through as-is.
  return { valid: true, payload: value }
}

function isItemErrorCode(value: string): value is ItemInterruptError['code'] {
  for (const code of itemErrorCodes) if (code === value) return true
  return false
}

function isBatchErrorCode(value: string): value is BatchInterruptError['code'] {
  for (const code of batchErrorCodes) if (code === value) return true
  return false
}

function isSubmissionError(value: unknown): value is InterruptSubmissionError {
  if (!isUnknownObject(value)) return false
  const scope = value['scope']
  const code = value['code']
  const base =
    typeof code === 'string' &&
    typeof value['message'] === 'string' &&
    typeof value['retryable'] === 'boolean' &&
    typeof value['threadId'] === 'string' &&
    typeof value['interruptedRunId'] === 'string' &&
    typeof value['generation'] === 'number'
  if (!base) return false
  if (scope === 'item') {
    return (
      isItemErrorCode(code) &&
      typeof value['interruptId'] === 'string' &&
      (value['source'] === 'client' || value['source'] === 'server')
    )
  }
  return (
    scope === 'batch' &&
    isBatchErrorCode(code) &&
    Array.isArray(value['interruptIds']) &&
    value['interruptIds'].every((id) => typeof id === 'string') &&
    (value['source'] === 'client' ||
      value['source'] === 'server' ||
      value['source'] === 'transport')
  )
}

function readSubmissionErrors(
  error: unknown,
): ReadonlyArray<InterruptSubmissionError> {
  if (isSubmissionError(error)) return [error]
  if (!isUnknownObject(error) || !Array.isArray(error['errors'])) return []
  return error['errors'].every(isSubmissionError) ? error['errors'] : []
}

function haveSameInterruptIds(
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
): boolean {
  if (left.length !== right.length) return false
  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((id, index) => id === sortedRight[index])
}

function haveSameBatchCorrelation(
  left: BatchInterruptError,
  right: BatchInterruptError,
): boolean {
  return (
    left.threadId === right.threadId &&
    left.interruptedRunId === right.interruptedRunId &&
    left.generation === right.generation &&
    haveSameInterruptIds(left.interruptIds, right.interruptIds)
  )
}

function mergeSubmissionBatchErrors(
  current: ReadonlyArray<BatchInterruptError>,
  previousSubmission: ReadonlyArray<BatchInterruptError>,
  incoming: ReadonlyArray<BatchInterruptError>,
): {
  rootErrors: ReadonlyArray<BatchInterruptError>
  submissionRootErrors: ReadonlyArray<BatchInterruptError>
} {
  const replaceableIncoming = incoming.filter(
    (error) => error.source !== 'transport',
  )
  const isSuperseded = (candidate: BatchInterruptError): boolean =>
    previousSubmission.includes(candidate) &&
    replaceableIncoming.some((error) =>
      haveSameBatchCorrelation(candidate, error),
    )
  const retainedRootErrors = current.filter(
    (candidate) => !isSuperseded(candidate),
  )
  const retainedSubmissionRootErrors = previousSubmission.filter(
    (candidate) =>
      !replaceableIncoming.some((error) =>
        haveSameBatchCorrelation(candidate, error),
      ),
  )
  return Object.freeze({
    rootErrors: Object.freeze([...retainedRootErrors, ...incoming]),
    submissionRootErrors: Object.freeze([
      ...retainedSubmissionRootErrors,
      ...replaceableIncoming,
    ]),
  })
}

function submissionErrorMatchesActiveBatch(
  error: InterruptSubmissionError,
  submission: InterruptManagerSubmission,
): boolean {
  if (
    error.threadId !== submission.threadId ||
    error.interruptedRunId !== submission.interruptedRunId ||
    error.generation !== submission.generation
  ) {
    return false
  }
  const interruptIds = submission.resolutions.map(
    (resolution) => resolution.interruptId,
  )
  return error.scope === 'item'
    ? interruptIds.includes(error.interruptId)
    : haveSameInterruptIds(error.interruptIds, interruptIds)
}

function genericBinding(
  interrupt: Interrupt,
  hydration: InterruptManagerHydration,
  candidate: InterruptBinding | undefined,
): InterruptBinding {
  const schemaHash =
    responseSchemaHash(interrupt) ?? candidate?.responseSchemaHash
  return cloneAndDeepFreezeJson({
    v: INTERRUPT_BINDING_VERSION,
    kind: 'generic',
    interruptId: interrupt.id,
    interruptedRunId: hydration.interruptedRunId,
    generation: hydration.generation,
    ...(schemaHash !== undefined ? { responseSchemaHash: schemaHash } : {}),
    ...(interrupt.expiresAt !== undefined
      ? { expiresAt: interrupt.expiresAt }
      : {}),
  })
}

function baseSnapshot(
  item: RuntimeInterrupt,
  hydration: InterruptManagerHydration,
): Omit<BoundInterruptBase, 'cancel' | 'clearResolution'> {
  const descriptor = cloneAndDeepFreezeJson(item.descriptor)
  const errors: ReadonlyArray<ItemInterruptError> =
    item.error === undefined
      ? Object.freeze([])
      : Object.freeze([cloneAndDeepFreezeJson(item.error)])
  const error = errors[0]
  return {
    id: descriptor.id,
    interruptId: descriptor.id,
    reason: descriptor.reason,
    ...(descriptor.message !== undefined
      ? { message: descriptor.message }
      : {}),
    ...(descriptor.responseSchema !== undefined
      ? { responseSchema: descriptor.responseSchema }
      : {}),
    ...(descriptor.expiresAt !== undefined
      ? { expiresAt: descriptor.expiresAt }
      : {}),
    ...(descriptor.metadata !== undefined
      ? { metadata: descriptor.metadata }
      : {}),
    threadId: hydration.threadId,
    interruptedRunId: hydration.interruptedRunId,
    generation: hydration.generation,
    status: item.status,
    errors,
    ...(error !== undefined ? { error } : {}),
    canResolve: item.canResolve,
  }
}

export class InterruptManager<
  TTools extends ReadonlyArray<AnyClientTool> = ReadonlyArray<AnyClientTool>,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    readonly [],
> {
  private hydration: InterruptManagerHydration | undefined
  private items: Array<RuntimeInterrupt> = []
  private snapshot: ReadonlyArray<ChatInterrupt<TTools, TInterrupts>> =
    Object.freeze([])
  private rootErrors: ReadonlyArray<BatchInterruptError> = Object.freeze([])
  private submissionRootErrors: ReadonlyArray<BatchInterruptError> =
    Object.freeze([])
  private state: ChatInterruptState<TTools, TInterrupts> = Object.freeze({
    interrupts: this.snapshot,
    pendingInterrupts: this.snapshot,
    interruptErrors: this.rootErrors,
    resuming: false,
  })
  private activeTransaction: TransactionToken | undefined
  private retrySubmission: InterruptManagerSubmission | undefined
  private resuming = false
  private tools: TTools | undefined
  private readonly interruptDefinitions: ReadonlyMap<
    string,
    InterruptDefinition<any, any, any, any>
  >

  constructor(
    private readonly options: InterruptManagerOptions<TTools, TInterrupts>,
  ) {
    this.tools = options.tools
    const definitions = new Map<
      string,
      InterruptDefinition<any, any, any, any>
    >()
    for (const definition of options.interrupts ?? []) {
      if (definitions.has(definition.id)) {
        throw new Error(`Duplicate interrupt definition id: ${definition.id}`)
      }
      definitions.set(definition.id, definition)
    }
    this.interruptDefinitions = definitions
  }

  updateTools(tools: TTools): void {
    this.tools = tools
  }

  hydrate(
    hydration: InterruptManagerHydration,
    source: InterruptManagerChangeSource = 'live',
  ): void {
    this.hydration = {
      threadId: hydration.threadId,
      interruptedRunId: hydration.interruptedRunId,
      generation: hydration.generation,
      interrupts: cloneAndDeepFreezeJson(hydration.interrupts),
    }
    const firstPartyIndexes = new Map<number, number>()
    for (const interrupt of hydration.interrupts) {
      const binding = getDescriptorBinding(interrupt)
      if (
        binding?.kind === 'generic' &&
        binding.definitionId !== undefined &&
        binding.key !== undefined &&
        binding.batchIndex !== undefined
      ) {
        firstPartyIndexes.set(
          binding.batchIndex,
          (firstPartyIndexes.get(binding.batchIndex) ?? 0) + 1,
        )
      }
    }
    this.items = hydration.interrupts.map((interrupt) =>
      this.hydrateInterrupt(interrupt, hydration, firstPartyIndexes),
    )
    this.rootErrors = Object.freeze([])
    this.submissionRootErrors = Object.freeze([])
    this.retrySubmission = undefined
    this.resuming = false
    this.publish(source)
  }

  getInterrupts(): BoundInterrupts<TTools, TInterrupts> {
    return this.snapshot
  }

  getState(): ChatInterruptState<TTools, TInterrupts> {
    return this.state
  }

  getDescriptors(): ReadonlyArray<Interrupt> {
    return this.hydration?.interrupts ?? Object.freeze([])
  }

  hasValidatedFirstPartyGenericBatch(): boolean {
    return this.items.some(
      (item) => item.kind === 'generic' && item.definition !== undefined,
    )
  }

  reset(options?: {
    preserveRootErrors?: boolean
    source?: InterruptManagerChangeSource
  }): void {
    this.hydration = undefined
    this.items = []
    this.snapshot = Object.freeze([])
    if (options?.preserveRootErrors !== true) {
      this.rootErrors = Object.freeze([])
      this.submissionRootErrors = Object.freeze([])
    }
    this.retrySubmission = undefined
    this.resuming = false
    this.state = Object.freeze({
      interrupts: this.snapshot,
      pendingInterrupts: this.snapshot,
      interruptErrors: this.rootErrors,
      resuming: false,
    })
    this.options.onChange?.(options?.source ?? 'live')
  }

  getInterruptErrors(): ReadonlyArray<BatchInterruptError> {
    return this.rootErrors
  }

  getResuming(): boolean {
    return this.resuming
  }

  resolve(approved: boolean): void
  resolve(
    resolver: (
      interrupt: ResolvableChatInterrupt<TTools, TInterrupts>,
    ) => undefined,
  ): void
  resolve(
    resolution:
      | boolean
      | ((interrupt: ResolvableChatInterrupt<TTools, TInterrupts>) => unknown),
  ): void {
    this.assertRootMutable()
    if (typeof resolution === 'boolean') {
      this.resolveBooleanBulk(resolution)
      return
    }
    this.resolveTransaction(resolution)
  }

  cancel(): void {
    this.assertRootMutable()
    this.invalidateRetry()
    for (const item of this.items) {
      if (!isClientOwnedInterrupt(item)) continue
      item.validationGeneration++
      item.resolution = Object.freeze(
        resolutionWithContinuation(item, {
          interruptId: item.descriptor.id,
          status: 'cancelled',
        }),
      )
      item.status = 'staged'
      item.error = undefined
    }
    this.publish()
    this.maybeSubmit()
  }

  retry(): void {
    if (this.resuming)
      throw new Error('Interrupt submission is already active.')
    const submission = this.retrySubmission
    if (!submission) {
      this.addRootError(
        'transport',
        'There is no retryable interrupt submission.',
        false,
      )
      return
    }
    this.submitBatch(submission)
  }

  resolveClientToolOutput(toolCallId: string, output: unknown): boolean {
    const item = this.items.find(
      (candidate) =>
        (candidate.kind === 'client-tool-execution' &&
          candidate.binding?.kind === 'client-tool-execution' &&
          candidate.binding.toolCallId === toolCallId) ||
        (candidate.kind === 'generic' &&
          isClientToolExecutionReason(candidate.descriptor.reason) &&
          candidate.descriptor.toolCallId === toolCallId &&
          isLegacyClientToolMetadata(candidate.descriptor.metadata)),
    )
    if (!item) return false
    this.resolveItem(item.descriptor.id, output)
    return true
  }

  resolveToolApprovalDecision(interruptId: string, approved: boolean): boolean {
    const item = this.items.find(
      (candidate) =>
        candidate.descriptor.id === interruptId &&
        (candidate.kind === 'tool-approval' ||
          (candidate.kind === 'generic' &&
            candidate.descriptor.reason === 'approval_required' &&
            isLegacyApprovalMetadata(candidate.descriptor.metadata))),
    )
    if (!item) return false
    this.resolveItem(item.descriptor.id, { approved })
    return true
  }

  private hydrateInterrupt(
    descriptor: Interrupt,
    hydration: InterruptManagerHydration,
    firstPartyIndexes: ReadonlyMap<number, number>,
  ): RuntimeInterrupt {
    const interrupt = cloneAndDeepFreezeJson(descriptor)
    const candidate = getDescriptorBinding(interrupt)
    const legacyResumable =
      candidate === undefined && isLegacyInterruptMetadata(interrupt)

    // No binding we understand, and nothing else identifying the descriptor as
    // ours, means this interrupt was not produced by this package's resume
    // path — a workflow engine's durable approval projected onto the same
    // AG-UI stream, a third-party agent's pause, or a binding written at a
    // protocol version we don't know.
    //
    // Do not invent a binding for it. Synthesising one would render a
    // resolvable form whose answer is submitted against a run that has no
    // matching pending descriptor, failing late as `unknown-interrupt` after
    // the user has already filled it in. Surface it as unresolvable instead,
    // so "someone else owns this pause" is visible rather than silently
    // translated into an AI-domain interrupt.
    //
    // Pre-binding TanStack descriptors are still ours: they carry the legacy
    // `metadata.kind` marker, so they keep hydrating through the generic path
    // below.
    if (candidate === undefined && !legacyResumable) {
      if (hasReservedFirstPartyBindingMarker(interrupt)) {
        return {
          descriptor: interrupt,
          binding: genericBinding(interrupt, hydration, undefined),
          kind: 'generic',
          status: 'error',
          canResolve: false,
          resumable: false,
          error: this.itemError(
            interrupt.id,
            'stale',
            'The interrupt binding is invalid or incomplete.',
          ),
          validationGeneration: 0,
        }
      }
      return {
        descriptor: interrupt,
        binding: undefined,
        kind: 'unbound',
        status: 'pending',
        canResolve: false,
        resumable: false,
        validationGeneration: 0,
      }
    }

    const correlated =
      candidate !== undefined &&
      candidate.interruptId === interrupt.id &&
      candidate.interruptedRunId === hydration.interruptedRunId &&
      candidate.generation === hydration.generation &&
      responseSchemaHash(interrupt) === candidate.responseSchemaHash

    const structurallyCorrelated =
      candidate !== undefined &&
      candidate.interruptId === interrupt.id &&
      candidate.interruptedRunId === hydration.interruptedRunId &&
      candidate.generation === hydration.generation &&
      candidate.responseSchemaHash ===
        (responseSchemaHash(interrupt) ?? candidate.responseSchemaHash)

    if (
      candidate !== undefined &&
      hasFirstPartyGenericMarker(interrupt) &&
      (!structurallyCorrelated ||
        candidate.kind !== 'generic' ||
        candidate.definitionId === undefined ||
        candidate.key === undefined ||
        candidate.batchIndex === undefined)
    ) {
      return {
        descriptor: interrupt,
        binding: genericBinding(interrupt, hydration, candidate),
        kind: 'generic',
        status: 'error',
        canResolve: false,
        resumable: false,
        error: this.itemError(
          interrupt.id,
          'stale',
          'The interrupt binding does not match this interrupted run.',
        ),
        validationGeneration: 0,
      }
    }

    if (structurallyCorrelated && candidate.kind === 'tool-approval') {
      const tool = this.tools?.find(
        (configured) => configured.name === candidate.toolName,
      )
      // Gated on the binding and the schema hashes below, not on
      // `interrupt.reason` — that string is free-form AG-UI text another
      // producer can also use, so it cannot be what decides ownership.
      if (
        tool?.needsApproval === true &&
        interrupt.toolCallId === candidate.toolCallId
      ) {
        try {
          const approval = normalizeApprovalSchema(
            tool.approvalSchema,
            tool.inputSchema,
          )
          if (
            hashSchemaInput(tool.inputSchema) === candidate.inputSchemaHash &&
            approval.approvalSchemaHash === candidate.approvalSchemaHash &&
            approval.responseSchemaHash === candidate.responseSchemaHash
          ) {
            return {
              descriptor: interrupt,
              binding: cloneAndDeepFreezeJson(candidate),
              kind: 'tool-approval',
              status: 'pending',
              canResolve: true,
              resumable: true,
              tool,
              validationGeneration: 0,
            }
          }
        } catch {
          // Invalid configured schemas cannot safely grant typed hydration.
        }
      }
    }

    if (structurallyCorrelated && candidate.kind === 'client-tool-execution') {
      const tool = this.tools?.find(
        (configured) => configured.name === candidate.toolName,
      )
      // Binding-gated, for the same reason as tool approvals above.
      if (
        tool !== undefined &&
        interrupt.toolCallId === candidate.toolCallId &&
        hashSchemaInput(tool.outputSchema) === candidate.outputSchemaHash
      ) {
        return {
          descriptor: interrupt,
          binding: cloneAndDeepFreezeJson(candidate),
          kind: 'client-tool-execution',
          status: 'pending',
          canResolve: true,
          resumable: true,
          tool,
          validationGeneration: 0,
        }
      }
    }

    if (
      candidate !== undefined &&
      candidate.kind === 'generic' &&
      candidate.definitionId !== undefined &&
      candidate.key !== undefined &&
      candidate.batchIndex !== undefined &&
      candidate.key.length > 0 &&
      firstPartyIndexes.get(candidate.batchIndex) !== 1
    ) {
      return {
        descriptor: interrupt,
        binding: cloneAndDeepFreezeJson(candidate),
        kind: 'generic',
        status: 'error',
        canResolve: false,
        resumable: false,
        error: this.itemError(
          interrupt.id,
          'stale',
          'Generic interrupt batch contains a duplicate batchIndex.',
        ),
        validationGeneration: 0,
      }
    }

    if (
      correlated &&
      candidate.kind === 'generic' &&
      candidate.definitionId !== undefined &&
      candidate.key !== undefined &&
      candidate.batchIndex !== undefined &&
      candidate.key.length > 0 &&
      firstPartyIndexes.get(candidate.batchIndex) === 1
    ) {
      const definition = this.interruptDefinitions.get(candidate.definitionId)
      if (
        definition !== undefined &&
        definitionSchemaHash(definition.responseSchema) ===
          candidate.responseSchemaHash &&
        (definition.payloadSchema === undefined
          ? candidate.payloadSchemaHash === undefined
          : candidate.payloadSchemaHash ===
            definitionSchemaHash(definition.payloadSchema))
      ) {
        const rawPayload = getInterruptPayload(interrupt)
        // First-party display payloads are parsed by definition.interrupt()
        // before the server emits them. Re-validating here would feed schema
        // output back through an input schema and reject transforms such as
        // z.string().transform(Number). The checks above still bind this value
        // to the exact descriptor, run, generation, definition, and schemas.
        return {
          descriptor: interrupt,
          binding: cloneAndDeepFreezeJson(candidate),
          definition,
          kind: 'generic',
          status: 'pending',
          canResolve: true,
          resumable: true,
          ...(rawPayload === undefined
            ? {}
            : { payload: cloneAndDeepFreezeJson(rawPayload) }),
          validationGeneration: 0,
        }
      }
    }

    const resumable =
      legacyResumable ||
      (candidate !== undefined &&
        candidate.interruptId === interrupt.id &&
        candidate.interruptedRunId === hydration.interruptedRunId &&
        candidate.generation === hydration.generation &&
        (candidate.kind !== 'generic' ||
          responseSchemaHash(interrupt) === undefined ||
          candidate.responseSchemaHash === responseSchemaHash(interrupt)))
    return {
      descriptor: interrupt,
      binding: genericBinding(interrupt, hydration, candidate),
      kind: 'generic',
      status: 'pending',
      // A valid raw binding is an explicit request to use this resume path,
      // even when this client has no registered first-party definition. Keep
      // it untyped, but preserve its existing generic controls. Missing,
      // malformed, and unsupported bindings remain display-only.
      canResolve: resumable,
      resumable,
      validationGeneration: 0,
    }
  }

  private buildSnapshot(
    transaction?: TransactionToken,
  ): BoundInterrupts<TTools, TInterrupts> {
    const hydration = this.requireHydration()
    // `client-tool-execution` items stay in `this.items` (they usually gate
    // batch submission and are resolved internally via auto-execution /
    // addToolResult), but they are never surfaced as public bound interrupts.
    // A mixed generic batch is the exception: those client tools wait for
    // `toolResume` and must not block submit.
    //
    // Items with status `submitting` are also omitted: the resume stream is
    // already in flight, so Approve/Deny is not actionable. Keeping them in
    // the public list made UIs look stuck after a successful approve and
    // blocked follow-up turns that key off `interrupts.length`.
    const next = this.items
      .filter(
        (item) =>
          item.kind !== 'client-tool-execution' && item.status !== 'submitting',
      )
      .map((item) => {
        const base = baseSnapshot(item, hydration)
        // Not ours to resume: expose the descriptor so a UI can show the run
        // is paused, with no `resolveInterrupt` to call.
        if (item.kind === 'unbound' || item.binding === undefined) {
          const snapshot: UnboundInterrupt = {
            ...base,
            kind: 'unbound',
            canResolve: false,
          }
          return Object.freeze(snapshot)
        }
        if (
          item.kind === 'tool-approval' &&
          item.binding.kind === 'tool-approval'
        ) {
          const binding = cloneAndDeepFreezeJson(item.binding)
          const snapshot = {
            ...base,
            kind: 'tool-approval' as const,
            binding,
            toolName: item.binding.toolName,
            toolCallId: item.binding.toolCallId,
            originalArgs: cloneAndDeepFreezeJson(item.binding.originalArgs),
            cancel: () => this.cancelItem(item.descriptor.id, transaction),
            clearResolution: () =>
              this.clearItem(item.descriptor.id, transaction),
            resolveInterrupt: (approved: boolean, options?: unknown) => {
              const details = isUnknownObject(options) ? options : undefined
              this.resolveItem(
                item.descriptor.id,
                {
                  approved,
                  ...(approved && details?.['editedArgs'] !== undefined
                    ? { editedArgs: details['editedArgs'] }
                    : {}),
                  ...(details?.['payload'] !== undefined
                    ? { payload: details['payload'] }
                    : {}),
                },
                transaction,
              )
            },
          }
          return Object.freeze(snapshot)
        }
        const boundGeneric =
          item.binding.kind === 'generic'
            ? cloneAndDeepFreezeJson(item.binding)
            : cloneAndDeepFreezeJson({
                v: INTERRUPT_BINDING_VERSION,
                kind: 'generic' as const,
                interruptId: item.descriptor.id,
                interruptedRunId: hydration.interruptedRunId,
                generation: hydration.generation,
                ...(typeof item.binding.responseSchemaHash === 'string'
                  ? { responseSchemaHash: item.binding.responseSchemaHash }
                  : {}),
              })
        if (item.definition !== undefined && item.binding.kind === 'generic') {
          const snapshot = {
            ...base,
            kind: 'generic',
            definitionId: item.definition.id,
            key: item.binding.key ?? '',
            payload: item.payload,
            binding: boundGeneric,
            cancel: () => this.cancelItem(item.descriptor.id, transaction),
            clearResolution: () =>
              this.clearItem(item.descriptor.id, transaction),
            resolveInterrupt: (response: unknown) =>
              this.resolveItem(item.descriptor.id, response, transaction),
          }
          return Object.freeze(snapshot)
        }
        const snapshot: GenericAGUIInterrupt = {
          ...base,
          kind: 'generic',
          binding: boundGeneric,
          cancel: () => this.cancelItem(item.descriptor.id, transaction),
          clearResolution: () =>
            this.clearItem(item.descriptor.id, transaction),
          resolveInterrupt: (payload) =>
            this.resolveItem(item.descriptor.id, payload, transaction),
        }
        return Object.freeze(snapshot)
      })

    // The runtime items are created only from the exact configured TTools entry
    // selected by name. TypeScript cannot preserve that per-element lookup
    // through Array.map, so this generic return boundary restores the proven
    // distributive public union.
    return Object.freeze(next) as BoundInterrupts<TTools, TInterrupts>
  }

  // Provenance belongs to each publication because `onChange` may synchronously
  // mutate the manager and publish again before an outer callback returns.
  private publish(source: InterruptManagerChangeSource = 'live'): void {
    if (!this.hydration) {
      this.snapshot = Object.freeze([])
      this.state = Object.freeze({
        interrupts: this.snapshot,
        pendingInterrupts: this.snapshot,
        interruptErrors: this.rootErrors,
        resuming: this.resuming,
      })
      this.options.onChange?.(source)
      return
    }
    this.snapshot = this.buildSnapshot()
    this.state = Object.freeze({
      interrupts: this.snapshot,
      pendingInterrupts: this.snapshot,
      interruptErrors: this.rootErrors,
      resuming: this.resuming,
    })
    this.options.onChange?.(source)
  }

  private resolveItem(
    interruptId: string,
    payload: unknown,
    transaction?: TransactionToken,
  ): void {
    this.assertItemMutable(transaction)
    const item = this.findItem(interruptId)
    this.invalidateRetry()
    if (!item.canResolve) {
      item.status = 'error'
      item.error = this.itemError(
        interruptId,
        'invalid-response-schema',
        'The interrupt response schema is invalid and cannot be resolved.',
      )
      if (!transaction) this.publish()
      return
    }
    const validationGeneration = ++item.validationGeneration
    const validation = this.validateCandidate(item, payload)
    if (isPromiseLike(validation)) {
      item.status = 'validating'
      item.error = undefined
      if (!transaction) this.publish()
      void Promise.resolve(validation)
        .then((result) => {
          if (validationGeneration !== item.validationGeneration) return
          this.applyValidation(item, result, transaction)
        })
        .catch((error: unknown) => {
          if (validationGeneration !== item.validationGeneration) return
          this.applyValidation(
            item,
            {
              code: this.validationCode(item),
              message: error instanceof Error ? error.message : String(error),
            },
            transaction,
          )
        })
      return
    }
    this.applyValidation(item, validation, transaction)
  }

  private cancelItem(
    interruptId: string,
    transaction?: TransactionToken,
  ): void {
    this.assertItemMutable(transaction)
    const item = this.findItem(interruptId)
    this.invalidateRetry()
    item.validationGeneration++
    item.resolution = Object.freeze(
      resolutionWithContinuation(item, { interruptId, status: 'cancelled' }),
    )
    item.status = 'staged'
    item.error = undefined
    if (!transaction) {
      this.publish()
      this.maybeSubmit()
    }
  }

  private clearItem(interruptId: string, transaction?: TransactionToken): void {
    this.assertItemMutable(transaction)
    const item = this.findItem(interruptId)
    this.invalidateRetry()
    item.validationGeneration++
    item.resolution = undefined
    item.error = undefined
    item.status = 'pending'
    if (!transaction) this.publish()
  }

  private maybeSubmit(): void {
    // Unbound items can never be resolved through this path — something else
    // owns them. Including them in the completeness gate would deadlock the
    // batch, so the run's own interrupts could never be answered once a
    // foreign one shared the stream.
    const hasGeneric = this.items.some((item) => item.kind === 'generic')
    const ours = this.items.filter(
      (item) =>
        isClientOwnedInterrupt(item) &&
        !(hasGeneric && item.kind === 'client-tool-execution'),
    )
    if (
      ours.length === 0 ||
      ours.some(
        (item) => item.resolution === undefined || item.status !== 'staged',
      )
    ) {
      return
    }
    const hydration = this.requireHydration()
    const canonical = canonicalizeInterruptResolutions(
      ours.map((item) => item.resolution).filter((item) => item !== undefined),
    )
    const submission = Object.freeze({
      threadId: hydration.threadId,
      interruptedRunId: hydration.interruptedRunId,
      generation: hydration.generation,
      resolutions: canonical.resolutions,
      canonicalResolutions: canonical.canonicalResolutions,
      fingerprint: canonical.fingerprint,
    })
    this.submitBatch(submission)
  }

  private applyValidation(
    item: RuntimeInterrupt,
    result: ValidationResult,
    transaction?: TransactionToken,
  ): void {
    if (!('valid' in result)) {
      item.status = 'error'
      const itemError = this.itemError(
        item.descriptor.id,
        result.code,
        result.message,
        result.path,
      )
      item.error = itemError
      // Client-tool-execution items are hidden from the public interrupt list,
      // so promote their validation failures onto interruptErrors for the UI.
      if (item.kind === 'client-tool-execution') {
        this.rootErrors = Object.freeze([
          ...this.rootErrors.filter(
            (error) =>
              !(
                error.code === 'item-validation-failed' &&
                error.interruptIds.includes(item.descriptor.id)
              ),
          ),
          Object.freeze({
            scope: 'batch' as const,
            code: 'item-validation-failed' as const,
            message: itemError.message,
            source: 'client' as const,
            retryable: false,
            interruptIds: Object.freeze([item.descriptor.id]),
            threadId: itemError.threadId,
            interruptedRunId: itemError.interruptedRunId,
            generation: itemError.generation,
          }),
        ])
      }
      if (!transaction) this.publish()
      return
    }
    item.resolution = cloneAndDeepFreezeJson(
      resolutionWithContinuation(item, {
        interruptId: item.descriptor.id,
        status: 'resolved',
        payload: result.payload,
      }),
    )
    item.status = 'staged'
    item.error = undefined
    if (!transaction) {
      this.publish()
      this.maybeSubmit()
    }
  }

  private validateCandidate(
    item: RuntimeInterrupt,
    payload: unknown,
  ): ValidationResult | Promise<ValidationResult> {
    if (item.kind === 'generic') {
      const validation = validateWithSchema(
        item.definition?.responseSchema ?? item.descriptor.responseSchema,
        payload,
        'invalid-payload',
      )
      if (item.definition === undefined) return validation
      const preserveInput = (result: ValidationResult): ValidationResult =>
        'valid' in result ? { valid: true, payload } : result
      return isPromiseLike(validation)
        ? Promise.resolve(validation).then(preserveInput)
        : preserveInput(validation)
    }
    if (item.kind === 'client-tool-execution') {
      return validateWithSchema(
        item.tool?.outputSchema,
        payload,
        'invalid-tool-output',
      )
    }
    return this.validateApprovalCandidate(item, payload)
  }

  private validateApprovalCandidate(
    item: RuntimeInterrupt,
    payload: unknown,
  ): ValidationResult | Promise<ValidationResult> {
    if (!isUnknownObject(payload) || typeof payload['approved'] !== 'boolean') {
      return {
        code: 'invalid-payload',
        message: 'Tool approval resolutions require an approved boolean.',
      }
    }
    const approved = payload['approved']
    const editedArgs = payload['editedArgs']
    if (!approved && editedArgs !== undefined) {
      return {
        code: 'invalid-edited-args',
        message: 'Rejected tool approvals cannot edit tool arguments.',
      }
    }
    if (approved && editedArgs !== undefined) {
      const editedValidation = validateWithSchema(
        item.tool?.inputSchema,
        editedArgs,
        'invalid-edited-args',
      )
      if (isPromiseLike(editedValidation)) {
        return Promise.resolve(editedValidation).then((result) =>
          'valid' in result
            ? this.validateApprovalPayload(item, payload, result.payload)
            : result,
        )
      }
      if (!('valid' in editedValidation)) return editedValidation
      return this.validateApprovalPayload(
        item,
        payload,
        editedValidation.payload,
      )
    }
    return this.validateApprovalPayload(item, payload, undefined)
  }

  private validateApprovalPayload(
    item: RuntimeInterrupt,
    envelope: UnknownObject,
    validatedEditedArgs: unknown,
  ): ValidationResult | Promise<ValidationResult> {
    const approved = envelope['approved'] === true
    const schema = this.approvalBranchSchema(item.tool, approved)
    const branchPayload = envelope['payload']
    if (schema === undefined && branchPayload !== undefined) {
      return {
        code: 'invalid-payload',
        message: 'This approval branch does not accept a payload.',
      }
    }
    if (schema !== undefined && branchPayload === undefined) {
      return {
        code: 'invalid-payload',
        message: 'This approval branch requires a payload.',
      }
    }
    const validation = validateWithSchema(
      schema,
      branchPayload,
      'invalid-payload',
    )
    const buildEnvelope = (result: ValidationResult): ValidationResult => {
      if (!('valid' in result)) return result
      return {
        valid: true,
        payload: {
          approved,
          ...(validatedEditedArgs !== undefined
            ? { editedArgs: validatedEditedArgs }
            : {}),
          ...(schema !== undefined ? { payload: result.payload } : {}),
        },
      }
    }
    return isPromiseLike(validation)
      ? Promise.resolve(validation).then(buildEnvelope)
      : buildEnvelope(validation)
  }

  private approvalBranchSchema(
    tool: AnyClientTool | undefined,
    approved: boolean,
  ): unknown {
    const approvalSchema: unknown = tool?.approvalSchema
    if (!isUnknownObject(approvalSchema)) return approvalSchema
    const hasBranches =
      'approve' in approvalSchema || 'reject' in approvalSchema
    if (!hasBranches) return approvalSchema
    return approved ? approvalSchema['approve'] : approvalSchema['reject']
  }

  private validationCode(item: RuntimeInterrupt): ItemInterruptError['code'] {
    return item.kind === 'client-tool-execution'
      ? 'invalid-tool-output'
      : 'invalid-payload'
  }

  private resolveBooleanBulk(approved: boolean): void {
    // `client-tool-execution` items resolve out-of-band (auto execution /
    // addToolResult); they are transparent to the boolean shorthand. Eligibility
    // and resolution consider only the publicly resolvable items.
    const resolvable = this.items.filter(
      (item) =>
        isClientOwnedInterrupt(item) && item.kind !== 'client-tool-execution',
    )
    const eligible = resolvable.every(
      (item) =>
        item.kind === 'tool-approval' &&
        this.approvalBranchSchema(item.tool, approved) === undefined,
    )
    if (!eligible || resolvable.length === 0) {
      this.addRootError(
        'unsupported-bulk-operation',
        'Boolean bulk resolution requires payloadless tool approvals.',
        false,
      )
      return
    }
    this.invalidateRetry()
    for (const item of resolvable) {
      item.validationGeneration++
      item.resolution = cloneAndDeepFreezeJson({
        interruptId: item.descriptor.id,
        status: 'resolved',
        payload: { approved },
      })
      item.status = 'staged'
      item.error = undefined
    }
    this.publish()
    this.maybeSubmit()
  }

  private resolveTransaction(
    resolver: (
      interrupt: ResolvableChatInterrupt<TTools, TInterrupts>,
    ) => unknown,
  ): void {
    const checkpoints = this.items.map<RuntimeInterruptCheckpoint>((item) => ({
      status: item.status,
      ...(item.resolution !== undefined ? { resolution: item.resolution } : {}),
      ...(item.error !== undefined ? { error: item.error } : {}),
      validationGeneration: item.validationGeneration,
    }))
    const token: TransactionToken = { active: true }
    this.activeTransaction = token
    const stable = this.buildSnapshot(token).filter(isRootResolvableInterrupt)
    let failure:
      | { code: BatchInterruptError['code']; message: string }
      | undefined
    try {
      for (const interrupt of stable) {
        const result = resolver(interrupt)
        if (result !== undefined) {
          failure = {
            code: isPromiseLike(result)
              ? 'async-resolver'
              : 'inactive-transaction',
            message: isPromiseLike(result)
              ? 'Interrupt transaction resolvers must be synchronous.'
              : 'Interrupt transaction resolvers must return literal undefined.',
          }
          break
        }
      }
      if (
        failure === undefined &&
        this.items.some(
          (item) =>
            // `client-tool-execution` items are resolved out-of-band (auto
            // execution / addToolResult), not by this synchronous resolver, so
            // they don't count against transaction completeness. `maybeSubmit`
            // still waits for them unless a generic interrupt shares the batch.
            isClientOwnedInterrupt(item) &&
            item.kind !== 'client-tool-execution' &&
            (item.resolution === undefined || item.status !== 'staged'),
        )
      ) {
        failure = {
          code: 'incomplete-batch',
          message: 'Interrupt transaction did not resolve every item.',
        }
      }
    } catch (error) {
      failure = {
        code: 'item-validation-failed',
        message: error instanceof Error ? error.message : String(error),
      }
    } finally {
      token.active = false
      this.activeTransaction = undefined
    }

    if (failure) {
      this.restoreCheckpoints(checkpoints)
      this.addRootError(failure.code, failure.message, false)
      return
    }
    this.publish()
    this.maybeSubmit()
  }

  private restoreCheckpoints(
    checkpoints: ReadonlyArray<RuntimeInterruptCheckpoint>,
  ): void {
    this.items.forEach((item, index) => {
      const checkpoint = checkpoints[index]
      if (!checkpoint) return
      item.status = checkpoint.status
      item.resolution = checkpoint.resolution
      item.error = checkpoint.error
      item.validationGeneration = checkpoint.validationGeneration + 1
    })
    this.publish()
  }

  private assertItemMutable(transaction?: TransactionToken): void {
    if (transaction && !transaction.active) {
      throw new Error('Interrupt transaction is inactive.')
    }
    if (this.activeTransaction && transaction !== this.activeTransaction) {
      throw new Error('Interrupt transaction is inactive.')
    }
    if (this.resuming) {
      throw new Error('Interrupts cannot be mutated while submitting.')
    }
  }

  private assertRootMutable(): void {
    if (this.activeTransaction) {
      throw new Error('Interrupt transaction is already active.')
    }
    if (this.resuming) {
      throw new Error('Interrupts cannot be mutated while submitting.')
    }
  }

  private invalidateRetry(): void {
    this.retrySubmission = undefined
  }

  private submitBatch(submission: InterruptManagerSubmission): void {
    this.resuming = true
    this.retrySubmission = undefined
    for (const item of this.items) {
      if (isClientOwnedInterrupt(item)) item.status = 'submitting'
    }
    this.publish()
    void this.performSubmission(submission)
  }

  private async performSubmission(
    submission: InterruptManagerSubmission,
  ): Promise<void> {
    try {
      await this.options.submit(submission)
    } catch (error) {
      this.handleSubmissionFailure(error, submission)
    } finally {
      this.resuming = false
      this.publish()
    }
  }

  private handleSubmissionFailure(
    error: unknown,
    submission: InterruptManagerSubmission,
  ): void {
    const errors = readSubmissionErrors(error)
    if (errors.length === 0) {
      const message = error instanceof Error ? error.message : String(error)
      this.addRootError('transport', message, true, 'transport')
      this.retrySubmission = submission
      for (const item of this.items) {
        if (isClientOwnedInterrupt(item)) item.status = 'error'
      }
      return
    }

    const correlatedErrors = errors.filter((submissionError) =>
      submissionErrorMatchesActiveBatch(submissionError, submission),
    )
    if (correlatedErrors.length !== errors.length) {
      this.addRootError(
        'protocol',
        'Interrupt submission errors did not match the active batch.',
        false,
      )
    }

    let nonRetryable = false
    let retryable = false
    const batchErrors: Array<BatchInterruptError> = []
    for (const submissionError of correlatedErrors) {
      if (
        submissionError.code === 'stale' ||
        submissionError.code === 'expired' ||
        submissionError.code === 'conflict'
      ) {
        nonRetryable = true
      }
      retryable ||= submissionError.retryable
      if (submissionError.scope === 'item') {
        const item = this.items.find(
          (candidate) =>
            isClientOwnedInterrupt(candidate) &&
            candidate.descriptor.id === submissionError.interruptId,
        )
        if (item) {
          item.status = 'error'
          item.error = cloneAndDeepFreezeJson(submissionError)
        }
      } else {
        batchErrors.push(cloneAndDeepFreezeJson(submissionError))
      }
    }
    const mergedBatchErrors = mergeSubmissionBatchErrors(
      this.rootErrors,
      this.submissionRootErrors,
      batchErrors,
    )
    this.rootErrors = mergedBatchErrors.rootErrors
    this.submissionRootErrors = mergedBatchErrors.submissionRootErrors
    for (const item of this.items) {
      if (isClientOwnedInterrupt(item) && item.status === 'submitting') {
        item.status = 'error'
      }
    }
    this.retrySubmission = retryable && !nonRetryable ? submission : undefined
  }

  private addRootError(
    code: BatchInterruptError['code'],
    message: string,
    retryable: boolean,
    source: BatchInterruptError['source'] = 'client',
  ): void {
    const hydration = this.requireHydration()
    this.rootErrors = Object.freeze([
      ...this.rootErrors,
      Object.freeze({
        scope: 'batch' as const,
        code,
        message,
        source,
        retryable,
        interruptIds: Object.freeze(
          this.items
            .filter(isClientOwnedInterrupt)
            .map((item) => item.descriptor.id),
        ),
        threadId: hydration.threadId,
        interruptedRunId: hydration.interruptedRunId,
        generation: hydration.generation,
      }),
    ])
    this.publish()
  }

  private findItem(interruptId: string): RuntimeInterrupt {
    const item = this.items.find(
      (candidate) => candidate.descriptor.id === interruptId,
    )
    if (!item) throw new Error(`Unknown interrupt: ${interruptId}`)
    return item
  }

  private requireHydration(): InterruptManagerHydration {
    if (!this.hydration) throw new Error('InterruptManager is not hydrated.')
    return this.hydration
  }

  private itemError(
    interruptId: string,
    code: ItemInterruptError['code'],
    message: string,
    path?: ReadonlyArray<string | number>,
  ): ItemInterruptError {
    const hydration = this.requireHydration()
    return Object.freeze({
      scope: 'item',
      interruptId,
      code,
      message,
      ...(path !== undefined ? { path: Object.freeze([...path]) } : {}),
      source: 'client',
      retryable: false,
      threadId: hydration.threadId,
      interruptedRunId: hydration.interruptedRunId,
      generation: hydration.generation,
    })
  }
}
