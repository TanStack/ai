// The server side of harness media: the store, capture of generated media,
// and the chat middleware that gives the model the bytes.
import { generateTranscription } from '@tanstack/ai'
import {
  resolveBlobRange,
  retrieveBlob,
  withGenerationPersistence,
} from '@tanstack/ai-persistence'
import { kindOf, mediaIdOf } from './media-ref'
import type {
  AnyTranscriptionAdapter,
  ChatMiddleware,
  ChatMiddlewareContext,
  ContentPart,
  GenerationMiddleware,
  Modality,
  ModelMessage,
  PersistedArtifactRef,
} from '@tanstack/ai'
import type {
  AIPersistence,
  ArtifactRecord,
  ArtifactStore,
  BlobBody,
  BlobRange,
  BlobStore,
  GenerationRunStore,
} from '@tanstack/ai-persistence'
import type { MediaKind, MediaRecord } from './types'

/** The `media` option of a harness: limits, and what the model reads. */
export interface MediaOptions {
  /** Refuse a file bigger than this many bytes. Default 100 MB. */
  maxBytes?: number
  /** The kinds a user can send. Default: all four. */
  kinds?: ReadonlyArray<MediaKind>
  /** The kinds the model reads. Narrows what the adapter says it reads. */
  accepts?: ReadonlyArray<MediaKind>
  /** Turns audio into text first when the model cannot read audio. */
  transcribe?: AnyTranscriptionAdapter
}

/**
 * A media request that failed. `status` is the HTTP status a route answers:
 * 404 (not found, or another thread's), 413 (too big), 415 (type not allowed).
 */
export class MediaError extends Error {
  readonly status: 404 | 413 | 415
  constructor(status: 404 | 413 | 415, message: string) {
    super(message)
    this.name = 'MediaError'
    this.status = status
  }
}

/** The stores media lives in. */
export type MediaPersistence = AIPersistence<{
  artifacts: ArtifactStore
  blobs: BlobStore
}>

/** The media store of one thread. */
export type MediaStore = ReturnType<typeof createMediaStore>

const DEFAULT_MAX_BYTES = 100 * 1024 * 1024
const DATA_URL_MAX_BYTES = 1024 * 1024
const ALL_KINDS: ReadonlyArray<MediaKind> = [
  'image',
  'audio',
  'video',
  'document',
]

// Uploads are artifact records with the run id `upload:<threadId>`, and their
// bytes use the default artifact key `artifacts/<runId>/<id>`. Generated media
// keeps what `withGenerationPersistence` gives it: a generation run id
// `<operation>[:<subagentRunId>...]:<activity>-<n>`.
function uploadRunId(threadId: string) {
  return `upload:${threadId}`
}

function toMediaRecord(record: ArtifactRecord, kind: MediaKind) {
  const isUpload = record.runId === uploadRunId(record.threadId)
  const segments = isUpload ? [] : record.runId.split(':')
  const [runId] = segments
  const subagentRunId = segments.findLast((segment) =>
    segment.startsWith('subagent-'),
  )
  const media: MediaRecord = {
    id: record.artifactId,
    threadId: record.threadId,
    kind,
    mimeType: record.mimeType,
    name: record.name,
    size: record.size,
    source: isUpload ? 'user' : 'generated',
    createdAt: record.createdAt,
    ...(runId ? { runId } : {}),
    ...(subagentRunId ? { subagentRunId } : {}),
  }
  return media
}

/** The byte length of a body, or `undefined` for a stream. */
function sizeOf(body: BlobBody) {
  if (typeof body === 'string') return new TextEncoder().encode(body).byteLength
  if (body instanceof Blob) return body.size
  if (body instanceof ReadableStream) return undefined
  return body.byteLength
}

/**
 * Base64 of `bytes`. It uses `btoa`, not the Node `Buffer`, so it runs on
 * workerd too.
 */
export function toBase64(bytes: Uint8Array) {
  const chunk = 0x8000
  let binary = ''
  // Chunks keep `fromCharCode` under the engine's argument limit.
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
  }
  return btoa(binary)
}

/**
 * The media store of one thread, on the persistence `artifacts` and `blobs`
 * stores. It sees only the media of `threadId`: an id of another thread reads
 * as not found.
 *
 * `put` throws a `MediaError` with 413 (over `maxBytes`) or 415 (a MIME type
 * with no media kind, or a kind not in `kinds`). `load` throws a `MediaError`
 * with 404 when the record or its bytes are missing.
 *
 * @example
 * const media = createMediaStore({ persistence, threadId })
 * const record = await media.put(bytes, { mimeType: 'image/png', name: 'cat.png' })
 * const url = await media.dataUrl(record.id)
 */
