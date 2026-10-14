import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chat, EventType } from '@tanstack/ai'
import {
  resolveDebugOption,
  tanstackMetadata,
} from '@tanstack/ai/adapter-internals'
import type {
  AdapterYieldChunk,
  MessageSource,
  ModelMessage,
  TextOptions,
} from '@tanstack/ai'
import { GeminiTextAdapter } from '../src/adapters/text'
import { GeminiTextInteractionsAdapter } from '../src/experimental/text-interactions/adapter'
import type { GoogleGenAI } from '@google/genai'
import { FunctionCallingConfigMode } from '@google/genai'

const mocks = vi.hoisted(() => ({
  stream: vi.fn(),
  generate: vi.fn(),
  interactions: vi.fn(),
}))
vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>()
  class MockGoogleGenAI {
    models = {
      generateContentStream: mocks.stream,
      generateContent: mocks.generate,
    }
    interactions = { create: mocks.interactions }
  }
  return { ...actual, GoogleGenAI: MockGoogleGenAI }
})
const source = (
  model = 'gemini-3.7-flash',
  api = 'google-generative-ai',
  provider = 'google',
): MessageSource => ({ provider, api, model })
const collect = async (stream: AsyncIterable<AdapterYieldChunk>) => {
  const chunks: Array<AdapterYieldChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}
const stream = (chunks: Array<Record<string, unknown>>) =>
  (async function* () {
    yield* chunks
  })()
