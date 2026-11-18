import { afterEach, describe, expect, it, vi } from 'vitest'
import { ElevenLabsClient as SdkClient } from '@elevenlabs/elevenlabs-js'
import { createElevenLabsClient } from '../src/client'
import type { ElevenLabsClient, ElevenLabsQuery } from '../src/client'
import type {
  ElevenlabsPostV1TextToDialogueBody,
  ElevenlabsPostV1TextToSpeechVoiceIdBody,
} from '../src/generated/client/types'
import type { ElevenLabsClientConfig } from '../src/utils/client'

// The real SDK is the oracle: each test runs it and our client on the same
// fetch and compares what went out and what came back.

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

interface SentRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

/** The headers to compare: no SDK telemetry, no multipart boundary. */
function comparableHeaders(headers: Headers) {
  const result: Record<string, string> = {}
  for (const [name, value] of headers) {
    if (name.startsWith('x-fern-') || name === 'user-agent') continue
    result[name] = value.startsWith('multipart/form-data')
      ? 'multipart/form-data'
      : value
  }
  return result
}

async function readRequestBody(request: Request) {
  const type = request.headers.get('content-type') ?? ''
  if (type.startsWith('application/json')) return request.json()
  if (!type.startsWith('multipart/form-data')) return undefined
  const fields: Array<Array<string>> = []
  for (const [name, value] of await request.formData()) {
    fields.push(
      typeof value === 'string'
        ? [name, value]
        : [name, value.name, value.type, await value.text()],
    )
  }
  // The server reads fields by name, so the order does not matter.
  return fields.sort((a, b) => a.join().localeCompare(b.join()))
}

type Responder = (request: Request, index: number) => Response | Promise<never>

/** A fetch that records every request and answers with `respond`. */
function recordingFetch(respond: Responder) {
  const requests: Array<SentRequest> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    requests.push({
      url: request.url,
      method: request.method,
      headers: comparableHeaders(request.headers),
      body: await readRequestBody(request.clone()),
    })
    return respond(request, requests.length - 1)
  }
  return { fetch, requests }
}

/** The fields of a thrown error that callers read. */
function describeError(error: unknown) {
  if (!(error instanceof Error)) return { thrown: error }
  return {
    class: error.constructor.name,
    name: error.name,
    message: error.message,
    ...('statusCode' in error && { statusCode: error.statusCode }),
    ...('body' in error && { body: error.body }),
    ...('requestId' in error && { requestId: error.requestId }),
    ...('rawResponse' in error &&
      typeof error.rawResponse === 'object' &&
      error.rawResponse !== null &&
      'status' in error.rawResponse && {
        rawStatus: error.rawResponse.status,
      }),
  }
}

/** Reads an audio stream to bytes; passes anything else through. */
async function settle(value: unknown) {
  if (!(value instanceof ReadableStream)) return value
  return Array.from(new Uint8Array(await new Response(value).arrayBuffer()))
}

type Run = (client: ElevenLabsClient) => Promise<unknown>

/** Runs `run` on one client and returns the requests and the outcome. */
async function runOn(
  client: ElevenLabsClient,
  run: Run,
  respond: Responder,
  { advanceTimers = false } = {},
) {
  const recorder = recordingFetch(respond)
  vi.stubGlobal('fetch', recorder.fetch)
  const pending = run(client).then(settle, (error: unknown) => ({
    error: describeError(error),
  }))
  if (advanceTimers) await vi.advanceTimersByTimeAsync(60000)
  const outcome = await pending
  vi.unstubAllGlobals()
  return { requests: recorder.requests, outcome }
}

const API_KEY = 'test-key'

// `labels` holds user keys, so the SDK sends them as they are.
function camel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camel)
  if (value === null || typeof value !== 'object' || value instanceof Blob) {
    return value
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()),
      key === 'labels' ? item : camel(item),
    ]),
  )
}

/**
 * The real SDK behind our client's method shapes: it merges our snake_case
 * body and query into the SDK's camelCase request.
 */
