import { tanstackMetadata } from '@tanstack/ai/client'
import type {
  MediaPrompt,
  PersistedArtifactRef,
  StreamChunk,
} from '@tanstack/ai/client'
import type { TokenUsage, TranscriptionResponseFormat } from '@tanstack/ai'
import type { ByokClient } from './byok'
import type { ConnectConnectionAdapter } from './connection-adapters'
import type { AIDevtoolsClientMetadata } from './devtools'
import type {
  GenerationDevtoolsBridgeFactory,
  VideoDevtoolsBridgeFactory,
} from './devtools-noop'

export type InferGenerationOutputFromReturn<TResult, TReturn> = [
  Exclude<TReturn, null | void | undefined>,
] extends [never]
  ? TResult
  : Exclude<TReturn, null | void | undefined>

export type InferGenerationOutput<TResult, TFn> = TFn extends (
  result: any,
) => infer R
  ? InferGenerationOutputFromReturn<TResult, R>
  : TResult

export type GenerationClientState = 'idle' | 'generating' | 'success' | 'error'

export type GenerationResumeStatus = 'idle' | 'running' | 'complete' | 'error'

export const GENERATION_STREAM_TRUNCATED_MESSAGE =
  'The generation stream ended before the run finished (no RUN_FINISHED or RUN_ERROR was received) — the connection was interrupted. Generate again to retry.'

export const GENERATION_UNRESTORABLE_RESULT_MESSAGE =
  'The stored generation completed but its result could not be rebuilt from the persisted record (its output artifact carries no serve URL, or the fields this activity needs were not persisted). Generate again to produce a fresh result.'

export function createGenerationHydrationError(
  detail: string,
  cause?: unknown,
): Error {
  const suffix = cause instanceof Error ? `: ${cause.message}` : ''
  const error = new Error(
    `[TanStack AI] Restoring the last generation for this thread failed — ${detail}${suffix}`,
  )
  if (cause !== undefined) {
    error.cause = cause
  }
  return error
}

export function clientStateFromResumeStatus(
  status: GenerationResumeStatus,
): GenerationClientState {
  switch (status) {
    case 'complete':
      return 'success'
    case 'error':
      return 'error'
    case 'running':
      return 'generating'
    case 'idle':
      return 'idle'
  }
}

/** @internal */
export interface GenerationResumeState {
  threadId: string
  runId: string
  pendingArtifacts?: Array<PersistedArtifactRef>
}

/** @internal */
export interface GenerationResultSnapshot {
  id?: string
  model?: string
  status?: string
  providerJobId?: string
  expiresAt?: string
  text?: string
  /** Token usage, persisted so a text result that requires it can be rebuilt. */
  usage?: TokenUsage
  artifacts?: Array<PersistedArtifactRef>
}

/** @internal */
export interface GenerationErrorSnapshot {
  message: string
  code?: string
}

/** @internal */
export interface GenerationEventSnapshot {
  type: StreamChunk['type']
  name?: string
  timestamp?: number
}

/** @internal */
export interface GenerationResumeSnapshot {
  schemaVersion?: 1
  resumeState: GenerationResumeState | null
  status: GenerationResumeStatus
  activity?: PersistedArtifactRef['source']['activity']
  pendingArtifacts?: Array<PersistedArtifactRef>
  result?: GenerationResultSnapshot
  error?: GenerationErrorSnapshot
  lastEvent?: GenerationEventSnapshot
}

export type GenerationPersistenceOptions =
  | {
      persistence: true
      /** Required by `persistence`. The stable scope runs are filed under. */
      threadId: string
    }
  | {
      persistence?: false | undefined
      /** Stable scope for the generation slot (also the wire / DevTools identity). */
      threadId?: string
    }

export const GENERATION_EVENTS = {
  /** The generation result payload */
  RESULT: 'generation:result',
  /** Persisted artifact refs for generated media */
  ARTIFACTS: 'generation:artifacts',
  /** Progress update (0-100) with optional message */
  PROGRESS: 'generation:progress',
  /** Video job created with jobId */
  VIDEO_JOB_CREATED: 'video:job:created',
  /** Video job status update */
  VIDEO_STATUS: 'video:status',
} as const

