import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { chat } from '@tanstack/ai'
import type { StreamChunk, Tool } from '@tanstack/ai'
import { GeminiTextInteractionsAdapter } from '../src/experimental/text-interactions/adapter'
import type { GeminiTextInteractionsProviderOptions } from '../src/experimental/text-interactions/adapter'

const mocks = vi.hoisted(() => {
  return {
    constructorSpy: vi.fn<(options: { apiKey: string }) => void>(),
    interactionsCreateSpy: vi.fn(),
  }
})

vi.mock('@google/genai', async () => {
  const actual = await vi.importActual<any>('@google/genai')
  const { constructorSpy, interactionsCreateSpy } = mocks
  class MockGoogleGenAI {
    get interactions() {
      return { create: interactionsCreateSpy }
    }
    constructor(options: { apiKey: string }) {
      constructorSpy(options)
    }
  }

  return {
    ...actual,
    GoogleGenAI: MockGoogleGenAI,
  }
})

const createAdapter = () =>
  new GeminiTextInteractionsAdapter({ apiKey: 'test-key' }, 'gemini-2.5-flash')

const mkStream = (events: Array<Record<string, unknown>>) => {
  return (async function* () {
    for (const event of events) {
      yield event
    }
  })()
}

const collectChunks = async (stream: AsyncIterable<StreamChunk>) => {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

describe('GeminiTextInteractionsAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('translates a basic text stream into AG-UI chunks and surfaces the interaction id', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.start',
          interaction: { id: 'int_1', status: 'in_progress' },
        },
        {
          event_type: 'content.start',
          index: 0,
          content: { type: 'text', text: '' },
        },
        {
          event_type: 'content.delta',
          index: 0,
          delta: { type: 'text', text: 'Hello' },
        },
        {
          event_type: 'content.delta',
          index: 0,
          delta: { type: 'text', text: ', world!' },
        },
        { event_type: 'content.stop', index: 0 },
        {
          event_type: 'interaction.complete',
          interaction: {
            id: 'int_1',
            status: 'completed',
            usage: {
              total_input_tokens: 3,
              total_output_tokens: 2,
              total_tokens: 5,
            },
          },
        },
      ]),
    )

    const adapter = createAdapter()
    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    )

    const types = chunks.map((c) => c.type)
    expect(types).toContain('RUN_STARTED')
    expect(types).toContain('TEXT_MESSAGE_START')
    expect(types).toContain('TEXT_MESSAGE_CONTENT')
    expect(types).toContain('TEXT_MESSAGE_END')
    expect(types).toContain('RUN_FINISHED')

    const contents = chunks.filter(
      (c) => c.type === 'TEXT_MESSAGE_CONTENT',
    ) as any[]
    expect(contents.map((c) => c.delta).join('')).toBe('Hello, world!')

    const finished = chunks.find((c) => c.type === 'RUN_FINISHED') as any
    expect(finished.finishReason).toBe('stop')
    expect(finished.usage).toEqual({
      promptTokens: 3,
      completionTokens: 2,
      totalTokens: 5,
    })

    const interactionCustom = chunks.find(
      (c) => c.type === 'CUSTOM' && (c as any).name === 'gemini.interactionId',
    ) as any
    expect(interactionCustom).toBeDefined()
    expect(interactionCustom.value).toEqual({ interactionId: 'int_1' })
  })

  it('forwards previous_interaction_id on the outgoing request and sends only the latest user turn', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.start',
          interaction: { id: 'int_2', status: 'in_progress' },
        },
        {
          event_type: 'interaction.complete',
          interaction: { id: 'int_2', status: 'completed' },
        },
      ]),
    )

    const adapter = createAdapter()
    const providerOptions: GeminiTextInteractionsProviderOptions = {
      previous_interaction_id: 'int_1',
    }

    await collectChunks(
      chat({
        adapter,
        messages: [
          { role: 'user', content: 'Hi, my name is Amir.' },
          { role: 'assistant', content: 'Nice to meet you, Amir!' },
          { role: 'user', content: 'What is my name?' },
        ],
        modelOptions: providerOptions,
      }),
    )

    expect(mocks.interactionsCreateSpy).toHaveBeenCalledTimes(1)
    const [payload] = mocks.interactionsCreateSpy.mock.calls[0]
    expect(payload.previous_interaction_id).toBe('int_1')
    expect(payload.model).toBe('gemini-2.5-flash')
    expect(payload.stream).toBe(true)
    expect(payload.input).toEqual([
      {
        role: 'user',
        content: [{ type: 'text', text: 'What is my name?' }],
      },
    ])
  })

  it('includes trailing tool result when chaining with previous_interaction_id', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.start',
          interaction: { id: 'int_followup', status: 'in_progress' },
        },
        {
          event_type: 'interaction.complete',
          interaction: { id: 'int_followup', status: 'completed' },
        },
      ]),
    )

    const adapter = createAdapter()
    await collectChunks(
      chat({
        adapter,
        messages: [
          { role: 'user', content: 'Weather in Madrid?' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'lookup_weather',
                  arguments: '{"location":"Madrid"}',
                },
              },
            ],
          },
          {
            role: 'tool',
            toolCallId: 'call_1',
            content: '{"tempC":22}',
          },
        ],
        modelOptions: {
          previous_interaction_id: 'int_prev',
        } as GeminiTextInteractionsProviderOptions,
      }),
    )

    const [payload] = mocks.interactionsCreateSpy.mock.calls[0]
    expect(payload.previous_interaction_id).toBe('int_prev')
    expect(payload.input).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'function_result',
            call_id: 'call_1',
            name: 'lookup_weather',
            result: '{"tempC":22}',
          },
        ],
      },
    ])
  })

  it('sends full conversation as Turn[] when previous_interaction_id is absent', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.start',
          interaction: { id: 'int_3', status: 'in_progress' },
        },
        {
          event_type: 'interaction.complete',
          interaction: { id: 'int_3', status: 'completed' },
        },
      ]),
    )

    const adapter = createAdapter()
    await collectChunks(
      chat({
        adapter,
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
          { role: 'user', content: 'How are you?' },
        ],
      }),
    )

    const [payload] = mocks.interactionsCreateSpy.mock.calls[0]
    expect(payload.input).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      { role: 'model', content: [{ type: 'text', text: 'Hi there' }] },
      { role: 'user', content: [{ type: 'text', text: 'How are you?' }] },
    ])
  })

  it('translates function_call deltas into TOOL_CALL_* events and marks tool_calls finish reason', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.start',
          interaction: { id: 'int_tool', status: 'in_progress' },
        },
        {
          event_type: 'content.start',
          index: 0,
          content: { type: 'function_call' },
        },
        {
          event_type: 'content.delta',
          index: 0,
          delta: {
            type: 'function_call',
            id: 'call_1',
            name: 'lookup_weather',
            arguments: { location: 'Madrid' },
          },
        },
        { event_type: 'content.stop', index: 0 },
        {
          event_type: 'interaction.complete',
          interaction: { id: 'int_tool', status: 'completed' },
        },
      ]),
    )

    const weatherTool: Tool = {
      name: 'lookup_weather',
      description: 'Return the weather for a location',
    }

    const adapter = createAdapter()
    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Weather in Madrid?' }],
        tools: [weatherTool],
      }),
    )

    const [payload] = mocks.interactionsCreateSpy.mock.calls[0]
    expect(payload.tools).toEqual([
      expect.objectContaining({
        type: 'function',
        name: 'lookup_weather',
        description: 'Return the weather for a location',
      }),
    ])

    const startEvent = chunks.find((c) => c.type === 'TOOL_CALL_START') as any
    expect(startEvent).toBeDefined()
    expect(startEvent.toolCallId).toBe('call_1')
    expect(startEvent.toolName).toBe('lookup_weather')

    const argsEvent = chunks.find((c) => c.type === 'TOOL_CALL_ARGS') as any
    expect(argsEvent.args).toBe('{"location":"Madrid"}')

    const endEvent = chunks.find((c) => c.type === 'TOOL_CALL_END') as any
    expect(endEvent.input).toEqual({ location: 'Madrid' })

    const finished = chunks.find((c) => c.type === 'RUN_FINISHED') as any
    expect(finished.finishReason).toBe('tool_calls')
  })

  it('serializes tool results as function_result content blocks', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.start',
          interaction: { id: 'int_followup', status: 'in_progress' },
        },
        {
          event_type: 'interaction.complete',
          interaction: { id: 'int_followup', status: 'completed' },
        },
      ]),
    )

    const adapter = createAdapter()
    await collectChunks(
      chat({
        adapter,
        messages: [
          { role: 'user', content: 'Weather in Madrid?' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'lookup_weather',
                  arguments: '{"location":"Madrid"}',
                },
              },
            ],
          },
          {
            role: 'tool',
            toolCallId: 'call_1',
            content: '{"tempC":22}',
          },
        ],
      }),
    )

    const [payload] = mocks.interactionsCreateSpy.mock.calls[0]
    expect(payload.input).toContainEqual({
      role: 'user',
      content: [
        expect.objectContaining({
          type: 'function_result',
          call_id: 'call_1',
          name: 'lookup_weather',
          result: '{"tempC":22}',
        }),
      ],
    })
  })

  it('rejects unsupported image mime types with a clear error', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(mkStream([]))
    const adapter = createAdapter()

    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'data',
                  value: 'base64-data',
                  mimeType: 'image/bmp',
                },
              },
            ],
          },
        ],
      }),
    )

    const err = chunks.find((c) => c.type === 'RUN_ERROR') as any
    expect(err).toBeDefined()
    expect(err.message).toMatch(/image\/bmp/)
    expect(err.message).toMatch(/image\/png/)
  })

  it('sends built-in google_search, code_execution, url_context tools with snake_case shape', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.start',
          interaction: { id: 'int_builtins', status: 'in_progress' },
        },
        {
          event_type: 'interaction.complete',
          interaction: { id: 'int_builtins', status: 'completed' },
        },
      ]),
    )

    const adapter = createAdapter()
    await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'What happened yesterday?' }],
        tools: [
          {
            name: 'google_search',
            description: '',
            metadata: { search_types: ['web_search'] },
          },
          { name: 'code_execution', description: '', metadata: {} },
          { name: 'url_context', description: '', metadata: {} },
        ] as Array<Tool>,
      }),
    )

    const [payload] = mocks.interactionsCreateSpy.mock.calls[0]
    expect(payload.tools).toEqual([
      { type: 'google_search', search_types: ['web_search'] },
      { type: 'code_execution' },
      { type: 'url_context' },
    ])
  })

  it('translates file_search metadata fields into snake_case', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.start',
          interaction: { id: 'int_fs', status: 'in_progress' },
        },
        {
          event_type: 'interaction.complete',
          interaction: { id: 'int_fs', status: 'completed' },
        },
      ]),
    )

    const adapter = createAdapter()
    await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Find it.' }],
        tools: [
          {
            name: 'file_search',
            description: '',
            metadata: {
              fileSearchStoreNames: ['fileSearchStores/my-store'],
              topK: 5,
              metadataFilter: 'kind="faq"',
            },
          },
        ] as Array<Tool>,
      }),
    )

    const [payload] = mocks.interactionsCreateSpy.mock.calls[0]
    expect(payload.tools).toEqual([
      {
        type: 'file_search',
        file_search_store_names: ['fileSearchStores/my-store'],
        top_k: 5,
        metadata_filter: 'kind="faq"',
      },
    ])
  })

  it('surfaces built-in tool deltas as gemini.* CUSTOM events and keeps finish reason "stop"', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.start',
          interaction: { id: 'int_search', status: 'in_progress' },
        },
        {
          event_type: 'content.start',
          index: 0,
          content: { type: 'google_search_call' },
        },
        {
          event_type: 'content.delta',
          index: 0,
          delta: {
            type: 'google_search_call',
            id: 'call_gs_1',
            arguments: { queries: ['weather madrid'] },
          },
        },
        {
          event_type: 'content.delta',
          index: 0,
          delta: {
            type: 'google_search_result',
            call_id: 'call_gs_1',
            result: [{ title: 'Madrid weather', uri: 'https://example.com' }],
          },
        },
        { event_type: 'content.stop', index: 0 },
        {
          event_type: 'content.delta',
          index: 0,
          delta: { type: 'text', text: 'It is sunny.' },
        },
        {
          event_type: 'interaction.complete',
          interaction: { id: 'int_search', status: 'completed' },
        },
      ]),
    )

    const adapter = createAdapter()
    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Weather in Madrid?' }],
        tools: [
          { name: 'google_search', description: '', metadata: {} },
        ] as Array<Tool>,
      }),
    )

    const callChunk = chunks.find(
      (c) =>
        c.type === 'CUSTOM' && (c as any).name === 'gemini.googleSearchCall',
    ) as any
    expect(callChunk).toBeDefined()
    expect(callChunk.value.id).toBe('call_gs_1')
    expect(callChunk.value.arguments).toEqual({ queries: ['weather madrid'] })

    const resultChunk = chunks.find(
      (c) =>
        c.type === 'CUSTOM' && (c as any).name === 'gemini.googleSearchResult',
    ) as any
    expect(resultChunk).toBeDefined()
    expect(resultChunk.value.call_id).toBe('call_gs_1')

    const finished = chunks.find((c) => c.type === 'RUN_FINISHED') as any
    expect(finished.finishReason).toBe('stop')
  })

  it('rejects google_search_retrieval with a clear error', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(mkStream([]))
    const adapter = createAdapter()

    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Search' }],
        tools: [
          { name: 'google_search_retrieval', description: '', metadata: {} },
        ] as Array<Tool>,
      }),
    )

    const err = chunks.find((c) => c.type === 'RUN_ERROR') as any
    expect(err).toBeDefined()
    expect(err.message).toMatch(/google_search_retrieval/)
    expect(err.message).toMatch(/Interactions API/)
    expect(err.message).toMatch(/google_search/)
  })

  it('rejects google_maps with a clear error', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(mkStream([]))
    const adapter = createAdapter()

    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Directions' }],
        tools: [
          { name: 'google_maps', description: '', metadata: {} },
        ] as Array<Tool>,
      }),
    )

    const err = chunks.find((c) => c.type === 'RUN_ERROR') as any
    expect(err).toBeDefined()
    expect(err.message).toMatch(/google_maps/)
    expect(err.message).toMatch(/Interactions API/)
  })

  it('emits RUN_ERROR on an upstream error event', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.start',
          interaction: { id: 'int_err', status: 'in_progress' },
        },
        {
          event_type: 'error',
          error: { code: 500, message: 'boom' },
        },
      ]),
    )

    const adapter = createAdapter()
    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    )

    const err = chunks.find((c) => c.type === 'RUN_ERROR') as any
    expect(err).toBeDefined()
    expect(err.message).toBe('boom')
    expect(err.code).toBe('500')
  })

  it('structuredOutput parses JSON text from interaction.outputs', async () => {
    // First call: agentic loop's streaming turn (no tools, short completion).
    mocks.interactionsCreateSpy.mockResolvedValueOnce(
      mkStream([
        {
          event_type: 'interaction.start',
          interaction: { id: 'int_struct_stream', status: 'in_progress' },
        },
        {
          event_type: 'content.start',
          index: 0,
          content: { type: 'text', text: '' },
        },
        { event_type: 'content.stop', index: 0 },
        {
          event_type: 'interaction.complete',
          interaction: { id: 'int_struct_stream', status: 'completed' },
        },
      ]),
    )
    // Second call: non-streaming structured output.
    mocks.interactionsCreateSpy.mockResolvedValueOnce({
      id: 'int_structured',
      status: 'completed',
      outputs: [{ type: 'text', text: '{"foo":"bar"}' }],
    })

    const adapter = createAdapter()
    const result = await chat({
      adapter,
      messages: [{ role: 'user', content: 'Give JSON' }],
      outputSchema: z.object({ foo: z.string() }),
    })

    expect(result).toEqual({ foo: 'bar' })

    expect(mocks.interactionsCreateSpy).toHaveBeenCalledTimes(2)
    const structuredPayload = mocks.interactionsCreateSpy.mock.calls[1][0]
    expect(structuredPayload.response_mime_type).toBe('application/json')
    expect(structuredPayload.response_format).toBeDefined()
    expect(structuredPayload.stream).toBeUndefined()
  })
})
