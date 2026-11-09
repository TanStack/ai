import {
  ElevenLabsError,
  ElevenLabsTimeoutError,
} from '@elevenlabs/elevenlabs-js/errors/index.js'
import { UnprocessableEntityError } from '@elevenlabs/elevenlabs-js/api/errors/UnprocessableEntityError.js'
import { createHttpClient, mergeHeaders } from '@tanstack/ai-utils/http'
import { sendWith } from '@tanstack/ai-utils/kubb'
import {
  elevenlabsPostV1Music,
  elevenlabsPostV1SoundGeneration,
  elevenlabsPostV1SpeechToText,
  elevenlabsPostV1TextToDialogue,
  elevenlabsPostV1TextToDialogueWithTimestamps,
  elevenlabsPostV1TextToSpeechVoiceId,
  elevenlabsPostV1TextToSpeechVoiceIdWithTimestamps,
  elevenlabsPostV1TextToVoice,
  elevenlabsPostV1TextToVoiceDesign,
} from '../generated/client/sdk'
import { getElevenLabsApiKeyFromEnv } from '../utils/client'
import type { ClientInstance } from '@tanstack/ai-utils/kubb'
import type { ElevenLabs } from '@elevenlabs/elevenlabs-js'
import type { ElevenLabsClientConfig } from '../utils/client'
import type { ElevenLabsOutputFormat } from '../model-meta'
import type {
  ElevenlabsPostV1MusicBody,
  ElevenlabsPostV1SoundGenerationBody,
  ElevenlabsPostV1SpeechToTextBody,
  ElevenlabsPostV1TextToDialogueBody,
  ElevenlabsPostV1TextToDialogueWithTimestampsBody,
  ElevenlabsPostV1TextToSpeechVoiceIdBody,
  ElevenlabsPostV1TextToSpeechVoiceIdWithTimestampsBody,
  ElevenlabsPostV1TextToVoiceBody,
  ElevenlabsPostV1TextToVoiceDesignBody,
} from '../generated/client/types'

/** The per-call options of the SDK methods that this package uses. */
interface RequestOptions {
  abortSignal?: AbortSignal
}

/**
 * Query params the API takes but the OpenAPI document leaves out (each
 * operation has `query?: never`). Each endpoint sends only its own keys.
 */
