import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest'
import { EventType } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  createBytePlusText as _realCreateBytePlusText,
  byteplusText as _realBytePlusText,
} from '../src/adapters/text'
import {
  BYTEPLUS_CHAT_MODELS,
  BYTEPLUS_STRUCTURED_OUTPUT_CHAT_MODELS,
  BYTEPLUS_THINKING_SUMMARY_MODELS,
} from '../src/model-meta'
import type { ContentPart, ModelMessage, StreamChunk, Tool } from '@tanstack/ai'
import type { BytePlusTextProviderOptions } from '../src/index'

// Silent logger for adapter calls under test.
const testLogger = resolveDebugOption(false)

// Stub the OpenAI SDK so constructing an adapter never opens a real network
// handle. The per-test mock client is injected post-construction through the
// wrapped factories below (the ai-groq / ai-grok pattern) rather than by
// stubbing globals — the built openai-base dist resolves `openai`
// independently, so vi.mock alone would not intercept it.
vi.mock('openai', () => {
  return {
    default: class {
      chat = {
        completions: {
          create: vi.fn(),
        },
      }
    },
  }
})

function createAsyncIterable<T>(chunks: Array<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0
      return {
        async next() {
          if (index < chunks.length) {
            return { value: chunks[index++]!, done: false }
          }
          return { value: undefined as T, done: true }
        },
      }
    },
  }
}

let pendingMockCreate: Mock<(...args: Array<unknown>) => unknown> | undefined

function setupMockSdkClient(
  streamChunks: Array<Record<string, unknown>>,
  nonStreamResponse?: Record<string, unknown>,
): Mock<(...args: Array<unknown>) => unknown> {
  pendingMockCreate = vi.fn().mockImplementation((params) => {
    if (params.stream) {
      return Promise.resolve(createAsyncIterable(streamChunks))
    }
    return Promise.resolve(nonStreamResponse)
  })
  return pendingMockCreate
}

function applyPendingMock<T extends object>(adapter: T): T {
  if (pendingMockCreate) {
    ;(adapter as any).client = {
      chat: { completions: { create: pendingMockCreate } },
    }
    pendingMockCreate = undefined
  }
  return adapter
}

const createBytePlusText: typeof _realCreateBytePlusText = (
  model,
  apiKey,
  config,
) => applyPendingMock(_realCreateBytePlusText(model, apiKey, config))
const byteplusText: typeof _realBytePlusText = (model, config) =>
  applyPendingMock(_realBytePlusText(model, config))

// Models are picked off the exported metadata rather than hard-coded so these
// tests keep testing the *behaviour* (gating, echoing) if the underlying
// capability lists are corrected.
const THINKING_SUMMARY_MODEL = BYTEPLUS_THINKING_SUMMARY_MODELS[0]
const PLAIN_MODEL = BYTEPLUS_CHAT_MODELS.find(
  (model) =>
    !(BYTEPLUS_THINKING_SUMMARY_MODELS as ReadonlyArray<string>).includes(
      model,
    ),
)!
const STRUCTURED_MODEL = BYTEPLUS_STRUCTURED_OUTPUT_CHAT_MODELS[0]
const UNSTRUCTURED_MODEL = BYTEPLUS_CHAT_MODELS.find(
  (model) =>
    !(BYTEPLUS_STRUCTURED_OUTPUT_CHAT_MODELS as ReadonlyArray<string>).includes(
      model,
    ),
)!

const ENCRYPTED_BLOB = 'ENC-eyJhbGciOiJzaWduZWQifQ.reasoning-signature'

const weatherTool: Tool = {
  name: 'lookup_weather',
  description: 'Return the forecast for a location',
}

/**
 * The chunk sequence a thinking-summary model produces, as captured live:
 * reasoning deltas → one dedicated encrypted_content chunk → content deltas →
 * a finish chunk → a usage-only chunk with empty `choices`.
 */
