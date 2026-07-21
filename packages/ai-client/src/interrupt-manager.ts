import {
  canonicalInterruptJson,
  canonicalizeInterruptResolutions,
  cloneAndDeepFreezeJson,
  compileJsonSchema202012,
  digestInterruptJson,
  hashSchemaInput,
  isStandardSchema,
  normalizeApprovalSchema,
} from '@tanstack/ai/client'
import type {
  AnyClientTool,
  BatchInterruptError,
  Interrupt,
  InterruptBinding,
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

export interface InterruptManagerOptions<
  TTools extends ReadonlyArray<AnyClientTool>,
> {
  tools?: TTools
  submit: (submission: InterruptManagerSubmission) => Promise<void>
  onChange?: () => void
}

type UnknownObject = { [key: string]: unknown }

type RuntimeKind = 'generic' | 'tool-approval' | 'client-tool-execution'

interface RuntimeInterrupt {
  descriptor: Interrupt
  binding: InterruptBinding
  kind: RuntimeKind
  status: InterruptItemStatus
  canResolve: boolean
  error?: ItemInterruptError
  resolution?: RunAgentResumeItem
  tool?: AnyClientTool
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
  'persistence-required',
  'atomic-commit-unsupported',
  'recovery-unavailable',
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

function isBindingBase(value: UnknownObject): boolean {
  return (
    typeof value['kind'] === 'string' &&
    typeof value['interruptId'] === 'string' &&
    typeof value['interruptedRunId'] === 'string' &&
    typeof value['generation'] === 'number' &&
    Number.isInteger(value['generation']) &&
    value['generation'] >= 0 &&
    typeof value['responseSchemaHash'] === 'string' &&
    (value['expiresAt'] === undefined ||
      (typeof value['expiresAt'] === 'string' &&
        Number.isFinite(Date.parse(value['expiresAt']))))
  )
}

function readBinding(value: unknown): InterruptBinding | undefined {
  if (!isUnknownObject(value) || !isBindingBase(value)) return undefined
  const expiresAt =
    typeof value['expiresAt'] === 'string' ? value['expiresAt'] : undefined
  if (value['kind'] === 'generic') {
    return {
      kind: 'generic',
      interruptId: String(value['interruptId']),
      interruptedRunId: String(value['interruptedRunId']),
      generation: Number(value['generation']),
      responseSchemaHash: String(value['responseSchemaHash']),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    }
  }
  if (
    value['kind'] === 'client-tool-execution' &&
    typeof value['toolName'] === 'string' &&
    typeof value['toolCallId'] === 'string' &&
    typeof value['outputSchemaHash'] === 'string'
  ) {
    return {
      kind: 'client-tool-execution',
      interruptId: String(value['interruptId']),
      interruptedRunId: String(value['interruptedRunId']),
      generation: Number(value['generation']),
      toolName: value['toolName'],
      toolCallId: value['toolCallId'],
      outputSchemaHash: value['outputSchemaHash'],
      responseSchemaHash: String(value['responseSchemaHash']),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    }
  }
  if (
    value['kind'] === 'tool-approval' &&
    typeof value['toolName'] === 'string' &&
    typeof value['toolCallId'] === 'string' &&
    typeof value['inputSchemaHash'] === 'string' &&
    typeof value['approvalSchemaHash'] === 'string' &&
    'originalArgs' in value
  ) {
    return {
      kind: 'tool-approval',
      interruptId: String(value['interruptId']),
      interruptedRunId: String(value['interruptedRunId']),
      generation: Number(value['generation']),
      toolName: value['toolName'],
      toolCallId: value['toolCallId'],
      originalArgs: value['originalArgs'],
      inputSchemaHash: value['inputSchemaHash'],
      approvalSchemaHash: value['approvalSchemaHash'],
      responseSchemaHash: String(value['responseSchemaHash']),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    }
  }
  return undefined
}

function getDescriptorBinding(
  interrupt: Interrupt,
): InterruptBinding | undefined {
  const candidate: unknown = interrupt.metadata?.['tanstack:interruptBinding']
  return readBinding(candidate)
}

function isToolApprovalReason(reason: string): boolean {
  return reason === 'tool_call' || reason === 'approval_required'
}

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

function canValidateGeneric(interrupt: Interrupt): boolean {
  if (interrupt.responseSchema === undefined) return true
  try {
    compileJsonSchema202012(interrupt.responseSchema)
    return true
  } catch {
    return false
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
  try {
    const issues = compileJsonSchema202012(schema)(value)
    const issue = issues[0]
    return issue
      ? { code, message: issue.message, path: issue.path }
      : { valid: true, payload: value }
  } catch {
    return {
      code: 'invalid-response-schema',
      message: 'The interrupt response schema is invalid.',
    }
  }
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
  return cloneAndDeepFreezeJson({
    kind: 'generic',
    interruptId: interrupt.id,
    interruptedRunId: hydration.interruptedRunId,
    generation: hydration.generation,
    responseSchemaHash:
      responseSchemaHash(interrupt) ??
      candidate?.responseSchemaHash ??
      'invalid',
    ...(interrupt.expiresAt !== undefined
      ? { expiresAt: interrupt.expiresAt }
      : {}),
  })
}

function baseSnapshot(
  item: RuntimeInterrupt,
  hydration: InterruptManagerHydration,
  cancel: () => void,
  clearResolution: () => void,
): BoundInterruptBase {
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
    cancel,
    clearResolution,
  }
}

export class InterruptManager<
  TTools extends ReadonlyArray<AnyClientTool> = ReadonlyArray<AnyClientTool>,
> {
  private hydration: InterruptManagerHydration | undefined
  private items: Array<RuntimeInterrupt> = []
  private snapshot: ReadonlyArray<ChatInterrupt<TTools>> = Object.freeze([])
  private rootErrors: ReadonlyArray<BatchInterruptError> = Object.freeze([])
  private submissionRootErrors: ReadonlyArray<BatchInterruptError> =
    Object.freeze([])
  private state: ChatInterruptState<TTools> = Object.freeze({
    interrupts: this.snapshot,
    pendingInterrupts: this.snapshot,
    interruptErrors: this.rootErrors,
    resuming: false,
  })
  private activeTransaction: TransactionToken | undefined
  private retrySubmission: InterruptManagerSubmission | undefined
  private resuming = false
  private tools: TTools | undefined

  constructor(private readonly options: InterruptManagerOptions<TTools>) {
    this.tools = options.tools
  }

  updateTools(tools: TTools): void {
    this.tools = tools
  }

  hydrate(hydration: InterruptManagerHydration): void {
    this.hydration = {
      threadId: hydration.threadId,
      interruptedRunId: hydration.interruptedRunId,
      generation: hydration.generation,
      interrupts: cloneAndDeepFreezeJson(hydration.interrupts),
    }
    this.items = hydration.interrupts.map((interrupt) =>
      this.hydrateInterrupt(interrupt, hydration),
    )
    this.rootErrors = Object.freeze([])
    this.submissionRootErrors = Object.freeze([])
    this.retrySubmission = undefined
    this.resuming = false
    this.publish()
  }

  getInterrupts(): BoundInterrupts<TTools> {
    return this.snapshot
  }

  getState(): ChatInterruptState<TTools> {
    return this.state
  }

  getDescriptors(): ReadonlyArray<Interrupt> {
    return this.hydration?.interrupts ?? Object.freeze([])
  }

  reset(options?: { preserveRootErrors?: boolean }): void {
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
    this.options.onChange?.()
  }

  getInterruptErrors(): ReadonlyArray<BatchInterruptError> {
    return this.rootErrors
  }

  getResuming(): boolean {
    return this.resuming
  }

  resolve(approved: boolean): void
  resolve(resolver: (interrupt: ChatInterrupt<TTools>) => undefined): void
  resolve(
    resolution: boolean | ((interrupt: ChatInterrupt<TTools>) => unknown),
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
      item.validationGeneration++
      item.resolution = Object.freeze({
        interruptId: item.descriptor.id,
        status: 'cancelled',
      })
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
          candidate.binding.kind === 'client-tool-execution' &&
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
  ): RuntimeInterrupt {
    const interrupt = cloneAndDeepFreezeJson(descriptor)
    const candidate = getDescriptorBinding(interrupt)
    const correlated =
      candidate !== undefined &&
      candidate.interruptId === interrupt.id &&
      candidate.interruptedRunId === hydration.interruptedRunId &&
      candidate.generation === hydration.generation &&
      candidate.responseSchemaHash ===
        (responseSchemaHash(interrupt) ?? candidate.responseSchemaHash)

    if (correlated && candidate.kind === 'tool-approval') {
      const tool = this.tools?.find(
        (configured) => configured.name === candidate.toolName,
      )
      if (
        tool?.needsApproval === true &&
        isToolApprovalReason(interrupt.reason) &&
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
              tool,
              validationGeneration: 0,
            }
          }
        } catch {
          // Invalid configured schemas cannot safely grant typed hydration.
        }
      }
    }

    if (correlated && candidate.kind === 'client-tool-execution') {
      const tool = this.tools?.find(
        (configured) => configured.name === candidate.toolName,
      )
      if (
        tool !== undefined &&
        isClientToolExecutionReason(interrupt.reason) &&
        interrupt.toolCallId === candidate.toolCallId &&
        hashSchemaInput(tool.outputSchema) === candidate.outputSchemaHash
      ) {
        return {
          descriptor: interrupt,
          binding: cloneAndDeepFreezeJson(candidate),
          kind: 'client-tool-execution',
          status: 'pending',
          canResolve: true,
          tool,
          validationGeneration: 0,
        }
      }
    }

    return {
      descriptor: interrupt,
      binding: genericBinding(interrupt, hydration, candidate),
      kind: 'generic',
      status: 'pending',
      canResolve: canValidateGeneric(interrupt),
      validationGeneration: 0,
    }
  }

  private buildSnapshot(
    transaction?: TransactionToken,
  ): BoundInterrupts<TTools> {
    const hydration = this.requireHydration()
    // `client-tool-execution` items stay in `this.items` (they gate batch
    // submission and are resolved internally via auto-execution / addToolResult),
    // but they are never surfaced as public bound interrupts.
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
        const base = baseSnapshot(
          item,
          hydration,
          () => this.cancelItem(item.descriptor.id, transaction),
          () => this.clearItem(item.descriptor.id, transaction),
        )
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
                kind: 'generic' as const,
                interruptId: item.descriptor.id,
                interruptedRunId: hydration.interruptedRunId,
                generation: hydration.generation,
                responseSchemaHash:
                  typeof item.binding.responseSchemaHash === 'string'
                    ? item.binding.responseSchemaHash
                    : 'none',
              })
        const snapshot: GenericAGUIInterrupt = {
          ...base,
          kind: 'generic',
          binding: boundGeneric,
          resolveInterrupt: (payload) =>
            this.resolveItem(item.descriptor.id, payload, transaction),
        }
        return Object.freeze(snapshot)
      })

    // The runtime items are created only from the exact configured TTools entry
    // selected by name. TypeScript cannot preserve that per-element lookup
    // through Array.map, so this generic return boundary restores the proven
    // distributive public union.
    return Object.freeze(next) as BoundInterrupts<TTools>
  }

  private publish(): void {
    if (!this.hydration) {
      this.snapshot = Object.freeze([])
      this.state = Object.freeze({
        interrupts: this.snapshot,
        pendingInterrupts: this.snapshot,
        interruptErrors: this.rootErrors,
        resuming: this.resuming,
      })
      this.options.onChange?.()
      return
    }
    this.snapshot = this.buildSnapshot()
    this.state = Object.freeze({
      interrupts: this.snapshot,
      pendingInterrupts: this.snapshot,
      interruptErrors: this.rootErrors,
      resuming: this.resuming,
    })
    this.options.onChange?.()
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
    item.resolution = Object.freeze({ interruptId, status: 'cancelled' })
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
    if (
      this.items.length === 0 ||
      this.items.some(
        (item) => item.resolution === undefined || item.status !== 'staged',
      )
    ) {
      return
    }
    const hydration = this.requireHydration()
    const canonical = canonicalizeInterruptResolutions(
      this.items
        .map((item) => item.resolution)
        .filter((item) => item !== undefined),
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
    item.resolution = cloneAndDeepFreezeJson({
      interruptId: item.descriptor.id,
      status: 'resolved',
      payload: result.payload,
    })
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
      return validateWithSchema(
        item.descriptor.responseSchema,
        payload,
        'invalid-payload',
      )
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
      (item) => item.kind !== 'client-tool-execution',
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
    resolver: (interrupt: ChatInterrupt<TTools>) => unknown,
  ): void {
    const checkpoints = this.items.map<RuntimeInterruptCheckpoint>((item) => ({
      status: item.status,
      ...(item.resolution !== undefined ? { resolution: item.resolution } : {}),
      ...(item.error !== undefined ? { error: item.error } : {}),
      validationGeneration: item.validationGeneration,
    }))
    const token: TransactionToken = { active: true }
    this.activeTransaction = token
    const stable = this.buildSnapshot(token)
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
            // still gates the actual submission on them being resolved.
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
    for (const item of this.items) item.status = 'submitting'
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
      for (const item of this.items) item.status = 'error'
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
      if (item.status === 'submitting') item.status = 'error'
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
          this.items.map((item) => item.descriptor.id),
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