function sdkAsOurs(sdk: SdkClient): ElevenLabsClient {
  type Sdk = Parameters<typeof sdk.textToSpeech.convert>[2]
  // ponytail: `any` stands in for each SDK request type; the parity
  // assertions check what the SDK actually sends.
  // oxlint-disable-next-line typescript/no-explicit-any
  const req = (body: object, query: ElevenLabsQuery = {}): any =>
    camel({ ...body, ...query })
  const adapted = {
    textToSpeech: {
      convert: (
        voiceId: string,
        body: object,
        query?: ElevenLabsQuery,
        options?: Sdk,
      ) => sdk.textToSpeech.convert(voiceId, req(body, query), options),
      convertWithTimestamps: (
        voiceId: string,
        body: object,
        query?: ElevenLabsQuery,
        options?: Sdk,
      ) =>
        sdk.textToSpeech.convertWithTimestamps(
          voiceId,
          req(body, query),
          options,
        ),
    },
    textToDialogue: {
      convert: (body: object, query?: ElevenLabsQuery, options?: Sdk) =>
        sdk.textToDialogue.convert(req(body, query), options),
      convertWithTimestamps: (
        body: object,
        query?: ElevenLabsQuery,
        options?: Sdk,
      ) => sdk.textToDialogue.convertWithTimestamps(req(body, query), options),
    },
    voices: sdk.voices,
    music: {
      compose: (body: object, query?: ElevenLabsQuery, options?: Sdk) =>
        sdk.music.compose(req(body, query), options),
    },
    textToSoundEffects: {
      convert: (body: object, query?: ElevenLabsQuery, options?: Sdk) =>
        sdk.textToSoundEffects.convert(req(body, query), options),
    },
    speechToText: {
      convert: (body: object, query?: ElevenLabsQuery, options?: Sdk) =>
        sdk.speechToText.convert(req(body, query), options),
    },
    textToVoice: {
      design: (body: object, query?: ElevenLabsQuery, options?: Sdk) =>
        sdk.textToVoice.design(req(body, query), options),
      create: (body: object, options?: Sdk) =>
        sdk.textToVoice.create(req(body), options),
    },
    conversationalAi: sdk.conversationalAi,
  }
  // The one cast: the SDK returns `HttpResponsePromise`s and wider types
  // than our client, and the parity tests compare the settled values.
  return adapted as unknown as ElevenLabsClient
}

/** Runs `run` on the real SDK and on our client, and returns both. */
async function both(
  run: Run,
  respond: Responder,
  config: ElevenLabsClientConfig = {},
  options: { advanceTimers?: boolean } = {},
) {
  const sdkClient = new SdkClient({
    apiKey: API_KEY,
    ...(config.baseURL ? { baseUrl: config.baseURL } : {}),
    ...(config.timeoutInSeconds != null && {
      timeoutInSeconds: config.timeoutInSeconds,
    }),
    ...(config.maxRetries != null && { maxRetries: config.maxRetries }),
    ...(config.defaultHeaders ? { headers: config.defaultHeaders } : {}),
  })
  const sdk = sdkAsOurs(sdkClient)
  const ours = createElevenLabsClient({ apiKey: API_KEY, ...config })
  return {
    sdk: await runOn(sdk, run, respond, options),
    ours: await runOn(ours, run, respond, options),
  }
}

/** Asserts that both clients sent the same requests and got the same result. */
async function expectParity(
  run: Run,
  respond: Responder,
  config?: ElevenLabsClientConfig,
  options?: { advanceTimers?: boolean },
) {
  const { sdk, ours } = await both(run, respond, config, options)
  expect(ours.requests).toEqual(sdk.requests)
  expect(ours.outcome).toEqual(sdk.outcome)
  return sdk
}

const audio = () => new Response(new Uint8Array([1, 2, 3, 250]))
const json = (body: unknown) => () => Response.json(body)

const alignment = {
  characters: ['H', 'i'],
  character_start_times_seconds: [0, 0.1],
  character_end_times_seconds: [0.1, 0.2],
}

const dialogue = {
  model_id: 'eleven_v3',
  inputs: [
    { text: 'Hi', voice_id: 'v1' },
    { text: 'Yo', voice_id: 'v2' },
  ],
  settings: { stability: 0.5 },
  language_code: 'en',
  seed: 7,
  apply_text_normalization: 'on',
} satisfies ElevenlabsPostV1TextToDialogueBody
const dialogueQuery: ElevenLabsQuery = { output_format: 'mp3_44100_128' }

const speech = {
  text: 'Hello there',
  model_id: 'eleven_multilingual_v2',
  voice_settings: {
    stability: 0.4,
    similarity_boost: 0.7,
    style: 0.1,
    speed: 1.1,
    use_speaker_boost: true,
  },
  previous_text: 'Before.',
  next_text: 'After.',
  previous_request_ids: ['req-a'],
  next_request_ids: ['req-b'],
  apply_language_text_normalization: true,
  apply_text_normalization: 'auto',
  language_code: 'en',
  seed: 1,
} satisfies ElevenlabsPostV1TextToSpeechVoiceIdBody
const speechQuery: ElevenLabsQuery = {
  output_format: 'pcm_44100',
  enable_logging: false,
}