export function createMediaStore({
  persistence,
  threadId,
  options = {},
}: {
  persistence: MediaPersistence
  threadId: string
  options?: MediaOptions
}) {
  const { artifacts, blobs } = persistence.stores
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const kinds = options.kinds ?? ALL_KINDS
  const tooBig = () =>
    new MediaError(
      413,
      `The file is bigger than the limit of ${maxBytes} bytes.`,
    )

  async function artifact(id: string) {
    const record = await artifacts.get(id)
    return record?.threadId === threadId ? record : null
  }

  async function get(id: string) {
    const record = await artifact(id)
    const kind = record ? kindOf(record.mimeType) : undefined
    return record && kind ? toMediaRecord(record, kind) : null
  }

  async function load(id: string, range?: BlobRange) {
    const record = await artifact(id)
    const blob = record
      ? await retrieveBlob(
          persistence,
          record,
          range ? { range: resolveBlobRange(record.size, range) } : undefined,
        )
      : null
    if (!blob) throw new MediaError(404, `Media ${id} was not found.`)
    return new Uint8Array(await blob.arrayBuffer())
  }

  return {
    /** Store a user file. Returns its record. */
    async put(body: BlobBody, info: { mimeType: string; name: string }) {
      const kind = kindOf(info.mimeType)
      if (kind === undefined) {
        throw new MediaError(
          415,
          `Files of type ${info.mimeType} are not supported.`,
        )
      }
      if (!kinds.includes(kind)) {
        throw new MediaError(415, `This harness does not accept ${kind} files.`)
      }
      const size = sizeOf(body)
      if (size !== undefined && size > maxBytes) throw tooBig()

      const id = crypto.randomUUID()
      const runId = uploadRunId(threadId)
      const blobKey = `artifacts/${runId}/${id}`
      // A stream has no length up front, so count it as the store reads it.
      let seen = 0
      const counted =
        body instanceof ReadableStream
          ? body.pipeThrough(
              new TransformStream({
                transform(bytes: Uint8Array, controller) {
                  seen += bytes.byteLength
                  if (seen > maxBytes) controller.error(tooBig())
                  else controller.enqueue(bytes)
                },
              }),
            )
          : body
      try {
        await blobs.put(blobKey, counted, { contentType: info.mimeType })
      } catch (error) {
        if (seen <= maxBytes) throw error
        await blobs.delete(blobKey)
        throw tooBig()
      }
      const record: ArtifactRecord = {
        artifactId: id,
        runId,
        threadId,
        blobKey,
        name: info.name,
        mimeType: info.mimeType,
        size: size ?? seen,
        createdAt: Date.now(),
      }
      await artifacts.save(record)
      return toMediaRecord(record, kind)
    },
    /** The record of `id`, or `null` when it is missing or another thread's. */
    get,
    /** The bytes of `id`, or one `range` of them. */
    load,
    /** A data URL for a file up to 1 MB. `undefined` above that. */
    async dataUrl(id: string) {
      const record = await get(id)
      if (!record || record.size > DATA_URL_MAX_BYTES) return undefined
      return `data:${record.mimeType};base64,${toBase64(await load(id))}`
    },
  }
}

/**
 * Generation middleware that keeps the media an agent makes and publishes a
 * record for each new file. It is `withGenerationPersistence` plus a result
 * transform that runs after it.
 *
 * A failed save or a failed `publish` does not fail the generation: the agent
 * gets its result, and `onError` gets the error, so the caller can warn.
 *
 * @example
 * const middleware = mediaCapture({
 *   persistence,
 *   threadId,
 *   publish: (record) => console.log(`saved ${record.name}`),
 *   onError: (error) => console.warn('media not kept', error),
 * })
 * await generateImage({ adapter, prompt, threadId, middleware })
 */
export function mediaCapture({
  persistence,
  threadId,
  options = {},
  publish,
  onError,
}: {
  persistence: AIPersistence<{
    artifacts: ArtifactStore
    blobs: BlobStore
    generationRuns: GenerationRunStore
  }>
  threadId: string
  options?: MediaOptions
  publish: (record: MediaRecord) => void | Promise<void>
  onError?: (error: unknown) => void
}) {
  const store = createMediaStore({ persistence, threadId, options })
  const persist = withGenerationPersistence(persistence, {
    threadId,
    maxArtifactBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
  })
  const keep: GenerationMiddleware = {
    ...persist,
    async onStart(ctx) {
      const from = ctx.resultTransforms.length
      await persist.onStart?.(ctx)
      // Guard the transforms that save the bytes, so a store failure (or a
      // file over the limit) keeps the agent's result.
      const added = ctx.resultTransforms.splice(from)
      for (const transform of added) {
        ctx.resultTransforms.push(async (result, transformCtx) => {
          try {
            return await transform(result, transformCtx)
          } catch (error) {
            onError?.(error)
            return undefined
          }
        })
      }
    },
  }
  const announce: GenerationMiddleware = {
    name: 'harness:media-capture',
    onStart(ctx) {
      const runId = ctx.runId ?? ctx.requestId
      // `artifacts` is what the persistence transform above added.
      ctx.resultTransforms.push(
        async (result: { artifacts?: Array<PersistedArtifactRef> }) => {
          const refs = (result.artifacts ?? []).filter(
            (ref) => ref.role === 'output' && ref.runId === runId,
          )
          for (const ref of refs) {
            try {
              const record = await store.get(ref.artifactId)
              if (record) await publish(record)
            } catch (error) {
              onError?.(error)
            }
          }
          return undefined
        },
      )
    },
  }
  return [keep, announce]
}

