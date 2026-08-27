import {
  defineChatMiddleware,
  fromSpecTokenUsage,
  getDetachableRun,
  InterruptResumeValidationError,
  readInterruptBinding,
  validateInterruptResumeBatch,
  wasCancelRequested,
} from '@tanstack/ai'
import {
  createInterruptBinding,
  getGenericInterruptDefinitionRegistry,
  providePendingTurn,
  rehydrateInterruptRequest,
  toRunErrorPayload,
} from '@tanstack/ai/adapter-internals'
import { base64ToUint8Array } from '@tanstack/ai-utils'
import {
  InterruptsCapability,
  PersistenceCapability,
  PersistenceCompletionCapability,
  provideInterrupts,
  providePersistence,
  providePersistenceCompletion,
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
  PendingInterruptResumeRecord,
  PersistedArtifactActivity,
  PersistedArtifactRef,
  PersistedArtifactRole,
  RunAgentResumeItem,
  StreamChunk,
  Tool,
  ToolApprovalResolution,
  BilledUsage,
  TokenUsage,
} from '@tanstack/ai'
import type {
  AIPersistence,
  AIPersistenceStores,
  ArtifactRecord,
  BlobBody,
  ChatTranscriptStores,
  InterruptCommitEntry,
  InterruptRecord,
  RunStore,
} from './types'
import { artifactBlobKey } from './retrieve'

/**
 * How generated media is turned into durable artifacts: which pieces of a
 * result become artifacts, what they are named, where their bytes land, and how
 * the bytes are fetched when the provider returns a URL rather than inline data.
 *
 * Consumed by {@link withGenerationPersistence} through
 * {@link WithGenerationPersistenceOptions}. Chat persistence has no artifacts —
 * its options are {@link WithPersistenceOptions}.
 */
export interface ArtifactPersistenceOptions {
  extractArtifacts?: (
    input: GenerationArtifactExtractionInput,
  ) =>
    | Array<GenerationArtifactDescriptor | PersistedArtifactRef>
    | Promise<Array<GenerationArtifactDescriptor | PersistedArtifactRef>>
  nameArtifact?: (input: GenerationArtifactNameInput) => string
  /**
     * Map a freshly-persisted artifact ref to the durable app-origin URL that
     * serves its bytes (your `GET` route around `retrieveArtifact` /
     * `retrieveBlob`). The returned URL is stamped onto `ref.url` and written into
     * the result's media field, so both the live and the restored result render
     * durable media from your own origin instead of the provider's expiring link.
     * Return `undefined` to leave a ref without a durable URL.
     */
  artifactUrl?: (ref: PersistedArtifactRef) => string | undefined
  /**
     * Choose the blob-store key each artifact's bytes are written under, so
     * generated media can land in your own folder structure rather than the
     * default `artifacts/<runId>/<artifactId>`.
     *
     * ```ts
     * storageKey: ({ runId, artifactId, mimeType }) =>
     *   `video/${videoId}/frames/${runId}-${artifactId}.png`
     * ```
     *
     * Server-side only, and deliberately so: a key supplied by the browser would
     * be a path-traversal and cross-tenant-write vector.
     *
     * The resolved key is recorded on `ArtifactRecord.blobKey`, because once the
     * path is arbitrary a reader can no longer recompute it. Returning a
     * non-unique key overwrites — include `artifactId` (or something equally
     * unique) unless you intend that.
     */
  storageKey?: (input: {
    artifactId: string
    runId: string
    /**
       * Override the scope runs are filed under. Defaults to the `threadId` you
       * passed the activity, which is normally what you want, so leave this unset
       * unless the record belongs somewhere other than the activity's own scope.
       */
    threadId: string
    role: PersistedArtifactRole
    activity: PersistedArtifactActivity
    path: string
    mimeType: string
    name: string
  }) => string
  /**
     * Opt in to fetching prompt media referenced by URL (`role: 'input'`).
     *
     * Off by default, and deliberately expressed as a predicate rather than a
     * boolean: input URLs come from the caller, so fetching them server-side
     * turns your server into a proxy for whatever the caller names — cloud
     * metadata endpoints, `localhost` admin services, anything your network can
     * reach. The bytes are also redundant in the common case, since the client
     * already had the media it referenced.
     *
     * Enable this only when you genuinely need a durable copy of caller-supplied
     * media (a "paste an image URL" input box, say), and validate the target:
     *
     * ```ts
     * allowInputUrl: ({ url }) => url.hostname.endsWith('.cdn.example.com')
     * ```
     *
     * Requests are additionally forced through the same baseline checks every
     * artifact fetch gets (http/https only, timeout, size cap), plus — because
     * the target is untrusted — a loopback/private/link-local host block and
     * `redirect: 'manual'` so a 302 cannot hop to an internal address. Those are
     * a backstop, not a substitute for a narrow predicate: a hostname that
     * resolves to a private address still passes a literal-IP check.
     */
  allowInputUrl?: (input: {
    url: URL
    descriptor: GenerationArtifactDescriptor
  }) => boolean | Promise<boolean>
  /** Abort an artifact fetch after this many ms. Default 30_000. */
  artifactFetchTimeoutMs?: number
  /**
     * Refuse an artifact body larger than this many bytes. Default 1 GiB.
     *
     * This is a bound on TRANSFER, not on memory: the URL path streams into the
     * blob store and never buffers, so a 1 GiB artifact costs a streaming store
     * (R2, S3, filesystem) flat memory. What the cap buys is a ceiling on what a
     * broken or hostile origin can make you pull and store — `content-length` is
     * advisory, so without it an artifact fetch is an unbounded transfer billed
     * to you.
     *
     * Pass `false` to remove the ceiling entirely. That also removes the
     * cap-enforcing `TransformStream` wrapper, so the fetched body reaches your
     * store exactly as `fetch` produced it — on workerd that means it keeps its
     * native declared length and `R2Bucket.put` can single-shot it with no hint,
     * no multipart, and nothing buffered. Do that when you trust the origins you
     * fetch from (your provider's CDN); keep the cap when `allowInputUrl` lets
     * callers name the URL.
     */
  maxArtifactBytes?: number | false
  /**
     * `fetch` used to download artifact bytes. Defaults to the global. Inject to
     * route downloads through a proxy or an egress-restricted agent — the most
     * robust SSRF control available here, since it can resolve and check the
     * address actually connected to.
     */
  artifactFetch?: typeof globalThis.fetch
}

/**
 * Options for {@link withGenerationPersistence}: everything in
 * {@link ArtifactPersistenceOptions}, plus an optional scope override.
 */
export interface WithGenerationPersistenceOptions extends ArtifactPersistenceOptions {
  threadId?: string
}

/**
 * The slot this generation's runs are filed under: `ctx.threadId` (the
 * `threadId` the caller passed the activity), or the option when it overrides.
 *
 * Throws when neither supplies one. A run filed under no scope can never be
 * hydrated by one, so `persistence: true` would restore nothing, forever. That
 * is worth failing loudly for, since the alternative is a silent hole a reader
 * cannot diagnose from behavior.
 */
function generationScope(
  ctx: GenerationMiddlewareContext,
  opts: WithGenerationPersistenceOptions,
): string {
  const threadId = opts.threadId ?? ctx.threadId
  if (threadId === undefined || threadId.length === 0) {
    throw new Error(
      'Generation persistence requires a `threadId`, the stable scope successive ' +
        'runs are filed under. Pass it to the activity, e.g. ' +
        '`generateImage({ threadId, middleware: [withGenerationPersistence(p)] })`, ' +
        'or override it with `withGenerationPersistence(p, { threadId })`.',
    )
  }
  return threadId
}

const DEFAULT_ARTIFACT_FETCH_TIMEOUT_MS = 30_000
const DEFAULT_MAX_ARTIFACT_BYTES = 1024 * 1024 * 1024

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

interface RunStateEntry {
  merged: boolean
  interrupted: boolean
  /**
     * Resumes accepted in `onConfig` but not yet committed to the interrupt
     * store. They are applied (resolve/cancel) only once the run reaches a
     * successful boundary — see {@link commitPendingResumes}. Left uncommitted
     * (still pending in the store) if the run fails or aborts first.
     */
  pendingResumes?: {
    pending: Array<InterruptRecord>
    resumeByInterruptId: Map<string, RunAgentResumeItem>
  }
  /** Usage accumulated across every model call in this chat invocation. */
  usage?: TokenUsage
  /** Accumulated terminal-turn text, for throttled streaming snapshots (B). */
  streamingText?: string
  /** Epoch ms of the last streaming snapshot, to throttle writes (B). */
  lastSnapshotAt?: number
  /**
     * The current assistant turn's stream messageId, captured from
     * `TEXT_MESSAGE_START`. Persisted onto the assistant message so its identity
     * survives the persist → hydrate round-trip and a reload can resume the same
     * bubble in place.
     */
  streamingMessageId?: string
  streamingMessageCreatedAt?: Date
  completion?: {
    promise: Promise<void>
    resolve: () => void
    reject: (error: unknown) => void
  }
}

const runState = new WeakMap<object, RunStateEntry>()

const validResumeStatuses = new Set(['resolved', 'cancelled'])

function mergeMaps<K, V>(
  left?: ReadonlyMap<K, V>,
  right?: ReadonlyMap<K, V>,
): Map<K, V> | undefined {
  const hasNeitherMap = !left && !right
  if (hasNeitherMap) return undefined
  return new Map([...(left ?? []), ...(right ?? [])])
}