describe('ElevenLabs client parity with @elevenlabs/elevenlabs-js', () => {
  it('textToDialogue.convertWithTimestamps', async () => {
    const sdk = await expectParity(
      (client) =>
        client.textToDialogue.convertWithTimestamps(dialogue, dialogueQuery),
      json({
        audio_base64: 'AAAA',
        alignment,
        normalized_alignment: alignment,
        voice_segments: [
          {
            voice_id: 'v1',
            start_time_seconds: 0,
            end_time_seconds: 0.2,
            character_start_index: 0,
            character_end_index: 2,
            dialogue_input_index: 0,
          },
        ],
      }),
    )
    expect(sdk.requests[0]!.url).toBe(
      'https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps?output_format=mp3_44100_128',
    )
  })

  it('textToDialogue.convert', async () => {
    await expectParity(
      (client) => client.textToDialogue.convert(dialogue, dialogueQuery),
      audio,
    )
  })

  it('textToSpeech.convertWithTimestamps', async () => {
    await expectParity(
      (client) =>
        client.textToSpeech.convertWithTimestamps(
          'voice 1/x',
          speech,
          speechQuery,
        ),
      json({ audio_base64: 'AAAA', alignment, normalized_alignment: null }),
    )
  })

  it('textToSpeech.convert', async () => {
    const sdk = await expectParity(
      (client) =>
        client.textToSpeech.convert('voice-1', speech, {
          ...speechQuery,
          optimize_streaming_latency: 2,
        }),
      audio,
    )
    expect(sdk.outcome).toEqual([1, 2, 3, 250])
  })

  it('voices.getAll', async () => {
    await expectParity(
      (client) =>
        client.voices.getAll({}, { abortSignal: new AbortController().signal }),
      json({
        voices: [
          {
            voice_id: 'v1',
            name: 'Rachel',
            category: 'premade',
            description: 'Calm',
            preview_url: 'https://example.com/v1.mp3',
            labels: { use_case: 'narration', accent: 'american' },
          },
        ],
      }),
    )
  })

  it('music.compose with a composition plan', async () => {
    await expectParity(
      (client) =>
        client.music.compose(
          {
            model_id: 'music_v1',
            composition_plan: {
              positive_global_styles: ['rock'],
              negative_global_styles: [],
              sections: [
                {
                  section_name: 'Intro',
                  positive_local_styles: ['guitar'],
                  negative_local_styles: [],
                  duration_ms: 10000,
                  lines: ['la la'],
                },
              ],
            },
            seed: 4,
            force_instrumental: true,
            respect_sections_durations: true,
          },
          { output_format: 'mp3_44100_128' },
        ),
      audio,
    )
  })

  it('music.compose with a prompt', async () => {
    await expectParity(
      (client) =>
        client.music.compose({
          model_id: 'music_v1',
          prompt: 'calm piano',
          music_length_ms: 30000,
        }),
      audio,
    )
  })

  it('textToSoundEffects.convert', async () => {
    await expectParity(
      (client) =>
        client.textToSoundEffects.convert(
          {
            text: 'glass shattering',
            model_id: 'eleven_text_to_sound_v2',
            duration_seconds: 3,
            prompt_influence: 0.3,
            loop: true,
          },
          { output_format: 'mp3_44100_128' },
        ),
      audio,
    )
  })

  it('speechToText.convert with a file and every option', async () => {
    await expectParity(
      (client) =>
        client.speechToText.convert(
          {
            model_id: 'scribe_v1',
            file: new Blob([new Uint8Array([9, 8, 7])], {
              type: 'audio/mpeg',
            }),
            language_code: 'en',
            tag_audio_events: true,
            num_speakers: 2,
            timestamps_granularity: 'word',
            diarize: true,
            diarization_threshold: 0.3,
            detect_speaker_roles: false,
            keyterms: ['TanStack', 'adapter'],
            entity_detection: ['pii', 'phi'],
            entity_redaction: ['pii'],
            entity_redaction_mode: 'redacted',
            no_verbatim: true,
            temperature: 0.2,
            seed: 3,
            use_multi_channel: false,
            file_format: 'other',
          },
          { enable_logging: false },
        ),
      json({
        language_code: 'en',
        language_probability: 0.98,
        text: 'Hello world',
        words: [
          {
            text: 'Hello',
            start: 0,
            end: 0.5,
            type: 'word',
            speaker_id: 'speaker_0',
            logprob: -0.1,
          },
        ],
      }),
    )
  })

  it('speechToText.convert with a URL', async () => {
    await expectParity(
      (client) =>
        client.speechToText.convert({
          model_id: 'scribe_v1',
          cloud_storage_url: 'https://example.com/a.mp3',
          use_multi_channel: true,
        }),
      json({
        transcripts: [
          {
            language_code: 'en',
            language_probability: 0.9,
            text: 'Hi',
            words: [],
            channel_index: 0,
          },
        ],
        audio_duration_secs: 2.5,
      }),
    )
  })

  it('textToVoice.design', async () => {
    await expectParity(
      (client) =>
        client.textToVoice.design(
          {
            voice_description: 'A calm narrator',
            model_id: 'eleven_ttv_v3',
            text: 'Hello from the preview.',
            auto_generate_text: false,
            loudness: 0.5,
            seed: 1,
            guidance_scale: 5,
            quality: 0.9,
            should_enhance: true,
            prompt_strength: 0.5,
            reference_audio_base64: 'AAAA',
            remixing_session_id: 'r1',
            remixing_session_iteration_id: 'r1-i1',
          },
          { output_format: 'mp3_44100_128' },
        ),
      json({
        previews: [
          {
            audio_base_64: 'AAAA',
            generated_voice_id: 'gen-1',
            media_type: 'audio/mpeg',
            duration_secs: 1.5,
            language: 'en',
          },
        ],
        text: 'Hello from the preview.',
      }),
    )
  })

  it('textToVoice.create', async () => {
    await expectParity(
      (client) =>
        client.textToVoice.create({
          voice_name: 'Narrator',
          voice_description: 'A calm narrator',
          generated_voice_id: 'gen-1',
          labels: { use_case: 'narration' },
          played_not_selected_voice_ids: ['gen-2'],
        }),
      json({
        voice_id: 'saved-1',
        name: 'Narrator',
        labels: { use_case: 'narration' },
      }),
    )
  })

  it('conversationalAi.conversations.getSignedUrl', async () => {
    await expectParity(
      (client) =>
        client.conversationalAi.conversations.getSignedUrl({
          agentId: 'agent_1',
        }),
      json({ signed_url: 'wss://example.com/signed' }),
    )
  })

  it('sends baseURL, headers, and the API key the same way', async () => {
    const sdk = await expectParity(
      (client) => client.voices.getAll(),
      json({ voices: [] }),
      {
        baseURL: 'https://gw.example/elevenlabs/',
        defaultHeaders: { 'X-Gateway': 'yes', 'xi-api-key': 'ignored' },
      },
    )
    expect(sdk.requests[0]!.url).toBe('https://gw.example/elevenlabs/v1/voices')
  })
})

