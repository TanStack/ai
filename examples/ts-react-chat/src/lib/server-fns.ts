import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  chat,
  generateAudio,
  generateImage,
  generateSpeech,
  generateTranscription,
  generateVideo,
  getVideoJobStatus,
  memoryStream,
  replayRunStream,
  summarize,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import {
  getGenerationHydration,
  withGenerationPersistence,
} from '@tanstack/ai-persistence'
import { openaiSummarize, openaiText } from '@tanstack/ai-openai'
import { grokImage, grokVideo } from '@tanstack/ai-grok'
import type { UIMessage } from '@tanstack/ai'
import {
  InvalidModelOverrideError,
  UnknownProviderError,
  buildAudioAdapter,
  buildSpeechAdapter,
  buildTranscriptionAdapter,
} from './server-audio-adapters'
import {
  artifactServeUrl,
  generationServerPersistence,
} from './generation-server-store'

/**
 * Server-fn error with a stable `code` property clients can switch on.
 *
 * TanStack Start's `createServerFn` surfaces thrown errors as a generic 500
 * without a structured payload. We can't influence the status code from here,
 * so we attach a `code` field the client can read to distinguish well-known
 * failure modes (invalid_model_override, unknown_provider) from truly
 * unexpected errors.
 */
class ServerFnError extends Error {
  readonly code: string
  readonly details?: Record<string, unknown>

  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ServerFnError'
    this.code = code
    this.details = details
  }
}

/**
 * Translate the typed audio-adapter errors into a `ServerFnError` with a stable
 * `code`. Any other error is re-thrown untouched so the framework's default
 * 500 path handles it.
 */
function rethrowAudioAdapterError(err: unknown): never {
  if (err instanceof InvalidModelOverrideError) {
    throw new ServerFnError('invalid_model_override', err.message, {
      providerId: err.providerId,
      requestedModel: err.requestedModel,
      allowedModels: err.allowedModels,
    })
  }
  if (err instanceof UnknownProviderError) {
    throw new ServerFnError('unknown_provider', err.message, {
      providerId: err.providerId,
      allowedProviders: err.allowedProviders,
    })
  }
  throw err
}

const SPEECH_PROVIDER_SCHEMA = z
  .enum(['openai', 'gemini', 'fal', 'grok', 'elevenlabs'])
  .optional()

const TRANSCRIPTION_PROVIDER_SCHEMA = z
  .enum(['openai', 'openai-diarize', 'fal', 'grok', 'elevenlabs'])
  .optional()

const TRANSCRIPTION_RESPONSE_FORMAT_SCHEMA = z
  .enum(['json', 'text', 'srt', 'verbose_json', 'vtt'])
  .optional()

const AUDIO_PROVIDER_SCHEMA = z
  .enum([
    'gemini-lyria',
    'fal-audio',
    'fal-sfx',
    'elevenlabs-music',
    'elevenlabs-sfx',
  ])
  .optional()

// =============================================================================
// Image generation — server-driven persistence (direct + streaming server fns)
// =============================================================================
//
// Same stores as `/api/generate/image` (`generationServerPersistence` +
// `/api/artifacts`). Direct and streaming server-fn modes have no GET route, so
// the client supplies `hydrateGeneration` / `joinRun` via the companion
// functions below. See docs/persistence/generation-persistence.md.

const imageGenerateInputSchema = z.object({
  prompt: z.string(),
  numberOfImages: z.number().optional(),
  size: z.string().optional(),
  // Required: the slot successive runs are filed under for hydration.
  threadId: z.string().min(1),
})

function imagePersistenceMiddleware() {
  return withGenerationPersistence(generationServerPersistence(), {
    artifactUrl: (ref) => artifactServeUrl(ref.artifactId),
  })
}

// =============================================================================
// Direct server functions (non-streaming, return the result directly)
// =============================================================================

export const generateImageFn = createServerFn({ method: 'POST' })
  .inputValidator(imageGenerateInputSchema)
  .handler(async ({ data }) => {
    return generateImage({
      adapter: grokImage('grok-imagine-image'),
      prompt: data.prompt,
      numberOfImages: data.numberOfImages,
      size: data.size as any,
      threadId: data.threadId,
      middleware: [imagePersistenceMiddleware()],
    })
  })

export const generateSpeechFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      text: z.string(),
      voice: z.string().optional(),
      format: z.enum(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']).optional(),
      provider: SPEECH_PROVIDER_SCHEMA,
    }),
  )
  .handler(async ({ data }) => {
    // `buildSpeechAdapter` can throw `UnknownProviderError` (defense-in-depth;
    // Zod should catch this first). Translate into a `ServerFnError` so
    // clients can distinguish it from a generic failure via the stable `code`.
    let adapter
    try {
      adapter = buildSpeechAdapter(data.provider ?? 'openai')
    } catch (err) {
      rethrowAudioAdapterError(err)
    }
    return generateSpeech({
      adapter,
      text: data.text,
      voice: data.voice,
      format: data.format,
    })
  })