function mergeSets<T>(
  left?: ReadonlySet<T>,
  right?: ReadonlySet<T>,
): Set<T> | undefined {
  const hasNeitherSet = !left && !right
  if (hasNeitherSet) return undefined
  return new Set([...(left ?? []), ...(right ?? [])])
}

function mergeResumeToolState(
  left: ChatResumeToolState | undefined,
  right: ChatResumeToolState | undefined,
): ChatResumeToolState | undefined {
  if (!left) return right
  if (!right) return left
  return {
    approvals: mergeMaps(left.approvals, right.approvals),
    clientToolResults: mergeMaps(
      left.clientToolResults,
      right.clientToolResults,
    ),
    genericInterrupts: mergeMaps(
      left.genericInterrupts,
      right.genericInterrupts,
    ),
    genericInterruptRequests: mergeMaps(
      left.genericInterruptRequests,
      right.genericInterruptRequests,
    ),
    deniedToolResults: mergeMaps(
      left.deniedToolResults,
      right.deniedToolResults,
    ),
    cancelledToolCallIds: mergeSets(
      left.cancelledToolCallIds,
      right.cancelledToolCallIds,
    ),
  }
}

function rejectMixedRunPending(
  pending: Array<InterruptRecord>,
  ctx: Pick<ChatMiddlewareContext, 'threadId' | 'runId'>,
): void {
  const runIds = new Set(pending.map((interrupt) => interrupt.runId))
  if (runIds.size <= 1) return
  throw new InterruptResumeValidationError([
    {
      scope: 'batch',
      threadId: ctx.threadId,
      interruptedRunId: ctx.runId,
      generation: 0,
      interruptIds: pending.map((interrupt) => interrupt.interruptId),
      code: 'stale',
      message: 'Thread has pending interrupts from more than one run.',
      source: 'server',
      retryable: false,
    },
  ])
}

function validatePendingResumes(
  pending: Array<InterruptRecord>,
  resume: Array<RunAgentResumeItem> | undefined,
  ctx: Pick<ChatMiddlewareContext, 'threadId' | 'runId'>,
): Map<string, RunAgentResumeItem> {
  const interruptedRunId = pending[0]?.runId ?? ctx.runId
  const failure = (
    interruptId: string,
    code: 'conflict' | 'unknown-interrupt',
    message: string,
  ): never => {
    throw new InterruptResumeValidationError([
      {
        scope: 'item',
        threadId: ctx.threadId,
        interruptedRunId,
        generation: 0,
        interruptId,
        code,
        message,
        source: 'client',
        retryable: false,
      },
      {
        scope: 'batch',
        threadId: ctx.threadId,
        interruptedRunId,
        generation: 0,
        interruptIds: pending.map((interrupt) => interrupt.interruptId),
        code: code === 'conflict' ? 'conflict' : 'incomplete-batch',
        message:
          'Resume entries must resolve or cancel the complete interrupt batch.',
        source: 'client',
        retryable: false,
      },
    ])
  }
  const pendingInterruptIds = new Set(
    pending.map((interrupt) => interrupt.interruptId),
  )
  const resumeByInterruptId = new Map<string, RunAgentResumeItem>()
  for (const entry of resume ?? []) {
    if (resumeByInterruptId.has(entry.interruptId)) {
      return failure(
        entry.interruptId,
        'conflict',
        `Interrupt ${entry.interruptId} has duplicate resume entries.`,
      )
    }
    resumeByInterruptId.set(entry.interruptId, entry)
  }
  if (pending.length === 0) {
    const staleEntry = resume?.[0]
    if (staleEntry) {
      return failure(
        staleEntry.interruptId,
        'unknown-interrupt',
        `Resume entry references non-pending interrupt ${staleEntry.interruptId}.`,
      )
    }
    return resumeByInterruptId
  }
  const firstPending = pending[0]
  if (firstPending === undefined) return resumeByInterruptId
  const hasNoResume = !resume || resume.length === 0
  if (hasNoResume) {
    return failure(
      firstPending.interruptId,
      'unknown-interrupt',
      `Thread has pending interrupts; resume is required before accepting new input.`,
    )
  }

  for (const interrupt of pending) {
    const entry = resumeByInterruptId.get(interrupt.interruptId)
    if (!entry) {
      return failure(
        interrupt.interruptId,
        'unknown-interrupt',
        `Missing resume entry for pending interrupt ${interrupt.interruptId}.`,
      )
    }
    if (!validResumeStatuses.has(entry.status)) {
      return failure(
        interrupt.interruptId,
        'unknown-interrupt',
        `Invalid resume status for pending interrupt ${interrupt.interruptId}: ${entry.status}.`,
      )
    }
  }
  for (const entry of resume) {
    if (!pendingInterruptIds.has(entry.interruptId)) {
      return failure(
        entry.interruptId,
        'unknown-interrupt',
        `Resume entry references non-pending interrupt ${entry.interruptId}.`,
      )
    }
  }
  return resumeByInterruptId
}

async function applyPendingResumes(
  pending: Array<InterruptRecord>,
  resumeByInterruptId: Map<string, RunAgentResumeItem>,
  interrupts: NonNullable<AIPersistence['stores']['interrupts']>,
): Promise<void> {
  const entries: Array<InterruptCommitEntry> = []
  for (const interrupt of pending) {
    const entry = resumeByInterruptId.get(interrupt.interruptId)
    if (!entry) continue
    if (entry.status === 'resolved') {
      entries.push({
        interruptId: interrupt.interruptId,
        status: 'resolved',
        response: entry.payload,
      })
    } else {
      entries.push({
        interruptId: interrupt.interruptId,
        status: 'cancelled',
      })
    }
  }
  if (interrupts.commitBatch) {
    await interrupts.commitBatch(entries)
    return
  }
  const ids = new Set<string>()
  for (const entry of entries) {
    if (ids.has(entry.interruptId)) {
      throw new Error(
        `Interrupt batch contains duplicate id: ${entry.interruptId}.`,
      )
    }
    ids.add(entry.interruptId)
    const existing = await interrupts.get(entry.interruptId)
    if (!existing) {
      throw new Error(
        `Interrupt batch references missing id: ${entry.interruptId}.`,
      )
    }
    if (existing.status !== 'pending') {
      throw new Error(
        `Interrupt batch references non-pending id: ${entry.interruptId}.`,
      )
    }
  }
  for (const entry of entries) {
    if (entry.status === 'resolved') {
      await interrupts.resolve(entry.interruptId, entry.response)
    } else {
      await interrupts.cancel(entry.interruptId)
    }
  }
}

/**
 * Commit the resumes stashed in `onConfig`, marking each resumed interrupt
 * resolved/cancelled. Called only from success boundaries (`onFinish`, and the
 * `onChunk` interrupt boundary) so a provider failure or abort between accepting
 * the resume and reaching a boundary leaves the interrupts pending — the
 * approval is not consumed and a retry with the same resume succeeds. Idempotent
 * and a no-op when nothing is stashed.
 */
