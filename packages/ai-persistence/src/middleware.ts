import {
  defineChatMiddleware,
  fromSpecTokenUsage,
  getDetachableRun,
  InterruptResumeValidationError,
  MetadataCapability,
  provideMetadata,
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
import type {
  GenericInterruptRequest,
  InterruptDefinition,
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
  /**
   * Override the scope runs are filed under. Defaults to the `threadId` you
   * passed the activity, which is normally what you want, so leave this unset
   * unless the record belongs somewhere other than the activity's own scope.
   */
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
// 1 GiB, because generated video clips routinely run to a few hundred MB and
// the old 100 MiB default silently failed them. The cap is a drain-time
// counter, not a buffer: the URL path streams into the store, so raising it
// costs a streaming store nothing in memory. It still earns its keep as the
// only ceiling on what a runaway or hostile origin can make you transfer and
// store (`content-length` is advisory, and on a compressed reply it measures
// the compressed body). `maxArtifactBytes: false` removes it — and the wrapper
// with it, which is the zero-copy path onto workerd + R2.
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
  if (!left && !right) return undefined
  return new Map([...(left ?? []), ...(right ?? [])])
}

function mergeSets<T>(
  left?: ReadonlySet<T>,
  right?: ReadonlySet<T>,
): Set<T> | undefined {
  if (!left && !right) return undefined
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
    clientToolErrors: mergeMaps(left.clientToolErrors, right.clientToolErrors),
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
  if (!resume || resume.length === 0) {
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
  if (!state?.pendingResumes || !interrupts) return
  const { pending, resumeByInterruptId } = state.pendingResumes
  // Apply first; only clear the in-memory stash after every resolve/cancel
  // succeeds so a mid-loop store failure can still re-drive remaining ids
  // if the hook is retried (or a later boundary re-enters commit).
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
    if (!isPersistedInterruptDescriptor(persisted.payload)) {
      if (hasReservedInterruptBinding(persisted.payload)) {
        throw durableGenericFailure(
          ctx,
          persisted,
          `Persisted interrupt ${persisted.interruptId} has an invalid binding descriptor.`,
        )
      }
      continue
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
      continue
    }
    if (
      descriptor.id !== persisted.interruptId ||
      binding.interruptId !== persisted.interruptId ||
      binding.interruptedRunId !== persisted.runId ||
      binding.generation !== 0
    ) {
      throw durableGenericFailure(
        ctx,
        persisted,
        `Persisted interrupt ${persisted.interruptId} has stale correlation metadata.`,
      )
    }
    if (binding.kind !== 'generic') {
      records.push({
        interruptId: persisted.interruptId,
        payload: descriptor,
        binding,
      })
      continue
    }
    if (
      !binding.definitionId ||
      !binding.key ||
      binding.batchIndex === undefined
    ) {
      records.push({
        interruptId: persisted.interruptId,
        payload: descriptor,
        binding,
      })
      continue
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
    const metadata = objectValue(descriptor.metadata)
    const payload = metadata?.['tanstack:interruptPayload']
    let request: GenericInterruptRequest<
      InterruptDefinition<any, any, any, any>
    >
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
    if (
      emitted.descriptor.responseSchemaHash !== binding.responseSchemaHash ||
      emitted.descriptor.payloadSchemaHash !== binding.payloadSchemaHash ||
      binding.interruptId !== persisted.interruptId
    ) {
      throw durableGenericFailure(
        ctx,
        persisted,
        `Persisted generic interrupt ${persisted.interruptId} is stale.`,
      )
    }
    records.push({
      interruptId: persisted.interruptId,
      payload: descriptor,
      binding,
      genericRequest: request,
    })
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
  type GenericRecord = PendingInterruptResumeRecord & {
    binding: Extract<
      PendingInterruptResumeRecord['binding'],
      { kind: 'generic' }
    >
    genericRequest: GenericInterruptRequest<
      InterruptDefinition<any, any, any, any>
    >
  }
  const isGenericRecord = (
    record: PendingInterruptResumeRecord,
  ): record is GenericRecord =>
    record.binding.kind === 'generic' && record.genericRequest !== undefined
  const genericRecords: Array<{ record: GenericRecord; batchIndex: number }> =
    []
  const batchIndexes = new Set<number>()
  for (const record of records) {
    if (!isGenericRecord(record)) continue
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
    if (hasReservedInterruptBinding(interrupt.payload)) continue

    const kind = interruptKind(interrupt)
    const reason = stringField(interrupt.payload, 'reason')
    const toolCallId = stringField(interrupt.payload, 'toolCallId')

    if (entry.status === 'cancelled' && toolCallId) {
      cancelledToolCallIds.add(toolCallId)
    }

    if (kind === 'approval' || reason === 'approval_required') {
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

  if (
    approvals.size === 0 &&
    clientToolResults.size === 0 &&
    cancelledToolCallIds.size === 0
  ) {
    return undefined
  }
  return { approvals, clientToolResults, cancelledToolCallIds }
}

function interruptPayload(interrupt: unknown): Record<string, unknown> {
  return interrupt && typeof interrupt === 'object'
    ? { ...(interrupt as Record<string, unknown>) }
    : { value: interrupt }
}

// ---------------------------------------------------------------------------
// Generation artifact extraction / persistence
// ---------------------------------------------------------------------------

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
  // A plain (non-base64) data URL may carry a bare `%` (`data:text/plain,100%`),
  // which makes `decodeURIComponent` throw. Fall back to the literal payload so
  // a malformed escape doesn't fail the whole generation.
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
  if (host === 'localhost' || host.endsWith('.localhost')) return true

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
    if (a === 127 || a === 0 || a === 10) return true
    if (a === 169 && b === 254) return true // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    return false
  }

  if (host === '::' || host === '::1') return true
  if (host.startsWith('fe80:')) return true // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true // unique-local
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
  return false
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

/**
 * Resolve a descriptor to the bytes to store. Returns `undefined` when the
 * descriptor is deliberately not persisted — today that means a caller-supplied
 * input URL without an `allowInputUrl` opt-in.
 */
async function descriptorBody(
  descriptor: GenerationArtifactDescriptor,
  opts: ArtifactPersistenceOptions | undefined,
): Promise<
  | {
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
  | undefined
> {
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
    // A caller-controlled input URL is never fetched unless the app opted in
    // with a validating predicate. Skipped, not thrown: not mirroring someone
    // else's URL is the intended default, and the run itself is fine.
    const isCallerSupplied = descriptor.role === 'input'
    const allowInputUrl = opts?.allowInputUrl
    if (isCallerSupplied && !allowInputUrl) return undefined

    let target: URL
    try {
      target = new URL(descriptor.url)
    } catch {
      throw new Error(
        `Failed to persist artifact: ${descriptor.url} is not a valid URL.`,
      )
    }
    if (target.protocol !== 'https:' && target.protocol !== 'http:') {
      throw new Error(
        `Refusing to fetch artifact over ${target.protocol} (${descriptor.path}).`,
      )
    }
    if (allowInputUrl && isCallerSupplied) {
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
    if (isCallerSupplied && response.status >= 300 && response.status < 400) {
      throw new Error(
        `Refusing to follow a redirect for input artifact ${descriptor.path}.`,
      )
    }
    if (!response.ok) {
      throw new Error(
        `Failed to persist artifact from ${descriptor.url}: HTTP ${response.status}`,
      )
    }
    // `headers.get` returns null when the header is absent, and
    // `Number(null) === 0` — parse only a present header, or a chunked reply
    // would read as a declared length of 0 (harmless, but the early-reject
    // below would silently never be reachable for it).
    const contentLength = response.headers.get('content-length')
    const declaredLength =
      contentLength === null ? undefined : Number(contentLength)
    if (
      maxBytes !== false &&
      declaredLength !== undefined &&
      Number.isFinite(declaredLength) &&
      declaredLength > maxBytes
    ) {
      throw new Error(
        `Artifact at ${descriptor.url} exceeds maxArtifactBytes (${maxBytes}).`,
      )
    }
    const mimeType =
      descriptor.mimeType ??
      response.headers.get('content-type') ??
      'application/octet-stream'
    // A declared length is the DECODED body's length only when the response is
    // not content-encoded: fetch transparently decompresses, so on a gzipped
    // reply `content-length` measures the compressed bytes and the decoded
    // stream can be arbitrarily longer. Only trust it when it provably
    // describes what the store will drain.
    const encoding = response.headers.get('content-encoding')
    const decodedLengthIsKnown =
      declaredLength !== undefined &&
      Number.isFinite(declaredLength) &&
      (encoding === null || encoding === 'identity')
    const expectedLength = decodedLengthIsKnown ? declaredLength : undefined
    // Stream the body straight into the blob store instead of buffering the
    // whole artifact in memory. `size` is left 0 (unknown up front); the store
    // records the actual byte length as it drains the stream. Fall back to
    // buffering only when the response has no body to stream.
    if (response.body) {
      return {
        // Wrap ONLY when the response does not already bound itself. A
        // trustworthy `content-length` was checked against the cap above, and
        // HTTP framing holds the origin to it — a body cannot exceed a length
        // it declared — so the counter would add nothing and cost everything:
        // it is a TransformStream, whose readable side has no declared length,
        // and that missing length is precisely what breaks `R2Bucket.put`.
        // Unwrapped, the runtime's own length rides along and R2 single-shots
        // the stream. What still needs the counter: a chunked reply (no
        // declared length at all) and a content-encoded one (declared length
        // measures the compressed bytes, so the decoded stream is a
        // decompression bomb waiting to happen).
        body:
          maxBytes === false || decodedLengthIsKnown
            ? response.body
            : capBodySize(response.body, maxBytes, descriptor.url),
        size: 0,
        expectedLength,
        mimeType,
        sourceUrl: descriptor.url,
      }
    }
    const body = await response.arrayBuffer()
    if (maxBytes !== false && body.byteLength > maxBytes) {
      throw new Error(
        `Artifact at ${descriptor.url} exceeds maxArtifactBytes (${maxBytes}).`,
      )
    }
    return {
      body,
      size: body.byteLength,
      mimeType,
      sourceUrl: descriptor.url,
    }
  }

  throw new Error(
    `Artifact descriptor ${descriptor.path} has no bytes, url, or json.`,
  )
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
    const resolved = await descriptorBody(descriptor, opts)
    // Deliberately not persisted (an input URL with no `allowInputUrl` opt-in):
    // no blob, no record, no ref — the rest of the run is unaffected.
    if (!resolved) continue
    const { body, size, expectedLength, mimeType, sourceUrl } = resolved
    // Resolved before the blob write so `storageKey` can build a path from the
    // final filename (extensions, slugs) rather than guessing at one.
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
    const key =
      opts?.storageKey?.({
        artifactId,
        runId,
        threadId,
        role: descriptor.role,
        activity,
        path: descriptor.path,
        mimeType,
        name,
      }) ?? artifactBlobKey({ runId, artifactId })
    const stored = await persistence.stores.blobs.put(key, body, {
      contentType: mimeType,
      // Exact decoded length when the origin declared one — lets a store
      // single-shot the stream (e.g. R2 via FixedLengthStream) instead of
      // buffering or going multipart. Absent when unknown.
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
    await persistence.stores.artifacts.save(record)
    refs.push({
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
    })
  }

  // Stamp the durable app-origin serve URL onto every ref that lacks one, so
  // clients render + restore media from your own origin, not the provider link.
  if (opts?.artifactUrl) {
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i]
      if (ref && !ref.url) {
        const url = opts.artifactUrl(ref)
        if (url) refs[i] = { ...ref, url }
      }
    }
  }

  return refs
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
    if (ref.role !== 'output' || !ref.url) continue
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

// ---------------------------------------------------------------------------
// Shared store / feature plan
// ---------------------------------------------------------------------------

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
  if (chunk.type !== 'RUN_FINISHED' && chunk.type !== 'RUN_ERROR') {
    return undefined
  }
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
  // A late detach stamp from a superseded host can land after takeover
  // claimed the run. A terminal run is not detached.
  await runs?.update(runId, {
    status: 'completed',
    finishedAt: Date.now(),
    detachedSince: undefined,
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
    detachedSince: undefined,
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
    detachedSince: undefined,
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

// ---------------------------------------------------------------------------
// Chat middleware
// ---------------------------------------------------------------------------

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
    ...(persistence.stores.metadata ? [MetadataCapability] : []),
    ...(wantsInterrupts ? [InterruptsCapability] : []),
  ]

  return defineChatMiddleware({
    name: 'chat-persistence',
    provides,
    setup(ctx: ChatMiddlewareContext) {
      providePersistence(ctx, persistence)
      if (persistence.stores.metadata) {
        provideMetadata(ctx, persistence.stores.metadata)
      }

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

      // Offer the pending-turn seam so a middleware that is about to be SLOW can
      // have the user's turn stored before it starts. Only `onStart` stores the
      // turn otherwise, and `onStart` runs after every middleware `setup` — which
      // is milliseconds for a normal run and MINUTES for one that builds a sandbox.
      // For that whole window the thread reads as empty, so a reload or a second
      // device shows no sign of the message the user just sent.
      //
      // Offering it changes nothing on its own: a run whose middleware never calls
      // it behaves exactly as before. See `PendingTurnCapability`.
      providePendingTurn(ctx, {
        snapshot: async () => {
          const stored = await messageStore.loadThread(ctx.threadId)
          // The SAME rule `onConfig` applies when it merges. Kept here, in the
          // owner, because `saveThread` REPLACES the thread: a caller that stored
          // only the newly-sent list would delete the history.
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
        // Gate only records that this chat owns. A foreign AG-UI interrupt can
        // share the durable thread, but its owner resolves it outside this
        // resume protocol. Including it would deadlock this chat resume.
        const ownedPending = pending.filter(isChatOwnedPendingInterrupt)
        rejectMixedRunPending(ownedPending, ctx)
        const resumeByInterruptId = validatePendingResumes(
          ownedPending,
          config.resume,
          ctx,
        )
        // Persistence is the server-authoritative resume path: translate the
        // persisted interrupts into the engine's resume tool state and CLEAR
        // `config.resume`, so the engine skips its ephemeral reconstruction
        // (which needs a parentRunId and the client message history the
        // persistence flow deliberately omits).
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
        // Defer marking these interrupts resolved/cancelled until the run
        // succeeds (see commitPendingResumes). Committing here would consume the
        // approval even if the run then failed, breaking a retry.
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
      // (A) Persist the pending turn (the just-submitted user message plus any
      // prior history) as soon as the run starts, so a reload mid-run rehydrates
      // it before the assistant reply exists. Best-effort: a failed eager
      // snapshot must not abort the run — the authoritative save is `onFinish`.
      try {
        await messageStore.saveThread(ctx.threadId, [...ctx.messages])
      } catch {
        // Eager pre-save is best-effort; the run continues and onFinish saves.
      }
    },

    async onChunk(ctx: ChatMiddlewareContext, chunk: StreamChunk) {
      // Capture the current assistant turn's identity for optional in-progress
      // snapshots. Completed messages already live in `ctx.messages`.
      if (snapshotStreaming && ctx.phase === 'modelStream') {
        const s = runState.get(ctx)
        if (s && chunk.type === 'TEXT_MESSAGE_START') {
          // An empty/malformed messageId means "no identity" (matching the
          // engine's convention), leaving room for the TOOL_CALL_START
          // parentMessageId fallback below — but the per-turn accumulator
          // still resets so snapshots never mix text across turns.
          s.streamingMessageId =
            typeof chunk.messageId === 'string' && chunk.messageId !== ''
              ? chunk.messageId
              : undefined
          s.streamingMessageCreatedAt = new Date()
          s.streamingText = ''
        } else if (
          s &&
          chunk.type === 'TOOL_CALL_START' &&
          typeof chunk.parentMessageId === 'string' &&
          chunk.parentMessageId !== '' &&
          s.streamingMessageId === undefined
        ) {
          s.streamingMessageId = chunk.parentMessageId
          s.streamingMessageCreatedAt ??= new Date()
        }
      }

      // (B) Optional throttled snapshot of the in-progress assistant reply, so
      // partial output survives a crash/reload before onFinish. Off unless
      // `snapshotStreaming` is set. The completed turn enters `ctx.messages`
      // only after streaming ends, so accumulate its text here and persist
      // `ctx.messages` + that partial assistant message (tagged with its id).
      if (
        snapshotStreaming &&
        chunk.type === 'TEXT_MESSAGE_CONTENT' &&
        typeof chunk.delta === 'string'
      ) {
        const snapshotState = runState.get(ctx)
        if (snapshotState) {
          snapshotState.streamingText =
            (snapshotState.streamingText ?? '') + chunk.delta
          const now = Date.now()
          if (now - (snapshotState.lastSnapshotAt ?? 0) >= snapshotIntervalMs) {
            snapshotState.lastSnapshotAt = now
            try {
              await messageStore.saveThread(ctx.threadId, [
                ...ctx.messages,
                {
                  role: 'assistant',
                  content: snapshotState.streamingText,
                  ...(snapshotState.streamingMessageId
                    ? { id: snapshotState.streamingMessageId }
                    : {}),
                  ...(snapshotState.streamingMessageCreatedAt
                    ? { createdAt: snapshotState.streamingMessageCreatedAt }
                    : {}),
                },
              ])
            } catch {
              // Streaming snapshots are best-effort; onFinish persists final.
            }
          }
        }
      }

      // State-only: react to the interrupt boundary (create interrupt records,
      // mark the run interrupted, snapshot thread messages). The chunk stream is
      // never mutated — delivery durability is a transport-layer concern.
      if (
        chunk.type !== 'RUN_FINISHED' ||
        chunk.outcome?.type !== 'interrupt'
      ) {
        return
      }
      const state = runState.get(ctx)
      if (!state) return

      if (wantsInterrupts && persistence.stores.interrupts) {
        // The run reached a new interrupt boundary, so the resumes it consumed
        // are committed before the fresh interrupts are recorded.
        await commitPendingResumes(state, persistence.stores.interrupts)
        for (const interrupt of chunk.outcome.interrupts) {
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
    },

    onUsage(ctx: ChatMiddlewareContext, usage: TokenUsage) {
      const state = runState.get(ctx)
      if (!state || state.interrupted) return
      state.usage = accumulateTokenUsage(state.usage, usage)
    },

    async onFinish(ctx: ChatMiddlewareContext, info: FinishInfo) {
      const state = runState.get(ctx)
      if (state?.interrupted) return
      // Transcript first: if saveThread fails the run stays non-completed and
      // resumes stay pending so a retry can re-apply them. Completing the run
      // or consuming approvals before the durable history lands leaves a
      // "finished" run whose transcript is missing the terminal turn.
      try {
        await messageStore.saveThread(ctx.threadId, [...ctx.messages])
        await commitPendingResumes(state, persistence.stores.interrupts)
        await completeRun(runs, ctx.runId, state?.usage ?? info.usage)
        state?.completion?.resolve()
      } catch (error) {
        // Core has already selected its terminal hook. Persist the failed run
        // here, so a failed transcript save or batch write does not leave an
        // interrupted or completed run whose pending records need retrying.
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
      // A user pressing Stop and a user closing the tab produce the IDENTICAL
      // connection close, so intent is not inferable from the abort. It arrives
      // out of band in two bands, and either is authoritative: in-process
      // (`info.cancelRequested`, set when the cancel aborted this host's signal)
      // and durable (`RunRecord.cancelRequested`, the only channel that reaches
      // a run being driven elsewhere).
      // A run paused at an interrupt boundary is waiting for a HUMAN, not for
      // this socket. `chat()` skips its terminal hook at an actionable-wait
      // boundary, so its `finally` routes the disconnect here — and
      // terminalizing then produced a record claiming the run finished while
      // the interrupt rows stayed `'pending'` and `validatePendingResumes`
      // still threw on the next request. An explicit cancel is different: the
      // user gave up on the approval, so the cancel band stays authoritative.
      const state = runState.get(ctx)
      let terminal = false
      try {
        // The durable cancel read is best-effort. It must not bypass the
        // terminal persistence path or prevent the completion promise from
        // settling when the run store is unavailable.
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
      // A plain disconnect on a detachable or interrupted run: write NOTHING.
      // Either the agent is still running and a later attach can take it over
      // (the record stays `'running'`; the detach path records `detachedSince`
      // for the reaper), or the run is paused at an interrupt and the record
      // must stay `'interrupted'` so the pending resumes can still be applied.
    },
  })
}

// ---------------------------------------------------------------------------
// Generation middleware
// ---------------------------------------------------------------------------

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

      // Always capture the terminal result metadata + any artifact refs onto the
      // run record. Registered AFTER the artifact transform so it observes the
      // fully-merged result (with the artifact refs attached). `result` is
      // metadata/urls only — the media bytes already live in the blob store.
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
      // Unconditional, unlike chat's: a generation job has no journal and no
      // agent loop, so there is nothing to reattach to. An aborted generation is
      // over, full stop — hence `'aborted'` (terminal) rather than
      // `'interrupted'`, which now means "parked, waiting for a human" and is
      // deliberately NOT terminal-shaped, so pairing it with `finishedAt` would
      // leave the run looking permanently active.
      await generationRuns.update(runIdOf(ctx), {
        status: 'aborted',
        finishedAt: Date.now(),
      })
    },
  }
}
