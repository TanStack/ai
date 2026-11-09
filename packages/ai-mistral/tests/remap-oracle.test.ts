import { afterEach, describe, expect, it, vi } from 'vitest'
import { Mistral } from '@mistralai/mistralai'
import {
  ChatCompletionRequest$outboundSchema,
  ChatCompletionResponse$inboundSchema,
  EmbeddingRequest$outboundSchema,
  EmbeddingResponse$inboundSchema,
} from '@mistralai/mistralai/models/components'
import {
  ConnectionError,
  HTTPValidationError as SdkHTTPValidationError,
  MistralError,
  RequestTimeoutError,
  SDKError,
  UnexpectedClientError,
} from '@mistralai/mistralai/models/errors'
import {
  HTTPValidationError,
  chatCompletionResponseFromWire,
  createMistralClient,
  embeddingResponseFromWire,
} from '../src/client'
import type {
  ChatCompletionRequest,
  EmbeddingRequest,
} from '@mistralai/mistralai/models/components'
import type {
  MistralPostV1ChatCompletionsBody,
  MistralPostV1EmbeddingsBody,
} from '../src/generated/client/types'
import type { MistralClient } from '../src/client'

const chatRequest: ChatCompletionRequest = {
  model: 'mistral-large-latest',
  temperature: 0.3,
  topP: 0.9,
  maxTokens: 512,
  stop: ['END'],
  randomSeed: 7,
  metadata: { traceId: 't-1', nested: { camelCase: true } },
  messages: [
    { role: 'system', content: 'Be brief.' },
    {
      role: 'system',
      content: [
        { type: 'text', text: 'Rule' },
        { type: 'thinking', thinking: [{ type: 'text', text: 'why' }] },
      ],
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Look' },
        { type: 'image_url', imageUrl: 'https://img.example/a.png' },
        {
          type: 'image_url',
          imageUrl: { url: 'data:image/png;base64,AAA', detail: 'high' },
        },
        {
          type: 'document_url',
          documentUrl: 'https://doc.example/a.pdf',
          documentName: 'a.pdf',
        },
        { type: 'reference', referenceIds: [1, 'r-2'] },
        { type: 'file', fileId: 'file-1' },
        { type: 'input_audio', inputAudio: 'UklGRg==' },
      ],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'thinking',
          thinking: [
            { type: 'text', text: 'plan' },
            { type: 'reference', referenceIds: [3] },
            {
              type: 'tool_reference',
              tool: 'web_search',
              title: 'Result',
              url: 'https://r.example',
            },
          ],
          closed: true,
        },
        { type: 'text', text: 'Calling a tool' },
      ],
      toolCalls: [
        {
          id: 'abc123def',
          type: 'function',
          function: { name: 'lookup', arguments: '{"q":"x"}' },
          index: 2,
        },
        { function: { name: 'other', arguments: { q: 'y' } } },
      ],
    },
    {
      role: 'tool',
      toolCallId: 'abc123def',
      name: 'lookup',
      content: [{ type: 'text', text: 'found' }],
    },
    { role: 'tool', toolCallId: 'xyz', content: 'plain' },
    { role: 'assistant', content: 'prefix text', prefix: true },
  ],
  responseFormat: {
    type: 'json_schema',
    jsonSchema: {
      name: 'structured_output',
      description: 'The answer',
      schemaDefinition: {
        type: 'object',
        properties: { someField: { type: 'string' } },
        required: ['someField'],
      },
      strict: true,
    },
  },
  tools: [
    {
      type: 'function',
      function: {
        name: 'lookup',
        description: 'Look it up',
        strict: true,
        parameters: { type: 'object', properties: { q: { type: 'string' } } },
      },
    },
  ],
  toolChoice: { type: 'function', function: { name: 'lookup' } },
  presencePenalty: 0.1,
  frequencyPenalty: 0.2,
  n: 1,
  prediction: { type: 'content', content: 'draft' },
  parallelToolCalls: false,
  reasoningEffort: 'high',
  promptMode: 'reasoning',
  safePrompt: true,
}

const embeddingRequest: EmbeddingRequest = {
  model: 'codestral-embed',
  metadata: { tag: 'x' },
  inputs: ['a red guitar', 'a blue drum kit'],
  outputDimension: 256,
  outputDtype: 'int8',
  encodingFormat: 'base64',
}

// Our client takes the wire body: the SDK's own serialization of the SDK
// request, so the sent requests can be compared.
const { chatBody, embeddingBody } = {
  chatBody: ChatCompletionRequest$outboundSchema.parse(chatRequest),
  embeddingBody: EmbeddingRequest$outboundSchema.parse(embeddingRequest),
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- the SDK `$Outbound` types widen every enum (model, detail, dtype) to `string`; the values are the fixture literals above
} as {
  chatBody: MistralPostV1ChatCompletionsBody
  embeddingBody: MistralPostV1EmbeddingsBody
}

/**
 * The SDK as a `MistralClient`. The SDK takes the camelCase request, so it
 * sends the fixture request that `chatBody` / `embeddingBody` serialize.
 */