async function commitPendingResumes(
  state: RunStateEntry | undefined,
  interrupts: AIPersistence['stores']['interrupts'],
): Promise<void> {
  if (!state?.pendingResumes) return
  if (!interrupts) return
  const { pending, resumeByInterruptId } = state.pendingResumes
  await applyPendingResumes(pending, resumeByInterruptId, interrupts)
  state.pendingResumes = undefined
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

function interruptKind(interrupt: InterruptRecord): string | undefined {
  const metadata = objectValue(interrupt.payload.metadata)
  return metadata ? stringField(metadata, 'kind') : undefined
}

function hasReservedInterruptBinding(payload: unknown): boolean {
  const descriptor = objectValue(payload)
  const metadata = objectValue(descriptor?.metadata)
  return !!metadata && 'tanstack:interruptBinding' in metadata
}

function isPersistedInterruptDescriptor(
  value: unknown,
): value is Interrupt & { reason: string; message: string } {
  const record = objectValue(value)
  return (
    !!record &&
    typeof record.id === 'string' &&
    typeof record.reason === 'string' &&
    typeof record.message === 'string'
  )
}

/**
 * Does this pending record belong to the TanStack chat resume protocol?
 *
 * An external system can persist an AG-UI descriptor in the same durable
 * thread. A descriptor without a TanStack binding or legacy tool marker stays
 * pending for its owner, but it does not make this resume incomplete. Older
 * opaque records remain owned because their provenance cannot be known.
 */
function isChatOwnedPendingInterrupt(interrupt: InterruptRecord): boolean {
  const kind = interruptKind(interrupt)
  return (
    !isPersistedInterruptDescriptor(interrupt.payload) ||
    stringField(interrupt.payload, 'toolCallId') !== undefined ||
    kind === 'approval' ||
    kind === 'client_tool' ||
    hasReservedInterruptBinding(interrupt.payload)
  )
}

function durableGenericFailure(
  ctx: Pick<ChatMiddlewareContext, 'threadId' | 'runId'>,
  persisted: InterruptRecord,
  message: string,
): InterruptResumeValidationError {
  return new InterruptResumeValidationError([
    {
      scope: 'item',
      threadId: ctx.threadId,
      interruptedRunId: persisted.runId || ctx.runId,
      generation: 0,
      interruptId: persisted.interruptId,
      code: 'stale',
      message,
      source: 'server',
      retryable: false,
    },
    {
      scope: 'batch',
      threadId: ctx.threadId,
      interruptedRunId: persisted.runId || ctx.runId,
      generation: 0,
      interruptIds: [persisted.interruptId],
      code: 'item-validation-failed',
      message: 'One or more persisted interrupt records are invalid.',
      source: 'server',
      retryable: false,
    },
  ])
}

type PersistedInterruptDescriptor = Interrupt & {
  reason: string
  message: string
}

type GenericResumeRecord = PendingInterruptResumeRecord & {
  binding: Extract<PendingInterruptResumeRecord['binding'], { kind: 'generic' }>
  genericRequest: NonNullable<PendingInterruptResumeRecord['genericRequest']>
}

type InterruptDefinitionRegistry = ReturnType<
  typeof getGenericInterruptDefinitionRegistry
>

function readPersistedInterruptBinding(
  ctx: Pick<ChatMiddlewareContext, 'threadId' | 'runId'>,
  persisted: InterruptRecord,
):
  | {
      descriptor: PersistedInterruptDescriptor
      binding: NonNullable<ReturnType<typeof readInterruptBinding>>
    }
  | undefined {
  if (!isPersistedInterruptDescriptor(persisted.payload)) {
    if (hasReservedInterruptBinding(persisted.payload)) {
      throw durableGenericFailure(
        ctx,
        persisted,
        `Persisted interrupt ${persisted.interruptId} has an invalid binding descriptor.`,
      )
    }
    return undefined
  }
  const descriptor = persisted.payload
  const binding = readInterruptBinding(descriptor)
  if (!binding) {
    if (hasReservedInterruptBinding(descriptor)) {
      throw durableGenericFailure(
        ctx,
        persisted,
        `Persisted interrupt ${persisted.interruptId} has an invalid or incomplete binding.`,
      )
    }
    return undefined
  }
  return { descriptor, binding }
}

function assertPersistedInterruptCorrelation(
  ctx: Pick<ChatMiddlewareContext, 'threadId' | 'runId'>,
  persisted: InterruptRecord,
  descriptor: PersistedInterruptDescriptor,
  binding: NonNullable<ReturnType<typeof readInterruptBinding>>,
): void {
  const hasStaleCorrelation =
    descriptor.id !== persisted.interruptId ||
    binding.interruptId !== persisted.interruptId ||
    binding.interruptedRunId !== persisted.runId ||
    binding.generation !== 0
  if (hasStaleCorrelation) {
    throw durableGenericFailure(
      ctx,
      persisted,
      `Persisted interrupt ${persisted.interruptId} has stale correlation metadata.`,
    )
  }
}

function rehydratePersistedGenericRequest(
  ctx: Pick<ChatMiddlewareContext, 'threadId' | 'runId'>,
  persisted: InterruptRecord,
  descriptor: PersistedInterruptDescriptor,
  binding: Extract<
    NonNullable<ReturnType<typeof readInterruptBinding>>,
    { kind: 'generic' }
  >,
  definition: Parameters<typeof rehydrateInterruptRequest>[0],
): GenericResumeRecord['genericRequest'] {
  const metadata = objectValue(descriptor.metadata)
  const payload = metadata?.['tanstack:interruptPayload']
  if (!binding.key) {
    throw durableGenericFailure(
      ctx,
      persisted,
      `Persisted generic interrupt ${persisted.interruptId} is invalid: missing key.`,
    )
  }
  let request: GenericResumeRecord['genericRequest']
  try {
    request = rehydrateInterruptRequest(definition, {
      key: binding.key,
      reason: descriptor.reason,
      message: descriptor.message,
      ...(descriptor.expiresAt !== undefined
        ? { expiresAt: descriptor.expiresAt }
        : {}),
      ...(payload !== undefined ? { payload } : {}),
    })
  } catch (error) {
    throw durableGenericFailure(
      ctx,
      persisted,
      `Persisted generic interrupt ${persisted.interruptId} is invalid: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const emitted = createInterruptBinding(request, {
    batchIndex: binding.batchIndex,
  })
  const isStaleGenericInterrupt =
    emitted.descriptor.responseSchemaHash !== binding.responseSchemaHash ||
    emitted.descriptor.payloadSchemaHash !== binding.payloadSchemaHash ||
    binding.interruptId !== persisted.interruptId
  if (isStaleGenericInterrupt) {
    throw durableGenericFailure(
      ctx,
      persisted,
      `Persisted generic interrupt ${persisted.interruptId} is stale.`,
    )
  }
  return request
}

function hydrateGenericPersistedInterrupt(
  ctx: Pick<ChatMiddlewareContext, 'threadId' | 'runId'>,
  persisted: InterruptRecord,
  descriptor: PersistedInterruptDescriptor,
  binding: Extract<
    NonNullable<ReturnType<typeof readInterruptBinding>>,
    { kind: 'generic' }
  >,
  registry: InterruptDefinitionRegistry,
): PendingInterruptResumeRecord {
  if (
    !binding.definitionId ||
    !binding.key ||
    binding.batchIndex === undefined
  ) {
    return {
      interruptId: persisted.interruptId,
      payload: descriptor,
      binding,
    }
  }
  if (!registry) {
    throw durableGenericFailure(
      ctx,
      persisted,
      `Persisted generic interrupt ${persisted.interruptId} cannot be restored because no interrupt registry is available.`,
    )
  }
  const definition = registry.definitions.get(binding.definitionId)
  if (!definition) {
    throw durableGenericFailure(
      ctx,
      persisted,
      `Persisted generic interrupt definition ${binding.definitionId} is unavailable.`,
    )
  }
  return {
    interruptId: persisted.interruptId,
    payload: descriptor,
    binding,
    genericRequest: rehydratePersistedGenericRequest(
      ctx,
      persisted,
      descriptor,
      binding,
      definition,
    ),
  }
}

function persistedInterruptResumeRecord(
  ctx: Pick<ChatMiddlewareContext, 'threadId' | 'runId'>,
  persisted: InterruptRecord,
  registry: InterruptDefinitionRegistry,
): PendingInterruptResumeRecord | undefined {
  const resolved = readPersistedInterruptBinding(ctx, persisted)
  if (!resolved) return undefined
  const { descriptor, binding } = resolved
  assertPersistedInterruptCorrelation(ctx, persisted, descriptor, binding)
  if (binding.kind !== 'generic') {
    return {
      interruptId: persisted.interruptId,
      payload: descriptor,
      binding,
    }
  }
  return hydrateGenericPersistedInterrupt(
    ctx,
    persisted,
    descriptor,
    binding,
    registry,
  )
}

function isGenericResumeRecord(
  record: PendingInterruptResumeRecord,
): record is GenericResumeRecord {
  return (
    record.binding.kind === 'generic' && record.genericRequest !== undefined
  )
}

function collectGenericResumeRecords(
  ctx: ChatMiddlewareContext,
  records: Array<PendingInterruptResumeRecord>,
  interruptedRunId: string,
  generation: number,
): Array<{ record: GenericResumeRecord; batchIndex: number }> {
  const genericRecords: Array<{
    record: GenericResumeRecord
    batchIndex: number
  }> = []
  const batchIndexes = new Set<number>()
  for (const record of records) {
    if (!isGenericResumeRecord(record)) continue
    const batchIndex = record.binding.batchIndex
    if (batchIndex === undefined || batchIndexes.has(batchIndex)) {
      throw new InterruptResumeValidationError([
        {
          scope: 'batch',
          threadId: ctx.threadId,
          interruptedRunId,
          generation,
          interruptIds: records.map((item) => item.interruptId),
          code: 'stale',
          message:
            'Persisted generic interrupts have duplicate or invalid batch indexes.',
          source: 'server',
          retryable: false,
        },
      ])
    }
    batchIndexes.add(batchIndex)
    genericRecords.push({ record, batchIndex })
  }
  genericRecords.sort((left, right) => left.batchIndex - right.batchIndex)
  return genericRecords
}

async function durableGenericResumeState(
  ctx: ChatMiddlewareContext,
  pending: Array<InterruptRecord>,
  resume: ReadonlyArray<RunAgentResumeItem>,
  tools: Array<Tool>,
): Promise<ChatResumeToolState | undefined> {
  const registry = getGenericInterruptDefinitionRegistry(ctx, {
    optional: true,
  })
  const records: Array<PendingInterruptResumeRecord> = []

  for (const persisted of pending) {
    const record = persistedInterruptResumeRecord(ctx, persisted, registry)
    if (record) records.push(record)
  }

  const firstRecord = records[0]
  if (firstRecord === undefined) return undefined
  const interruptedRunId = firstRecord.binding.interruptedRunId
  const generation = firstRecord.binding.generation
  const validated = await validateInterruptResumeBatch({
    threadId: ctx.threadId,
    interruptedRunId,
    generation,
    pending: records,
    resume: resume.filter((entry) =>
      records.some((record) => record.interruptId === entry.interruptId),
    ),
    tools,
  })
  if (validated.errors.length > 0 || !validated.resumeToolState) {
    throw new InterruptResumeValidationError(validated.errors)
  }
  const genericRecords = collectGenericResumeRecords(
    ctx,
    records,
    interruptedRunId,
    generation,
  )
  return {
    ...validated.resumeToolState,
    genericInterruptRequests: new Map(
      genericRecords.flatMap(({ record }) =>
        record.genericRequest
          ? [[record.interruptId, record.genericRequest] as const]
          : [],
      ),
    ),
  }
}

function resolvedApprovalDecision(entry: RunAgentResumeItem): boolean {
  if (entry.status === 'cancelled') return false
  const payload = objectValue(entry.payload)
  // Fail closed: persisted resume payloads may be malformed or truncated, so a
  // missing/non-boolean `approved` denies the tool rather than running it.
  return typeof payload?.approved === 'boolean' ? payload.approved : false
}

/**
 * Translate the persisted pending interrupts + the resume batch into the
 * `ChatResumeToolState` the chat engine consumes. This is the server-authoritative
 * counterpart to the engine's ephemeral (client-history) reconstruction: because
 * the persistence flow sends empty client messages, the engine has no history to
 * rebuild from, so persistence supplies the resume state directly (and clears
 * `config.resume` so the ephemeral path is skipped — see `onConfig`).
 */
function resumeToolStateFromPending(
  pending: Array<InterruptRecord>,
  resumeByInterruptId: Map<string, RunAgentResumeItem>,
): ChatResumeToolState | undefined {
  const approvals = new Map<string, ToolApprovalResolution>()
  const clientToolResults = new Map<string, unknown>()
  const cancelledToolCallIds = new Set<string>()

  for (const interrupt of pending) {
    const entry = resumeByInterruptId.get(interrupt.interruptId)
    if (!entry) continue

    const kind = interruptKind(interrupt)
    const reason = stringField(interrupt.payload, 'reason')
    const toolCallId = stringField(interrupt.payload, 'toolCallId')

    if (entry.status === 'cancelled' && toolCallId) {
      cancelledToolCallIds.add(toolCallId)
    }

    const isApprovalInterrupt =
      kind === 'approval' || reason === 'approval_required'
    if (isApprovalInterrupt) {
      approvals.set(interrupt.interruptId, resolvedApprovalDecision(entry))
      continue
    }

    if (
      entry.status === 'resolved' &&
      toolCallId &&
      (kind === 'client_tool' || reason === 'client_tool_input')
    ) {
      clientToolResults.set(toolCallId, entry.payload)
    }
  }

  const hasNoResumeToolState =
    approvals.size === 0 &&
    clientToolResults.size === 0 &&
    cancelledToolCallIds.size === 0
  if (hasNoResumeToolState) {
    return undefined
  }
  return { approvals, clientToolResults, cancelledToolCallIds }
}

function interruptPayload(interrupt: unknown): Record<string, unknown> {
  return interrupt && typeof interrupt === 'object'
    ? { ...(interrupt as Record<string, unknown>) }
    : { value: interrupt }
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
  const raw = match[3] ?? ''
  let payload: string
  try {
    payload = decodeURIComponent(raw)
  } catch {
    payload = raw
  }
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
  if (!record) return []
  if (!source) return []
  if (type === undefined) return []
  switch (type) {
    case 'image':
    case 'audio':
    case 'video':
      break
    default:
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
    const isMediaPart = type === 'image' || type === 'audio' || type === 'video'
    if (!isMediaPart) continue
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

function imageOutputDescriptors(
  output: Record<string, unknown>,
): Array<GenerationArtifactDescriptor> {
  if (!Array.isArray(output.images)) return []
  const descriptors: Array<GenerationArtifactDescriptor> = []
  const imageEntries = output.images.entries()
  for (const [index, image] of imageEntries) {
    const descriptor = generatedMediaDescriptor({
      role: 'output',
      path: `images.${index}`,
      mediaType: 'image',
      mimeType: 'image/png',
      media: image,
    })
    if (descriptor) descriptors.push(descriptor)
  }
  return descriptors
}

function audioOutputDescriptors(
  output: Record<string, unknown>,
): Array<GenerationArtifactDescriptor> {
  const descriptor = generatedMediaDescriptor({
    role: 'output',
    path: 'audio',
    mediaType: 'audio',
    mimeType: 'audio/mpeg',
    media: output.audio,
  })
  return descriptor ? [descriptor] : []
}

function ttsOutputDescriptors(
  output: Record<string, unknown>,
): Array<GenerationArtifactDescriptor> {
  const audio = stringField(output, 'audio')
  if (!audio) return []
  const format = stringField(output, 'format')
  return [
    {
      role: 'output',
      path: 'audio',
      mediaType: 'audio',
      mimeType:
        stringField(output, 'contentType') ??
        (format ? `audio/${format}` : 'audio/mpeg'),
      bytes: base64ToUint8Array(audio),
    },
  ]
}

function videoOutputDescriptors(
  output: Record<string, unknown>,
): Array<GenerationArtifactDescriptor> {
  if (typeof output.url !== 'string') return []
  return [
    {
      role: 'output',
      path: 'video',
      mediaType: 'video',
      mimeType: 'video/mp4',
      url: output.url,
      jobId: stringField(output, 'jobId'),
      expiresAt:
        output.expiresAt instanceof Date ? output.expiresAt : undefined,
    },
  ]
}

function transcriptionAudioDescriptors(
  inputs: unknown,
): Array<GenerationArtifactDescriptor> {
  const audio = objectValue(inputs)?.audio
  if (typeof audio === 'string') {
    const data = parseDataUrl(audio)
    return [
      {
        role: 'input',
        path: 'audio',
        mediaType: 'audio',
        mimeType: data?.mimeType ?? 'audio/mpeg',
        bytes: data?.bytes ?? base64ToUint8Array(audio),
      },
    ]
  }
  if (audio instanceof ArrayBuffer) {
    return [
      {
        role: 'input',
        path: 'audio',
        mediaType: 'audio',
        mimeType: 'audio/mpeg',
        bytes: audio.slice(0),
      },
    ]
  }
  if (typeof Blob !== 'undefined' && audio instanceof Blob) {
    return [
      {
        role: 'input',
        path: 'audio',
        mediaType: 'audio',
        mimeType: audio.type || 'audio/mpeg',
        bytes: audio,
      },
    ]
  }
  return []
}

function transcriptionOutputDescriptors(
  output: Record<string, unknown>,
): Array<GenerationArtifactDescriptor> {
  const hasNoTranscriptionTokens =
    !Array.isArray(output.segments) && !Array.isArray(output.words)
  if (hasNoTranscriptionTokens) {
    return []
  }
  return [
    {
      role: 'output',
      path: 'transcription',
      mediaType: 'json',
      mimeType: 'application/json',
      json: output,
    },
  ]
}

function builtInArtifactDescriptors(
  activity: PersistedArtifactActivity,
  inputs: unknown,
  result: unknown,
): Array<GenerationArtifactDescriptor> {
  const descriptors = promptInputDescriptors(inputs)
  const output = objectValue(result)
  if (!output) return descriptors

  if (activity === 'image') {
    descriptors.push(...imageOutputDescriptors(output))
  } else if (activity === 'audio') {
    descriptors.push(...audioOutputDescriptors(output))
  } else if (activity === 'tts') {
    descriptors.push(...ttsOutputDescriptors(output))
  } else if (activity === 'video') {
    descriptors.push(...videoOutputDescriptors(output))
  } else if (activity === 'transcription') {
    descriptors.push(...transcriptionAudioDescriptors(inputs))
    descriptors.push(...transcriptionOutputDescriptors(output))
  }

  return descriptors
}

function blockedIpv4Literal(host: string): boolean | undefined {
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!ipv4) return undefined
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
  const isBlockedA = a === 127 || a === 0 || a === 10
  if (isBlockedA) return true
  const isLinkLocal = a === 169 && b === 254
  if (isLinkLocal) return true // link-local + cloud metadata
  const isPrivateClassB = a === 172 && b >= 16 && b <= 31
  if (isPrivateClassB) return true
  const isPrivateClassC = a === 192 && b === 168
  if (isPrivateClassC) return true
  return false
}

function blockedIpv6MappedHost(host: string): boolean | undefined {
  // IPv4-mapped IPv6 — re-check the embedded address. `new URL()` normalizes
  // `::ffff:127.0.0.1` to the hex form `::ffff:7f00:1`, so accept both.
  const mappedDotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(
    host,
  )
  if (mappedDotted?.[1]) return isBlockedInputHost(mappedDotted[1])
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host)
  if (mappedHex?.[1] && mappedHex[2]) {
    const high = Number.parseInt(mappedHex[1], 16)
    const low = Number.parseInt(mappedHex[2], 16)
    return isBlockedInputHost(
      `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`,
    )
  }
  return undefined
}

/**
 * Reject hosts that only make sense as an SSRF target: loopback, link-local
 * (including the cloud metadata address), private, and unique-local ranges.
 *
 * Applied to caller-supplied input URLs only. Provider result URLs skip it on
 * purpose — a self-hosted or local provider legitimately returns a `localhost`
 * URL, and those live inside the same trust boundary as the adapter itself.
 *
 * This checks IP *literals*. A hostname that resolves to a private address
 * passes, which is why `allowInputUrl` is required rather than optional.
 */
function isBlockedInputHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const isLocalhost = host === 'localhost' || host.endsWith('.localhost')
  if (isLocalhost) return true

  const ipv4Blocked = blockedIpv4Literal(host)
  if (ipv4Blocked !== undefined) return ipv4Blocked

  const isIpv6Loopback = host === '::' || host === '::1'
  if (isIpv6Loopback) return true
  if (host.startsWith('fe80:')) return true // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true // unique-local
  return blockedIpv6MappedHost(host) === true
}

/**
 * Fail the stream once more than `maxBytes` have passed through, so an
 * unexpectedly huge artifact can't fill the blob store.
 *
 * Only used when the response does NOT already bound itself — a chunked reply,
 * or a content-encoded one whose declared length describes the compressed
 * bytes. When `content-length` describes the body the store will drain, HTTP
 * framing is the bound and wrapping would only cost the caller the declared
 * length: a `TransformStream`'s readable side carries none, which is what
 * pushes a length-strict runtime (workerd + R2) onto a multipart upload.
 */
function capBodySize(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  url: string,
): ReadableStream<Uint8Array> {
  let seen = 0
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength
        if (seen > maxBytes) {
          controller.error(
            new Error(
              `Artifact at ${url} exceeds maxArtifactBytes (${maxBytes}).`,
            ),
          )
          return
        }
        controller.enqueue(chunk)
      },
    }),
  )
}

type ResolvedDescriptorBody = {
  body: BlobBody
  size: number
  /**
         * Exact byte length of a streamed body, when the origin declared one
         * that survives decoding — forwarded to `BlobStore.put` as
         * `BlobPutOptions.expectedLength`. Undefined when unknown.
         */
  expectedLength?: number
  mimeType: string
  sourceUrl?: string
}

function descriptorJsonBody(
  descriptor: GenerationArtifactDescriptor,
): ResolvedDescriptorBody {
  const body = JSON.stringify(descriptor.json)
  return {
    body,
    size: new TextEncoder().encode(body).byteLength,
    mimeType: descriptor.mimeType ?? 'application/json',
  }
}

function descriptorBytesSize(body: BlobBody): number {
  if (typeof body === 'string') {
    return new TextEncoder().encode(body).byteLength
  }
  if (body instanceof ArrayBuffer) {
    return body.byteLength
  }
  if (ArrayBuffer.isView(body)) {
    return body.byteLength
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return body.size
  }
  return 0
}

function descriptorBytesBody(
  body: BlobBody,
  mimeType: string | undefined,
): ResolvedDescriptorBody {
  return {
    body,
    size: descriptorBytesSize(body),
    mimeType: mimeType ?? 'application/octet-stream',
  }
}

function parseArtifactUrl(url: string): URL {
  try {
    return new URL(url)
  } catch {
    throw new Error(`Failed to persist artifact: ${url} is not a valid URL.`)
  }
}

async function assertAllowedInputArtifactUrl(
  target: URL,
  descriptor: GenerationArtifactDescriptor,
  opts: ArtifactPersistenceOptions | undefined,
): Promise<void> {
  const isHttpUrl = target.protocol === 'https:' || target.protocol === 'http:'
  if (!isHttpUrl) {
    throw new Error(
      `Refusing to fetch artifact over ${target.protocol} (${descriptor.path}).`,
    )
  }
  const isCallerSupplied = descriptor.role === 'input'
  const allowInputUrl = opts?.allowInputUrl
  const shouldSkipInputUrlCheck = !allowInputUrl || !isCallerSupplied
  if (shouldSkipInputUrlCheck) return
  if (isBlockedInputHost(target.hostname)) {
    throw new Error(
      `Refusing to fetch input artifact from internal host ${target.hostname}.`,
    )
  }
  if (!(await allowInputUrl({ url: target, descriptor }))) {
    throw new Error(
      `Refusing to fetch input artifact from ${target.hostname}: rejected by allowInputUrl.`,
    )
  }
}

function declaredContentLength(response: Response): number | undefined {
  const contentLength = response.headers.get('content-length')
  if (contentLength === null) return undefined
  const declaredLength = Number(contentLength)
  if (!Number.isFinite(declaredLength)) return undefined
  return declaredLength
}

function assertWithinMaxArtifactBytes(
  url: string,
  byteLength: number,
  maxBytes: number | false,
): void {
  const exceedsMaxArtifactBytes = maxBytes !== false && byteLength > maxBytes
  if (exceedsMaxArtifactBytes) {
    throw new Error(
      `Artifact at ${url} exceeds maxArtifactBytes (${maxBytes}).`,
    )
  }
}

function decodedExpectedLength(
  response: Response,
  declaredLength: number | undefined,
): number | undefined {
  const encoding = response.headers.get('content-encoding')
  if (declaredLength === undefined) return undefined
  const isCompressed = encoding !== null && encoding !== 'identity'
  if (isCompressed) return undefined
  return declaredLength
}

async function artifactBodyFromResponse(
  response: Response,
  url: string,
  descriptor: GenerationArtifactDescriptor,
  maxBytes: number | false,
): Promise<ResolvedDescriptorBody> {
  const declaredLength = declaredContentLength(response)
  if (declaredLength !== undefined) {
    assertWithinMaxArtifactBytes(url, declaredLength, maxBytes)
  }
  const mimeType =
    descriptor.mimeType ??
    response.headers.get('content-type') ??
    'application/octet-stream'
  const expectedLength = decodedExpectedLength(response, declaredLength)
  if (response.body) {
    return {
      body:
        maxBytes === false || expectedLength !== undefined
          ? response.body
          : capBodySize(response.body, maxBytes, url),
      size: 0,
      expectedLength,
      mimeType,
      sourceUrl: url,
    }
  }
  const body = await response.arrayBuffer()
  assertWithinMaxArtifactBytes(url, body.byteLength, maxBytes)
  return {
    body,
    size: body.byteLength,
    mimeType,
    sourceUrl: url,
  }
}

async function fetchArtifactUrlBody(
  url: string,
  descriptor: GenerationArtifactDescriptor,
  opts: ArtifactPersistenceOptions | undefined,
): Promise<ResolvedDescriptorBody | undefined> {
  const data = parseDataUrl(url)
  if (data) {
    return {
      body: data.bytes,
      size: data.bytes.byteLength,
      mimeType: descriptor.mimeType ?? data.mimeType,
    }
  }
  const isCallerSupplied = descriptor.role === 'input'
  const allowInputUrl = opts?.allowInputUrl
  const shouldSkipInputFetch = isCallerSupplied && !allowInputUrl
  if (shouldSkipInputFetch) return undefined

  const target = parseArtifactUrl(url)
  await assertAllowedInputArtifactUrl(target, descriptor, opts)

  const maxBytes = opts?.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES
  const fetchArtifact = opts?.artifactFetch ?? globalThis.fetch
  const response = await fetchArtifact(target, {
    // Provider CDNs redirect routinely, so output fetches follow. An input
    // fetch must not: a 302 would land on a host neither check ever saw.
    redirect: isCallerSupplied ? 'manual' : 'follow',
    signal: AbortSignal.timeout(
      opts?.artifactFetchTimeoutMs ?? DEFAULT_ARTIFACT_FETCH_TIMEOUT_MS,
    ),
  })
  const isInputRedirect =
    isCallerSupplied && response.status >= 300 && response.status < 400
  if (isInputRedirect) {
    throw new Error(
      `Refusing to follow a redirect for input artifact ${descriptor.path}.`,
    )
  }
  if (!response.ok) {
    throw new Error(
      `Failed to persist artifact from ${url}: HTTP ${response.status}`,
    )
  }
  return artifactBodyFromResponse(response, url, descriptor, maxBytes)
}

/**
 * Resolve a descriptor to the bytes to store. Returns `undefined` when the
 * descriptor is deliberately not persisted — today that means a caller-supplied
 * input URL without an `allowInputUrl` opt-in.
 */
async function descriptorBody(
  descriptor: GenerationArtifactDescriptor,
  opts: ArtifactPersistenceOptions | undefined,
): Promise<ResolvedDescriptorBody | undefined> {
  if (descriptor.json !== undefined) {
    return descriptorJsonBody(descriptor)
  }

  if (descriptor.bytes !== undefined) {
    return descriptorBytesBody(descriptor.bytes, descriptor.mimeType)
  }

  if (descriptor.url) {
    return fetchArtifactUrlBody(descriptor.url, descriptor, opts)
  }

  throw new Error(
    `Artifact descriptor ${descriptor.path} has no bytes, url, or json.`,
  )
}

function artifactNameForDescriptor(
  opts: WithGenerationPersistenceOptions,
  descriptor: GenerationArtifactDescriptor,
  mimeType: string,
  activity: PersistedArtifactActivity,
  ctx: GenerationMiddlewareContext,
  threadId: string,
  runId: string,
  index: number,
): string {
  return (
    opts.nameArtifact?.({
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
  )
}

function artifactStorageKey(
  opts: WithGenerationPersistenceOptions,
  input: {
    artifactId: string
    runId: string
    threadId: string
    descriptor: GenerationArtifactDescriptor
    activity: PersistedArtifactActivity
    mimeType: string
    name: string
  },
): string {
  return (
    opts.storageKey?.({
      artifactId: input.artifactId,
      runId: input.runId,
      threadId: input.threadId,
      role: input.descriptor.role,
      activity: input.activity,
      path: input.descriptor.path,
      mimeType: input.mimeType,
      name: input.name,
    }) ?? artifactBlobKey({ runId: input.runId, artifactId: input.artifactId })
  )
}

function stampArtifactUrls(
  refs: Array<PersistedArtifactRef>,
  artifactUrl: ArtifactPersistenceOptions['artifactUrl'],
): Array<PersistedArtifactRef> {
  if (!artifactUrl) return refs
  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i]
    if (ref && !ref.url) {
      const url = artifactUrl(ref)
      if (url) refs[i] = { ...ref, url }
    }
  }
  return refs
}

async function persistOneGenerationArtifact(input: {
  persistence: AIPersistence
  opts: WithGenerationPersistenceOptions
  ctx: GenerationMiddlewareContext
  activity: PersistedArtifactActivity
  threadId: string
  runId: string
  index: number
  descriptor: GenerationArtifactDescriptor
}): Promise<PersistedArtifactRef | undefined> {
  const {
    persistence,
    opts,
    ctx,
    activity,
    threadId,
    runId,
    index,
    descriptor,
  } = input
  const artifactId = ctx.createId('artifact')
  const resolved = await descriptorBody(descriptor, opts)
  // Deliberately not persisted (an input URL with no `allowInputUrl` opt-in):
  // no blob, no record, no ref — the rest of the run is unaffected.
  if (!resolved) return undefined
  const artifacts = persistence.stores.artifacts
  const blobs = persistence.stores.blobs
  if (!artifacts) {
    throw new Error(
      'Generation artifact persistence requires stores.artifacts and stores.blobs.',
    )
  }
  if (!blobs) {
    throw new Error(
      'Generation artifact persistence requires stores.artifacts and stores.blobs.',
    )
  }
  const { body, size, expectedLength, mimeType, sourceUrl } = resolved
  // Resolved before the blob write so `storageKey` can build a path from the
  // final filename (extensions, slugs) rather than guessing at one.
  const name = artifactNameForDescriptor(
    opts,
    descriptor,
    mimeType,
    activity,
    ctx,
    threadId,
    runId,
    index,
  )
  const key = artifactStorageKey(opts, {
    artifactId,
    runId,
    threadId,
    descriptor,
    activity,
    mimeType,
    name,
  })
  const stored = await blobs.put(key, body, {
    contentType: mimeType,
    ...(expectedLength !== undefined ? { expectedLength } : {}),
    customMetadata: {
      runId,
      threadId,
      role: descriptor.role,
      activity,
      path: descriptor.path,
    },
  })
  // For streamed downloads the descriptor size is unknown (0); the store
  // reports the real byte length once it has drained the stream.
  const resolvedSize = size || stored.size || 0
  const createdAtMs = Date.now()
  const record: ArtifactRecord = {
    artifactId,
    runId,
    threadId,
    // Always recorded: with a custom `storageKey` the path is no longer
    // derivable from the record, so the reader has to be told where it went.
    blobKey: key,
    name,
    mimeType,
    size: resolvedSize,
    sourceUrl,
    createdAt: createdAtMs,
  }
  await artifacts.save(record)
  return {
    role: descriptor.role,
    artifactId,
    threadId,
    runId,
    name,
    mimeType,
    size: resolvedSize,
    createdAt: new Date(createdAtMs).toISOString(),
    ...(sourceUrl ? { sourceUrl } : {}),
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
  }
}

async function persistGenerationArtifacts(
  persistence: AIPersistence,
  opts: WithGenerationPersistenceOptions,
  ctx: GenerationMiddlewareContext,
  result: unknown,
): Promise<Array<PersistedArtifactRef>> {
  const activity = mediaActivity(ctx.activity)
  if (!activity) return []

  // Resolved the same way the run record is, so an artifact always lands in the
  // same slot as the run that produced it.
  const threadId = generationScope(ctx, opts)
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
    opts.extractArtifacts !== undefined
      ? await opts.extractArtifacts(extractionInput)
      : builtInArtifactDescriptors(activity, ctx.artifactInputs, result)

  if (extracted.length === 0) return []

  const existingRefs = extracted.filter(isArtifactRef)
  const descriptors = extracted.filter(
    (item): item is GenerationArtifactDescriptor => !isArtifactRef(item),
  )
  if (descriptors.length === 0) return existingRefs

  const hasNoArtifactStores =
    !persistence.stores.artifacts || !persistence.stores.blobs
  if (hasNoArtifactStores) {
    throw new Error(
      'Generation artifact persistence requires stores.artifacts and stores.blobs.',
    )
  }

  const refs: Array<PersistedArtifactRef> = [...existingRefs]
  const descriptorEntries = descriptors.entries()
  for (const [index, descriptor] of descriptorEntries) {
    const ref = await persistOneGenerationArtifact({
      persistence,
      opts,
      ctx,
      activity,
      threadId,
      runId,
      index,
      descriptor,
    })
    if (ref) refs.push(ref)
  }

  // Stamp the durable app-origin serve URL onto every ref that lacks one, so
  // clients render + restore media from your own origin, not the provider link.
  return stampArtifactUrls(refs, opts.artifactUrl)
}

/**
 * Rewrite the live result's media fields to each output ref's durable serve URL
 * (`ref.url`), so the live result matches what a reload restores. Keyed off the
 * ref's `source.path`: `images.<i>` → `result.images[i].url`, `video` →
 * `result.url`, `audio` (object) → `result.audio.url`. tts (a base64 string) and
 * transcription (json) have no media-URL field, so they are left as-is; their
 * durable bytes are reachable via `result.artifacts`. A no-op when no ref has a
 * `url`.
 */
function applyDurableMediaUrls(
  result: Record<string, unknown>,
  refs: Array<PersistedArtifactRef>,
): Record<string, unknown> {
  let next = result
  for (const ref of refs) {
    if (ref.role !== 'output') continue
    if (!ref.url) continue
    const path = ref.source.path
    if (path.startsWith('images.')) {
      const index = Number(path.slice('images.'.length))
      const images = next.images
      if (Array.isArray(images) && objectValue(images[index])) {
        const cloned = [...images]
        cloned[index] = { ...objectValue(images[index]), url: ref.url }
        next = { ...next, images: cloned }
      }
    } else if (path === 'video') {
      next = { ...next, url: ref.url }
    } else if (path === 'audio' && objectValue(next.audio)) {
      next = { ...next, audio: { ...objectValue(next.audio), url: ref.url } }
    }
  }
  return next
}

interface PersistencePlan {
  wantsInterrupts: boolean
  wantsArtifactPersistence: boolean
  runs: AIPersistence['stores']['runs']
}

function resolvePersistencePlan(persistence: AIPersistence): PersistencePlan {
  return {
    wantsInterrupts: persistence.stores.interrupts !== undefined,
    wantsArtifactPersistence:
      persistence.stores.artifacts !== undefined &&
      persistence.stores.blobs !== undefined,
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

/**
 * Chat entrypoint invalid when:
 * - `messages` is known-absent, or
 * - `interrupts` is known-present without `runs`.
 *
 * Fully optional bags (`AIPersistence` with all `?` keys) stay assignable and
 * are checked at runtime by {@link validateChatPersistenceStores}.
 */
type InvalidChatPersistence<TStores extends AIPersistenceStores> =
  StoreIsDefinitelyAbsent<TStores, 'messages'> extends true
    ? true
    : StoreIsDefinitelyPresent<TStores, 'interrupts'> extends true
      ? StoreIsDefinitelyAbsent<TStores, 'runs'>
      : false

/**
 * Generation entrypoint invalid when `generationRuns` is known-absent, or when
 * exactly one of `artifacts` / `blobs` is present (artifact persistence needs
 * both).
 */
type InvalidGenerationPersistence<TStores extends AIPersistenceStores> =
  StoreIsDefinitelyAbsent<TStores, 'generationRuns'> extends true
    ? true
    : StoreIsDefinitelyPresent<TStores, 'artifacts'> extends true
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
): Promise<TokenUsage | undefined> {
  const run = await runs?.createOrResume({
    runId,
    threadId,
    startedAt: Date.now(),
  })
  return run?.usage
}

function sumOptionalNumber(
  current: number | undefined,
  next: number | undefined,
): number | undefined {
  if (current === undefined) return next
  if (next === undefined) return current
  return current + next
}

function sumNumberFields<T extends object>(
  current: T | undefined,
  next: T | undefined,
): T | undefined {
  if (!current) return next
  if (!next) return current

  const result = { ...current }
  for (const key of Object.keys(next) as Array<keyof T>) {
    const currentValue = current[key]
    const nextValue = next[key]
    if (typeof nextValue === 'number') {
      result[key] = ((typeof currentValue === 'number' ? currentValue : 0) +
        nextValue) as T[keyof T]
    }
  }
  return result
}

function tokenUsageFromChunk(chunk: StreamChunk): TokenUsage | undefined {
  if (chunk.type !== 'RUN_FINISHED') {
    if (chunk.type !== 'RUN_ERROR') {
      return undefined
    }
  }
  /** Usage accumulated across every model call in this chat invocation. */
  const usage = chunk.usage
  if (
    usage != null &&
    typeof usage === 'object' &&
    !Array.isArray(usage) &&
    'promptTokens' in usage
  ) {
    return usage
  }
  const metadata = chunk.metadata
  const tanstack =
    metadata != null && typeof metadata === 'object' && 'tanstack' in metadata
      ? metadata.tanstack
      : undefined
  const leftover =
    tanstack != null && typeof tanstack === 'object' && !Array.isArray(tanstack)
      ? (tanstack as { usage?: TokenUsage }).usage
      : undefined
  return fromSpecTokenUsage(Array.isArray(usage) ? usage : undefined, leftover)
}

function accumulateTokenUsage(
  current: TokenUsage | undefined,
  next: TokenUsage,
): TokenUsage {
  if (!current) return { ...next }

  const promptTokensDetails = sumNumberFields(
    current.promptTokensDetails,
    next.promptTokensDetails,
  )
  const completionTokensDetails = sumNumberFields(
    current.completionTokensDetails,
    next.completionTokensDetails,
  )
  const costDetails = sumNumberFields(current.costDetails, next.costDetails)
  // Provider-specific details are opaque, so retain the latest reported bag.
  const providerUsageDetails =
    next.providerUsageDetails ?? current.providerUsageDetails
  const durationSeconds = sumOptionalNumber(
    current.durationSeconds,
    next.durationSeconds,
  )
  const unitsBilled = sumOptionalNumber(current.unitsBilled, next.unitsBilled)
  const billed = accumulateBilled(current.billed, next.billed)
  const cost = sumOptionalNumber(current.cost, next.cost)

  return {
    ...current,
    ...next,
    promptTokens: current.promptTokens + next.promptTokens,
    completionTokens: current.completionTokens + next.completionTokens,
    totalTokens: current.totalTokens + next.totalTokens,
    ...(promptTokensDetails ? { promptTokensDetails } : {}),
    ...(completionTokensDetails ? { completionTokensDetails } : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    ...(unitsBilled !== undefined ? { unitsBilled } : {}),
    ...(billed !== undefined ? { billed } : {}),
    ...(cost !== undefined ? { cost } : {}),
    ...(costDetails ? { costDetails } : {}),
    ...(providerUsageDetails ? { providerUsageDetails } : {}),
  }
}

/**
 * Sum billed quantities when both reports use the same unit. Different units
 * cannot be added, so the later report wins.
 */
function accumulateBilled(
  current: BilledUsage | undefined,
  next: BilledUsage | undefined,
): BilledUsage | undefined {
  if (!current) return next
  if (!next) return current
  if (current.unit !== next.unit) return next
  return { quantity: current.quantity + next.quantity, unit: current.unit }
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
  usage?: TokenUsage,
): Promise<void> {
  const runError = toRunErrorPayload(error)
  await runs?.update(runId, {
    status: 'failed',
    finishedAt: Date.now(),
    error: {
      message: runError.message,
      ...(runError.code !== undefined ? { code: runError.code } : {}),
    },
    ...(usage ? { usage } : {}),
  })
}

/**
 * Record a human-in-the-loop PAUSE.
 *
 * Deliberately writes NO `finishedAt`: `'interrupted'` is not a terminal status
 * (`isTerminalRunStatus('interrupted')` is `false`), and stamping a terminal
 * timestamp on it told every reader the run was over while it was in fact
 * waiting for a human. Only `abortRun`/`completeRun`/`failRun` finish a run.
 */
export async function interruptRun(
  runs: RunStore | undefined,
  runId: string,
  usage?: TokenUsage,
): Promise<void> {
  await runs?.update(runId, {
    status: 'interrupted',
    ...(usage ? { usage } : {}),
  })
}

/**
 * Record that the run has ended for good — an explicit cancel, or a disconnect
 * on a run that has nothing to reattach to. Terminal, so it carries
 * `finishedAt`.
 */
export async function abortRun(
  runs: RunStore | undefined,
  runId: string,
  usage?: TokenUsage,
): Promise<void> {
  await runs?.update(runId, {
    status: 'aborted',
    finishedAt: Date.now(),
    ...(usage ? { usage } : {}),
  })
}

/**
 * Whether some middleware has declared this run detachable — i.e. it has a
 * durable event log and a run store, so a disconnect can be survived and the
 * run picked back up rather than destroyed.
 *
 * The capability is read from CORE, never from `@tanstack/ai-sandbox`: sandbox
 * provides it, persistence consumes it, and a persistence → sandbox import
 * would invert the layering.
 */
function detachableRun(ctx: ChatMiddlewareContext): boolean {
  return getDetachableRun(ctx, { optional: true }) === true
}

/**
 * Chat-only **state** persistence middleware. Provides durable transcript,
 * run records, and interrupts for `chat()`. Does **not** provide locks —
 * use `withLocks` from `@tanstack/ai` for multi-instance coordination.
 *
 * This middleware never mutates the chunk stream; delivery durability
 * (replaying a disconnected/reloaded stream) is a separate transport-layer
 * concern (see the resumable-streams docs).
 *
 * Requires `stores.messages`. When `stores.interrupts` is present,
 * `stores.runs` is also required.
 *
 * ⚠️ AUTHORITATIVE-HISTORY CONTRACT: when a request carries a non-empty
 * `messages` array it is treated as the FULL conversation history and, on
 * finish, **overwrites** the entire stored thread. Post only the complete
 * transcript, never a delta — sending just the newest message(s) will replace
 * (and thereby destroy) the stored thread. To continue a stored thread without
 * resending history, pass an empty `messages` array and the stored transcript
 * is loaded and used.
 */
export interface WithPersistenceOptions {
  /**
     * Also persist a throttled snapshot of the in-progress assistant reply while
     * it streams. Off by default — the transcript is otherwise persisted at the
     * pending turn (`onStart`), interrupt boundaries, and completion (`onFinish`).
     * Enable it to recover partial output if the process dies mid-generation, at
     * the cost of extra writes. Snapshots are throttled to at most one per
     * {@link WithPersistenceOptions.snapshotIntervalMs}.
     */
  snapshotStreaming?: boolean
  /**
     * Minimum milliseconds between streaming snapshots when `snapshotStreaming`
     * is on. Defaults to 1000.
     */
  snapshotIntervalMs?: number
}

function captureStreamingTurnIdentity(
  state: RunStateEntry,
  chunk: StreamChunk,
): void {
  if (chunk.type === 'TEXT_MESSAGE_START') {
    state.streamingMessageId =
      typeof chunk.messageId === 'string' && chunk.messageId !== ''
        ? chunk.messageId
        : undefined
    state.streamingMessageCreatedAt = new Date()
    state.streamingText = ''
    return
  }
  if (chunk.type !== 'TOOL_CALL_START') return
  if (typeof chunk.parentMessageId !== 'string') return
  if (chunk.parentMessageId === '') return
  if (state.streamingMessageId !== undefined) return
  state.streamingMessageId = chunk.parentMessageId
  state.streamingMessageCreatedAt ??= new Date()
}

async function snapshotStreamingAssistant(
  ctx: ChatMiddlewareContext,
  chunk: StreamChunk,
  state: RunStateEntry,
  messageStore: NonNullable<ChatTranscriptStores['messages']>,
  snapshotIntervalMs: number,
): Promise<void> {
  if (chunk.type !== 'TEXT_MESSAGE_CONTENT') return
  if (typeof chunk.delta !== 'string') return
  state.streamingText = (state.streamingText ?? '') + chunk.delta
  const now = Date.now()
  if (now - (state.lastSnapshotAt ?? 0) < snapshotIntervalMs) return
  state.lastSnapshotAt = now
  try {
    await messageStore.saveThread(ctx.threadId, [
      ...ctx.messages,
      {
        role: 'assistant',
        content: state.streamingText,
        ...(state.streamingMessageId ? { id: state.streamingMessageId } : {}),
        ...(state.streamingMessageCreatedAt
          ? { createdAt: state.streamingMessageCreatedAt }
          : {}),
      },
    ])
  } catch {
    // Streaming snapshots are best-effort; onFinish persists final.
  }
}

async function persistInterruptBoundary(
  ctx: ChatMiddlewareContext,
  chunk: StreamChunk,
  interrupts: ReadonlyArray<Interrupt>,
  state: RunStateEntry,
  wantsInterrupts: boolean,
  persistence: AIPersistence,
  runs: RunStore | undefined,
  messageStore: NonNullable<ChatTranscriptStores['messages']>,
): Promise<void> {
  if (wantsInterrupts && persistence.stores.interrupts) {
    // The run reached a new interrupt boundary, so the resumes it consumed
    // are committed before the fresh interrupts are recorded.
    await commitPendingResumes(state, persistence.stores.interrupts)
    for (const interrupt of interrupts) {
      await persistence.stores.interrupts.create({
        interruptId: interrupt.id,
        runId: ctx.runId,
        threadId: ctx.threadId,
        requestedAt: Date.now(),
        payload: interruptPayload(interrupt),
      })
    }
  }
  // Adapter terminals arrive before `onUsage`; synthesized tool boundaries
  // arrive after it with the same usage already in state.
  const chunkUsage = tokenUsageFromChunk(chunk)
  const usage =
    ctx.phase === 'modelStream' && chunkUsage
      ? accumulateTokenUsage(state.usage, chunkUsage)
      : (state.usage ?? chunkUsage)
  state.usage = usage
  await interruptRun(runs, ctx.runId, usage)
  await messageStore.saveThread(ctx.threadId, [...ctx.messages])
  state.interrupted = true
}

/**
 * @param persistence - Must satisfy {@link ChatTranscriptStores} (messages
 *   required). Known-absent `messages` or `interrupts` without `runs` fail at
 *   compile time; fully dynamic bags are checked at runtime.
 */
export function withPersistence<TStores extends ChatTranscriptStores>(
  persistence: AIPersistence<TStores> & ValidChatPersistence<TStores>,
  options: WithPersistenceOptions = {},
): ChatMiddleware {
  // Runtime validation covers dynamic bags that bypass the generic constraint.
  validateChatPersistenceStores(persistence)
  const snapshotStreaming = options.snapshotStreaming ?? false
  const snapshotIntervalMs = options.snapshotIntervalMs ?? 1000
  const plan = resolvePersistencePlan(persistence)
  const { wantsInterrupts, runs } = plan
  const messageStore = persistence.stores.messages
  if (!messageStore) {
    // validateChatPersistenceStores already throws; this narrows for TypeScript.
    throw new Error('Chat persistence requires stores.messages.')
  }

  const provides = [
    PersistenceCapability,
    PersistenceCompletionCapability,
    ...(wantsInterrupts ? [InterruptsCapability] : []),
  ]

  return defineChatMiddleware({
    name: 'chat-persistence',
    provides,
    setup(ctx: ChatMiddlewareContext) {
      providePersistence(ctx, persistence)

      let resolveCompletion: () => void = () => undefined
      let rejectCompletion: (error: unknown) => void = () => undefined
      const completion = new Promise<void>((resolve, reject) => {
        resolveCompletion = resolve
        rejectCompletion = reject
      })
      // Consumers may not need this capability. Mark the rejection handled while
      // preserving the original promise for callers that do await it.
      void completion.catch(() => undefined)

      runState.set(ctx, {
        merged: false,
        interrupted: false,
        completion: {
          promise: completion,
          resolve: resolveCompletion,
          reject: rejectCompletion,
        },
      })
      providePersistenceCompletion(ctx, {
        waitForRunCompletion: () => completion,
      })

      if (wantsInterrupts && persistence.stores.interrupts) {
        provideInterrupts(ctx, persistence.stores.interrupts)
      }

      providePendingTurn(ctx, {
        snapshot: async () => {
          const stored = await messageStore.loadThread(ctx.threadId)
          const list = ctx.messages.length > 0 ? [...ctx.messages] : stored
          await messageStore.saveThread(ctx.threadId, list)
        },
      })
    },

    async onConfig(ctx: ChatMiddlewareContext, config: ChatMiddlewareConfig) {
      if (ctx.phase !== 'init') return

      const patch: Partial<ChatMiddlewareConfig> = {}

      if (wantsInterrupts && persistence.stores.interrupts) {
        const pending = await persistence.stores.interrupts.listPending(
          ctx.threadId,
        )
        const ownedPending = pending.filter(isChatOwnedPendingInterrupt)
        rejectMixedRunPending(ownedPending, ctx)
        const resumeByInterruptId = validatePendingResumes(
          ownedPending,
          config.resume,
          ctx,
        )
        if ((config.resume?.length ?? 0) > 0) {
          const resumeToolState = resumeToolStateFromPending(
            ownedPending,
            resumeByInterruptId,
          )
          const genericResumeState = await durableGenericResumeState(
            ctx,
            ownedPending,
            config.resume ?? [],
            config.tools,
          )
          patch.resume = []
          if (resumeToolState || genericResumeState) {
            patch.resumeToolState = mergeResumeToolState(
              resumeToolState,
              genericResumeState,
            )
          }
        }
        const state = runState.get(ctx)
        if (state && ownedPending.length > 0) {
          state.pendingResumes = { pending: ownedPending, resumeByInterruptId }
        }
      }

      const storedUsage = await createOrResumeRun(runs, ctx.runId, ctx.threadId)

      const state = runState.get(ctx)
      // A continuation has a fresh middleware context but resumes the same run.
      if (state && storedUsage) state.usage = storedUsage
      if (!state?.merged) {
        if (state) state.merged = true
        const stored = await messageStore.loadThread(ctx.threadId)
        patch.messages = config.messages.length > 0 ? config.messages : stored
      }

      return Object.keys(patch).length > 0 ? patch : undefined
    },

    async onStart(ctx: ChatMiddlewareContext) {
      try {
        await messageStore.saveThread(ctx.threadId, [...ctx.messages])
      } catch {
        // Eager pre-save is best-effort; the run continues and onFinish saves.
      }
    },

    async onChunk(ctx: ChatMiddlewareContext, chunk: StreamChunk) {
      // Capture the current assistant turn's identity for optional in-progress
      // snapshots. Completed messages already live in `ctx.messages`.
      const shouldCaptureTurnIdentity =
        snapshotStreaming && ctx.phase === 'modelStream'
      if (shouldCaptureTurnIdentity) {
        const s = runState.get(ctx)
        if (s) captureStreamingTurnIdentity(s, chunk)
      }

      if (snapshotStreaming) {
        const snapshotState = runState.get(ctx)
        if (snapshotState) {
          await snapshotStreamingAssistant(
            ctx,
            chunk,
            snapshotState,
            messageStore,
            snapshotIntervalMs,
          )
        }
      }

      if (chunk.type !== 'RUN_FINISHED') return
      if (chunk.outcome?.type !== 'interrupt') return
      const state = runState.get(ctx)
      if (!state) return
      await persistInterruptBoundary(
        ctx,
        chunk,
        chunk.outcome.interrupts,
        state,
        wantsInterrupts,
        persistence,
        runs,
        messageStore,
      )
    },

    onUsage(ctx: ChatMiddlewareContext, usage: TokenUsage) {
      const state = runState.get(ctx)
      if (!state) return
      if (state.interrupted) return
      state.usage = accumulateTokenUsage(state.usage, usage)
    },

    async onFinish(ctx: ChatMiddlewareContext, info: FinishInfo) {
      const state = runState.get(ctx)
      if (state?.interrupted) return
      try {
        await messageStore.saveThread(ctx.threadId, [...ctx.messages])
        await commitPendingResumes(state, persistence.stores.interrupts)
        await completeRun(runs, ctx.runId, state?.usage ?? info.usage)
        state?.completion?.resolve()
      } catch (error) {
        try {
          await failRun(runs, ctx.runId, error, state?.usage)
        } finally {
          state?.completion?.reject(error)
        }
        throw error
      }
    },

    async onError(ctx: ChatMiddlewareContext, info: ErrorInfo) {
      try {
        await failRun(runs, ctx.runId, info.error, runState.get(ctx)?.usage)
      } finally {
        runState.get(ctx)?.completion?.reject(info.error)
      }
    },

    async onAbort(ctx: ChatMiddlewareContext, info: AbortInfo) {
      const state = runState.get(ctx)
      let terminal = false
      try {
        const cancelled =
          info.cancelRequested === true ||
          (runs !== undefined && (await wasCancelRequested(runs, ctx.runId)))
        terminal =
          cancelled || (!detachableRun(ctx) && state?.interrupted !== true)
        if (terminal) {
          await abortRun(runs, ctx.runId, state?.usage)
        }
      } finally {
        if (terminal) state?.completion?.reject(info.reason)
      }
    },
  })
}

/**
 * Generation-only persistence middleware. Tracks generation run status (run
 * records keyed by `runId`) and, when `stores.artifacts` + `stores.blobs` are
 * both provided, persists the generated media for image, audio, TTS, video, and
 * transcription activities.
 *
 * Requires `stores.generationRuns`. A generation activity has no conversation,
 * so the run is keyed on its own `runId` (`ctx.runId ?? ctx.requestId`), which
 * is never faked from anything else.
 *
 * A `threadId` is REQUIRED alongside it — not as a link to a chat, but as the
 * stable app-chosen slot successive runs of the same thing fill
 * (`product-123-hero`, `video-9-start-frame`). It is what
 * `stores.generationRuns.findLatestForThread` keys on, and therefore the only
 * way a run is ever hydrated again. It comes from the `threadId` passed to the
 * activity, or from {@link WithGenerationPersistenceOptions.threadId} when that
 * overrides it; supplying neither throws at `onStart` rather than filing a run
 * nothing can find.
 *
 * On success the terminal result metadata (ids, urls — never media bytes) and,
 * when artifact persistence is on, the persisted artifact refs are captured onto
 * the run record so a server-authoritative client can hydrate the last
 * generation for a thread via {@link reconstructGeneration}.
 */
export function withGenerationPersistence<TStores extends AIPersistenceStores>(
  persistence: AIPersistence<TStores> & ValidGenerationPersistence<TStores>,
  opts?: WithGenerationPersistenceOptions,
): GenerationMiddleware
export function withGenerationPersistence(
  persistence: AIPersistence,
  opts: WithGenerationPersistenceOptions = {},
): GenerationMiddleware {
  validateGenerationPersistenceStores(persistence)
  const { wantsArtifactPersistence } = resolvePersistencePlan(persistence)
  const generationRuns = persistence.stores.generationRuns
  if (!generationRuns) {
    // validateGenerationPersistenceStores already throws; this narrows for TypeScript.
    throw new Error('Generation persistence requires stores.generationRuns.')
  }

  const runIdOf = (ctx: GenerationMiddlewareContext): string =>
    ctx.runId ?? ctx.requestId

  return {
    name: 'generation-persistence',

    async onStart(ctx: GenerationMiddlewareContext) {
      const runId = runIdOf(ctx)
      await generationRuns.createOrResume({
        runId,
        activity: ctx.activity,
        provider: ctx.provider,
        model: ctx.model,
        startedAt: Date.now(),
        threadId: generationScope(ctx, opts),
      })

      // Extract + persist artifact bytes (media → blobs, metadata → artifacts)
      // and merge the resulting refs onto the result. Gated on artifact stores.
      if (wantsArtifactPersistence) {
        ctx.resultTransforms?.push(async (result) => {
          const refs = await persistGenerationArtifacts(
            persistence,
            opts,
            ctx,
            result,
          )
          if (refs.length === 0) return undefined
          const base = objectValue(result) ?? {}
          const existing = base.artifacts
          const withArtifacts = {
            ...base,
            artifacts: [...(Array.isArray(existing) ? existing : []), ...refs],
          }
          // Point the live result's media at the durable serve URL (when
          // `artifactUrl` stamped one), so live and restored results match.
          return applyDurableMediaUrls(withArtifacts, refs)
        })
      }

      ctx.resultTransforms?.push(async (result) => {
        const rawArtifacts = objectValue(result)?.artifacts
        const artifacts = Array.isArray(rawArtifacts)
          ? rawArtifacts.filter(isArtifactRef)
          : []
        await generationRuns.update(runId, {
          result,
          ...(artifacts.length > 0 ? { artifacts } : {}),
        })
        return undefined
      })
    },

    async onFinish(
      ctx: GenerationMiddlewareContext,
      info: GenerationFinishInfo,
    ) {
      await generationRuns.update(runIdOf(ctx), {
        status: 'completed',
        finishedAt: Date.now(),
        ...(info.usage ? { usage: info.usage } : {}),
      })
    },

    async onError(ctx: GenerationMiddlewareContext, info: GenerationErrorInfo) {
      await generationRuns.update(runIdOf(ctx), {
        status: 'failed',
        finishedAt: Date.now(),
        error: {
          message:
            info.error instanceof Error
              ? info.error.message
              : String(info.error),
        },
      })
    },

    async onAbort(
      ctx: GenerationMiddlewareContext,
      _info: GenerationAbortInfo,
    ) {
      await generationRuns.update(runIdOf(ctx), {
        status: 'aborted',
        finishedAt: Date.now(),
      })
    },
  }
}