function thinkingStreamChunks(model: string): Array<Record<string, unknown>> {
  return [
    {
      id: 'chatcmpl-think',
      model,
      choices: [{ index: 0, delta: { reasoning_content: 'The user ' } }],
    },
    {
      id: 'chatcmpl-think',
      model,
      choices: [
        { index: 0, delta: { reasoning_content: 'wants a greeting.' } },
      ],
    },
    {
      id: 'chatcmpl-think',
      model,
      choices: [
        {
          index: 0,
          delta: {
            content: '',
            reasoning_content: '',
            encrypted_content: ENCRYPTED_BLOB,
          },
        },
      ],
    },
    {
      id: 'chatcmpl-think',
      model,
      choices: [{ index: 0, delta: { content: 'Hello' } }],
    },
    {
      id: 'chatcmpl-think',
      model,
      choices: [{ index: 0, delta: { content: '!' }, finish_reason: 'stop' }],
    },
    {
      id: 'chatcmpl-think',
      model,
      choices: [],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 7,
        total_tokens: 19,
        completion_tokens_details: { reasoning_tokens: 4 },
      },
    },
  ]
}

async function collect(
  stream: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

describe('BytePlus text adapter', () => {
  beforeEach(() => {
    pendingMockCreate = undefined
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('construction', () => {
    it('creates an adapter with an explicit API key', () => {
      const adapter = createBytePlusText('seed-2-0-lite-260428', 'ark-test-key')

      expect(adapter.kind).toBe('text')
      expect(adapter.name).toBe('byteplus')
      expect(adapter.model).toBe('seed-2-0-lite-260428')
    })

    it('creates an adapter from ARK_API_KEY', () => {
      vi.stubEnv('ARK_API_KEY', 'env-ark-key')

      const adapter = byteplusText('seed-1-6-250915')

      expect(adapter.model).toBe('seed-1-6-250915')
    })

    it('throws when ARK_API_KEY is missing', () => {
      vi.stubEnv('ARK_API_KEY', '')

      expect(() => byteplusText('seed-2-0-lite-260428')).toThrow('ARK_API_KEY')
    })

    it('accepts a baseURL override (EU endpoint)', () => {
      const adapter = createBytePlusText(
        'seed-2-0-lite-260428',
        'ark-test-key',
        { baseURL: 'https://ark.eu-west.bytepluses.com/api/v3' },
      )

      expect(adapter).toBeDefined()
    })
  })

  describe('streaming', () => {
    it('emits reasoning, then text, then usage for a thinking stream', async () => {
      setupMockSdkClient(thinkingStreamChunks(THINKING_SUMMARY_MODEL))
      const adapter = createBytePlusText(THINKING_SUMMARY_MODEL, 'ark-test-key')

      const chunks = await collect(
        adapter.chatStream({
          model: THINKING_SUMMARY_MODEL,
          messages: [{ role: 'user', content: 'Say hi' }],
          logger: testLogger,
        }),
      )

      const types = chunks.map((c) => c.type)
      expect(types[0]).toBe(EventType.RUN_STARTED)
      expect(types).toContain(EventType.REASONING_MESSAGE_START)
      expect(types).toContain(EventType.TEXT_MESSAGE_START)
      expect(types.indexOf(EventType.REASONING_END)).toBeLessThan(
        types.indexOf(EventType.TEXT_MESSAGE_START),
      )

      const reasoning = chunks
        .filter((c) => c.type === EventType.REASONING_MESSAGE_CONTENT)
        .map((c) => c.delta)
        .join('')
      expect(reasoning).toBe('The user wants a greeting.')

      const text = chunks
        .filter((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)
        .map((c) => c.delta)
        .join('')
      expect(text).toBe('Hello!')

      const runFinished = chunks.find((c) => c.type === EventType.RUN_FINISHED)
      expect(
        runFinished?.type === EventType.RUN_FINISHED && runFinished.usage,
      ).toMatchObject({
        promptTokens: 12,
        completionTokens: 7,
        totalTokens: 19,
      })
    })

    it('attaches encrypted_content to the reasoning step as its signature', async () => {
      setupMockSdkClient(thinkingStreamChunks(THINKING_SUMMARY_MODEL))
      const adapter = createBytePlusText(THINKING_SUMMARY_MODEL, 'ark-test-key')

      const chunks = await collect(
        adapter.chatStream({
          model: THINKING_SUMMARY_MODEL,
          messages: [{ role: 'user', content: 'Say hi' }],
          logger: testLogger,
        }),
      )

      const stepFinished = chunks.filter(
        (c) => c.type === EventType.STEP_FINISHED,
      )
      expect(stepFinished).toHaveLength(1)
      expect(
        stepFinished[0]?.type === EventType.STEP_FINISHED &&
          stepFinished[0].signature,
      ).toBe(ENCRYPTED_BLOB)
    })

    it('does not treat the encrypted chunk as reasoning text', async () => {
      setupMockSdkClient([
        {
          id: 'chatcmpl-enc-only',
          model: THINKING_SUMMARY_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                content: '',
                reasoning_content: '',
                encrypted_content: ENCRYPTED_BLOB,
              },
            },
          ],
        },
        {
          id: 'chatcmpl-enc-only',
          model: THINKING_SUMMARY_MODEL,
          choices: [
            { index: 0, delta: { content: 'Hi' }, finish_reason: 'stop' },
          ],
        },
      ])
      const adapter = createBytePlusText(THINKING_SUMMARY_MODEL, 'ark-test-key')

      const chunks = await collect(
        adapter.chatStream({
          model: THINKING_SUMMARY_MODEL,
          messages: [{ role: 'user', content: 'Say hi' }],
          logger: testLogger,
        }),
      )

      expect(
        chunks.some((c) => c.type === EventType.REASONING_MESSAGE_CONTENT),
      ).toBe(false)
    })

    it('emits AG-UI tool-call events with the OpenAI tool shape', async () => {
      const mockCreate = setupMockSdkClient([
        {
          id: 'chatcmpl-tool',
          model: 'seed-2-0-lite-260428',
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'lookup_weather',
                      arguments: '{"location":',
                    },
                  },
                ],
              },
            },
          ],
        },
        {
          id: 'chatcmpl-tool',
          model: 'seed-2-0-lite-260428',
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  { index: 0, function: { arguments: '"Berlin"}' } },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
      ])
      const adapter = createBytePlusText('seed-2-0-lite-260428', 'ark-test-key')

      const chunks = await collect(
        adapter.chatStream({
          model: 'seed-2-0-lite-260428',
          messages: [{ role: 'user', content: 'Weather in Berlin?' }],
          tools: [weatherTool],
          logger: testLogger,
        }),
      )

      // Ark accepts (and requires) `type: 'function'` — the docs' claimed
      // `'function_call'` value is rejected with 400 InvalidParameter.
      expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({
        tools: [{ type: 'function', function: { name: 'lookup_weather' } }],
      })

      const toolEnd = chunks.find((c) => c.type === EventType.TOOL_CALL_END)
      expect(
        toolEnd?.type === EventType.TOOL_CALL_END && toolEnd.input,
      ).toEqual({ location: 'Berlin' })
    })
  })

  describe('encrypted_content round-trip', () => {
    const assistantWithSignature: ModelMessage = {
      role: 'assistant',
      content: 'Hello!',
      thinking: [
        { content: 'The user wants a greeting.', signature: ENCRYPTED_BLOB },
      ],
    }

    async function requestBodyFor(
      model: (typeof BYTEPLUS_CHAT_MODELS)[number],
      messages: Array<ModelMessage>,
    ): Promise<any> {
      const mockCreate = setupMockSdkClient([
        {
          id: 'chatcmpl-echo',
          model,
          choices: [
            { index: 0, delta: { content: 'ok' }, finish_reason: 'stop' },
          ],
        },
      ])
      const adapter = createBytePlusText(model, 'ark-test-key')
      await collect(adapter.chatStream({ model, messages, logger: testLogger }))
      return mockCreate.mock.calls[0]?.[0]
    }

    it('echoes the blob verbatim on the outgoing assistant message', async () => {
      const body = await requestBodyFor(THINKING_SUMMARY_MODEL, [
        { role: 'user', content: 'Say hi' },
        assistantWithSignature,
        { role: 'user', content: 'Again?' },
      ])

      expect(body.messages[1]).toMatchObject({
        role: 'assistant',
        content: 'Hello!',
        encrypted_content: ENCRYPTED_BLOB,
      })
    })

    it('omits the field when the assistant message carries no signature', async () => {
      const body = await requestBodyFor(THINKING_SUMMARY_MODEL, [
        { role: 'user', content: 'Say hi' },
        { role: 'assistant', content: 'Hello!' },
        { role: 'user', content: 'Again?' },
      ])

      expect(body.messages[1]).not.toHaveProperty('encrypted_content')
    })

    it('never forwards a signature on a model that does not emit the blob', async () => {
      const body = await requestBodyFor(PLAIN_MODEL, [
        { role: 'user', content: 'Say hi' },
        assistantWithSignature,
        { role: 'user', content: 'Again?' },
      ])

      expect(body.messages[1]).not.toHaveProperty('encrypted_content')
    })

    it('echoes the last signature when several thinking steps carry one', async () => {
      const body = await requestBodyFor(THINKING_SUMMARY_MODEL, [
        { role: 'user', content: 'Say hi' },
        {
          role: 'assistant',
          content: 'Hello!',
          thinking: [
            { content: 'first', signature: 'ENC-first' },
            { content: 'second', signature: 'ENC-second' },
          ],
        },
        { role: 'user', content: 'Again?' },
      ])

      expect(body.messages[1].encrypted_content).toBe('ENC-second')
    })
  })

  describe('provider options', () => {
    it('forwards Ark-only and sampling options into the request body', async () => {
      const mockCreate = setupMockSdkClient([
        {
          id: 'chatcmpl-opts',
          model: 'seed-2-0-lite-260428',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        },
      ])
      const adapter = createBytePlusText('seed-2-0-lite-260428', 'ark-test-key')

      const modelOptions: BytePlusTextProviderOptions = {
        thinking: { type: 'enabled' },
        reasoning_effort: 'high',
        repetition_penalty: 1.05,
        service_tier: 'flex',
        temperature: 0.4,
        max_tokens: 256,
      }

      await collect(
        adapter.chatStream({
          model: 'seed-2-0-lite-260428',
          messages: [{ role: 'user', content: 'Hello' }],
          modelOptions,
          logger: testLogger,
        }),
      )

      expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({
        thinking: { type: 'enabled' },
        reasoning_effort: 'high',
        repetition_penalty: 1.05,
        service_tier: 'flex',
        temperature: 0.4,
        max_tokens: 256,
        stream: true,
        stream_options: { include_usage: true },
      })
    })
  })

  describe('multimodal content parts', () => {
    async function contentPartsFor(parts: Array<ContentPart>): Promise<any> {
      const mockCreate = setupMockSdkClient([
        {
          id: 'chatcmpl-mm',
          model: 'seed-2-0-lite-260428',
          choices: [
            { index: 0, delta: { content: 'ok' }, finish_reason: 'stop' },
          ],
        },
      ])
      const adapter = createBytePlusText('seed-2-0-lite-260428', 'ark-test-key')
      await collect(
        adapter.chatStream({
          model: 'seed-2-0-lite-260428',
          messages: [{ role: 'user', content: parts }],
          logger: testLogger,
        }),
      )
      const body: any = mockCreate.mock.calls[0]?.[0]
      return body.messages[0].content
    }

    it('sends image parts with Ark detail and pixel bounds', async () => {
      const content = await contentPartsFor([
        { type: 'text', content: 'What is this?' },
        {
          type: 'image',
          source: { type: 'url', value: 'https://example.com/cat.png' },
          metadata: {
            detail: 'xhigh',
            image_pixel_limit: { max_pixels: 1_000_000 },
          },
        },
      ])

      expect(content).toContainEqual({
        type: 'image_url',
        image_url: {
          url: 'https://example.com/cat.png',
          detail: 'xhigh',
          image_pixel_limit: { max_pixels: 1_000_000 },
        },
      })
    })

    it('sends video parts as video_url', async () => {
      const content = await contentPartsFor([
        { type: 'text', content: 'Describe this' },
        {
          type: 'video',
          source: { type: 'url', value: 'https://example.com/clip.mp4' },
          metadata: { fps: 2 },
        },
      ])

      expect(content).toContainEqual({
        type: 'video_url',
        video_url: { url: 'https://example.com/clip.mp4', fps: 2 },
      })
    })

    it('sends URL audio as input_audio.url and inline audio as data + format', async () => {
      const urlContent = await contentPartsFor([
        { type: 'text', content: 'Transcribe' },
        {
          type: 'audio',
          source: { type: 'url', value: 'https://example.com/clip.mp3' },
        },
      ])
      expect(urlContent).toContainEqual({
        type: 'input_audio',
        input_audio: { url: 'https://example.com/clip.mp3' },
      })

      const dataContent = await contentPartsFor([
        { type: 'text', content: 'Transcribe' },
        {
          type: 'audio',
          source: { type: 'data', value: 'QUJD', mimeType: 'audio/mpeg' },
        },
      ])
      expect(dataContent).toContainEqual({
        type: 'input_audio',
        input_audio: { data: 'QUJD', format: 'mp3' },
      })
    })

    it('fails loud on inline audio with an unrecognised mimeType', async () => {
      const chunks = await collect(
        createBytePlusText('seed-2-0-lite-260428', 'ark-test-key').chatStream({
          model: 'seed-2-0-lite-260428',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', content: 'Transcribe' },
                {
                  type: 'audio',
                  source: {
                    type: 'data',
                    value: 'QUJD',
                    mimeType: 'audio/weird-codec',
                  },
                },
              ],
            },
          ],
          logger: testLogger,
        }),
      )

      const runError = chunks.find((c) => c.type === EventType.RUN_ERROR)
      expect(
        runError?.type === EventType.RUN_ERROR && runError.message,
      ).toContain('unrecognised mimeType')
    })
  })

  describe('structured-output gating', () => {
    it('opts into the native combined tools + schema path only on supported models', () => {
      expect(
        createBytePlusText(
          STRUCTURED_MODEL,
          'ark-test-key',
        ).supportsCombinedToolsAndSchema(),
      ).toBe(true)
      expect(
        createBytePlusText(
          UNSTRUCTURED_MODEL,
          'ark-test-key',
        ).supportsCombinedToolsAndSchema(),
      ).toBe(false)
    })

    it('throws from structuredOutput on a model Ark rejects json_schema for', async () => {
      const adapter = createBytePlusText(UNSTRUCTURED_MODEL, 'ark-test-key')

      await expect(
        adapter.structuredOutput({
          chatOptions: {
            model: UNSTRUCTURED_MODEL,
            messages: [{ role: 'user', content: 'Hi' }],
            logger: testLogger,
          },
          outputSchema: { type: 'object', properties: {} },
        }),
      ).rejects.toThrow('does not support structured output')
    })

    it('emits RUN_ERROR (not a throw) from structuredOutputStream on those models', async () => {
      const adapter = createBytePlusText(UNSTRUCTURED_MODEL, 'ark-test-key')

      const chunks = await collect(
        adapter.structuredOutputStream({
          chatOptions: {
            model: UNSTRUCTURED_MODEL,
            messages: [{ role: 'user', content: 'Hi' }],
            logger: testLogger,
          },
          outputSchema: { type: 'object', properties: {} },
        }),
      )

      expect(chunks[0]?.type).toBe(EventType.RUN_STARTED)
      const runError = chunks.find((c) => c.type === EventType.RUN_ERROR)
      expect(runError?.type === EventType.RUN_ERROR && runError.code).toBe(
        'unsupported-structured-output',
      )
    })

    it('sends response_format json_schema on a supported model', async () => {
      const mockCreate = setupMockSdkClient([], {
        choices: [{ message: { content: '{"city":"Paris"}' } }],
      })
      const adapter = createBytePlusText(STRUCTURED_MODEL, 'ark-test-key')

      const result = await adapter.structuredOutput({
        chatOptions: {
          model: STRUCTURED_MODEL,
          messages: [{ role: 'user', content: 'Where is the Eiffel tower?' }],
          logger: testLogger,
        },
        outputSchema: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      })

      expect(result.data).toEqual({ city: 'Paris' })
      expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({
        stream: false,
        response_format: { type: 'json_schema' },
      })
    })
  })
})