const sdkClient = (sdk: Mistral): MistralClient => ({
  chat: {
    complete: (_body, options) => sdk.chat.complete(chatRequest, options),
  },
  embeddings: {
    create: (_body, options) =>
      sdk.embeddings.create(embeddingRequest, options),
  },
})

const chatResponse = {
  id: 'cmpl-1',
  object: 'chat.completion',
  model: 'mistral-large-latest',
  created: 1700000000,
  usage: {
    prompt_tokens: 100,
    total_tokens: 105,
    prompt_audio_seconds: 3,
    prompt_tokens_details: { cached_tokens: 40 },
    num_cached_tokens: 40,
  },
  choices: [
    {
      index: 0,
      message: {
        content: [
          {
            type: 'thinking' as const,
            thinking: [
              { type: 'text' as const, text: 'hm' },
              { type: 'reference' as const, reference_ids: [1] },
              {
                type: 'tool_reference' as const,
                tool: 'web_search',
                title: 'T',
              },
            ],
          },
          { type: 'text' as const, text: '{"a":1}' },
          { type: 'image_url' as const, image_url: 'https://img.example/b' },
          {
            type: 'image_url' as const,
            image_url: { url: 'https://img.example/c', detail: 'low' as const },
          },
          {
            type: 'document_url' as const,
            document_url: 'https://doc.example/b.pdf',
            document_name: 'b.pdf',
          },
          { type: 'reference' as const, reference_ids: ['r'] },
          { type: 'file' as const, file_id: 'file-2' },
          { type: 'input_audio' as const, input_audio: 'AAA=' },
        ],
        tool_calls: [
          { function: { name: 'lookup', arguments: '{}' } },
          {
            id: 'id-2',
            type: 'function',
            function: { name: 'lookup', arguments: { q: 1 } },
            index: 1,
          },
        ],
      },
      finish_reason: 'tool_calls' as const,
    },
    {
      index: 1,
      messages: [{ role: 'assistant' as const, content: null, prefix: true }],
      finish_reason: 'stop' as const,
    },
  ],
}

const embeddingResponse = {
  id: 'embd-1',
  object: 'list',
  model: 'codestral-embed',
  usage: { prompt_tokens: 7, total_tokens: 7 },
  data: [
    { object: 'embedding', embedding: [0.1, 0.2], index: 0 },
    { embedding: [0.3] },
  ],
}

describe('Mistral remap matches the SDK schemas', () => {
  it('chat response equals ChatCompletionResponse$inboundSchema', () => {
    expect(chatCompletionResponseFromWire(chatResponse)).toEqual(
      ChatCompletionResponse$inboundSchema.parse(chatResponse),
    )
  })

  it('embedding response equals EmbeddingResponse$inboundSchema', () => {
    expect(embeddingResponseFromWire(embeddingResponse)).toEqual(
      EmbeddingResponse$inboundSchema.parse(embeddingResponse),
    )
  })
})

// ===========================
// Real SDK vs our client on the same mock fetch
// ===========================

interface SentRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

/**
 * Runs `call` with the real SDK and with our client. Each request gets a
 * fresh `respond()` response. Returns what each one sent and its outcome.
 */
async function runBoth<T>(
  call: (client: MistralClient) => Promise<T>,
  respond: () => Response | Promise<Response>,
) {
  async function run(client: MistralClient) {
    const sent: Array<SentRequest> = []
    vi.stubGlobal('fetch', async (input: RequestInfo, init?: RequestInit) => {
      const request = new Request(input, init)
      const headers = Object.fromEntries(request.headers)
      // The SDK always sends its user agent and an empty cookie header.
      delete headers['user-agent']
      if (headers.cookie === '') delete headers.cookie
      sent.push({
        url: request.url,
        method: request.method,
        headers,
        body: await request.json(),
      })
      return respond()
    })
    let result: T | undefined
    let error: unknown
    try {
      result = await call(client)
    } catch (caught) {
      error = caught
    }
    return { sent, result, error }
  }

  const sdk = await run(
    sdkClient(
      new Mistral({ apiKey: 'test-key', serverURL: 'https://gw.example/m' }),
    ),
  )
  const ours = await run(
    createMistralClient({
      apiKey: 'test-key',
      baseURL: 'https://gw.example/m',
    }),
  )
  return { sdk, ours }
}

/** The error fields a caller can read. */
function errorFields(error: unknown) {
  if (!(error instanceof Error)) return { error }
  const fields = {
    name: error.name,
    message: error.message,
    cause: error.cause,
  }
  if (!(error instanceof MistralError)) return fields
  return {
    ...fields,
    statusCode: error.statusCode,
    body: error.body,
    contentType: error.contentType,
    detail: 'detail' in error ? error.detail : undefined,
  }
}

const complete = (client: MistralClient) => client.chat.complete(chatBody)