export interface ElevenLabsQuery {
  output_format?: ElevenLabsOutputFormat
  enable_logging?: boolean
  optimize_streaming_latency?: number
}

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
 * Creates a fetch client with the `@elevenlabs/elevenlabs-js` method names
 * and results for the endpoints this package calls. POST methods take the
 * generated (modelschemas) snake_case body, plus the query params the
 * document leaves out. It sends the same requests as the SDK and throws the
 * same `ElevenLabsError` classes.
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
    request: {
      query?: Record<string, unknown>
      body?: unknown
      // The headers of a generated body (its content type). Client headers win.
      bodyHeaders?: Record<string, string>
    },
    options: RequestOptions | undefined,
  ) {
    let rawResponse = unknownRawResponse()
    const http = createHttpClient({
      baseURL,
      timeout,
      // The SDK retry rules differ from the Stainless ones, so retry below.
      maxRetries: 0,
      fetch: async (url, init) => {
        // Read at call time, so a fetch swapped in later is still used.
        const response = await (config?.fetch ?? fetch)(url, init)
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
          headers: mergeHeaders(request.bodyHeaders, headers),
          signal: options?.abortSignal,
          query: request.query,
          body: request.body,
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

  // A GET endpoint that the OpenAPI document does not have. The `queryKeys`
  // SDK params go in the query, in the SDK order, with snake_case names.
  const get = (
    path: string,
    params: object,
    queryKeys: ReadonlyArray<string>,
    options: RequestOptions | undefined,
  ) => {
    const values = new Map(Object.entries(params))
    const query = Object.fromEntries(
      queryKeys.map((key) => [toSnake(key), values.get(key)]),
    )
    return send('GET', path, path, { query }, options)
  }

  // The `keys` of `query`, in the SDK order (the URL order).
  const pick = (
    query: ElevenLabsQuery,
    keys: ReadonlyArray<keyof ElevenLabsQuery>,
  ) => Object.fromEntries(keys.map((key) => [key, query[key]]))

  // A generated operation: it builds the path and the body, and `send` adds
  // the query (the document declares none) and sends it with the client
  // headers, retries, and errors.
  async function generated(
    template: string,
    query: Record<string, unknown>,
    options: RequestOptions | undefined,
    operation: (client: ClientInstance) => Promise<{ response: Response }>,
  ) {
    const { response } = await operation(
      sendWith((built) =>
        send(
          'POST',
          built.path,
          template,
          { query, body: built.body, bodyHeaders: built.headers },
          options,
        ),
      ),
    )
    return response
  }

  // The audio bytes of a response.
  function readAudio(response: Response) {
    if (!response.body) {
      throw new ElevenLabsError({
        statusCode: response.status,
        rawResponse: toRawResponse(response),
      })
    }
    const audio: ReadableStream<Uint8Array> = response.body
    return audio
  }

  const ttsQuery = [
    'enable_logging',
    'optimize_streaming_latency',
    'output_format',
  ] as const
  const dialogueQuery = ['output_format', 'enable_logging'] as const

  return {
    textToSpeech: {
      convert: async (
        voiceId: string,
        body: ElevenlabsPostV1TextToSpeechVoiceIdBody,
        query: ElevenLabsQuery = {},
        options?: RequestOptions,
      ) =>
        readAudio(
          await generated(
            '/v1/text-to-speech/{voice_id}',
            pick(query, ttsQuery),
            options,
            (client) =>
              elevenlabsPostV1TextToSpeechVoiceId({
                client,
                path: { voice_id: voiceId },
                body,
              }),
          ),
        ),
      convertWithTimestamps: async (
        voiceId: string,
        body: ElevenlabsPostV1TextToSpeechVoiceIdWithTimestampsBody,
        query: ElevenLabsQuery = {},
        options?: RequestOptions,
      ) => {
        const response = await generated(
          '/v1/text-to-speech/{voice_id}/with-timestamps',
          pick(query, ttsQuery),
          options,
          (client) =>
            elevenlabsPostV1TextToSpeechVoiceIdWithTimestamps({
              client,
              path: { voice_id: voiceId },
              body,
            }),
        )
        return (await readJSON(
          response,
        )) as ElevenLabs.AudioWithTimestampsResponse
      },
    },
    textToDialogue: {
      convert: async (
        body: ElevenlabsPostV1TextToDialogueBody,
        query: ElevenLabsQuery = {},
        options?: RequestOptions,
      ) =>
        readAudio(
          await generated(
            '/v1/text-to-dialogue',
            pick(query, dialogueQuery),
            options,
            (client) => elevenlabsPostV1TextToDialogue({ client, body }),
          ),
        ),
      convertWithTimestamps: async (
        body: ElevenlabsPostV1TextToDialogueWithTimestampsBody,
        query: ElevenLabsQuery = {},
        options?: RequestOptions,
      ) => {
        const response = await generated(
          '/v1/text-to-dialogue/with-timestamps',
          pick(query, dialogueQuery),
          options,
          (client) =>
            elevenlabsPostV1TextToDialogueWithTimestamps({ client, body }),
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
        const response = await get(
          '/v1/voices',
          request,
          ['showLegacy'],
          options,
        )
        return (await readJSON(response)) as ElevenLabs.GetVoicesResponse
      },
    },
    music: {
      compose: async (
        body: ElevenlabsPostV1MusicBody,
        query: ElevenLabsQuery = {},
        options?: RequestOptions,
      ) =>
        readAudio(
          await generated(
            '/v1/music',
            pick(query, ['output_format']),
            options,
            (client) => elevenlabsPostV1Music({ client, body }),
          ),
        ),
    },
    textToSoundEffects: {
      convert: async (
        body: ElevenlabsPostV1SoundGenerationBody,
        query: ElevenLabsQuery = {},
        options?: RequestOptions,
      ) =>
        readAudio(
          await generated(
            '/v1/sound-generation',
            pick(query, ['output_format']),
            options,
            (client) => elevenlabsPostV1SoundGeneration({ client, body }),
          ),
        ),
    },
    speechToText: {
      // The generated operation sends `body` as multipart/form-data.
      convert: async (
        body: ElevenlabsPostV1SpeechToTextBody,
        query: ElevenLabsQuery = {},
        options?: RequestOptions,
      ) => {
        const response = await generated(
          '/v1/speech-to-text',
          pick(query, ['enable_logging']),
          options,
          (client) => elevenlabsPostV1SpeechToText({ client, body }),
        )
        return (await readJSON(
          response,
        )) as ElevenLabs.SpeechToTextConvertResponse
      },
    },
    textToVoice: {
      design: async (
        body: ElevenlabsPostV1TextToVoiceDesignBody,
        query: ElevenLabsQuery = {},
        options?: RequestOptions,
      ) => {
        const response = await generated(
          '/v1/text-to-voice/design',
          pick(query, ['output_format']),
          options,
          (client) => elevenlabsPostV1TextToVoiceDesign({ client, body }),
        )
        return (await readJSON(
          response,
        )) as ElevenLabs.VoiceDesignPreviewResponse
      },
      create: async (
        body: ElevenlabsPostV1TextToVoiceBody,
        options?: RequestOptions,
      ) => {
        const response = await generated(
          '/v1/text-to-voice',
          {},
          options,
          (client) => elevenlabsPostV1TextToVoice({ client, body }),
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
          const response = await get(
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
