import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FunctionCallingConfigMode,
  GenerateVideosOperation,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  Modality,
  VideoGenerationReferenceType,
} from '@google/genai'
import { createGoogleGenAI } from '../src/client'
import type { GoogleGenAIOptions, Schema } from '@google/genai'
import type { GeminiClient } from '../src/client'

// The real SDK is the oracle: each case runs the same call through
// `new GoogleGenAI()` and through `createGoogleGenAI()` against the same
// mocked fetch, then compares the requests and the results.

// A real SDK client must still fit the client type.
const sdkFitsClientType: GeminiClient = new GoogleGenAI({ apiKey: 'k' })
void sdkFitsClientType

const OPTIONS: GoogleGenAIOptions = {
  apiKey: 'test-key',
  httpOptions: { headers: { 'x-custom': 'custom-value' } },
}

// Telemetry headers that only the SDK sends. `cookie` is an empty header
// that the SDK interactions client adds.
const IGNORED_HEADERS = new Set(['user-agent', 'x-goog-api-client', 'cookie'])

interface SentRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

const json =
  (body: unknown, init: ResponseInit = {}) =>
  () =>
    new Response(JSON.stringify(body), {
      ...init,
      headers: { 'content-type': 'application/json', ...init.headers },
    })

const sse = (events: Array<string>) => () =>
  new Response(events.map((event) => `${event}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  })

async function readBody(request: Request) {
  const text = await request.text()
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// Drops what cannot match: functions, the raw `Response` the SDK keeps, and
// class prototypes.
const plain = (value: unknown): unknown =>
  value === undefined
    ? undefined
    : JSON.parse(
        JSON.stringify(value, (key, item) =>
          key === 'responseInternal' ? undefined : item,
        ),
      )

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
  typeof value === 'object' && value !== null && Symbol.asyncIterator in value

async function collect(value: unknown) {
  if (!isAsyncIterable(value)) return value
  const items: Array<unknown> = []
  for await (const item of value) items.push(item)
  return items
}

/** Runs `call` once with `client` and records every fetch. */
async function record(
  client: GeminiClient,
  call: (client: GeminiClient) => Promise<unknown>,
  responses: Array<() => Response>,
) {
  const queue = [...responses]
  const requests: Array<SentRequest> = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init)
    const headers: Record<string, string> = {}
    request.headers.forEach((value, name) => {
      if (!IGNORED_HEADERS.has(name)) headers[name] = value
    })
    requests.push({
      url: request.url,
      method: request.method,
      headers,
      body: await readBody(request),
    })
    const next = queue.shift()
    if (!next) throw new Error(`unexpected request to ${request.url}`)
    return next()
  })
  try {
    const result = await collect(await call(client))
    return { requests, result: plain(result), error: undefined }
  } catch (error) {
    return { requests, result: undefined, error }
  } finally {
    vi.restoreAllMocks()
  }
}

async function run(
  call: (client: GeminiClient) => Promise<unknown>,
  responses: Array<() => Response>,
  options: GoogleGenAIOptions,
) {
  const sdk = await record(new GoogleGenAI(options), call, responses)
  const ours = await record(createGoogleGenAI(options), call, responses)
  expect(ours.requests).toEqual(sdk.requests)
  return { sdk, ours }
}

/**
 * Runs a call that succeeds through the SDK and through our client, and
 * expects the same requests (one per response) and the same result.
 */
async function compare(
  call: (client: GeminiClient) => Promise<unknown>,
  responses: Array<() => Response>,
  options: GoogleGenAIOptions = OPTIONS,
) {
  const { sdk, ours } = await run(call, responses, options)
  expect(sdk.error).toBeUndefined()
  expect(ours.error).toBeUndefined()
  expect(ours.requests).toHaveLength(responses.length)
  expect(ours.result).toEqual(sdk.result)
  return ours
}

/**
 * Runs a call that fails, and expects the same requests and an error with
 * the same name, message, and status.
 */
async function compareError(
  call: (client: GeminiClient) => Promise<unknown>,
  responses: Array<() => Response>,
) {
  const { sdk, ours } = await run(call, responses, OPTIONS)
  expect(ours.error).toBeInstanceOf(Error)
  expect(sdk.error).toBeInstanceOf(Error)
  if (!(ours.error instanceof Error) || !(sdk.error instanceof Error)) return
  expect(ours.error.name).toBe(sdk.error.name)
  expect(ours.error.message).toBe(sdk.error.message)
  expect(Reflect.get(ours.error, 'status')).toBe(
    Reflect.get(sdk.error, 'status'),
  )
  return ours.error
}

// The SDK also takes a plain JSON Schema where its type says `Schema`, and
// converts it. JSON.parse gives the plain object the `Schema` type.
const jsonSchema = (schema: object): Schema =>
  JSON.parse(JSON.stringify(schema))

const MODEL_RESPONSE = {
  candidates: [
    {
      content: { role: 'model', parts: [{ text: 'Hello' }] },
      finishReason: 'STOP',
      finishMessage: 'dropped by the SDK',
      index: 0,
      citationMetadata: {
        citationSources: [{ startIndex: 0, endIndex: 5, uri: 'https://x.y' }],
      },
      groundingMetadata: { webSearchQueries: ['q'] },
    },
  ],
  usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1 },
  modelVersion: 'gemini-2.5-flash-001',
  responseId: 'resp-1',
  unknownField: 'dropped by the SDK',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('models.generateContent', () => {
  it('sends the same request and returns the same response', async () => {
    await compare(
      (client) =>
        client.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            { role: 'user', parts: [{ text: 'Hi' }] },
            {
              role: 'model',
              parts: [
                {
                  functionCall: { id: 'c1', name: 'lookup', args: { q: 1 } },
                  thoughtSignature: 'sig',
                },
              ],
            },
            {
              role: 'user',
              parts: [
                {
                  functionResponse: {
                    id: 'c1',
                    name: 'lookup',
                    response: { ok: true },
                  },
                },
                { inlineData: { data: 'AAAA', mimeType: 'image/png' } },
                { fileData: { fileUri: 'files/x', mimeType: 'video/mp4' } },
              ],
            },
          ],
          config: {
            systemInstruction: 'Be brief.',
            temperature: 0.4,
            topP: 0.9,
            topK: 10,
            maxOutputTokens: 100,
            stopSequences: ['END'],
            seed: 7,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                tags: { type: 'array', items: { type: 'string' } },
                maybe: { anyOf: [{ type: 'null' }, { type: 'number' }] },
              },
              required: ['name'],
              additionalProperties: false,
            },
            thinkingConfig: { thinkingBudget: 128, includeThoughts: true },
            speechConfig: 'Kore',
            imageConfig: { aspectRatio: '16:9' },
            responseModalities: ['TEXT'],
            safetySettings: [
              {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_NONE,
              },
            ],
            tools: [
              {
                functionDeclarations: [
                  {
                    name: 'lookup',
                    description: 'Look something up',
                    parameters: jsonSchema({
                      type: 'object',
                      properties: { q: { type: ['integer', 'null'] } },
                    }),
                  },
                  {
                    name: 'raw',
                    parameters: jsonSchema({
                      $schema: 'http://json-schema.org/draft-07/schema#',
                      type: 'object',
                    }),
                  },
                ],
              },
              { googleSearch: {} },
              { codeExecution: {} },
              { urlContext: {} },
            ],
            toolConfig: {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.ANY,
                allowedFunctionNames: ['lookup'],
              },
              includeServerSideToolInvocations: true,
            },
            cachedContent: 'my-cache',
            labels: { team: 'a' },
            audioTranscriptionConfig: { languageCodes: ['en-US'] },
            continuationToken: 'token-1',
            store: false,
            abortSignal: new AbortController().signal,
            httpOptions: { headers: { 'x-call': 'per-call' } },
          },
        }),
      [json(MODEL_RESPONSE)],
    )
  })

  it('moves a responseSchema with $schema to responseJsonSchema', async () => {
    const ours = await compare(
      (client) =>
        client.models.generateContent({
          model: 'models/gemini-2.5-flash',
          contents: 'Hi',
          config: {
            responseSchema: {
              $schema: 'https://json-schema.org/draft/2020-12/schema',
              type: 'object',
            },
          },
        }),
      [json(MODEL_RESPONSE)],
    )
    expect(ours.requests[0]?.body).toEqual({
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
      generationConfig: {
        responseJsonSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
        },
      },
    })
  })

  it('applies client base URL, API version, timeout, and extra body', async () => {
    await compare(
      (client) =>
        client.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: 'Hi',
          config: { httpOptions: { extraBody: { labels: { a: 'b' } } } },
        }),
      [json(MODEL_RESPONSE)],
      {
        apiKey: 'test-key',
        apiVersion: 'v1',
        httpOptions: {
          baseUrl: 'https://gateway.example.com/google/',
          headers: { 'x-gateway': 'g' },
          timeout: 4500,
        },
      },
    )
  })

  it('throws the same error for a field only Vertex AI supports', async () => {
    await compareError(
      (client) =>
        client.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: 'Hi',
          config: {
            generationOutputConfig: { outputUriPrefix: 'gs://bucket/' },
          },
        }),
      [],
    )
  })

  it.each([
    [
      'a JSON error body',
      json(
        { error: { code: 400, message: 'bad', status: 'INVALID_ARGUMENT' } },
        { status: 400 },
      ),
    ],
    [
      'a text error body',
      () =>
        new Response('upstream down', {
          status: 503,
          statusText: 'Service Unavailable',
        }),
    ],
  ])('throws the same ApiError for %s', async (_label, response) => {
    const error = await compareError(
      (client) =>
        client.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: 'Hi',
        }),
      [response],
    )
    expect(error).toMatchObject({ name: 'ApiError' })
  })
})

describe('models.generateContentStream', () => {
  it('sends the same request and yields the same chunks', async () => {
    await compare(
      (client) =>
        client.models.generateContentStream({
          model: 'gemini-2.5-flash',
          contents: 'Hi',
          config: { tools: [{ googleSearch: {} }] },
        }),
      [
        sse([
          `data: ${JSON.stringify({
            candidates: [
              { content: { role: 'model', parts: [{ text: 'He' }] } },
            ],
            responseId: 'r1',
          })}`,
          `data: ${JSON.stringify(MODEL_RESPONSE)}`,
        ]),
      ],
    )
  })

  it('throws the same error for a JSON error body with status 200', async () => {
    const error = await compareError(
      (client) =>
        client.models.generateContentStream({
          model: 'gemini-2.5-flash',
          contents: 'Hi',
        }),
      [
        json({
          error: { code: 429, message: 'quota', status: 'RESOURCE_EXHAUSTED' },
        }),
      ],
    )
    expect(error).toMatchObject({ status: 429 })
  })
})

describe('models.embedContent', () => {
  const embeddings = json({
    embeddings: [{ values: [0.1, 0.2] }, { values: [0.3, 0.4] }],
  })

  it.each([
    ['one text', 'gemini-embedding-001', 'hello'],
    ['many texts', 'gemini-embedding-001', ['a', 'b']],
    ['many texts for gemini-embedding-2', 'gemini-embedding-2', ['a', 'b']],
  ])('sends the same request for %s', async (_label, model, contents) => {
    await compare(
      (client) =>
        client.models.embedContent({
          model,
          contents,
          config: {
            outputDimensionality: 2,
            taskType: 'RETRIEVAL_DOCUMENT',
            title: 'doc',
          },
        }),
      [embeddings],
    )
  })
})

describe('models.generateVideos + operations.getVideosOperation', () => {
  it('sends the same requests and returns the same operations', async () => {
    const generate = (client: GeminiClient) =>
      client.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt: 'A cat',
        image: { imageBytes: 'AAAA', mimeType: 'image/png' },
        config: {
          numberOfVideos: 1,
          durationSeconds: 8,
          aspectRatio: '16:9',
          resolution: '720p',
          negativePrompt: 'dogs',
          lastFrame: { imageBytes: 'BBBB', mimeType: 'image/png' },
          referenceImages: [
            {
              image: { imageBytes: 'CCCC', mimeType: 'image/jpeg' },
              referenceType: VideoGenerationReferenceType.ASSET,
            },
          ],
        },
      })
    await compare(generate, [
      json({ name: 'models/veo-3.1-generate-preview/operations/op1' }),
    ])

    const operation = Object.assign(new GenerateVideosOperation(), {
      name: 'models/veo-3.1-generate-preview/operations/op1',
    })
    await compare(
      (client) => client.operations.getVideosOperation({ operation }),
      [
        json({
          name: 'models/veo-3.1-generate-preview/operations/op1',
          done: true,
          response: {
            generateVideoResponse: {
              generatedSamples: [
                {
                  video: {
                    uri: 'https://files/v.mp4',
                    encodedVideo: 'VVVV',
                    encoding: 'video/mp4',
                  },
                },
              ],
              raiMediaFilteredCount: 1,
              raiMediaFilteredReasons: ['filtered'],
            },
          },
        }),
      ],
    )
  })

  it('throws the same error for a field only Vertex AI supports', async () => {
    await compareError(
      (client) =>
        client.models.generateVideos({
          model: 'veo-3.1-generate-preview',
          prompt: 'A cat',
          config: { seed: 3 },
        }),
      [],
    )
  })
})

describe('files', () => {
  it('uploads a Blob with the same resumable requests', async () => {
    await compare(
      (client) =>
        client.files.upload({
          file: new Blob(['hello'], { type: 'text/plain' }),
          config: { mimeType: 'video/mp4', displayName: 'clip' },
        }),
      [
        json(
          {},
          {
            headers: {
              'x-goog-upload-url':
                'https://upload.example.com/upload/v1beta/files?upload_id=u1',
            },
          },
        ),
        json(
          { file: { name: 'files/abc', state: 'PROCESSING', uri: 'u' } },
          { headers: { 'x-goog-upload-status': 'final' } },
        ),
      ],
    )
  })

  it('gets and deletes a file with the same requests', async () => {
    await compare(
      (client) =>
        client.files.get({
          name: 'https://generativelanguage.googleapis.com/v1beta/files/abc',
        }),
      [json({ name: 'files/abc', state: 'ACTIVE' })],
    )
    await compare(
      (client) => client.files.delete({ name: 'files/abc' }),
      [json({})],
    )
  })
})

describe('interactions', () => {
  const interaction = {
    id: 'i1',
    status: 'completed',
    model: 'gemini-2.5-flash',
    steps: [
      { type: 'user_input', content: [{ type: 'text', text: 'Hi' }] },
      {
        type: 'model_output',
        content: [
          { type: 'text', text: 'Hel' },
          { type: 'text', text: 'lo' },
          { type: 'image', data: 'IMG', mime_type: 'image/png' },
        ],
      },
    ],
  }

  it('creates an interaction with the same request and result', async () => {
    await compare(
      (client) =>
        client.interactions.create({
          model: 'gemini-2.5-flash',
          input: 'Hi',
          system_instruction: 'Be brief.',
        }),
      [json(interaction)],
    )
  })

  it('streams interaction events with the same request and events', async () => {
    await compare(
      (client) =>
        client.interactions.create(
          { model: 'gemini-2.5-flash', input: 'Hi', stream: true },
          { signal: new AbortController().signal },
        ),
      [
        sse([
          `event: interaction.start\ndata: ${JSON.stringify({ event_type: 'interaction.start', interaction: { id: 'i1' } })}`,
          `data: ${JSON.stringify({ event_type: 'content.delta', delta: { type: 'text', text: 'Hi' } })}`,
          'data: [DONE]',
        ]),
      ],
    )
  })

  it('gets an interaction and fills steps for a legacy Lyria result', async () => {
    await compare(
      (client) => client.interactions.get('i/1'),
      [
        json({
          id: 'i/1',
          model: 'lyria-3-pro-preview',
          outputs: [{ type: 'audio', data: 'AUD', mime_type: 'audio/mp3' }],
        }),
      ],
    )
  })

  it('throws an error with the same name, message, status, and body', async () => {
    const error = await compareError(
      (client) =>
        client.interactions.create({ model: 'gemini-2.5-flash', input: 'x' }),
      [
        json(
          { error: { code: 400, message: 'bad', status: 'INVALID_ARGUMENT' } },
          { status: 400 },
        ),
      ],
    )
    expect(error).toMatchObject({
      name: 'BadRequestError',
      error: {
        error: { code: 400, message: 'bad', status: 'INVALID_ARGUMENT' },
      },
    })
  })
})

describe('authTokens.create', () => {
  it('sends the same request and returns the same token', async () => {
    await compare(
      (client) =>
        client.authTokens.create({
          config: {
            uses: 1,
            expireTime: '2026-01-01T00:00:00.000Z',
            liveConnectConstraints: {
              model: 'gemini-live-2.5-flash',
              config: {
                responseModalities: [Modality.AUDIO],
                temperature: 0.3,
                systemInstruction: 'Be brief.',
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                },
                inputAudioTranscription: {},
                tools: [{ googleSearch: {} }],
              },
            },
            httpOptions: { apiVersion: 'v1alpha' },
          },
        }),
      [json({ name: 'auth_tokens/t1' })],
    )
  })
})
