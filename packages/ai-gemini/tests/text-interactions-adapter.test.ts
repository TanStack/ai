import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { chat } from '@tanstack/ai'
import type { StreamChunk, Tool } from '@tanstack/ai'
import { GeminiTextInteractionsAdapter } from '../src/experimental/text-interactions/adapter'
import type { GeminiTextInteractionsProviderOptions } from '../src/experimental/text-interactions/adapter'
import type {
  GeminiInteractionsCustomEvent,
  GeminiInteractionsCustomEventValue,
} from '../src/experimental/text-interactions/events'

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
    // `mockReset()` (vs `clearAllMocks`) also clears `mockResolvedValue`
    // and `mockResolvedValueOnce` queues, preventing a prior test's
    // permanent return value (e.g. the upstream-error test's "boom"
    // stream) from leaking into a later test's third+ call.
    mocks.interactionsCreateSpy.mockReset()
    mocks.constructorSpy.mockReset()
  })

  it('translates a basic text stream into AG-UI chunks and surfaces the interaction id', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_1', status: 'in_progress' },
        },
        {
          event_type: 'step.start',
          index: 0,
          step: { type: 'model_output' },
        },
        {
          event_type: 'step.delta',
          index: 0,
          delta: { type: 'text', text: 'Hello' },
        },
        {
          event_type: 'step.delta',
          index: 0,
          delta: { type: 'text', text: ', world!' },
        },
        { event_type: 'step.stop', index: 0 },
        {
          event_type: 'interaction.completed',
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
    ) as
      | (Extract<StreamChunk, { type: 'CUSTOM' }> &
          Extract<
            GeminiInteractionsCustomEvent,
            { name: 'gemini.interactionId' }
          >)
      | undefined
    expect(interactionCustom).toBeDefined()
    // Narrowing via the discriminated union exported from /experimental:
    const value:
      | GeminiInteractionsCustomEventValue<'gemini.interactionId'>
      | undefined = interactionCustom?.value
    expect(value).toEqual({ interactionId: 'int_1' })
  })

  it('threads runId, threadId, and parentRunId onto RUN_STARTED / RUN_FINISHED for AG-UI compliance', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_3', status: 'in_progress' },
        },
        {
          event_type: 'interaction.completed',
          interaction: { id: 'int_3', status: 'completed' },
        },
      ]),
    )

    const adapter = createAdapter()
    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'run_42',
        threadId: 'thread_7',
        parentRunId: 'run_parent',
      }),
    )

    const started = chunks.find((c) => c.type === 'RUN_STARTED') as any
    expect(started.runId).toBe('run_42')
    expect(started.threadId).toBe('thread_7')
    expect(started.parentRunId).toBe('run_parent')

    const finished = chunks.find((c) => c.type === 'RUN_FINISHED') as any
    expect(finished.runId).toBe('run_42')
    expect(finished.threadId).toBe('thread_7')
  })

  it('forwards previous_interaction_id on the outgoing request and sends only the latest user turn', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_2', status: 'in_progress' },
        },
        {
          event_type: 'interaction.completed',
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
    const [payload] = mocks.interactionsCreateSpy.mock.calls[0]!
    expect(payload.previous_interaction_id).toBe('int_1')
    expect(payload.model).toBe('gemini-2.5-flash')
    expect(payload.stream).toBe(true)
    // `input` is sent as `Array<Step>` — the live API expects a list
    // of Steps at the top level, not bare content blocks. See the
    // `InteractionsRequestInput` comment in the adapter for the
    // rejection mode if that envelope is missing.
    expect(payload.input).toEqual([
      {
        type: 'user_input',
        content: [{ type: 'text', text: 'What is my name?' }],
      },
    ])
  })

  it('reads sampling from modelOptions.generation_config into the request generation_config', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_gen', status: 'in_progress' },
        },
        {
          event_type: 'interaction.completed',
          interaction: { id: 'int_gen', status: 'completed' },
        },
      ]),
    )

    const adapter = createAdapter()
    const providerOptions: GeminiTextInteractionsProviderOptions = {
      generation_config: {
        temperature: 0.6,
        top_p: 0.95,
        max_output_tokens: 512,
      },
    }

    await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: providerOptions,
      }),
    )

    expect(mocks.interactionsCreateSpy).toHaveBeenCalledTimes(1)
    const [payload] = mocks.interactionsCreateSpy.mock.calls[0]!
    expect(payload.generation_config).toMatchObject({
      temperature: 0.6,
      top_p: 0.95,
      max_output_tokens: 512,
    })
  })

  it('includes trailing tool result when chaining with previous_interaction_id', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_followup', status: 'in_progress' },
        },
        {
          event_type: 'interaction.completed',
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

    const [payload] = mocks.interactionsCreateSpy.mock.calls[0]!
    expect(payload.previous_interaction_id).toBe('int_prev')
    // Tool result follow-ups are sent as Step[] with `function_result`
    // entries at the top level (NOT wrapped in `user_input` content).
    expect(payload.input).toEqual([
      {
        type: 'function_result',
        call_id: 'call_1',
        name: 'lookup_weather',
        result: '{"tempC":22}',
      },
    ])
  })

  it('rejects multi-turn history without previous_interaction_id with a targeted error', async () => {
    const adapter = createAdapter()
    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
          { role: 'user', content: 'How are you?' },
        ],
      }),
    )

    // The Interactions API does not support stateless multi-turn replay —
    // the adapter must error rather than send invalid Turn[] shapes that
    // the API rejects with "value at top-level must be a list".
    const err = chunks.find((c) => c.type === 'RUN_ERROR') as any
    expect(err).toBeDefined()
    expect(err.message).toMatch(/previous_interaction_id/i)
    expect(mocks.interactionsCreateSpy).not.toHaveBeenCalled()
  })

  it('sends a fresh single-text turn as a single user_input Step', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_fresh', status: 'in_progress' },
        },
        {
          event_type: 'interaction.completed',
          interaction: { id: 'int_fresh', status: 'completed' },
        },
      ]),
    )

    const adapter = createAdapter()
    await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    )

    const [payload] = mocks.interactionsCreateSpy.mock.calls[0]!
    expect(payload.input).toEqual([
      { type: 'user_input', content: [{ type: 'text', text: 'Hello' }] },
    ])
    expect(payload.previous_interaction_id).toBeUndefined()
  })

  it('translates function_call deltas into TOOL_CALL_* events and marks tool_calls finish reason', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_tool', status: 'in_progress' },
        },
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call_1',
            name: 'lookup_weather',
            arguments: { location: 'Madrid' },
          },
        },
        { event_type: 'step.stop', index: 0 },
        {
          event_type: 'interaction.completed',
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
        tools: [weatherTool],      }),
    )

    const [payload] = mocks.interactionsCreateSpy.mock.calls[0]!
    expect(payload.tools).toEqual([
      expect.objectContaining({
        type: 'function',
        name: 'lookup_weather',
        description: 'Return the weather for a location',
      }),
    ])

    const startEvent = chunks.find((c) => c.type === 'TOOL_CALL_START')
    expect(startEvent).toMatchObject({
      toolCallId: 'call_1',
      toolName: 'lookup_weather',
    })

    const argsEvent = chunks.find((c) => c.type === 'TOOL_CALL_ARGS')
    expect(argsEvent).toMatchObject({ args: '{"location":"Madrid"}' })

    const endEvent = chunks.find((c) => c.type === 'TOOL_CALL_END')
    expect(endEvent).toMatchObject({ input: { location: 'Madrid' } })

    const finished = chunks.find((c) => c.type === 'RUN_FINISHED')
    expect(finished).toMatchObject({ finishReason: 'tool_calls' })
  })

  it('accumulates multi-fragment arguments_delta into the final tool input', async () => {
    // Streaming function calls deliver identity on step.start (with an empty
    // `{}` arguments placeholder) and the JSON arguments as a sequence of
    // individually-incomplete `arguments_delta` fragments.
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_frag', status: 'in_progress' },
        },
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call_frag',
            name: 'lookup_weather',
            arguments: {},
          },
        },
        {
          event_type: 'step.delta',
          index: 0,
          delta: { type: 'arguments_delta', arguments: '{"location":' },
        },
        {
          event_type: 'step.delta',
          index: 0,
          delta: { type: 'arguments_delta', arguments: '"Berlin","unit":' },
        },
        {
          event_type: 'step.delta',
          index: 0,
          delta: { type: 'arguments_delta', arguments: '"celsius"}' },
        },
        { event_type: 'step.stop', index: 0 },
        {
          event_type: 'interaction.completed',
          interaction: { id: 'int_frag', status: 'completed' },
        },
      ]),
    )

    const adapter = createAdapter()
    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Weather in Berlin?' }],
        tools: [{ name: 'lookup_weather', description: 'Return the weather' }],      }),
    )

    const startEvent = chunks.find((c) => c.type === 'TOOL_CALL_START')
    expect(startEvent).toMatchObject({
      toolCallId: 'call_frag',
      toolName: 'lookup_weather',
    })

    // The last TOOL_CALL_ARGS event carries the fully-accumulated buffer.
    const argsEvents = chunks.filter((c) => c.type === 'TOOL_CALL_ARGS')
    expect(argsEvents.length).toBeGreaterThan(1)
    expect(argsEvents.at(-1)).toMatchObject({
      args: '{"location":"Berlin","unit":"celsius"}',
    })

    const endEvent = chunks.find((c) => c.type === 'TOOL_CALL_END')
    expect(endEvent).toMatchObject({
      input: { location: 'Berlin', unit: 'celsius' },
    })
  })

  it('preserves the last good args when the arguments stream truncates mid-fragment', async () => {
    // If the stream ends after an incomplete fragment, the tool input must
    // retain whatever was parsed so far rather than being reset to `{}` — a
    // strict JSON.parse would throw on the partial buffer and lose the
    // already-merged keys.
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_trunc', status: 'in_progress' },
        },
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call_trunc',
            name: 'lookup_weather',
            arguments: {},
          },
        },
        {
          event_type: 'step.delta',
          index: 0,
          // Complete `city` key, then a dangling `unit` key the stream never
          // finishes.
          delta: {
            type: 'arguments_delta',
            arguments: '{"city":"London","unit":',
          },
        },
        { event_type: 'step.stop', index: 0 },
        {
          event_type: 'interaction.completed',
          interaction: { id: 'int_trunc', status: 'completed' },
        },
      ]),
    )

    const adapter = createAdapter()
    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Weather in London?' }],
        tools: [{ name: 'lookup_weather', description: 'Return the weather' }],      }),
    )

    // No parse-failure RUN_ERROR, and the completed key survives truncation.
    expect(chunks.find((c) => c.type === 'RUN_ERROR')).toBeUndefined()
    const endEvent = chunks.find((c) => c.type === 'TOOL_CALL_END')
    expect(endEvent).toMatchObject({ input: { city: 'London' } })
  })

  it('translates thought_summary deltas into REASONING events', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_think', status: 'in_progress' },
        },
        {
          event_type: 'step.start',
          index: 0,
          step: { type: 'thought', id: 'thought_1' },
        },
        {
          event_type: 'step.delta',
          index: 0,
          delta: {
            type: 'thought_summary',
            content: { text: 'First I consider the question. ' },
          },
        },
        {
          event_type: 'step.delta',
          index: 0,
          delta: {
            type: 'thought_summary',
            content: { text: 'Then I answer.' },
          },
        },
        { event_type: 'step.stop', index: 0 },
        {
          event_type: 'step.delta',
          index: 1,
          delta: { type: 'text', text: 'It is sunny.' },
        },
        {
          event_type: 'interaction.completed',
          interaction: { id: 'int_think', status: 'completed' },
        },
      ]),
    )

    const adapter = createAdapter()
    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Think, then answer.' }],
      }),
    )

    expect(chunks.find((c) => c.type === 'REASONING_START')).toBeDefined()
    expect(
      chunks.find((c) => c.type === 'REASONING_MESSAGE_START'),
    ).toBeDefined()

    const reasoningDeltas = chunks.filter(
      (c) => c.type === 'REASONING_MESSAGE_CONTENT',
    ) as Array<any>
    expect(reasoningDeltas.map((c) => c.delta)).toEqual([
      'First I consider the question. ',
      'Then I answer.',
    ])

    // Reasoning is distinct from the final assistant text.
    const textContent = chunks.find(
      (c) => c.type === 'TEXT_MESSAGE_CONTENT',
    ) as any
    expect(textContent.delta).toBe('It is sunny.')

    const finished = chunks.find((c) => c.type === 'RUN_FINISHED') as any
    expect(finished.finishReason).toBe('stop')
  })

  it('emits parentMessageId on tool-first tool calls matching the assistant message id', async () => {
    // The function_call content arrives before any text. parentMessageId must
    // bind the tool call to the same assistant message id the eventual
    // TEXT_MESSAGE_START uses so the message id stays stable mid-stream (#477).
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_tf', status: 'in_progress' },
        },
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call_tf',
            name: 'lookup_weather',
            arguments: { location: 'Berlin' },
          },
        },
        { event_type: 'step.stop', index: 0 },
        {
          event_type: 'step.delta',
          index: 1,
          delta: { type: 'text', text: 'It is sunny.' },
        },
        {
          event_type: 'interaction.completed',
          interaction: { id: 'int_tf', status: 'completed' },
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
        messages: [{ role: 'user', content: 'Weather in Berlin?' }],
        tools: [weatherTool],
      }),
    )

    const textStart = chunks.find((c) => c.type === 'TEXT_MESSAGE_START')
    const toolStart = chunks.find((c) => c.type === 'TOOL_CALL_START')

    expect(textStart?.type).toBe('TEXT_MESSAGE_START')
    expect(toolStart?.type).toBe('TOOL_CALL_START')
    if (
      textStart?.type === 'TEXT_MESSAGE_START' &&
      toolStart?.type === 'TOOL_CALL_START'
    ) {
      expect(toolStart.parentMessageId).toBe(textStart.messageId)
    }
  })

  it('serializes tool results as function_result content blocks', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_followup', status: 'in_progress' },
        },
        {
          event_type: 'interaction.completed',
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
        // Tool-result continuations require a prior interaction id; the
        // server already has the assistant turn, the client only re-sends
        // the function_result.
        modelOptions: {
          previous_interaction_id: 'int_prev',
        } as GeminiTextInteractionsProviderOptions,
      }),
    )

    const [payload] = mocks.interactionsCreateSpy.mock.calls[0]!
    expect(payload.input).toContainEqual(
      expect.objectContaining({
        type: 'function_result',
        call_id: 'call_1',
        name: 'lookup_weather',
        result: '{"tempC":22}',
      }),
    )
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
          event_type: 'interaction.created',
          interaction: { id: 'int_builtins', status: 'in_progress' },
        },
        {
          event_type: 'interaction.completed',
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

    const [payload] = mocks.interactionsCreateSpy.mock.calls[0]!
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
          event_type: 'interaction.created',
          interaction: { id: 'int_fs', status: 'in_progress' },
        },
        {
          event_type: 'interaction.completed',
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

    const [payload] = mocks.interactionsCreateSpy.mock.calls[0]!
    expect(payload.tools).toEqual([
      {
        type: 'file_search',
        file_search_store_names: ['fileSearchStores/my-store'],
        top_k: 5,
        metadata_filter: 'kind="faq"',
      },
    ])
  })

  it('strips empty `required: []` arrays from tool parameter schemas', async () => {
    // The live Interactions API rejects tool parameter schemas that
    // contain an empty `required` array with the misleading top-level
    // error "value at top-level must be a list". The adapter must strip
    // those instances before sending.
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_strip', status: 'in_progress' },
        },
        {
          event_type: 'interaction.completed',
          interaction: { id: 'int_strip', status: 'completed' },
        },
      ]),
    )

    const adapter = createAdapter()
    await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [
          {
            name: 'noArgs',
            description: 'A tool with no parameters',
            // Mirrors what zod-to-json-schema emits for `z.object({})`:
            // `properties: {}` and `required: []`. The `required: []`
            // is the poison.
            inputSchema: { type: 'object', properties: {}, required: [] },
          },
          {
            name: 'withRequired',
            description: 'A tool with one required param',
            inputSchema: {
              type: 'object',
              properties: { city: { type: 'string' } },
              required: ['city'],
            },
          },
        ] as Array<Tool>,
      }),
    )

    const [payload] = mocks.interactionsCreateSpy.mock.calls[0]!
    expect(payload.tools).toEqual([
      {
        type: 'function',
        name: 'noArgs',
        description: 'A tool with no parameters',
        // `required: []` stripped; `properties: {}` preserved.
        parameters: { type: 'object', properties: {} },
      },
      {
        type: 'function',
        name: 'withRequired',
        description: 'A tool with one required param',
        // Non-empty `required` is passed through unchanged.
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      },
    ])
  })

  it('surfaces built-in tool deltas as gemini.* CUSTOM events and keeps finish reason "stop"', async () => {
    mocks.interactionsCreateSpy.mockResolvedValue(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_search', status: 'in_progress' },
        },
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'google_search_call',
            id: 'call_gs_1',
            arguments: { queries: ['weather madrid'] },
          },
        },
        { event_type: 'step.stop', index: 0 },
        {
          event_type: 'step.start',
          index: 1,
          step: {
            type: 'google_search_result',
            call_id: 'call_gs_1',
            result: [{ search_suggestions: '<div>Madrid weather</div>' }],
          },
        },
        { event_type: 'step.stop', index: 1 },
        {
          event_type: 'step.start',
          index: 2,
          step: { type: 'model_output' },
        },
        {
          event_type: 'step.delta',
          index: 2,
          delta: { type: 'text', text: 'It is sunny.' },
        },
        { event_type: 'step.stop', index: 2 },
        {
          event_type: 'interaction.completed',
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
          event_type: 'interaction.created',
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
    // `chat({outputSchema, …no tools})` goes straight to structuredOutput;
    // no agent-loop chatStream first. So a single mocked Interaction
    // response is enough.
    mocks.interactionsCreateSpy.mockResolvedValueOnce({
      id: 'int_structured',
      status: 'completed',
      steps: [
        {
          type: 'model_output',
          content: [{ type: 'text', text: '{"foo":"bar"}' }],
        },
      ],
    })

    const adapter = createAdapter()
    const result = await chat({
      adapter,
      messages: [{ role: 'user', content: 'Give JSON' }],
      outputSchema: z.object({ foo: z.string() }),
    })

    expect(result).toEqual({ foo: 'bar' })

    expect(mocks.interactionsCreateSpy).toHaveBeenCalledTimes(1)
    const structuredPayload = mocks.interactionsCreateSpy.mock.calls[0]![0]
    // SDK 2.x: `response_mime_type` was removed; mime + schema now live
    // inside `response_format`.
    expect(structuredPayload.response_format).toMatchObject({
      type: 'text',
      mime_type: 'application/json',
    })
    expect(structuredPayload.stream).toBeUndefined()
  })

  // ===========================
  // interactionId map lifecycle
  // ===========================
  //
  // The adapter keeps a `Map<threadId, interactionId>` so multi-iteration
  // agent loops within one chatStream invocation, and the agentic-structured
  // composition (chatStream → structuredOutput), can chain via the
  // server-assigned id without the caller threading it. The tests below
  // pin the eviction policy: stale entries on the same threadId have
  // bitten this adapter before (see recent fixes to abandonment and the
  // tool_calls boundary in the commit log). Each test makes a second
  // `chat()` call on the same threadId and asserts the second outgoing
  // payload's `previous_interaction_id` — the only externally observable
  // signal of the Map's state.

  it('preserves the captured interactionId across iterations after RUN_FINISHED(tool_calls)', async () => {
    // First call: ends with tool_calls. Map MUST retain the id so the
    // next iteration on the same threadId can chain.
    mocks.interactionsCreateSpy.mockResolvedValueOnce(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_tool_chain', status: 'in_progress' },
        },
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call_x',
            name: 'lookup',
            arguments: { q: 'madrid' },
          },
        },
        { event_type: 'step.stop', index: 0 },
        {
          event_type: 'interaction.completed',
          interaction: {
            id: 'int_tool_chain',
            status: 'requires_action',
          },
        },
      ]),
    )
    // Second call: same threadId, no caller-provided previous_interaction_id.
    // Must carry the id from the first call.
    mocks.interactionsCreateSpy.mockResolvedValueOnce(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_after_tool', status: 'in_progress' },
        },
        {
          event_type: 'interaction.completed',
          interaction: { id: 'int_after_tool', status: 'completed' },
        },
      ]),
    )

    const adapter = createAdapter()
    await collectChunks(
      chat({
        adapter,
        threadId: 'thread_chain',
        messages: [{ role: 'user', content: 'Weather?' }],
        tools: [{ name: 'lookup', description: 'lookup' }],
      }),
    )
    await collectChunks(
      chat({
        adapter,
        threadId: 'thread_chain',
        messages: [
          { role: 'user', content: 'Weather?' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call_x',
                type: 'function',
                function: { name: 'lookup', arguments: '{"q":"madrid"}' },
              },
            ],
          },
          { role: 'tool', toolCallId: 'call_x', content: '{"tempC":22}' },
        ],
      }),
    )

    const secondPayload = mocks.interactionsCreateSpy.mock.calls[1]![0]
    expect(secondPayload.previous_interaction_id).toBe('int_tool_chain')
  })

  it('evicts the captured interactionId after a terminal RUN_FINISHED(stop)', async () => {
    mocks.interactionsCreateSpy.mockResolvedValueOnce(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_done', status: 'in_progress' },
        },
        {
          event_type: 'step.start',
          index: 0,
          step: { type: 'model_output' },
        },
        {
          event_type: 'step.delta',
          index: 0,
          delta: { type: 'text', text: 'done' },
        },
        { event_type: 'step.stop', index: 0 },
        {
          event_type: 'interaction.completed',
          interaction: { id: 'int_done', status: 'completed' },
        },
      ]),
    )
    mocks.interactionsCreateSpy.mockResolvedValueOnce(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_fresh', status: 'in_progress' },
        },
        {
          event_type: 'interaction.completed',
          interaction: { id: 'int_fresh', status: 'completed' },
        },
      ]),
    )

    const adapter = createAdapter()
    await collectChunks(
      chat({
        adapter,
        threadId: 'thread_stop',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    )
    await collectChunks(
      chat({
        adapter,
        threadId: 'thread_stop',
        messages: [{ role: 'user', content: 'Hello again' }],
      }),
    )

    const secondPayload = mocks.interactionsCreateSpy.mock.calls[1]![0]
    expect(secondPayload.previous_interaction_id).toBeUndefined()
  })

  it('evicts the captured interactionId after RUN_ERROR from an upstream error event', async () => {
    mocks.interactionsCreateSpy.mockResolvedValueOnce(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_err', status: 'in_progress' },
        },
        { event_type: 'error', error: { code: 500, message: 'boom' } },
      ]),
    )
    mocks.interactionsCreateSpy.mockResolvedValueOnce(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_recovery', status: 'in_progress' },
        },
        {
          event_type: 'interaction.completed',
          interaction: { id: 'int_recovery', status: 'completed' },
        },
      ]),
    )

    const adapter = createAdapter()
    await collectChunks(
      chat({
        adapter,
        threadId: 'thread_err',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    )
    await collectChunks(
      chat({
        adapter,
        threadId: 'thread_err',
        messages: [{ role: 'user', content: 'Try again' }],
      }),
    )

    const secondPayload = mocks.interactionsCreateSpy.mock.calls[1]![0]
    expect(secondPayload.previous_interaction_id).toBeUndefined()
  })

  it('evicts on truncation (SDK stream ends without interaction.complete or error) and seals open AG-UI state', async () => {
    // Mid-stream text + function_call deltas, then the SDK stream just
    // ends with no terminal event. The truncation fallback in chatStream
    // must yield a synthetic RUN_ERROR AND closeOpenState must seal the
    // open TEXT_MESSAGE_START / TOOL_CALL_START so downstream consumers
    // don't see orphaned `*_START` events without matching `*_END`.
    mocks.interactionsCreateSpy.mockResolvedValueOnce(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_trunc', status: 'in_progress' },
        },
        {
          event_type: 'step.start',
          index: 0,
          step: { type: 'model_output' },
        },
        {
          event_type: 'step.delta',
          index: 0,
          delta: { type: 'text', text: 'partial' },
        },
        {
          event_type: 'step.start',
          index: 1,
          step: {
            type: 'function_call',
            id: 'call_trunc',
            name: 'lookup',
            arguments: { q: 'x' },
          },
        },
        // (no interaction.complete, no error — also no step.stop for index 1)
      ]),
    )
    mocks.interactionsCreateSpy.mockResolvedValueOnce(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_after_trunc', status: 'in_progress' },
        },
        {
          event_type: 'interaction.completed',
          interaction: { id: 'int_after_trunc', status: 'completed' },
        },
      ]),
    )

    const adapter = createAdapter()
    const truncatedChunks = await collectChunks(
      chat({
        adapter,
        threadId: 'thread_trunc',
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [{ name: 'lookup', description: 'lookup' }],
      }),
    )

    // Truncation surfaces as RUN_ERROR rather than silently leaving
    // downstream waiting on a RUN_FINISHED that never arrives.
    const truncError = truncatedChunks.find(
      (c) => c.type === 'RUN_ERROR',
    ) as any
    expect(truncError).toBeDefined()
    expect(truncError.message).toMatch(/without a terminal event/i)

    // Open TEXT_MESSAGE_START / TOOL_CALL_START must be sealed before
    // the RUN_ERROR so the StreamProcessor sees a balanced event stream.
    const types = truncatedChunks.map((c) => c.type as string)
    const textStart = types.indexOf('TEXT_MESSAGE_START')
    const textEnd = types.indexOf('TEXT_MESSAGE_END')
    expect(textStart).toBeGreaterThanOrEqual(0)
    expect(textEnd).toBeGreaterThan(textStart)
    const toolStart = types.indexOf('TOOL_CALL_START')
    const toolEnd = types.indexOf('TOOL_CALL_END')
    expect(toolStart).toBeGreaterThanOrEqual(0)
    expect(toolEnd).toBeGreaterThan(toolStart)
    const runError = types.indexOf('RUN_ERROR')
    expect(textEnd).toBeLessThan(runError)
    expect(toolEnd).toBeLessThan(runError)

    await collectChunks(
      chat({
        adapter,
        threadId: 'thread_trunc',
        messages: [{ role: 'user', content: 'Try again' }],
      }),
    )

    const secondPayload = mocks.interactionsCreateSpy.mock.calls[1]![0]
    expect(secondPayload.previous_interaction_id).toBeUndefined()
  })

  it('evicts on consumer abandonment via generator .return() (upstream break)', async () => {
    // The consumer stops iterating mid-stream BEFORE any terminal event.
    // The chatStream `finally` block must evict, otherwise a follow-up
    // call on the same threadId would silently inherit a stale id from
    // a transcript the server never finished.
    mocks.interactionsCreateSpy.mockResolvedValueOnce(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_abandon', status: 'in_progress' },
        },
        {
          event_type: 'step.start',
          index: 0,
          step: { type: 'model_output' },
        },
        {
          event_type: 'step.delta',
          index: 0,
          delta: { type: 'text', text: 'first chunk' },
        },
        // (never reached — consumer breaks before this)
        {
          event_type: 'interaction.completed',
          interaction: { id: 'int_abandon', status: 'completed' },
        },
      ]),
    )
    mocks.interactionsCreateSpy.mockResolvedValueOnce(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_fresh_after_abandon', status: 'in_progress' },
        },
        {
          event_type: 'interaction.completed',
          interaction: {
            id: 'int_fresh_after_abandon',
            status: 'completed',
          },
        },
      ]),
    )

    const adapter = createAdapter()
    const stream = chat({
      adapter,
      threadId: 'thread_abandon',
      messages: [{ role: 'user', content: 'Hi' }],
    })
    for await (const chunk of stream) {
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') break
    }

    await collectChunks(
      chat({
        adapter,
        threadId: 'thread_abandon',
        messages: [{ role: 'user', content: 'Try again' }],
      }),
    )

    const secondPayload = mocks.interactionsCreateSpy.mock.calls[1]![0]
    expect(secondPayload.previous_interaction_id).toBeUndefined()
  })

  it('structuredOutput chains via the captured interactionId when composed after a chatStream on the same thread', async () => {
    // Regression: when an app composes a chatStream call (turn 1) and a
    // structured-output call (turn 2) on the same threadId with the
    // accumulated multi-turn history, the structured-output call must
    // pick up the id captured by chatStream. Otherwise
    // convertMessagesToInteractionsInput throws "cannot send prior
    // conversation history on a fresh interaction" on turn 2.
    //
    // Two mocked calls:
    //   1. Seed chatStream: a fresh single-user turn captures `int_seed`.
    //   2. structuredOutput on the seeded thread with multi-turn history.
    mocks.interactionsCreateSpy
      .mockResolvedValueOnce(
        mkStream([
          {
            event_type: 'interaction.created',
            interaction: { id: 'int_seed', status: 'in_progress' },
          },
          {
            event_type: 'step.start',
            index: 0,
            step: { type: 'model_output' },
          },
          {
            event_type: 'step.delta',
            index: 0,
            delta: { type: 'text', text: 'ack' },
          },
          { event_type: 'step.stop', index: 0 },
          {
            event_type: 'interaction.completed',
            interaction: { id: 'int_seed', status: 'completed' },
          },
        ]),
      )
      .mockResolvedValueOnce({
        id: 'int_struct',
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'text', text: '{"answer":"42"}' }],
          },
        ],
      })

    const adapter = createAdapter()

    // Seed: a fresh single-user turn captures int_seed in the Map.
    await collectChunks(
      chat({
        adapter,
        threadId: 'thread_agentic',
        messages: [{ role: 'user', content: 'Compute the answer.' }],
      }),
    )

    // Compose: structuredOutput on the same threadId with multi-turn
    // history. Caller did NOT pass `previous_interaction_id` —
    // structuredOutput must pull `int_seed` from the Map.
    const result = await chat({
      adapter,
      threadId: 'thread_agentic',
      messages: [
        { role: 'user', content: 'Compute the answer.' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'call_compute',
              type: 'function',
              function: { name: 'compute', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', toolCallId: 'call_compute', content: '42' },
      ],
      outputSchema: z.object({ answer: z.string() }),
    })

    expect(result).toEqual({ answer: '42' })
    const structuredPayload = mocks.interactionsCreateSpy.mock.calls[1]![0]
    expect(structuredPayload.previous_interaction_id).toBe('int_seed')
    expect(structuredPayload.response_format).toMatchObject({
      type: 'text',
      mime_type: 'application/json',
    })
  })

  it('evicts on consumer abandonment AFTER RUN_FINISHED(tool_calls) — the tool-iteration that never happens', async () => {
    // Specifically guards against the regression from commit efc9394f:
    // a RUN_FINISHED(tool_calls) sets `sawTerminalEvent = true` and the
    // in-loop deliberately keeps the entry for the next iteration. If
    // the consumer then abandons (no next iteration), the finally block
    // must still evict — otherwise the entry leaks indefinitely.
    mocks.interactionsCreateSpy.mockResolvedValueOnce(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: { id: 'int_tool_abandon', status: 'in_progress' },
        },
        {
          event_type: 'step.start',
          index: 0,
          step: {
            type: 'function_call',
            id: 'call_y',
            name: 'lookup',
            arguments: { q: 'x' },
          },
        },
        { event_type: 'step.stop', index: 0 },
        {
          event_type: 'interaction.completed',
          interaction: {
            id: 'int_tool_abandon',
            status: 'requires_action',
          },
        },
      ]),
    )
    mocks.interactionsCreateSpy.mockResolvedValueOnce(
      mkStream([
        {
          event_type: 'interaction.created',
          interaction: {
            id: 'int_recovery_after_tool_abandon',
            status: 'in_progress',
          },
        },
        {
          event_type: 'interaction.completed',
          interaction: {
            id: 'int_recovery_after_tool_abandon',
            status: 'completed',
          },
        },
      ]),
    )

    const adapter = createAdapter()
    const stream = chat({
      adapter,
      threadId: 'thread_tool_abandon',
      messages: [{ role: 'user', content: 'Weather?' }],
      tools: [{ name: 'lookup', description: 'lookup' }],
    })
    for await (const chunk of stream) {
      // Abandon right after the run finishes with tool_calls — exactly
      // the spot where `sawTerminalEvent` is `true` but the entry was
      // intentionally retained.
      if (chunk.type === 'RUN_FINISHED') break
    }

    await collectChunks(
      chat({
        adapter,
        threadId: 'thread_tool_abandon',
        messages: [{ role: 'user', content: 'Different question' }],
      }),
    )

    const secondPayload = mocks.interactionsCreateSpy.mock.calls[1]![0]
    expect(secondPayload.previous_interaction_id).toBeUndefined()
  })
})
