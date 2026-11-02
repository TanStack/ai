import {
  ElevenLabsError,
  ElevenLabsTimeoutError,
} from '@elevenlabs/elevenlabs-js/errors/index.js'
import { UnprocessableEntityError } from '@elevenlabs/elevenlabs-js/api/errors/UnprocessableEntityError.js'
import {
  createHttpClient,
  mergeHeaders,
  toFormData,
} from '@tanstack/ai-utils/http'
import { getElevenLabsApiKeyFromEnv } from '../utils/client'
import type { ElevenLabs } from '@elevenlabs/elevenlabs-js'
import type { ElevenLabsClientConfig } from '../utils/client'

/** The per-call options of the SDK methods that this package uses. */
interface RequestOptions {
  abortSignal?: AbortSignal
}

/** The `speechToText.convert` fields that this package sends. */
type SpeechToTextRequest = Pick<
  ElevenLabs.BodySpeechToTextV1SpeechToTextPost,
  | 'modelId'
  | 'cloudStorageUrl'
  | 'languageCode'
  | 'tagAudioEvents'
  | 'numSpeakers'
  | 'timestampsGranularity'
  | 'diarize'
  | 'diarizationThreshold'
  | 'detectSpeakerRoles'
  | 'keyterms'
  | 'entityDetection'
  | 'entityRedaction'
  | 'entityRedactionMode'
  | 'noVerbatim'
  | 'temperature'
  | 'seed'
  | 'enableLogging'
  | 'useMultiChannel'
  | 'fileFormat'
> & { file?: Blob }

type RawResponse = NonNullable<ElevenLabsError['rawResponse']>

const DEFAULT_BASE_URL = 'https://api.elevenlabs.io'

// The SDK's `unknownRawResponse` and `abortRawResponse`.
const unknownRawResponse = (): RawResponse => ({
  headers: new Headers(),
  redirected: false,
  status: 0,
  statusText: 'Unknown Error',
  type: 'error',
  url: '',
})
const abortRawResponse = (): RawResponse => ({
  ...unknownRawResponse(),
  status: 499,
  statusText: 'Client Closed Request',
})

const toRawResponse = (response: Response): RawResponse => ({
  headers: response.headers,
  redirected: response.redirected,
  status: response.status,
  statusText: response.statusText,
  type: response.type,
  url: response.url,
})

// Values under these keys are maps with user or model ids as keys, so their
// keys go on the wire as they are (the SDK `record` schemas).
const RECORD_KEYS = new Set(['labels', 'state', 'progress', 'message'])

function renameKeys(value: unknown, rename: (key: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => renameKeys(item, rename))
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      rename(key),
      RECORD_KEYS.has(key) ? item : renameKeys(item, rename),
    ]),
  )
}

const toSnake = (key: string) =>
  key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
// `audio_base_64` becomes `audioBase64`, like the SDK schema.
const toCamel = (key: string) =>
  key.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase())

// ponytail: no schema check. The SDK validates each response and keeps
// unknown keys as they are; this renames every key to camelCase. A `null`
// becomes `undefined`, like the SDK `optional()` schemas.
const readJSON = async (response: Response) =>
  renameKeys(
    JSON.parse(
      await response.text(),
      (_, value: unknown) => value ?? undefined,
    ),
    toCamel,
  )

/**
 * The Fern SDK retry wait in ms: `Retry-After` (seconds or a date), then
 * `X-RateLimit-Reset`, else `1000 * 2^attempt` with 10% jitter. All capped at
 * 60 s.
 */
function retryDelay(headers: Headers, attempt: number) {
  const retryAfter = headers.get('retry-after')
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10)
    if (seconds > 0) return Math.min(seconds * 1000, 60000)
    const untilDate = new Date(retryAfter).getTime() - Date.now()
    if (untilDate > 0) return Math.min(untilDate, 60000)
  }
  const reset = parseInt(headers.get('x-ratelimit-reset') ?? '', 10)
  const untilReset = reset * 1000 - Date.now()
  if (untilReset > 0) {
    return Math.min(untilReset, 60000) * (1 + Math.random() * 0.2)
  }
  return (
    Math.min(1000 * 2 ** attempt, 60000) * (1 + (Math.random() - 0.5) * 0.2)
  )
}

const isRetryableStatus = (status: number) =>
  status === 408 || status === 429 || status >= 500

/**
 * Creates a fetch client with the `@elevenlabs/elevenlabs-js` method names,
 * arguments, and results for the endpoints this package calls. It sends the
 * same requests as the SDK and throws the same `ElevenLabsError` classes.
 *
 * @param config - API key (default `ELEVENLABS_API_KEY`), `baseURL` /
 * `baseUrl`, `defaultHeaders` / `headers`, `timeoutInSeconds` (default 240),
 * and `maxRetries` (default 2).
 *
 * @example
 * const client = createElevenLabsClient({ apiKey })
 * const audio = await client.textToSpeech.convert(voiceId, { text: 'Hi' })
 */