type MediaContentPart = Exclude<ContentPart, { type: 'text' }>

function textPart(content: string) {
  const part: ContentPart = { type: 'text', content }
  return part
}

function cannotRead(model: string, kind: MediaKind) {
  const fix =
    kind === 'audio'
      ? 'Add media.transcribe'
      : `Use a model that reads ${kind} files`
  return `${model} cannot read ${kind} files. ${fix}, or send a text summary.`
}

function hasMediaRef(message: ModelMessage) {
  return (
    Array.isArray(message.content) &&
    message.content.some((part) => mediaIdOf(part) !== undefined)
  )
}

/**
 * Chat middleware that gives the model the bytes of `harness-media:` parts.
 * It changes only what the adapter gets (`providerMessages`), so the saved
 * transcript keeps the small `harness-media:` URLs.
 *
 * - A part of a kind in `accepted` becomes a base64 data source. With
 *   `accepted` undefined, every kind is sent.
 * - Audio not in `accepted` becomes a transcript when `transcribe` is set.
 * - Any other kind not in `accepted` stops the run with a clear error before
 *   the model call.
 * - A part whose file is gone becomes a short text note.
 *
 * List it after `withPersistence` and after any middleware that returns
 * `messages`: a later `messages` result resets the provider messages.
 *
 * @example
 * chat({
 *   adapter,
 *   messages,
 *   middleware: [withPersistence(persistence), mediaMiddleware({ store })],
 * })
 */
export function mediaMiddleware({
  store,
  accepted,
  transcribe,
}: {
  store: MediaStore
  accepted?: ReadonlyArray<Modality>
  transcribe?: AnyTranscriptionAdapter
}) {
  // ponytail: one cache per run, so the loop does not load or transcribe a
  // file again at every model call. A new turn does it again for history.
  const runs = new WeakMap<object, Map<string, Promise<ContentPart>>>()

  async function resolve(
    ctx: ChatMiddlewareContext,
    part: MediaContentPart,
    id: string,
  ) {
    const record = await store.get(id)
    if (!record) return textPart(`[${part.type} not found: ${id}]`)
    const isAccepted = accepted === undefined || accepted.includes(record.kind)
    const transcriber =
      isAccepted || record.kind !== 'audio' ? undefined : transcribe
    if (!isAccepted && transcriber === undefined) {
      throw new Error(cannotRead(ctx.model, record.kind))
    }
    const bytes = await store.load(id).catch((error: unknown) => {
      if (error instanceof MediaError && error.status === 404) return undefined
      throw error
    })
    if (!bytes) return textPart(`[${record.kind} not found: ${record.name}]`)
    if (transcriber === undefined) {
      const swapped: ContentPart = {
        ...part,
        source: {
          type: 'data',
          value: toBase64(bytes),
          mimeType: record.mimeType,
        },
      }
      return swapped
    }
    const transcript = await generateTranscription({
      adapter: transcriber,
      audio: new Blob([bytes], { type: record.mimeType }),
      ...(ctx.signal ? { abortSignal: ctx.signal } : {}),
    })
    return textPart(`[audio transcript: ${record.name}] ${transcript.text}`)
  }

  async function resolveMessage(
    ctx: ChatMiddlewareContext,
    cache: Map<string, Promise<ContentPart>>,
    message: ModelMessage,
  ) {
    const { content } = message
    if (!Array.isArray(content) || !hasMediaRef(message)) return message
    const parts: Array<ContentPart> = []
    for (const part of content) {
      const id = part.type === 'text' ? undefined : mediaIdOf(part)
      if (part.type === 'text' || id === undefined) {
        parts.push(part)
        continue
      }
      let pending = cache.get(id)
      if (!pending) {
        pending = resolve(ctx, part, id)
        cache.set(id, pending)
      }
      parts.push(await pending)
    }
    return { ...message, content: parts }
  }

  const middleware: ChatMiddleware = {
    name: 'harness:media',
    // `init` runs before the user turn is stored, so a refusal stops the send
    // early. `beforeModel` builds the provider messages again, so it runs
    // there too (the cache makes that cheap).
    async onConfig(ctx, config) {
      const messages = config.providerMessages ?? config.messages
      if (!messages.some(hasMediaRef)) return undefined
      let cache = runs.get(ctx)
      if (!cache) {
        cache = new Map()
        runs.set(ctx, cache)
      }
      const providerMessages: Array<ModelMessage> = []
      for (const message of messages) {
        providerMessages.push(await resolveMessage(ctx, cache, message))
      }
      return { providerMessages }
    },
  }
  return middleware
}