describe('ElevenLabs client error parity', () => {
  const errorResponse = (status: number, body: unknown) => () =>
    Response.json(body, { status, headers: { 'x-request-id': 'req-1' } })

  it('throws UnprocessableEntityError for a 422', async () => {
    const sdk = await expectParity(
      (client) => client.textToSpeech.convert('voice-1', speech, speechQuery),
      errorResponse(422, { detail: [{ msg: 'bad voice' }] }),
    )
    expect(sdk.outcome).toMatchObject({
      error: { class: 'UnprocessableEntityError', statusCode: 422 },
    })
  })

  it('throws ElevenLabsError for a 400 with a text body', async () => {
    await expectParity(
      (client) => client.voices.getAll(),
      () => new Response('bad request', { status: 400 }),
    )
  })

  it('does not retry a 409', async () => {
    const sdk = await expectParity(
      (client) => client.voices.getAll(),
      errorResponse(409, { detail: 'conflict' }),
    )
    expect(sdk.requests).toHaveLength(1)
  })

  it('retries a 503 after Retry-After, up to maxRetries', async () => {
    vi.useFakeTimers()
    const sdk = await expectParity(
      (client) => client.voices.getAll(),
      () =>
        Response.json(
          { detail: 'busy' },
          { status: 503, headers: { 'retry-after': '1' } },
        ),
      { maxRetries: 1 },
      { advanceTimers: true },
    )
    expect(sdk.requests).toHaveLength(2)
  })

  it('returns the retried success', async () => {
    vi.useFakeTimers()
    await expectParity(
      (client) => client.voices.getAll(),
      (_request, index) =>
        index === 0
          ? new Response('', { status: 429, headers: { 'retry-after': '2' } })
          : Response.json({ voices: [] }),
      {},
      { advanceTimers: true },
    )
  })

  it('throws ElevenLabsTimeoutError when the timeout passes', async () => {
    await expectParity(
      (client) => client.voices.getAll(),
      (request) =>
        new Promise<never>((_, reject) => {
          request.signal.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
      { timeoutInSeconds: 0.01 },
    )
  })

  it('throws ElevenLabsError when the caller aborts', async () => {
    const controller = new AbortController()
    controller.abort()
    const { sdk, ours } = await both(
      (client) => client.voices.getAll({}, { abortSignal: controller.signal }),
      () => Promise.reject(new DOMException('aborted', 'AbortError')),
    )
    // The SDK calls fetch with the aborted signal; ours stops before fetch.
    expect(ours.outcome).toEqual(sdk.outcome)
  })

  it('throws ElevenLabsError when the connection fails', async () => {
    await expectParity(
      (client) => client.voices.getAll(),
      () => Promise.reject(new TypeError('fetch failed')),
    )
  })
})