export const transcribeFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      audio: z.string(),
      language: z.string().optional(),
      responseFormat: TRANSCRIPTION_RESPONSE_FORMAT_SCHEMA,
      modelOptions: z.record(z.string(), z.any()).optional(),
      provider: TRANSCRIPTION_PROVIDER_SCHEMA,
    }),
  )
  .handler(async ({ data }) => {
    // `buildTranscriptionAdapter` can throw `UnknownProviderError`
    // (defense-in-depth; Zod should catch this first). Translate into a
    // `ServerFnError` so clients can distinguish it from a generic failure
    // via the stable `code`.
    let adapter
    try {
      adapter = buildTranscriptionAdapter(data.provider ?? 'openai')
    } catch (err) {
      rethrowAudioAdapterError(err)
    }
    return generateTranscription({
      adapter,
      audio: data.audio,
      language: data.language,
      responseFormat: data.responseFormat,
      modelOptions: data.modelOptions,
    })
  })

export const generateAudioFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      prompt: z.string(),
      duration: z.number().optional(),
      provider: AUDIO_PROVIDER_SCHEMA,
      model: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    // `buildAudioAdapter` can throw `InvalidModelOverrideError` (unknown
    // model id) or `UnknownProviderError` (defense-in-depth; Zod should
    // catch this first). Translate both into a `ServerFnError` so clients
    // can distinguish them from a generic failure via the stable `code`.
    let adapter
    try {
      adapter = buildAudioAdapter(data.provider ?? 'gemini-lyria', data.model)
    } catch (err) {
      rethrowAudioAdapterError(err)
    }
    return generateAudio({
      adapter,
      prompt: data.prompt,
      duration: data.duration,
    })
  })

export const summarizeFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      text: z.string(),
      maxLength: z.number().optional(),
      style: z.enum(['bullet-points', 'paragraph', 'concise']).optional(),
      model: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    return summarize({
      adapter: openaiSummarize((data.model ?? 'gpt-4o-mini') as 'gpt-4o-mini'),
      text: data.text,
      maxLength: data.maxLength,
      style: data.style,
    })
  })

export const generateVideoFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      prompt: z.string(),
      size: z.string().optional(),
      duration: z.number().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const adapter = grokVideo('grok-imagine-video')

    // Create the job
    const { jobId } = await generateVideo({
      adapter,
      prompt: data.prompt,
      size: data.size as any,
      duration: data.duration,
    })

    // Poll until complete (max 10 minutes)
    const MAX_POLLS = 120
    let polls = 0
    let status = await getVideoJobStatus({ adapter, jobId })
    while (status.status !== 'completed' && status.status !== 'failed') {
      if (++polls > MAX_POLLS) {
        throw new Error('Video generation timed out')
      }
      await new Promise((r) => setTimeout(r, 5000))
      status = await getVideoJobStatus({ adapter, jobId })
    }

    if (status.status === 'failed') {
      throw new Error(status.error || 'Video generation failed')
    }

    if (!status.url) {
      throw new Error('Video generation completed but no URL was provided')
    }

    return {
      jobId,
      status: 'completed' as const,
      url: status.url,
    }
  })

// =============================================================================
// Streaming server functions (return SSE Response for client-side parsing)
// Used with: fetchServerSentEvents((input) => streamFn({ data: input }))
// =============================================================================

export const generateImageStreamFn = createServerFn({ method: 'POST' })
  .inputValidator(imageGenerateInputSchema)
  .handler(({ data }) => {
    // One run id for the durability log and the run record so join can replay
    // exactly the run hydration reports.
    const runId = crypto.randomUUID()
    const stream = generateImage({
      adapter: grokImage('grok-imagine-image'),
      prompt: data.prompt,
      numberOfImages: data.numberOfImages,
      size: data.size as any,
      threadId: data.threadId,
      runId,
      stream: true,
      middleware: [imagePersistenceMiddleware()],
    })
    return toServerSentEventsResponse(stream, {
      durability: { adapter: memoryStream({ runId }) },
    })
  })

/**
 * Wire shape for mount hydration. Parsed with Zod so:
 * - TanStack Start gets a JSON-serializable return type (no `unknown`)
 * - the store's loose `result` is validated before it crosses the wire
 */