describe('Mistral client parity with the SDK', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('chat.complete sends the same request and returns the same result', async () => {
    const unknownChunk = { type: 'mystery', value: 1 }
    const body = {
      ...chatResponse,
      extra: 'dropped',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: [unknownChunk] },
          finish_reason: 'stop',
        },
        ...chatResponse.choices,
      ],
    }
    const { sdk, ours } = await runBoth(complete, () => Response.json(body))

    expect(ours.sent).toEqual(sdk.sent)
    expect(ours.sent[0]).toMatchObject({
      url: 'https://gw.example/m/v1/chat/completions',
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer test-key',
        'content-type': 'application/json',
      },
    })
    expect(ours.error).toBeUndefined()
    expect(ours.result).toMatchObject({
      choices: expect.arrayContaining([
        expect.objectContaining({
          message: expect.objectContaining({
            content: [{ type: 'UNKNOWN', raw: unknownChunk, isUnknown: true }],
          }),
        }),
      ]),
    })
    expect(ours.result).toEqual(sdk.result)
  })

  it('embeddings.create sends the same request and returns the same result', async () => {
    const { sdk, ours } = await runBoth(
      (client) => client.embeddings.create(embeddingBody),
      () => Response.json(embeddingResponse),
    )
    expect(ours.sent).toEqual(sdk.sent)
    expect(ours.sent[0]?.url).toBe('https://gw.example/m/v1/embeddings')
    expect(ours.error).toBeUndefined()
    expect(ours.result).toEqual(sdk.result)
  })

  it('throws the same SDKError for a 4xx', async () => {
    const { sdk, ours } = await runBoth(complete, () =>
      Response.json(
        { object: 'error', message: 'Unauthorized', code: '1000' },
        { status: 401 },
      ),
    )
    expect(ours.error).toBeInstanceOf(SDKError)
    expect(errorFields(ours.error)).toEqual(errorFields(sdk.error))
    expect(errorFields(ours.error)).toMatchObject({
      name: 'SDKError',
      statusCode: 401,
    })
  })

  it('throws the same SDKError for a 5xx text body', async () => {
    const { sdk, ours } = await runBoth(
      complete,
      () => new Response('upstream down', { status: 503 }),
    )
    expect(ours.error).toBeInstanceOf(SDKError)
    expect(errorFields(ours.error)).toEqual(errorFields(sdk.error))
  })

  it('throws the same SDKError for a 200 that is not JSON', async () => {
    const { sdk, ours } = await runBoth(
      complete,
      () =>
        new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    )
    expect(ours.error).toBeInstanceOf(SDKError)
    expect(errorFields(ours.error)).toEqual(errorFields(sdk.error))
    expect(errorFields(ours.error)).toMatchObject({
      message: expect.stringContaining('Unexpected Status or Content-Type'),
    })
  })

  it('throws an HTTPValidationError with the SDK fields for a 422', async () => {
    const { sdk, ours } = await runBoth(complete, () =>
      Response.json(
        {
          detail: [
            {
              loc: ['body', 'messages', 0],
              msg: 'Field required',
              type: 'missing',
              input: { role: 'user' },
              ctx: { reason: 'dropped by the SDK' },
            },
          ],
          message: 'ignored',
        },
        { status: 422 },
      ),
    )
    expect(sdk.error).toBeInstanceOf(SdkHTTPValidationError)
    expect(ours.error).toBeInstanceOf(HTTPValidationError)
    expect(ours.error).toBeInstanceOf(MistralError)
    expect(errorFields(ours.error)).toEqual(errorFields(sdk.error))
    expect(errorFields(ours.error)).toMatchObject({
      name: 'HTTPValidationError',
      statusCode: 422,
      detail: [
        { loc: ['body', 'messages', 0], msg: 'Field required', ctx: {} },
      ],
    })
  })

  it('throws the same ConnectionError when fetch fails', async () => {
    const { sdk, ours } = await runBoth(complete, () => {
      throw new TypeError('fetch failed')
    })
    expect(ours.error).toBeInstanceOf(ConnectionError)
    expect(errorFields(ours.error)).toEqual(errorFields(sdk.error))
  })

  it('throws the same RequestTimeoutError when the request times out', async () => {
    const { sdk, ours } = await runBoth(complete, () => {
      throw new DOMException('The operation timed out.', 'TimeoutError')
    })
    expect(ours.error).toBeInstanceOf(RequestTimeoutError)
    expect(errorFields(ours.error)).toEqual(errorFields(sdk.error))
  })

  it('wraps a failing access token like the SDK request hook', async () => {
    const failure = new Error('no credentials')
    const client = createMistralClient(
      {
        apiKey: 'vertex',
        getAccessToken: () => Promise.reject(failure),
        resolveRequestUrl: () => 'https://vertex.example/m:rawPredict',
      },
      () => Promise.resolve(Response.json(chatResponse)),
    )
    const error = await complete(client).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(UnexpectedClientError)
    expect(errorFields(error)).toEqual({
      name: 'UnexpectedClientError',
      message: 'Unexpected HTTP client error: Error: no credentials',
      cause: failure,
    })
  })
})