export interface GenerationFetcherOptions {
  /** AbortSignal that is triggered when the user calls `stop()` */
  signal: AbortSignal
  /** Extra request headers for this run (e.g. BYOK keys). */
  headers?: Record<string, string>
}

export type GenerationFetcher<TInput, TResult> = (
  input: TInput,
  options?: GenerationFetcherOptions,
) => Promise<TResult | Response>

export type GenerationTransport<TInput, TResult> =
  | { connection: ConnectConnectionAdapter; fetcher?: never }
  | { fetcher: GenerationFetcher<TInput, TResult>; connection?: never }

// eslint-disable-next-line @typescript-eslint/naming-convention -- _TInput is unused in the interface body but part of the public positional generic API (callers supply it for inference)
export interface GenerationClientOptions<_TInput, TResult, TOutput = TResult> {
  threadId?: string

  /** Additional body parameters to send with connect-based adapter requests */
  body?: Record<string, any>

  byok?: ByokClient

  byokProvider?: () => string | undefined

  /** Metadata used to register this generation hook with TanStack AI Devtools */
  devtools?: Partial<AIDevtoolsClientMetadata>

  persistence?: boolean

  hydrateGeneration?: ConnectConnectionAdapter['hydrateGeneration']

  joinRun?: ConnectConnectionAdapter['joinRun']

  devtoolsBridgeFactory?: GenerationDevtoolsBridgeFactory

  onResult?: (result: TResult) => TOutput | null | void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when progress is reported (0-100) */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for each stream chunk (connect-based adapter mode only) */
  onChunk?: (chunk: StreamChunk) => void

  // Framework state callbacks (set by hooks, not users)
  /** @internal Called when result changes */
  onResultChange?: (result: TOutput | null) => void
  /** @internal Called when loading state changes */
  onLoadingChange?: (isLoading: boolean) => void
  /** @internal Called when error state changes */
  onErrorChange?: (error: Error | undefined) => void
  /** @internal Called when generation status changes */
  onStatusChange?: (status: GenerationClientState) => void
  /** @internal Called when lightweight resume snapshot changes. Receives `undefined` when the snapshot is cleared by `reset()`. */
  onResumeSnapshotChange?: (
    snapshot: GenerationResumeSnapshot | undefined,
  ) => void
  /** @internal Called when the in-flight run identity changes. `null` once no run is in flight. Mirrors the chat client's resume-state callback. */
  onResumeStateChange?: (resumeState: GenerationResumeState | null) => void

  reconstructResult?: (restored: GenerationRestoredResult) => TResult | null
}

export interface GenerationRestoredResult {
  id?: string
  model?: string
  status?: string
  /** The provider's async job handle — see {@link GenerationResultSnapshot.providerJobId}. */
  providerJobId?: string
  expiresAt?: string
  text?: string
  usage?: TokenUsage
  activity?: PersistedArtifactRef['source']['activity']
  artifacts: Array<PersistedArtifactRef>
}

function chunkCorrelationId(
  chunk: StreamChunk,
  key: 'threadId' | 'runId',
): string | undefined {
  const tanstack = tanstackMetadata(chunk)
  const fromChunk = stringField(chunk, key)
  if (fromChunk) return fromChunk
  const fromMeta = tanstack?.[key]
  return typeof fromMeta === 'string' ? fromMeta : undefined
}

function createCarriedResumeSnapshot(
  previous: GenerationResumeSnapshot | null | undefined,
  chunk: StreamChunk,
): GenerationResumeSnapshot {
  const carried = chunk.type === 'RUN_STARTED' ? undefined : previous
  const previousArtifacts = carried?.pendingArtifacts ?? []
  return {
    schemaVersion: 1,
    resumeState: carried?.resumeState ?? null,
    status: carried?.status ?? 'idle',
    ...(carried?.activity ? { activity: carried.activity } : {}),
    ...(previousArtifacts.length > 0
      ? { pendingArtifacts: [...previousArtifacts] }
      : {}),
    ...(carried?.result ? { result: { ...carried.result } } : {}),
    ...(carried?.error ? { error: { ...carried.error } } : {}),
    lastEvent: createGenerationEventSnapshot(chunk),
  }
}