export function createElevenLabsClient(config?: ElevenLabsClientConfig) {
  const apiKey = config?.apiKey ?? getElevenLabsApiKeyFromEnv()
  const baseURL = (
    config?.baseURL ??
    config?.baseUrl ??
    DEFAULT_BASE_URL
  ).replace(/\/+$/, '')
  const headers = mergeHeaders(
    { accept: '*/*' },
    config?.defaultHeaders ?? config?.headers,
    { 'xi-api-key': apiKey },
  )
  const timeout = (config?.timeoutInSeconds ?? 240) * 1000
  const maxRetries = config?.maxRetries ?? 2

  async function send(
    method: 'GET' | 'POST',
    path: string,
    // The path template the SDK names in its timeout message.
    template: string,
    request: { query?: Record<string, unknown>; body?: unknown },
    options: RequestOptions | undefined,
  ) {
    let rawResponse = unknownRawResponse()
    const http = createHttpClient({
      baseURL,
      timeout,
      // The SDK retry rules differ from the Stainless ones, so retry below.
      maxRetries: 0,
      fetch: async (url, init) => {
        const response = await fetch(url, init)
        rawResponse = toRawResponse(response)
        return response
      },
      makeError: (statusCode, json, text) => {
        const body = json ?? text
        return statusCode === 422
          ? new UnprocessableEntityError(body, rawResponse)
          : new ElevenLabsError({ statusCode, body, rawResponse })
      },
      makeConnectionError: (cause) =>
        new ElevenLabsError({
          message: cause instanceof Error ? cause.message : String(cause),
          rawResponse: unknownRawResponse(),
          cause,
        }),
      makeTimeoutError: () =>
        new ElevenLabsTimeoutError(
          `Timeout exceeded when calling ${method} ${template}.`,
        ),
      makeAbortError: () =>
        new ElevenLabsError({
          message: 'The user aborted a request',
          rawResponse: abortRawResponse(),
        }),
    })

    for (let attempt = 0; ; attempt++) {
      try {
        return await http.request({
          method,
          path,
          headers,
          signal: options?.abortSignal,
          ...request,
        })
      } catch (error) {
        const status =
          error instanceof ElevenLabsError ? error.statusCode : undefined
        const canRetry =
          attempt < maxRetries &&
          status !== undefined &&
          isRetryableStatus(status)
        if (!canRetry) throw error
        // The SDK wait ignores the abort signal; the next attempt sees it.
        const delay = retryDelay(rawResponse.headers, attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  // A JSON endpoint: the `queryKeys` fields go in the query (in the SDK
  // order), the rest is the body, all with snake_case names.
  function sendJSON(
    method: 'GET' | 'POST',
    path: string,
    template: string,
    params: object,
    queryKeys: ReadonlyArray<string>,
    options: RequestOptions | undefined,
  ) {
    const body: Record<string, unknown> = { ...params }
    const query = Object.fromEntries(
      queryKeys.map((key) => [toSnake(key), body[key]]),
    )
    for (const key of queryKeys) delete body[key]
    const hasBody = method === 'POST'
    return send(
      method,
      path,
      template,
      { query, ...(hasBody ? { body: renameKeys(body, toSnake) } : {}) },
      options,
    )
  }

  // An endpoint that answers with audio bytes. The wide stream type is the
  // SDK one, so a real SDK client also fits `ElevenLabsClient`.
  async function sendForAudio(...args: Parameters<typeof sendJSON>) {
    const response = await sendJSON(...args)
    if (!response.body) {
      throw new ElevenLabsError({
        statusCode: response.status,
        rawResponse: toRawResponse(response),
      })
    }
    const audio: ReadableStream<Uint8Array> = response.body
    return audio
  }

  const ttsPath = (voiceId: string) =>
    `/v1/text-to-speech/${encodeURIComponent(voiceId)}`
  const ttsQuery = ['enableLogging', 'optimizeStreamingLatency', 'outputFormat']
  const dialogueQuery = ['outputFormat', 'enableLogging']

  return {
    textToSpeech: {
      convert: (
        voiceId: string,
        request: ElevenLabs.BodyTextToSpeechFull,
        options?: RequestOptions,
      ) =>
        sendForAudio(
          'POST',
          ttsPath(voiceId),
          '/v1/text-to-speech/{voice_id}',
          request,
          ttsQuery,
          options,
        ),
      convertWithTimestamps: async (
        voiceId: string,
        request: ElevenLabs.BodyTextToSpeechFullWithTimestamps,
        options?: RequestOptions,
      ) => {
        const response = await sendJSON(
          'POST',
          `${ttsPath(voiceId)}/with-timestamps`,
          '/v1/text-to-speech/{voice_id}/with-timestamps',
          request,
          ttsQuery,
          options,
        )
        return (await readJSON(
          response,
        )) as ElevenLabs.AudioWithTimestampsResponse
      },
    },
    textToDialogue: {
      convert: (
        request: ElevenLabs.BodyTextToDialogueMultiVoiceV1TextToDialoguePost,
        options?: RequestOptions,
      ) =>
        sendForAudio(
          'POST',
          '/v1/text-to-dialogue',
          '/v1/text-to-dialogue',
          request,
          dialogueQuery,
          options,
        ),
      convertWithTimestamps: async (
        request: ElevenLabs.BodyTextToDialogueFullWithTimestamps,
        options?: RequestOptions,
      ) => {
        const response = await sendJSON(
          'POST',
          '/v1/text-to-dialogue/with-timestamps',
          '/v1/text-to-dialogue/with-timestamps',
          request,
          dialogueQuery,
          options,
        )
        return (await readJSON(
          response,
        )) as ElevenLabs.AudioWithTimestampsAndVoiceSegmentsResponseModel
      },
    },
    voices: {
      getAll: async (
        request: ElevenLabs.VoicesGetAllRequest = {},
        options?: RequestOptions,
      ) => {
        const response = await sendJSON(
          'GET',
          '/v1/voices',
          '/v1/voices',
          request,
          ['showLegacy'],
          options,
        )
        return (await readJSON(response)) as ElevenLabs.GetVoicesResponse
      },
    },
    music: {
      compose: (
        // The SDK sends `signWithC2Pa` as `sign_with_c2pa`, which the plain
        // snake_case rename would get wrong. This package never sets it.
        request: Omit<ElevenLabs.BodyComposeMusicV1MusicPost, 'signWithC2Pa'>,
        options?: RequestOptions,
      ) =>
        sendForAudio(
          'POST',
          '/v1/music',
          '/v1/music',
          request,
          ['outputFormat'],
          options,
        ),
    },
    textToSoundEffects: {
      convert: (
        request: ElevenLabs.CreateSoundEffectRequest,
        options?: RequestOptions,
      ) =>
        sendForAudio(
          'POST',
          '/v1/sound-generation',
          '/v1/sound-generation',
          request,
          ['outputFormat'],
          options,
        ),
    },
    speechToText: {
      convert: async (
        request: SpeechToTextRequest,
        options?: RequestOptions,
      ) => {
        const body = toFormData({
          model_id: request.modelId,
          file: request.file,
          language_code: request.languageCode,
          tag_audio_events: request.tagAudioEvents,
          num_speakers: request.numSpeakers,
          timestamps_granularity: request.timestampsGranularity,
          diarize: request.diarize,
          diarization_threshold: request.diarizationThreshold,
          file_format: request.fileFormat,
          cloud_storage_url: request.cloudStorageUrl,
          temperature: request.temperature,
          seed: request.seed,
          use_multi_channel: request.useMultiChannel,
          // ponytail: the SDK sends these two only when they are arrays and
          // drops a plain string. Kept the same for parity.
          entity_detection: Array.isArray(request.entityDetection)
            ? request.entityDetection
            : undefined,
          no_verbatim: request.noVerbatim,
          detect_speaker_roles: request.detectSpeakerRoles,
          entity_redaction: Array.isArray(request.entityRedaction)
            ? request.entityRedaction
            : undefined,
          entity_redaction_mode: request.entityRedactionMode,
          keyterms: request.keyterms,
        })
        const response = await send(
          'POST',
          '/v1/speech-to-text',
          '/v1/speech-to-text',
          { query: { enable_logging: request.enableLogging }, body },
          options,
        )
        return (await readJSON(
          response,
        )) as ElevenLabs.SpeechToTextConvertResponse
      },
    },
    textToVoice: {
      design: async (
        request: ElevenLabs.VoiceDesignRequestModel,
        options?: RequestOptions,
      ) => {
        const response = await sendJSON(
          'POST',
          '/v1/text-to-voice/design',
          '/v1/text-to-voice/design',
          request,
          ['outputFormat'],
          options,
        )
        return (await readJSON(
          response,
        )) as ElevenLabs.VoiceDesignPreviewResponse
      },
      create: async (
        request: ElevenLabs.BodyCreateANewVoiceFromVoicePreviewV1TextToVoicePost,
        options?: RequestOptions,
      ) => {
        const response = await sendJSON(
          'POST',
          '/v1/text-to-voice',
          '/v1/text-to-voice',
          request,
          [],
          options,
        )
        return (await readJSON(response)) as ElevenLabs.Voice
      },
    },
    conversationalAi: {
      conversations: {
        getSignedUrl: async (
          request: ElevenLabs.conversationalAi.ConversationsGetSignedUrlRequest,
          options?: RequestOptions,
        ) => {
          const response = await sendJSON(
            'GET',
            '/v1/convai/conversation/get-signed-url',
            '/v1/convai/conversation/get-signed-url',
            request,
            [
              'agentId',
              'includeConversationId',
              'branchId',
              'versionId',
              'environment',
              'debugEventsRequest',
            ],
            options,
          )
          return (await readJSON(
            response,
          )) as ElevenLabs.ConversationSignedUrlResponseModel
        },
      },
    },
  }
}

/** The ElevenLabs client this package calls. */
export type ElevenLabsClient = ReturnType<typeof createElevenLabsClient>