const generationHydrationSchema = z.object({
  resumeSnapshot: z
    .object({
      schemaVersion: z.literal(1),
      resumeState: z
        .object({
          threadId: z.string().optional(),
          runId: z.string(),
        })
        .nullable(),
      status: z.enum(['idle', 'running', 'complete', 'error']),
      // `z.any()` (not `z.unknown()`) so Start's serializer accepts the values.
      result: z.record(z.string(), z.any()).optional(),
      error: z
        .object({
          message: z.string(),
          code: z.string().optional(),
        })
        .optional(),
      activity: z.string().optional(),
    })
    .nullable(),
  activeRun: z.object({ runId: z.string() }).nullable(),
})

/** Mount hydration for image `persistence: true` over a fetcher (no GET route). */
export const getImageHydrationFn = createServerFn({ method: 'GET' })
  .inputValidator(z.string().min(1))
  .handler(async ({ data: threadId }) => {
    // No auth in this single-user demo — gate on session in a multi-user app.
    return generationHydrationSchema.parse(
      await getGenerationHydration(generationServerPersistence(), threadId),
    )
  })

/**
 * Rejoin an in-flight image run over a server function (replay + live tail).
 * Returns an SSE `Response` — the client parses it the same way
 * `generateImageStreamFn` does (see `chunksFromSseResponse` on the page).
 */
export const joinImageRunFn = createServerFn({ method: 'GET' })
  .inputValidator(z.string().min(1))
  .handler(({ data: runId }) =>
    toServerSentEventsResponse(replayRunStream(memoryStream({ runId }))),
  )

export const generateSpeechStreamFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      text: z.string(),
      voice: z.string().optional(),
      format: z.enum(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']).optional(),
      provider: SPEECH_PROVIDER_SCHEMA,
    }),
  )
  .handler(({ data }) => {
    // `buildSpeechAdapter` can throw `UnknownProviderError` (defense-in-depth;
    // Zod should catch this first). Translate into a `ServerFnError` so
    // clients can distinguish it from a generic failure via the stable `code`.
    let adapter
    try {
      adapter = buildSpeechAdapter(data.provider ?? 'openai')
    } catch (err) {
      rethrowAudioAdapterError(err)
    }
    return toServerSentEventsResponse(
      generateSpeech({
        adapter,
        text: data.text,
        voice: data.voice,
        format: data.format,
        stream: true,
      }),
    )
  })

export const transcribeStreamFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      audio: z.string(),
      language: z.string().optional(),
      responseFormat: TRANSCRIPTION_RESPONSE_FORMAT_SCHEMA,
      modelOptions: z.record(z.string(), z.any()).optional(),
      provider: TRANSCRIPTION_PROVIDER_SCHEMA,
    }),
  )
  .handler(({ data }) => {
    // `buildTranscriptionAdapter` can throw `UnknownProviderError`
    // (defense-in-depth; Zod should catch this first). Translate into a
    // `ServerFnError` so clients can distinguish it from a generic failure
    // via the stable `code`.
    let adapter
    try {
      adapter = buildTranscriptionAdapter(data.provider ?? 'openai')
    } catch (err) {
      rethrowAudioAdapterError(err)
    }
    return toServerSentEventsResponse(
      generateTranscription({
        adapter,
        audio: data.audio,
        language: data.language,
        responseFormat: data.responseFormat,
        modelOptions: data.modelOptions,
        stream: true,
      }),
    )
  })

export const summarizeStreamFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      text: z.string(),
      maxLength: z.number().optional(),
      style: z.enum(['bullet-points', 'paragraph', 'concise']).optional(),
      model: z.string().optional(),
    }),
  )
  .handler(({ data }) => {
    return toServerSentEventsResponse(
      summarize({
        adapter: openaiSummarize(
          (data.model ?? 'gpt-4o-mini') as 'gpt-4o-mini',
        ),
        text: data.text,
        maxLength: data.maxLength,
        style: data.style,
        stream: true,
      }),
    )
  })

export const generateVideoStreamFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      prompt: z.string(),
      size: z.string().optional(),
      duration: z.number().optional(),
    }),
  )
  .handler(({ data }) => {
    return toServerSentEventsResponse(
      generateVideo({
        adapter: grokVideo('grok-imagine-video'),
        prompt: data.prompt,
        size: data.size as any,
        duration: data.duration,
        stream: true,
      }),
    )
  })

// =============================================================================
// Chat server function â€” pairs with useChat({ fetcher })
// =============================================================================

export const chatFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { messages: Array<UIMessage>; data?: Record<string, any> }) => data,
  )
  .handler(({ data }) =>
    toServerSentEventsResponse(
      chat({
        adapter: openaiText('gpt-5.2'),
        messages: data.messages as any,
        systemPrompts: [
          'You are a helpful assistant. Keep replies short and friendly.',
        ],
      }),
    ),
  )