function applyResumeIdentity(
  next: GenerationResumeSnapshot,
  chunk: StreamChunk,
): void {
  const threadId = chunkCorrelationId(chunk, 'threadId')
  const runId = chunkCorrelationId(chunk, 'runId')
  const isThreadIdAndRunId = threadId && runId
  if (isThreadIdAndRunId) {
    next.resumeState = { threadId, runId }
    next.status = 'running'
    return
  }
  if (chunk.type === 'RUN_STARTED') {
    next.status = 'running'
  }
}

type CustomStreamChunk = Extract<StreamChunk, { type: 'CUSTOM' }>

function applyArtifactsCustomEvent(
  next: GenerationResumeSnapshot,
  chunk: CustomStreamChunk,
): void {
  const artifacts = collectArtifactRefs(chunk.value)
  if (artifacts.length === 0) return
  next.pendingArtifacts = artifacts
  next.activity = artifacts[0]?.source.activity
}

function applyResultCustomEvent(
  next: GenerationResumeSnapshot,
  chunk: CustomStreamChunk,
): void {
  const result = createGenerationResultSnapshot(chunk.value)
  if (!result) return
  next.result = result
  if (result.artifacts && result.artifacts.length > 0) {
    next.pendingArtifacts = result.artifacts
    next.activity = result.artifacts[0]?.source.activity
  }
}

function applyVideoJobCreatedCustomEvent(
  next: GenerationResumeSnapshot,
  chunk: CustomStreamChunk,
): void {
  const providerJobId = isObject(chunk.value)
    ? stringField(chunk.value, 'jobId')
    : undefined
  if (providerJobId) {
    next.result = { ...next.result, providerJobId }
  }
}

const generationCustomEventHandlers: Record<
  string,
  (next: GenerationResumeSnapshot, chunk: CustomStreamChunk) => void
> = {
  [GENERATION_EVENTS.ARTIFACTS]: applyArtifactsCustomEvent,
  [GENERATION_EVENTS.RESULT]: applyResultCustomEvent,
  [GENERATION_EVENTS.VIDEO_JOB_CREATED]: applyVideoJobCreatedCustomEvent,
}

function applyGenerationCustomEvent(
  next: GenerationResumeSnapshot,
  chunk: StreamChunk,
): void {
  if (chunk.type !== 'CUSTOM') return
  generationCustomEventHandlers[chunk.name]?.(next, chunk)
}

function applyGenerationRunTerminal(
  next: GenerationResumeSnapshot,
  chunk: StreamChunk,
): void {
  if (chunk.type === 'RUN_FINISHED') {
    next.resumeState = null
    next.status = 'complete'
    return
  }
  if (chunk.type === 'RUN_ERROR') {
    next.resumeState = null
    next.status = 'error'
    next.error = createGenerationErrorSnapshot(chunk)
  }
}

export function updateGenerationResumeSnapshot(
  previous: GenerationResumeSnapshot | null | undefined,
  chunk: StreamChunk,
): GenerationResumeSnapshot {
  const next = createCarriedResumeSnapshot(previous, chunk)
  applyResumeIdentity(next, chunk)
  applyGenerationCustomEvent(next, chunk)
  applyGenerationRunTerminal(next, chunk)
  return next
}