const answer = () =>
  stream([
    {
      responseId: 'response-real',
      modelVersion: 'gemini-reported',
      candidates: [
        { content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' },
      ],
    },
  ])
const options = (
  messages: Array<ModelMessage>,
  model = 'gemini-3.7-flash',
): TextOptions => ({ model, messages, logger: resolveDebugOption(false) })
const signed = (origin?: MessageSource): ModelMessage => ({
  role: 'assistant',
  content: 'Answer',
  thinking: [{ content: 'Reason', signature: 'opaque-signature' }],
  toolCalls: [
    {
      id: 'call|odd',
      type: 'function',
      function: { name: 'check', arguments: '{"nested":{"text":"ok"}}' },
      metadata: { thoughtSignature: 'tool-signature' },
    },
  ],
  ...(origin && { metadata: { tanstack: { source: origin } } }),
  blockOrder: [
    { type: 'tool-call', id: 'call|odd' },
    { type: 'text', length: 6 },
    { type: 'thinking', index: 0 },
  ],
})

describe('Gemini replay parity', () => {
  const unexpectedSDKRequests: Array<string> = []
  beforeEach(() => {
    vi.resetAllMocks()
    unexpectedSDKRequests.length = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        unexpectedSDKRequests.push('Unmatched SDK fetch')
        throw new Error('Unmatched SDK fetch in Gemini fixture')
      }),
    )
    mocks.generate.mockResolvedValue({
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
    })
    mocks.interactions.mockImplementation(async () =>
      stream([
        {
          event_type: 'interaction.completed',
          interaction: { id: 'followup', status: 'completed' },
        },
      ]),
    )
    mocks.stream.mockImplementation(async () => answer())
  })

  afterEach(() => {
    try {
      expect(unexpectedSDKRequests).toEqual([])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it.each([undefined, source()])(
    'preserves an empty signed thought on the request wire (%j)',
    async (origin) => {
      const messages: Array<ModelMessage> = [
        { role: 'user', content: 'first' },
        {
          role: 'assistant',
          content: '',
          thinking: [{ content: '', signature: 'opaque-signature' }],
          ...(origin && { metadata: { tanstack: { source: origin } } }),
        },
        { role: 'user', content: 'next' },
      ]
      const original = JSON.stringify(messages)
      const adapter = new GeminiTextAdapter(
        { apiKey: 'key' },
        'gemini-3.7-flash',
      )
      const expected = [
        { role: 'user', parts: [{ text: 'first' }] },
        {
          role: 'model',
          parts: [
            { thought: true, text: '', thoughtSignature: 'opaque-signature' },
          ],
        },
        { role: 'user', parts: [{ text: 'next' }] },
      ]
      await collect(adapter.chatStream(options(messages)))
      expect(mocks.stream.mock.calls[0]?.[0].contents).toEqual(expected)
      mocks.generate.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
      })
      await adapter.structuredOutput({
        chatOptions: options(messages),
        outputSchema: { type: 'object' },
      })
      expect(mocks.generate.mock.calls[0]?.[0].contents).toEqual(expected)
      expect(JSON.stringify(messages)).toBe(original)
    },
  )

  it('still drops ordinary empty assistant rows', async () => {
    await collect(
      new GeminiTextAdapter({ apiKey: 'key' }, 'gemini-3.7-flash').chatStream(
        options([
          { role: 'user', content: 'first' },
          { role: 'assistant', content: '' },
          { role: 'user', content: 'next' },
        ]),
      ),
    )
    expect(mocks.stream.mock.calls[0]?.[0].contents).toEqual([
      { role: 'user', parts: [{ text: 'first' }, { text: 'next' }] },
    ])
  })

  it('keeps normalized foreign IDs unique and paired', async () => {
    const messages: Array<ModelMessage> = [
      {
        role: 'assistant',
        content: null,
        metadata: { tanstack: { source: source('foreign') } },
        toolCalls: ['a|b', 'a/b'].map((id) => ({
          id,
          type: 'function',
          function: { name: 'check', arguments: '{}' },
        })),
      },
      ...['a|b', 'a/b'].map(
        (toolCallId): ModelMessage => ({
          role: 'tool',
          toolCallId,
          content: 'ok',
        }),
      ),
    ]
    await collect(
      new GeminiTextAdapter({ apiKey: 'key' }, 'gemini-3.7-flash').chatStream(
        options(messages),
      ),
    )
    const contents = mocks.stream.mock.calls[0]?.[0].contents
    const callIds = contents[0].parts.map(
      (part: { functionCall: { id: string } }) => part.functionCall.id,
    )
    const resultIds = contents[1].parts.map(
      (part: { functionResponse: { id: string } }) => part.functionResponse.id,
    )
    expect(new Set(callIds).size).toBe(2)
    expect(callIds).toEqual(resultIds)
    expect(
      callIds.every((id: string) => /^[a-zA-Z0-9_-]{1,64}$/.test(id)),
    ).toBe(true)
  })

  it.each([false, true])(
    'uses known Vertex context for replay rather than guessing from a URL: %s',
    async (vertex) => {
      const adapter = new GeminiTextAdapter(
        vertex
          ? { vertexai: true, project: 'project', location: 'region' }
          : { apiKey: 'key', baseURL: 'https://vertex.example/gateway' },
        'gemini-3.7-flash',
      )
      await collect(
        adapter.chatStream(
          options([
            signed(source()),
            { role: 'tool', toolCallId: 'call|odd', content: 'done' },
          ]),
        ),
      )
      expect(mocks.stream.mock.calls[0]?.[0].contents[0].parts[0]).toEqual({
        functionCall: {
          id: vertex ? 'call_odd' : 'call|odd',
          name: 'check',
          args: { nested: { text: 'ok' } },
        },
        ...(vertex ? {} : { thoughtSignature: 'tool-signature' }),
      })
      expect(adapter.provider).toBe(vertex ? 'google-vertex' : 'google')
    },
  )

  it('keeps the complete ordinary Interactions body and chaining options', async () => {
    mocks.interactions.mockResolvedValue(
      stream([
        {
          event_type: 'interaction.completed',
          interaction: { id: 'ordinary', status: 'completed' },
        },
      ]),
    )
    await collect(
      new GeminiTextInteractionsAdapter(
        { apiKey: 'key' },
        'gemini-3.7-flash',
      ).chatStream({
        ...options([{ role: 'user', content: 'hello' }]),
        modelOptions: {
          previous_interaction_id: 'previous',
          system_instruction: 'system',
          generation_config: { temperature: 0.2 },
          store: true,
          background: false,
          response_modalities: ['text'],
          response_format: { type: 'text', mime_type: 'text/plain' },
        },
      }),
    )
    expect(mocks.interactions.mock.calls[0]?.[0]).toEqual({
      model: 'gemini-3.7-flash',
      input: [
        { type: 'user_input', content: [{ type: 'text', text: 'hello' }] },
      ],
      previous_interaction_id: 'previous',
      system_instruction: 'system',
      tools: undefined,
      generation_config: { temperature: 0.2 },
      store: true,
      background: false,
      response_modalities: ['text'],
      response_format: { type: 'text', mime_type: 'text/plain' },
      stream: true,
    })
  })

  it.each([false, true])(
    'replays ordered agentic tool steps and signatures through the real SDK: foreign=%s',
    async (foreign) => {
      const actual =
        await vi.importActual<typeof import('@google/genai')>('@google/genai')
      const sdk = new actual.GoogleGenAI({ apiKey: 'key' })
      const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'sdk-real',
            status: 'completed',
            steps: [
              {
                type: 'model_output',
                content: [{ type: 'text', text: 'ok' }],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      mocks.interactions.mockImplementation(
        (request: Parameters<GoogleGenAI['interactions']['create']>[0]) =>
          sdk.interactions.create(request),
      )
      const messages: Array<ModelMessage> = [
        signed(
          source(
            'gemini-3.7-flash',
            foreign ? 'google-generative-ai' : 'google-interactions',
          ),
        ),
        { role: 'tool', toolCallId: 'call|odd', content: 'done' },
        {
          role: 'user',
          content: [
            {
              type: 'video',
              source: {
                type: 'url',
                value: 'opaque-url',
                mimeType: 'video/mp4',
              },
              metadata: { processing: 'agentic' },
            },
          ],
        },
      ]
      const original = JSON.stringify(messages)
      try {
        const chunks = await collect(
          chat({
            adapter: new GeminiTextAdapter(
              { apiKey: 'key' },
              'gemini-3.7-flash',
            ),
            messages,
          }),
        )
        const id = foreign ? 'call_odd' : 'call|odd'
        expect(mocks.interactions.mock.calls[0]?.[0].input).toEqual([
          ...(foreign
            ? []
            : [{ type: 'thought', signature: 'tool-signature', summary: [] }]),
          {
            type: 'function_call',
            id,
            name: 'check',
            arguments: { nested: { text: 'ok' } },
          },
          {
            type: 'model_output',
            content: [
              { type: 'text', text: foreign ? 'AnswerReason' : 'Answer' },
            ],
          },
          ...(foreign
            ? []
            : [
                {
                  type: 'thought',
                  signature: 'opaque-signature',
                  summary: [{ type: 'text', text: 'Reason' }],
                },
              ]),
          {
            type: 'function_result',
            call_id: id,
            name: 'check',
            result: 'done',
          },
          {
            type: 'user_input',
            content: [
              {
                type: 'video',
                uri: 'opaque-url',
                mime_type: 'video/mp4',
                processing: 'agentic',
              },
            ],
          },
        ])
        expect(fetch).toHaveBeenCalledTimes(1)
        const [request, init] = fetch.mock.calls[0] ?? []
        const body =
          request instanceof Request
            ? await request.clone().text()
            : typeof init?.body === 'string'
              ? init.body
              : undefined
        expect(body === undefined ? undefined : JSON.parse(body).input).toEqual(
          mocks.interactions.mock.calls[0]?.[0].input,
        )
        expect(
          tanstackMetadata(
            chunks.find((chunk) => chunk.type === EventType.RUN_FINISHED),
          )?.responseId,
        ).toBe('sdk-real')
        expect(JSON.stringify(messages)).toBe(original)
      } finally {
        fetch.mockRestore()
      }
    },
  )

  it('keeps the complete ordinary body and options unchanged', async () => {
    const adapter = new GeminiTextAdapter({ apiKey: 'key' }, 'gemini-3.7-flash')
    await collect(
      adapter.chatStream({
        ...options([
          {
            role: 'user',
            content: [
              { type: 'text', content: 'hello' },
              {
                type: 'video',
                source: {
                  type: 'url',
                  value: 'opaque-url',
                  mimeType: 'video/mp4',
                },
                metadata: { fps: 2, startOffset: '1s', endOffset: '3s' },
              },
            ],
          },
        ]),
        systemPrompts: ['system'],
        modelOptions: {
          temperature: 0.2,
          topP: 0.7,
          maxOutputTokens: 100,
          cachedContent: 'cachedContents/cache',
          toolConfig: {
            functionCallingConfig: { mode: FunctionCallingConfigMode.NONE },
          },
        },
      }),
    )
    expect(mocks.stream.mock.calls[0]?.[0]).toEqual({
      model: 'gemini-3.7-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'hello' },
            {
              fileData: { fileUri: 'opaque-url', mimeType: 'video/mp4' },
              videoMetadata: { fps: 2, startOffset: '1s', endOffset: '3s' },
            },
          ],
        },
      ],
      config: {
        temperature: 0.2,
        topP: 0.7,
        maxOutputTokens: 100,
        cachedContent: 'cachedContents/cache',
        toolConfig: { functionCallingConfig: { mode: 'NONE' } },
        systemInstruction: 'system',
        tools: [],
      },
    })
  })

  it('tags an early provider error without inventing a response ID', async () => {
    mocks.stream.mockRejectedValue(new Error('Denied'))
    const chunks = await collect(
      new GeminiTextAdapter({ apiKey: 'key' }, 'gemini-3.7-flash').chatStream(
        options([{ role: 'user', content: 'hello' }]),
      ),
    )
    expect(
      tanstackMetadata(
        chunks.find((chunk) => chunk.type === EventType.RUN_ERROR),
      )?.source,
    ).toEqual(source())
    expect(
      chunks.every(
        (chunk) => tanstackMetadata(chunk)?.responseId === undefined,
      ),
    ).toBe(true)
  })

  it('returns genuine Interactions identity from native structured output', async () => {
    mocks.interactions.mockResolvedValue({
      id: 'native-interaction',
      model: 'native-reported',
      status: 'completed',
      output_text: '{"ok":true}',
    })
    const result = await new GeminiTextInteractionsAdapter(
      { apiKey: 'key' },
      'gemini-3.7-flash',
    ).structuredOutput({
      chatOptions: options([{ role: 'user', content: 'hello' }]),
      outputSchema: { type: 'object' },
    })
    expect(result).toMatchObject({
      data: { ok: true },
      responseId: 'native-interaction',
      model: 'native-reported',
    })
  })

  it.each([undefined, source()])(
    'keeps source-free and same-source signatures and block order: %j',
    async (origin) => {
      const messages: Array<ModelMessage> = [
        signed(origin),
        { role: 'tool', toolCallId: 'call|odd', content: 'done' },
      ]
      const original = JSON.stringify(messages)
      await collect(
        new GeminiTextAdapter({ apiKey: 'key' }, 'gemini-3.7-flash').chatStream(
          options(messages),
        ),
      )
      expect(mocks.stream.mock.calls[0]?.[0].contents).toEqual([
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'call|odd',
                name: 'check',
                args: { nested: { text: 'ok' } },
              },
              thoughtSignature: 'tool-signature',
            },
            { text: 'Answer' },
            {
              thought: true,
              text: 'Reason',
              thoughtSignature: 'opaque-signature',
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'call|odd',
                name: 'check',
                response: { content: 'done' },
              },
            },
          ],
        },
      ])
      expect(JSON.stringify(messages)).toBe(original)
    },
  )

  it.each([
    'gemini-2.5-pro',
    'gemini-3.7-flash',
    'gemini-live-3-flash',
    'claude-sonnet',
    'gpt-oss-120b',
  ])(
    'uses the conditional pi ID rule for foreign %s history',
    async (model) => {
      const messages: Array<ModelMessage> = [
        signed(source('different')),
        { role: 'tool', toolCallId: 'call|odd', content: 'done' },
      ]
      await collect(
        new GeminiTextAdapter({ apiKey: 'key' }, 'gemini-3.7-flash').chatStream(
          options(messages, model),
        ),
      )
      const id = model === 'gemini-2.5-pro' ? 'call|odd' : 'call_odd'
      expect(mocks.stream.mock.calls[0]?.[0].contents).toEqual([
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                id,
                name: 'check',
                args: { nested: { text: 'ok' } },
              },
            },
            { text: 'AnswerReason' },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id,
                name: 'check',
                response: { content: 'done' },
              },
            },
          ],
        },
      ])
    },
  )

  it.each([
    { apiKey: 'key' },
    { vertexai: true, project: 'project', location: 'region' },
    { enterprise: true, project: 'project', location: 'region' },
  ])(
    'tags actual generateContent source and genuine response identity: %j',
    async (config) => {
      const adapter = new GeminiTextAdapter(config, 'gemini-3.7-flash')
      const chunks = await collect(
        adapter.chatStream(options([{ role: 'user', content: 'hello' }])),
      )
      const expected =
        'apiKey' in config
          ? source()
          : source('gemini-3.7-flash', 'google-vertex', 'google-vertex')
      expect(tanstackMetadata(chunks[0])).toMatchObject({
        source: expected,
        responseId: 'response-real',
        model: 'gemini-reported',
      })
      expect(
        tanstackMetadata(
          chunks.find((chunk) => chunk.type === EventType.RUN_FINISHED),
        ),
      ).toMatchObject({
        source: expected,
        responseId: 'response-real',
        model: 'gemini-reported',
      })
    },
  )

  it('returns genuine identity from native structured output', async () => {
    mocks.generate.mockResolvedValue({
      responseId: 'structured-real',
      modelVersion: 'reported-structured',
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
    })
    const result = await new GeminiTextAdapter(
      { apiKey: 'key' },
      'gemini-3.7-flash',
    ).structuredOutput({
      chatOptions: options([{ role: 'user', content: 'hello' }]),
      outputSchema: { type: 'object' },
    })
    expect(result).toMatchObject({
      data: { ok: true },
      responseId: 'structured-real',
      model: 'reported-structured',
    })
  })

  it('tags the actual agentic API before content and preserves signed Interactions history through core', async () => {
    mocks.interactions.mockResolvedValue({
      id: 'interaction-real',
      model: 'reported-agentic',
      output_text: 'ok',
    })
    const messages: Array<ModelMessage> = [
      {
        role: 'assistant',
        content: 'Past',
        thinking: [{ content: 'Thought', signature: 'keep-this' }],
        metadata: {
          tanstack: {
            source: source('gemini-3.7-flash', 'google-interactions'),
          },
        },
      },
      {
        role: 'user',
        content: [
          {
            type: 'video',
            source: { type: 'url', value: 'opaque-url', mimeType: 'video/mp4' },
            metadata: { processing: 'agentic' },
          },
        ],
      },
    ]
    const chunks = await collect(
      chat({
        adapter: new GeminiTextAdapter({ apiKey: 'key' }, 'gemini-3.7-flash'),
        messages,
      }),
    )
    expect(mocks.interactions.mock.calls[0]?.[0].input).toEqual([
      {
        type: 'thought',
        signature: 'keep-this',
        summary: [{ type: 'text', text: 'Thought' }],
      },
      { type: 'model_output', content: [{ type: 'text', text: 'Past' }] },
      {
        type: 'user_input',
        content: [
          {
            type: 'video',
            uri: 'opaque-url',
            mime_type: 'video/mp4',
            processing: 'agentic',
          },
        ],
      },
    ])
    const content = chunks.find(
      (chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT,
    )
    expect(tanstackMetadata(content)?.source).toEqual(
      source('gemini-3.7-flash', 'google-interactions'),
    )
    expect(
      tanstackMetadata(
        chunks.find((chunk) => chunk.type === EventType.RUN_FINISHED),
      )?.responseId,
    ).toBe('interaction-real')
  })

  it('keeps API source independent across concurrent calls on one adapter', async () => {
    mocks.interactions.mockResolvedValue({
      id: 'interaction-concurrent',
      output_text: 'video',
    })
    const adapter = new GeminiTextAdapter({ apiKey: 'key' }, 'gemini-3.7-flash')
    const [normal, agentic] = await Promise.all([
      collect(
        adapter.chatStream(options([{ role: 'user', content: 'hello' }])),
      ),
      collect(
        adapter.chatStream(
          options([
            {
              role: 'user',
              content: [
                {
                  type: 'video',
                  source: { type: 'url', value: 'url' },
                  metadata: { processing: 'agentic' },
                },
              ],
            },
          ]),
        ),
      ),
    ])
    expect(
      normal.every(
        (chunk) =>
          tanstackMetadata(chunk)?.source?.api === 'google-generative-ai',
      ),
    ).toBe(true)
    expect(
      agentic.every(
        (chunk) =>
          tanstackMetadata(chunk)?.source?.api === 'google-interactions',
      ),
    ).toBe(true)
  })

  it('keeps Interactions chaining and custom ID while adding source and genuine identity', async () => {
    mocks.interactions.mockResolvedValue(
      stream([
        {
          event_type: 'interaction.created',
          interaction: {
            id: 'interaction-stream',
            model: 'reported-interaction',
          },
        },
        {
          event_type: 'step.delta',
          index: 0,
          delta: { type: 'text', text: 'ok' },
        },
        {
          event_type: 'interaction.completed',
          interaction: {
            id: 'interaction-stream',
            model: 'reported-interaction',
            status: 'completed',
          },
        },
      ]),
    )
    const chunks = await collect(
      new GeminiTextInteractionsAdapter(
        { apiKey: 'key' },
        'gemini-3.7-flash',
      ).chatStream(options([{ role: 'user', content: 'hello' }])),
    )
    expect(mocks.interactions.mock.calls[0]?.[0].input).toEqual([
      { type: 'user_input', content: [{ type: 'text', text: 'hello' }] },
    ])
    expect(tanstackMetadata(chunks[0])?.source).toEqual(
      source('gemini-3.7-flash', 'google-interactions'),
    )
    expect(
      tanstackMetadata(
        chunks.find((chunk) => chunk.type === EventType.RUN_FINISHED),
      ),
    ).toMatchObject({
      responseId: 'interaction-stream',
      model: 'reported-interaction',
    })
    expect(
      chunks.find(
        (chunk) =>
          chunk.type === EventType.CUSTOM &&
          chunk.name === 'gemini.interactionId',
      ),
    ).toMatchObject({ value: { interactionId: 'interaction-stream' } })
  })
})
