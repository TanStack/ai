import { defineChatMiddleware } from '@tanstack/ai'
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
  PersistedArtifactActivity,
  PersistedArtifactRef,
  PersistedArtifactRole,
  RunAgentResumeItem,
  StreamChunk,
  TokenUsage,
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
  return typeof payload?.approved === 'boolean' ? payload.approved : true
}

function resumeToolStateFromPending(
  pending: Array<InterruptRecord>,
  resumeByInterruptId: Map<string, RunAgentResumeItem>,
): ChatResumeToolState | undefined {
  const approvals = new Map<string, boolean>()
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
 * `StreamDurability`, not here — this middleware never mutates the chunk stream.
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
        const pending = await persistence.stores.interrupts.listPending(
          ctx.threadId,
        )
        const resumeByInterruptId = validatePendingResumes(
          pending,
          config.resume,
        )
        resumeToolState = resumeToolStateFromPending(
          pending,
          resumeByInterruptId,
        )
        await applyPendingResumes(
          pending,
          resumeByInterruptId,
          persistence.stores.interrupts,
        )
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
        for (const interrupt of chunk.outcome.interrupts) {
          await persistence.stores.interrupts.create({
            interruptId: interrupt.id,
            runId: ctx.runId,
            threadId: ctx.threadId,
            status: 'pending',
            requestedAt: Date.now(),
            payload: interruptPayload(interrupt),
          })
        }
      }
      await interruptRun(runs, ctx.runId)
      if (wantsMessages && persistence.stores.messages) {
        await persistence.stores.messages.saveThread(ctx.threadId, [
          ...ctx.messages,
        ])
      }
      state.interrupted = true
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