export function parseGenerationResumeSnapshot(
  value: unknown,
): GenerationResumeSnapshot | undefined {
  if (!isObject(value)) return undefined

  const schemaVersion = Reflect.get(value, 'schemaVersion')
  const isSchemaVersionIsNotUndefinedAndSchemaVersionIsNot1 =
    schemaVersion !== undefined && schemaVersion !== 1
  if (isSchemaVersionIsNotUndefinedAndSchemaVersionIsNot1) return undefined

  const status = generationResumeStatusField(value, 'status')
  if (!status) return undefined

  const rawResumeState = Reflect.get(value, 'resumeState')
  let resumeState: GenerationResumeState | null = null
  const hasRawResumeStateAndRawResumeStateIsNotUndefined =
    rawResumeState !== null && rawResumeState !== undefined
  if (hasRawResumeStateAndRawResumeStateIsNotUndefined) {
    if (!isObject(rawResumeState)) return undefined
    const threadId = stringField(rawResumeState, 'threadId')
    const runId = stringField(rawResumeState, 'runId')
    const isNotThreadIdOrNotRunId = !threadId || !runId
    if (isNotThreadIdOrNotRunId) return undefined
    resumeState = { threadId, runId }
  }

  const snapshot: GenerationResumeSnapshot = {
    schemaVersion: 1,
    resumeState,
    status,
  }

  const activity = persistedArtifactActivityField(value, 'activity')
  if (activity) snapshot.activity = activity

  const pendingArtifacts = collectArtifactRefs(
    Reflect.get(value, 'pendingArtifacts'),
  )
  if (pendingArtifacts.length > 0) snapshot.pendingArtifacts = pendingArtifacts

  const result = createGenerationResultSnapshot(Reflect.get(value, 'result'))
  if (result) snapshot.result = result

  const rawError = Reflect.get(value, 'error')
  if (isObject(rawError)) {
    const message = stringField(rawError, 'message')
    if (message) {
      const code = stringField(rawError, 'code')
      snapshot.error = { message, ...(code ? { code } : {}) }
    }
  }

  return snapshot
}

function generationResumeStatusField(
  value: object,
  key: string,
): GenerationResumeStatus | undefined {
  const field = stringField(value, key)
  if (field === undefined) return undefined

  switch (field) {
    case 'idle':
    case 'running':
    case 'complete':
    case 'error':
      return field
    default:
      return undefined
  }
}

export interface VideoStatusInfo {
  /** Job identifier */
  jobId: string
  /** Current status of the video generation job */
  status: 'pending' | 'processing' | 'completed' | 'failed'
  /** Progress percentage (0-100), if available */
  progress?: number
  /** URL to the generated video (when completed) */
  url?: string
  /** Error message if status is 'failed' */
  error?: string
}

export interface VideoGenerateResult {
  /** Job identifier */
  jobId: string
  /** Final status */
  status: 'completed'
  /** URL to the generated video */
  url: string
  /** When the URL expires, if applicable */
  expiresAt?: Date
  /** Persisted artifact references for generated assets, when available */
  artifacts?: Array<PersistedArtifactRef>
}

export interface VideoGenerationClientOptions<
  TOutput = VideoGenerateResult,
> extends Omit<
  GenerationClientOptions<VideoGenerateInput, VideoGenerateResult, TOutput>,
  'devtoolsBridgeFactory'
> {
  devtoolsBridgeFactory?: VideoDevtoolsBridgeFactory

  /** Callback when a video job is created */
  onJobCreated?: (jobId: string) => void
  /** Callback on each status update */
  onStatusUpdate?: (status: VideoStatusInfo) => void

  // Framework state callbacks
  /** @internal Called when jobId changes */
  onJobIdChange?: (jobId: string | null) => void
  /** @internal Called when video status changes */
  onVideoStatusChange?: (status: VideoStatusInfo | null) => void
}

export interface ImageGenerateInput {
  prompt: MediaPrompt
  /** Number of images to generate (default: 1) */
  numberOfImages?: number
  /** Image size in WIDTHxHEIGHT format (e.g., "1024x1024") */
  size?: string
  /** Model-specific options */
  modelOptions?: Record<string, any>
}

export interface AudioGenerateInput {
  /** Text description of the desired audio */
  prompt: string
  /** Desired duration in seconds */
  duration?: number
  /** Model-specific options */
  modelOptions?: Record<string, any>
}

export interface SpeechGenerateInput {
  /** The text to convert to speech */
  text: string
  /** The voice to use for generation */
  voice?: string
  /** The output audio format */
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
  /** The speed of the generated audio (0.25 to 4.0) */
  speed?: number
  /** Model-specific options */
  modelOptions?: Record<string, any>
}

