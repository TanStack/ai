import { defineChatMiddleware } from '@tanstack/ai'
import { base64ToUint8Array } from '@tanstack/ai-utils'
import {
  InterruptsCapability,
  PersistenceCapability,
  provideInterrupts,
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
  ModelMessage,
  PersistedArtifactActivity,
  PersistedArtifactRef,
  PersistedArtifactRole,
  RunAgentResumeItem,
  StreamChunk,
  ToolApprovalResolution,
  TokenUsage,
} from '@tanstack/ai'
import type {
  AIPersistence,
  AIPersistenceStores,
  ArtifactRecord,
  BlobBody,
  ChatTranscriptStores,
  InterruptRecord,
  RunStore,
} from './types'
import { artifactBlobKey } from './retrieve'

export interface WithPersistenceOptions {
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
  /** Refuse an artifact body larger than this many bytes. Default 100 MiB. */
  maxArtifactBytes?: number
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
 * {@link WithPersistenceOptions}, plus an optional scope override.
 */
export interface WithGenerationPersistenceOptions extends WithPersistenceOptions {
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
const DEFAULT_MAX_ARTIFACT_BYTES = 100 * 1024 * 1024

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
}

const runState = new WeakMap<object, RunStateEntry>()

const validResumeStatuses = new Set(['resolved', 'cancelled'])

function validatePendingResumes(
  pending: Array<InterruptRecord>,
  resume: Array<RunAgentResumeItem> | undefined,
): Map<string, RunAgentResumeItem> {
  const pendingInterruptIds = new Set(
    pending.map((interrupt) => interrupt.interruptId),
  )
  const resumeByInterruptId = new Map(
    (resume ?? []).map((entry) => [entry.interruptId, entry]),
  )
  if (pending.length === 0) {
    const staleEntry = resume?.[0]
    if (staleEntry) {
      throw new Error(
        `Resume entry references non-pending interrupt ${staleEntry.interruptId}.`,
      )
    }
    return resumeByInterruptId
  }
  if (!resume || resume.length === 0) {
    throw new Error(
      `Thread has pending interrupts; resume is required before accepting new input.`,
    )
  }

  for (const interrupt of pending) {
    const entry = resumeByInterruptId.get(interrupt.interruptId)
    if (!entry) {
      throw new Error(
        `Missing resume entry for pending interrupt ${interrupt.interruptId}.`,
      )
    }
    if (!validResumeStatuses.has(entry.status)) {
      throw new Error(
        `Invalid resume status for pending interrupt ${interrupt.interruptId}: ${entry.status}.`,
      )
    }
  }
  for (const entry of resume) {
    if (!pendingInterruptIds.has(entry.interruptId)) {
      throw new Error(
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
  for (const interrupt of pending) {
    const entry = resumeByInterruptId.get(interrupt.interruptId)
    if (!entry) continue
    if (entry.status === 'resolved') {
      await interrupts.resolve(interrupt.interruptId, entry.payload)
    } else {
      await interrupts.cancel(interrupt.interruptId)
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

  for (const interrupt of pending) {
    const entry = resumeByInterruptId.get(interrupt.interruptId)
    if (!entry) continue

    const kind = interruptKind(interrupt)
    const reason = stringField(interrupt.payload, 'reason')
    const toolCallId = stringField(interrupt.payload, 'toolCallId')

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

  if (approvals.size === 0 && clientToolResults.size === 0) return undefined
  return { approvals, clientToolResults }
}

/**
 * Build the transcript to persist when a run finishes successfully.
 *
 * The chat engine appends an assistant message to the middleware message list
 * only when that turn carries tool calls (to feed the agent loop); a run's
 * terminal *text* reply is never appended. So `ctx.messages` at `onFinish` is
 * missing the assistant's final answer. Reattach it from the finish info —
 * `info.content` is the last turn's accumulated text (reset each cycle) — so
 * the stored thread is the complete conversation a server-authoritative client
 * hydrates on load. A guard avoids duplicating a terminal assistant turn should
 * the engine ever start appending it itself.
 */
function finishedTranscript(
  messages: ReadonlyArray<ModelMessage>,
  info: FinishInfo,
  messageId: string | undefined,
): Array<ModelMessage> {
  const transcript = [...messages]
  const last = transcript[transcript.length - 1]
  const alreadyPresent =
    last?.role === 'assistant' &&
    last.toolCalls === undefined &&
    last.content === info.content
  if (info.content && !alreadyPresent) {
    // Stamp the terminal turn with its stream messageId so a hydrated bubble
    // keeps the same identity as the live stream (in-place resume on reload).
    transcript.push({
      role: 'assistant',
      content: info.content,
      ...(messageId ? { id: messageId } : {}),
    })
  }
  return transcript
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
 * unexpectedly huge artifact can't fill the blob store. Enforced during the
 * drain because `content-length` is advisory (and absent on chunked replies).
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
  opts: WithPersistenceOptions | undefined,
): Promise<
  | {
      body: BlobBody
      size: number
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
    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new Error(
        `Artifact at ${descriptor.url} exceeds maxArtifactBytes (${maxBytes}).`,
      )
    }
    const mimeType =
      descriptor.mimeType ??
      response.headers.get('content-type') ??
      'application/octet-stream'
    // Stream the body straight into the blob store instead of buffering the
    // whole artifact in memory. `size` is left 0 (unknown up front); the store
    // records the actual byte length as it drains the stream. Fall back to
    // buffering only when the response has no body to stream.
    if (response.body) {
      return {
        body: capBodySize(response.body, maxBytes, descriptor.url),
        size: 0,
        mimeType,
        sourceUrl: descriptor.url,
      }
    }
    const body = await response.arrayBuffer()
    if (body.byteLength > maxBytes) {
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
    const { body, size, mimeType, sourceUrl } = resolved
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
    ...(wantsInterrupts ? [InterruptsCapability] : []),
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
    },

    async onConfig(ctx: ChatMiddlewareContext, config: ChatMiddlewareConfig) {
      if (ctx.phase !== 'init') return

      const patch: Partial<ChatMiddlewareConfig> = {}

      if (wantsInterrupts && persistence.stores.interrupts) {
        const pending = await persistence.stores.interrupts.listPending(
          ctx.threadId,
        )
        // Gate: a thread with pending interrupts must carry a resume batch that
        // references them.
        const resumeByInterruptId = validatePendingResumes(
          pending,
          config.resume,
        )
        // Persistence is the server-authoritative resume path: translate the
        // persisted interrupts into the engine's resume tool state and CLEAR
        // `config.resume`, so the engine skips its ephemeral reconstruction
        // (which needs a parentRunId and the client message history the
        // persistence flow deliberately omits).
        if ((config.resume?.length ?? 0) > 0) {
          const resumeToolState = resumeToolStateFromPending(
            pending,
            resumeByInterruptId,
          )
          patch.resume = []
          if (resumeToolState) patch.resumeToolState = resumeToolState
        }
        // Defer marking these interrupts resolved/cancelled until the run
        // succeeds (see commitPendingResumes). Committing here would consume the
        // approval even if the run then failed, breaking a retry.
        const state = runState.get(ctx)
        if (state && pending.length > 0) {
          state.pendingResumes = { pending, resumeByInterruptId }
        }
      }

      await createOrResumeRun(runs, ctx.runId, ctx.threadId)

      {
        const state = runState.get(ctx)
        if (!state?.merged) {
          if (state) state.merged = true
          const stored = await messageStore.loadThread(ctx.threadId)
          patch.messages = config.messages.length > 0 ? config.messages : stored
        }
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
      // Always capture the current assistant turn's stream messageId (cheap),
      // regardless of snapshotStreaming — it's persisted onto the assistant
      // message so its identity survives hydrate and a reload resumes the same
      // bubble in place.
      if (chunk.type === 'TEXT_MESSAGE_START') {
        const s = runState.get(ctx)
        if (s) {
          s.streamingMessageId = chunk.messageId
          s.streamingText = ''
        }
      }

      // (B) Optional throttled snapshot of the in-progress assistant reply, so
      // partial output survives a crash/reload before onFinish. Off unless
      // `snapshotStreaming` is set. We accumulate the terminal turn's text here
      // (the engine only appends assistant turns with tool calls to
      // `ctx.messages`, never a streaming text reply), then persist
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
      await interruptRun(runs, ctx.runId)
      await messageStore.saveThread(ctx.threadId, [...ctx.messages])
      state.interrupted = true
    },

    async onFinish(ctx: ChatMiddlewareContext, info: FinishInfo) {
      const state = runState.get(ctx)
      if (state?.interrupted) return
      // Transcript first: if saveThread fails the run stays non-completed and
      // resumes stay pending so a retry can re-apply them. Completing the run
      // or consuming approvals before the durable history lands leaves a
      // "finished" run whose transcript is missing the terminal turn.
      await messageStore.saveThread(
        ctx.threadId,
        finishedTranscript(ctx.messages, info, state?.streamingMessageId),
      )
      await completeRun(runs, ctx.runId, info.usage)
      await commitPendingResumes(state, persistence.stores.interrupts)
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
 * Generation-only persistence middleware. Tracks generation run status (run
 * records keyed by `runId`) and, when `stores.artifacts` + `stores.blobs` are
 * both provided, persists the generated media for image, audio, TTS, video, and
 * transcription activities.
 *
 * Requires `stores.generationRuns`. A generation activity has no conversation,
 * so the run is keyed on its own `runId` (`ctx.runId ?? ctx.requestId`).
 * `ctx.threadId` is carried through only as an OPTIONAL *link* to a chat when
 * the caller supplies one — it is never the run's primary identity and is never
 * faked from the request id.
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
      await generationRuns.update(runIdOf(ctx), {
        status: 'interrupted',
        finishedAt: Date.now(),
      })
    },
  }
}