export interface TranscriptionGenerateInput {
  /** The audio data to transcribe - can be base64 string, File, Blob, or ArrayBuffer */
  audio: string | File | Blob | ArrayBuffer
  /** The language of the audio in ISO-639-1 format (e.g., 'en') */
  language?: string
  /** An optional prompt to guide the transcription */
  prompt?: string
  /** The format of the transcription output */
  responseFormat?: TranscriptionResponseFormat
  /** Model-specific options */
  modelOptions?: Record<string, any>
}

export interface SummarizeGenerateInput {
  /** The text to summarize */
  text: string
  /** Maximum length of the summary */
  maxLength?: number
  /** Style of the summary */
  style?: 'bullet-points' | 'paragraph' | 'concise'
  /** Topics to focus on */
  focus?: Array<string>
  /** Model-specific options */
  modelOptions?: Record<string, any>
}

export interface VideoGenerateInput {
  prompt: MediaPrompt
  /** Video size — format depends on provider (e.g., "16:9", "1280x720") */
  size?: string
  /** Video duration in seconds */
  duration?: number
  /** Model-specific options */
  modelOptions?: Record<string, any>
}

function createGenerationEventSnapshot(
  chunk: StreamChunk,
): GenerationEventSnapshot {
  const name = stringField(chunk, 'name')
  const timestamp = numberField(chunk, 'timestamp')
  return {
    type: chunk.type,
    ...(name ? { name } : {}),
    ...(timestamp !== undefined ? { timestamp } : {}),
  }
}

/** @internal Narrows an untrusted result payload into the persisted result snapshot shape. */
export function createGenerationResultSnapshot(
  value: unknown,
): GenerationResultSnapshot | undefined {
  if (!isObject(value)) return undefined

  const artifacts = collectArtifactRefs(Reflect.get(value, 'artifacts'))
  const snapshot: GenerationResultSnapshot = {}
  const id = stringField(value, 'id')
  const model = stringField(value, 'model')
  const status = stringField(value, 'status')
  const providerJobId =
    stringField(value, 'providerJobId') ?? stringField(value, 'jobId')
  // A transcription's output is `text`; a summary's is `summary`. Capture either
  // under `text` so a text result restores on reload.
  const text = stringField(value, 'text') ?? stringField(value, 'summary')
  const usage = Reflect.get(value, 'usage')
  if (id) snapshot.id = id
  if (model) snapshot.model = model
  if (status) snapshot.status = status
  if (providerJobId) snapshot.providerJobId = providerJobId
  if (text) snapshot.text = text
  // Passthrough opaque token-usage metadata (untrusted; not deeply validated).
  if (isObject(usage)) snapshot.usage = usage as TokenUsage
  const expiresAt = Reflect.get(value, 'expiresAt')
  if (typeof expiresAt === 'string') {
    snapshot.expiresAt = expiresAt
  } else {
    const isExpiresAtIsDateAndNotGetTimeIsNaN =
      expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())
    if (isExpiresAtIsDateAndNotGetTimeIsNaN) {
      snapshot.expiresAt = expiresAt.toISOString()
    }
  }
  if (artifacts.length > 0) {
    snapshot.artifacts = artifacts
  }

  return Object.keys(snapshot).length > 0 ? snapshot : undefined
}

function createGenerationErrorSnapshot(
  chunk: StreamChunk,
): GenerationErrorSnapshot {
  const message =
    stringField(chunk, 'message') ??
    nestedStringField(chunk, 'error', 'message') ??
    'An error occurred'
  const code = stringField(chunk, 'code')
  return {
    message,
    ...(code ? { code } : {}),
  }
}

function collectArtifactRefs(value: unknown): Array<PersistedArtifactRef> {
  if (!Array.isArray(value)) return []
  const refs: Array<PersistedArtifactRef> = []
  for (const item of value) {
    const ref = createPersistedArtifactRefSnapshot(item)
    if (ref) {
      refs.push(ref)
    }
  }
  return refs
}

function createPersistedArtifactRefSnapshot(
  value: unknown,
): PersistedArtifactRef | undefined {
  if (!isObject(value)) return undefined
  const source = Reflect.get(value, 'source')
  if (!isObject(source)) return undefined

  const role = persistedArtifactRoleField(value, 'role')
  const artifactId = stringField(value, 'artifactId')
  const threadId = stringField(value, 'threadId')
  const runId = stringField(value, 'runId')
  const name = stringField(value, 'name')
  const mimeType = stringField(value, 'mimeType')
  const size = numberField(value, 'size')
  const createdAt = stringField(value, 'createdAt')
  const activity = persistedArtifactActivityField(source, 'activity')
  const path = stringField(source, 'path')
  const provider = stringField(source, 'provider')
  const model = stringField(source, 'model')
  const isNotRoleOrNotArtifactIdOrNotThreadIdOrNotRunIdOrNotNameOrNotMimeType =
    !role ||
    !artifactId ||
    !threadId ||
    !runId ||
    !name ||
    !mimeType ||
    size === undefined ||
    !createdAt ||
    !activity ||
    !path ||
    !provider ||
    !model
  if (isNotRoleOrNotArtifactIdOrNotThreadIdOrNotRunIdOrNotNameOrNotMimeType) {
    return undefined
  }

  const sourceUrl = durableUrlField(value, 'sourceUrl')
  const url = serveUrlField(value, 'url')
  const mediaType = persistedArtifactMediaTypeField(source, 'mediaType')
  const jobId = stringField(source, 'jobId')
  const expiresAt = stringField(source, 'expiresAt')

  return {
    role,
    artifactId,
    threadId,
    runId,
    name,
    mimeType,
    size,
    createdAt,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(url ? { url } : {}),
    source: {
      activity,
      path,
      provider,
      model,
      ...(mediaType ? { mediaType } : {}),
      ...(jobId ? { jobId } : {}),
      ...(expiresAt ? { expiresAt } : {}),
    },
  }
}

function durableUrlField(value: object, key: string): string | undefined {
  const field = stringField(value, key)
  const isNotFieldOrLengthCompared = !field || field.length > 2048
  if (isNotFieldOrLengthCompared) return undefined
  try {
    const url = new URL(field)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? field
      : undefined
  } catch {
    return undefined
  }
}

function serveUrlField(value: object, key: string): string | undefined {
  const field = stringField(value, key)
  const isNotFieldOrLengthCompared = !field || field.length > 2048
  if (isNotFieldOrLengthCompared) return undefined
  const isFieldStartsWithEmptyAndNotFieldStartsWithEmptyAndNotFieldIncludes =
    field.startsWith('/') && !field.startsWith('//') && !field.includes('\\')
  if (isFieldStartsWithEmptyAndNotFieldStartsWithEmptyAndNotFieldIncludes)
    return field
  try {
    const url = new URL(field)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? field
      : undefined
  } catch {
    return undefined
  }
}

function persistedArtifactRoleField(
  value: object,
  key: string,
): PersistedArtifactRef['role'] | undefined {
  const field = stringField(value, key)
  return field === 'input' || field === 'output' ? field : undefined
}

function persistedArtifactActivityField(
  value: object,
  key: string,
): PersistedArtifactRef['source']['activity'] | undefined {
  const field = stringField(value, key)
  if (field === undefined) return undefined

  switch (field) {
    case 'image':
    case 'audio':
    case 'tts':
    case 'video':
    case 'transcription':
      return field
    default:
      return undefined
  }
}

function persistedArtifactMediaTypeField(
  value: object,
  key: string,
): PersistedArtifactRef['source']['mediaType'] | undefined {
  const field = stringField(value, key)
  if (field === undefined) return undefined

  switch (field) {
    case 'image':
    case 'audio':
    case 'video':
    case 'document':
    case 'json':
      return field
    default:
      return undefined
  }
}

function nestedStringField(
  value: object,
  key: string,
  nestedKey: string,
): string | undefined {
  const nested = Reflect.get(value, key)
  return isObject(nested) ? stringField(nested, nestedKey) : undefined
}

function stringField(value: object, key: string): string | undefined {
  const field = Reflect.get(value, key)
  return typeof field === 'string' ? field : undefined
}

function numberField(value: object, key: string): number | undefined {
  const field = Reflect.get(value, key)
  return typeof field === 'number' ? field : undefined
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}
