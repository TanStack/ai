import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { ResponsesRequest$outboundSchema } from '@openrouter/sdk/models'
import { createOpenRouterResponsesText } from '../src/adapters/responses-text'
import { webSearchTool } from '../src/tools/web-search-tool'
import type { StreamChunk, Tool } from '@tanstack/ai'

const testLogger = resolveDebugOption(false)
let mockSend: any
let lastOpenRouterConfig: any

vi.mock('@openrouter/sdk', async () => {
  return {
    OpenRouter: class {
      constructor(config?: unknown) {
        lastOpenRouterConfig = config
      }
      beta = {
        responses: {
          send: (...args: Array<unknown>) => mockSend(...args),
        },
      }
    },
  }
})

const createAdapter = () =>
  createOpenRouterResponsesText('openai/gpt-4o-mini', 'test-key')

const weatherTool: Tool = {
  name: 'lookup_weather',
  description: 'Return the forecast for a location',
}

function createAsyncIterable<T>(chunks: Array<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0
      return {
        // eslint-disable-next-line @typescript-eslint/require-await
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

function setupMockSdkClient(
  streamEvents: Array<Record<string, unknown>>,
  nonStreamResult?: Record<string, unknown>,
) {
  mockSend = vi.fn().mockImplementation((params) => {
    if (params.responsesRequest?.stream) {
      return Promise.resolve(createAsyncIterable(streamEvents))
    }
    return Promise.resolve(nonStreamResult)
  })
}

describe('OpenRouter responses adapter — request shape', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps options into the Responses API payload (snake → camel)', async () => {
    setupMockSdkClient([
      {
        type: 'response.completed',
        sequenceNumber: 1,
        response: {
          model: 'openai/gpt-4o-mini',
          output: [],
          usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        },
      },
    ])

    const adapter = createAdapter()

    for await (const _ of chat({
      adapter,
      systemPrompts: ['Stay concise'],
      messages: [{ role: 'user', content: 'How is the weather?' }],
      tools: [weatherTool],
      temperature: 0.25,
      topP: 0.6,
      maxTokens: 1024,
      modelOptions: { toolChoice: 'auto' as any },
    })) {
      // consume
    }

    expect(mockSend).toHaveBeenCalledTimes(1)
    const [rawParams] = mockSend.mock.calls[0]!
    const params = rawParams.responsesRequest

    // Top-level camelCase keys reach the SDK.
    expect(params.model).toBe('openai/gpt-4o-mini')
    expect(params.temperature).toBe(0.25)
    expect(params.topP).toBe(0.6)
    expect(params.maxOutputTokens).toBe(1024)
    expect(params.toolChoice).toBe('auto')
    expect(params.instructions).toBe('Stay concise')
    expect(params.stream).toBe(true)

    // Tools land in OpenRouter's flat Responses function-tool shape.
    expect(Array.isArray(params.tools)).toBe(true)
    expect(params.tools[0]).toMatchObject({
      type: 'function',
      name: 'lookup_weather',
    })

    // The wire-format outboundSchema must accept the params — if camelCase
    // keys are still snake_case (silently stripped by Zod), this throws.
    const serialized = ResponsesRequest$outboundSchema.parse(params)
    expect(serialized).toHaveProperty('model', 'openai/gpt-4o-mini')
    expect(serialized).toHaveProperty('temperature', 0.25)
    expect(serialized).toHaveProperty('top_p', 0.6)
    expect(serialized).toHaveProperty('max_output_tokens', 1024)
    expect(serialized).toHaveProperty('tool_choice', 'auto')
  })

  it('walks input[] camel-casing call_id and image_url so Zod does not strip them', async () => {
    setupMockSdkClient([
      {
        type: 'response.completed',
        sequenceNumber: 1,
        response: {
          model: 'openai/gpt-4o-mini',
          output: [],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
      },
    ])

    const adapter = createAdapter()
    for await (const _ of chat({
      adapter,
      messages: [
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call_abc',
              type: 'function',
              function: { name: 'lookup_weather', arguments: '{"x":1}' },
            },
          ],
        },
        { role: 'tool', toolCallId: 'call_abc', content: '{"temp":72}' },
      ],
    })) {
      // consume
    }

    const params = mockSend.mock.calls[0]![0].responsesRequest
    const fcOutput = params.input.find(
      (i: any) => i.type === 'function_call_output',
    )
    // call_id was snake_case from the base; we must hand the SDK camelCase
    // or Zod silently strips it and the tool result detaches from its call.
    expect(fcOutput).toBeDefined()
    expect(fcOutput.callId).toBe('call_abc')
    expect(fcOutput).not.toHaveProperty('call_id')
  })

  it('applies modelOptions.variant as a `:suffix` to the model id', async () => {
    setupMockSdkClient([
      {
        type: 'response.completed',
        sequenceNumber: 1,
        response: {
          model: 'openai/gpt-4o-mini:thinking',
          output: [],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
      },
    ])
    const adapter = createAdapter()
    for await (const _ of chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      modelOptions: { variant: 'thinking' as any },
    })) {
      // consume
    }
    const params = mockSend.mock.calls[0]![0].responsesRequest
    expect(params.model).toBe('openai/gpt-4o-mini:thinking')
  })

  it('rejects webSearchTool() as RUN_ERROR pointing at the chat adapter', async () => {
    const adapter = createAdapter()
    const ws = webSearchTool() as unknown as Tool
    const events: Array<StreamChunk> = []
    for await (const evt of adapter.chatStream({
      model: 'openai/gpt-4o-mini' as any,
      messages: [{ role: 'user', content: 'hi' }],
      tools: [ws],
      logger: testLogger,
    })) {
      events.push(evt)
    }
    const runError = events.find(
      (e): e is Extract<StreamChunk, { type: typeof EventType.RUN_ERROR }> =>
        e.type === EventType.RUN_ERROR,
    )
    expect(runError).toBeDefined()
    expect(runError!.message).toMatch(/openRouterText/)
  })

  it('falls back audio URL → input_file (chat-completions audio input is base64-only)', async () => {
    setupMockSdkClient([
      {
        type: 'response.completed',
        sequenceNumber: 1,
        response: {
          model: 'm',
          output: [],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
      },
    ])
    const adapter = createAdapter()
    for await (const _ of chat({
      adapter,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'audio',
              source: {
                type: 'url',
                value: 'https://example.com/clip.mp3',
              } as any,
            } as any,
          ],
        },
      ],
    })) {
      // consume
    }
    const params = mockSend.mock.calls[0]![0].responsesRequest
    const userMsg = params.input.find((i: any) => i.role === 'user')
    expect(userMsg).toBeDefined()
    const audioPart = userMsg.content.find((p: any) => p.type === 'input_file')
    expect(audioPart).toBeDefined()
    expect(audioPart.fileUrl).toBe('https://example.com/clip.mp3')
  })

  it('builds fileData data URI for inline document parts', async () => {
    setupMockSdkClient([
      {
        type: 'response.completed',
        sequenceNumber: 1,
        response: {
          model: 'm',
          output: [],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
      },
    ])
    const adapter = createAdapter()
    for await (const _ of chat({
      adapter,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'data',
                value: 'aGVsbG8=',
                mimeType: 'application/pdf',
              } as any,
            } as any,
          ],
        },
      ],
    })) {
      // consume
    }
    const params = mockSend.mock.calls[0]![0].responsesRequest
    const userMsg = params.input.find((i: any) => i.role === 'user')
    const docPart = userMsg.content.find((p: any) => p.type === 'input_file')
    expect(docPart).toBeDefined()
    expect(docPart.fileData).toBe('data:application/pdf;base64,aGVsbG8=')
    // Survives the SDK's outbound Zod schema (key strip would drop fileData)
    const serialized = ResponsesRequest$outboundSchema.parse(params)
    expect(JSON.stringify(serialized)).toContain(
      'data:application/pdf;base64,aGVsbG8=',
    )
  })

  it('defaults image data-URI mimeType to application/octet-stream when omitted', async () => {
    setupMockSdkClient([
      {
        type: 'response.completed',
        sequenceNumber: 1,
        response: {
          model: 'm',
          output: [],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
      },
    ])
    const adapter = createAdapter()
    for await (const _ of chat({
      adapter,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'data', value: 'aGVsbG8=' } as any,
            } as any,
          ],
        },
      ],
    })) {
      // consume
    }
    const params = mockSend.mock.calls[0]![0].responsesRequest
    const userMsg = params.input.find((i: any) => i.role === 'user')
    const imgPart = userMsg.content.find((p: any) => p.type === 'input_image')
    expect(imgPart).toBeDefined()
    expect(imgPart.imageUrl).toBe(
      'data:application/octet-stream;base64,aGVsbG8=',
    )
  })

  it('routes video parts as input_video with camelCase videoUrl that survives Zod', async () => {
    setupMockSdkClient([
      {
        type: 'response.completed',
        sequenceNumber: 1,
        response: {
          model: 'm',
          output: [],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
      },
    ])
    const adapter = createAdapter()
    for await (const _ of chat({
      adapter,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'video',
              source: { value: 'https://example.com/v.mp4' } as any,
            } as any,
          ],
        },
      ],
    })) {
      // consume
    }
    const params = mockSend.mock.calls[0]![0].responsesRequest
    const userMsg = params.input.find((i: any) => i.role === 'user')
    const videoPart = userMsg.content.find((p: any) => p.type === 'input_video')
    expect(videoPart).toBeDefined()
    expect(videoPart.videoUrl).toBe('https://example.com/v.mp4')
    // The outbound schema would strip the camelCase videoUrl if the converter
    // emitted snake_case (or any other key shape).
    const serialized = ResponsesRequest$outboundSchema.parse(params)
    expect(JSON.stringify(serialized)).toContain('https://example.com/v.mp4')
  })

  it('stringifies object-shaped assistant tool-call arguments for the SDK', async () => {
    setupMockSdkClient([
      {
        type: 'response.completed',
        sequenceNumber: 1,
        response: {
          model: 'm',
          output: [],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
      },
    ])
    const adapter = createAdapter()
    for await (const _ of chat({
      adapter,
      messages: [
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call_obj',
              type: 'function',
              function: {
                name: 'lookup_weather',
                arguments: { location: 'Berlin' } as any,
              },
            },
          ],
        },
        { role: 'tool', toolCallId: 'call_obj', content: '{"temp":72}' },
      ],
    })) {
      // consume
    }
    const params = mockSend.mock.calls[0]![0].responsesRequest
    const fnCall = params.input.find(
      (i: any) => i.type === 'function_call' && i.callId === 'call_obj',
    )
    expect(fnCall).toBeDefined()
    expect(typeof fnCall.arguments).toBe('string')
    expect(JSON.parse(fnCall.arguments)).toEqual({ location: 'Berlin' })
  })

  it('extracts text from array-shaped tool message content rather than JSON-stringifying parts', async () => {
    setupMockSdkClient([
      {
        type: 'response.completed',
        sequenceNumber: 1,
        response: {
          model: 'm',
          output: [],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
      },
    ])
    const adapter = createAdapter()
    for await (const _ of chat({
      adapter,
      messages: [
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call_arr',
              type: 'function',
              function: { name: 'lookup_weather', arguments: '{}' },
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'call_arr',
          content: [
            { type: 'text', content: '{"temp":' } as any,
            { type: 'text', content: '72}' } as any,
          ] as any,
        },
      ],
    })) {
      // consume
    }
    const params = mockSend.mock.calls[0]![0].responsesRequest
    const fcOutput = params.input.find(
      (i: any) => i.type === 'function_call_output',
    )
    expect(fcOutput).toBeDefined()
    expect(fcOutput.output).toBe('{"temp":72}')
    expect(fcOutput.output).not.toContain('"type"')
  })

  it('throws on inline document data via chat-completions adapter (rejects base64 PDF inline)', async () => {
    // Cross-adapter assertion: the chat-completions sibling must throw on
    // inline document data so callers know to use the Responses adapter.
    const { createOpenRouterText } = await import('../src/adapters/text')
    const chatAdapter = createOpenRouterText('openai/gpt-4o-mini' as any, 'k')
    const events: Array<StreamChunk> = []
    for await (const evt of chatAdapter.chatStream({
      model: 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'data', value: 'aGVsbG8=' } as any,
            } as any,
          ],
        },
      ],
      logger: testLogger,
    })) {
      events.push(evt)
    }
    const runError = events.find(
      (e): e is Extract<StreamChunk, { type: typeof EventType.RUN_ERROR }> =>
        e.type === EventType.RUN_ERROR,
    )
    expect(runError).toBeDefined()
    expect(runError!.message.toLowerCase()).toMatch(
      /inline.*document|document.*inline|responses adapter/,
    )
  })
})

describe('OpenRouter responses adapter — stream event bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes text deltas through TEXT_MESSAGE_* lifecycle', async () => {
    setupMockSdkClient([
      {
        type: 'response.created',
        sequenceNumber: 0,
        response: { model: 'm', output: [] },
      },
      {
        type: 'response.output_text.delta',
        sequenceNumber: 1,
        itemId: 'msg_1',
        outputIndex: 0,
        contentIndex: 0,
        delta: 'Hello ',
      },
      {
        type: 'response.output_text.delta',
        sequenceNumber: 2,
        itemId: 'msg_1',
        outputIndex: 0,
        contentIndex: 0,
        delta: 'world',
      },
      {
        type: 'response.completed',
        sequenceNumber: 3,
        response: {
          model: 'm',
          output: [],
          usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        },
      },
    ])
    const adapter = createAdapter()
    const chunks: Array<StreamChunk> = []
    for await (const c of chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      chunks.push(c)
    }

    const text = chunks.filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
    expect(text.map((c: any) => c.delta)).toEqual(['Hello ', 'world'])

    const finished = chunks.find((c) => c.type === 'RUN_FINISHED') as any
    expect(finished).toBeDefined()
    // Usage shape is mapped from camel to snake before the base reads it.
    expect(finished.usage).toEqual({
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    })
  })

  it('routes function-call args through TOOL_CALL_START/ARGS/END', async () => {
    setupMockSdkClient([
      {
        type: 'response.created',
        sequenceNumber: 0,
        response: { model: 'm', output: [] },
      },
      {
        type: 'response.output_item.added',
        sequenceNumber: 1,
        outputIndex: 0,
        item: {
          type: 'function_call',
          id: 'item_1',
          callId: 'call_abc',
          name: 'lookup_weather',
          arguments: '',
        },
      },
      {
        type: 'response.function_call_arguments.delta',
        sequenceNumber: 2,
        itemId: 'item_1',
        outputIndex: 0,
        delta: '{"location":"Berlin"}',
      },
      {
        type: 'response.function_call_arguments.done',
        sequenceNumber: 3,
        itemId: 'item_1',
        outputIndex: 0,
        arguments: '{"location":"Berlin"}',
      },
      {
        type: 'response.completed',
        sequenceNumber: 4,
        response: {
          model: 'm',
          output: [{ type: 'function_call' }],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
      },
    ])

    const adapter = createAdapter()
    const chunks: Array<StreamChunk> = []
    for await (const c of chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      tools: [weatherTool],
    })) {
      chunks.push(c)
    }

    const start = chunks.find((c) => c.type === 'TOOL_CALL_START') as any
    expect(start).toMatchObject({
      type: 'TOOL_CALL_START',
      toolCallId: 'item_1',
      toolCallName: 'lookup_weather',
    })

    const args = chunks.filter((c) => c.type === 'TOOL_CALL_ARGS') as any[]
    expect(args.length).toBe(1)
    expect(args[0]!.delta).toBe('{"location":"Berlin"}')

    const end = chunks.find((c) => c.type === 'TOOL_CALL_END') as any
    expect(end.input).toEqual({ location: 'Berlin' })

    const finished = chunks.find((c) => c.type === 'RUN_FINISHED') as any
    expect(finished.finishReason).toBe('tool_calls')
  })

  it('surfaces response.failed with a RUN_ERROR carrying the error message + code', async () => {
    setupMockSdkClient([
      {
        type: 'response.created',
        sequenceNumber: 0,
        response: { model: 'm', output: [] },
      },
      {
        type: 'response.failed',
        sequenceNumber: 1,
        response: {
          model: 'm',
          output: [],
          error: { message: 'kaboom', code: 'server_error' },
        },
      },
    ])
    const adapter = createAdapter()
    const chunks: Array<StreamChunk> = []
    for await (const c of adapter.chatStream({
      model: 'openai/gpt-4o-mini' as any,
      messages: [{ role: 'user', content: 'hi' }],
      logger: testLogger,
    })) {
      chunks.push(c)
    }
    const err = chunks.find((c) => c.type === 'RUN_ERROR') as any
    expect(err).toBeDefined()
    expect(err.error.message).toBe('kaboom')
    expect(err.error.code).toBe('server_error')
    // RUN_ERROR is terminal — no synthetic RUN_FINISHED should follow.
    expect(chunks.find((c) => c.type === 'RUN_FINISHED')).toBeUndefined()
  })

  it('stringifies non-string error.code on top-level error events', async () => {
    setupMockSdkClient([
      {
        type: 'response.created',
        sequenceNumber: 0,
        response: { model: 'm', output: [] },
      },
      {
        type: 'error',
        sequenceNumber: 1,
        message: 'rate limit',
        code: 429,
        param: null,
      },
    ])
    const adapter = createAdapter()
    const chunks: Array<StreamChunk> = []
    for await (const c of adapter.chatStream({
      model: 'openai/gpt-4o-mini' as any,
      messages: [{ role: 'user', content: 'hi' }],
      logger: testLogger,
    })) {
      chunks.push(c)
    }
    const err = chunks.find((c) => c.type === 'RUN_ERROR') as any
    expect(err).toBeDefined()
    expect(err.error.code).toBe('429')
  })

  it('drops object-shaped error.code rather than shipping "[object Object]"', async () => {
    setupMockSdkClient([
      {
        type: 'response.created',
        sequenceNumber: 0,
        response: { model: 'm', output: [] },
      },
      {
        type: 'response.failed',
        sequenceNumber: 1,
        response: {
          model: 'm',
          output: [],
          error: { message: 'malformed', code: { nested: 'oops' } as any },
        },
      },
    ])
    const adapter = createAdapter()
    const chunks: Array<StreamChunk> = []
    for await (const c of adapter.chatStream({
      model: 'openai/gpt-4o-mini' as any,
      messages: [{ role: 'user', content: 'hi' }],
      logger: testLogger,
    })) {
      chunks.push(c)
    }
    const err = chunks.find((c) => c.type === 'RUN_ERROR') as any
    expect(err).toBeDefined()
    expect(err.message).toBe('malformed')
    // Object-shaped code must fall through to undefined rather than being
    // stringified as "[object Object]" — the typeof narrowing matches
    // normalizeCode's contract in toRunErrorPayload.
    expect(err.code).toBeUndefined()
    expect(err.error.code).toBeUndefined()
  })

  it('stringifies non-string error.code on response.failed events', async () => {
    setupMockSdkClient([
      {
        type: 'response.created',
        sequenceNumber: 0,
        response: { model: 'm', output: [] },
      },
      {
        type: 'response.failed',
        sequenceNumber: 1,
        response: {
          model: 'm',
          output: [],
          error: { message: 'upstream auth failed', code: 401 },
        },
      },
    ])
    const adapter = createAdapter()
    const chunks: Array<StreamChunk> = []
    for await (const c of adapter.chatStream({
      model: 'openai/gpt-4o-mini' as any,
      messages: [{ role: 'user', content: 'hi' }],
      logger: testLogger,
    })) {
      chunks.push(c)
    }
    const err = chunks.find((c) => c.type === 'RUN_ERROR') as any
    expect(err).toBeDefined()
    expect(err.message).toBe('upstream auth failed')
    // Provider code must survive as a string so `toRunErrorPayload`'s
    // string-only `code` filter doesn't drop it on the way through.
    expect(err.code).toBe('401')
    expect(err.error.code).toBe('401')
  })

  it('does not emit further lifecycle events after a top-level error event', async () => {
    setupMockSdkClient([
      {
        type: 'response.created',
        sequenceNumber: 0,
        response: { model: 'm', output: [] },
      },
      {
        type: 'response.output_item.added',
        sequenceNumber: 1,
        outputIndex: 0,
        item: { type: 'message', id: 'msg_1', role: 'assistant' },
      },
      {
        type: 'response.output_text.delta',
        sequenceNumber: 2,
        itemId: 'msg_1',
        outputIndex: 0,
        contentIndex: 0,
        delta: 'partial ',
      },
      // Top-level error mid-stream — terminal.
      {
        type: 'error',
        sequenceNumber: 3,
        message: 'rate limit',
        code: 429,
        param: null,
      },
      // The adapter MUST NOT process anything after the error event;
      // these chunks would otherwise yield TEXT_MESSAGE_CONTENT / END
      // events past the terminal RUN_ERROR.
      {
        type: 'response.output_text.delta',
        sequenceNumber: 4,
        itemId: 'msg_1',
        outputIndex: 0,
        contentIndex: 0,
        delta: 'after-error',
      },
      {
        type: 'response.output_text.done',
        sequenceNumber: 5,
        itemId: 'msg_1',
        outputIndex: 0,
        contentIndex: 0,
        text: 'partial after-error',
      },
    ])
    const adapter = createAdapter()
    const chunks: Array<StreamChunk> = []
    for await (const c of adapter.chatStream({
      model: 'openai/gpt-4o-mini' as any,
      messages: [{ role: 'user', content: 'hi' }],
      logger: testLogger,
    })) {
      chunks.push(c)
    }

    const errIndex = chunks.findIndex((c) => c.type === 'RUN_ERROR')
    expect(errIndex).toBeGreaterThanOrEqual(0)
    // No content/lifecycle events emitted after RUN_ERROR.
    const post = chunks.slice(errIndex + 1)
    expect(post).toEqual([])
    // The first delta's content reached the consumer; the second did not.
    const allContent = chunks
      .filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
      .map((c: any) => c.delta)
      .join('')
    expect(allContent).toBe('partial ')
    expect(allContent).not.toContain('after-error')
  })
})

describe('OpenRouter responses adapter — structured output', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('preserves null values in structured output (does not strip nulls)', async () => {
    // Non-streaming Responses API result with a `null` field in the parsed
    // JSON. The base default `transformStructuredOutput` would convert
    // nulls to undefined; the OpenRouter override must keep them intact
    // so consumers that discriminate "field present but null" from
    // "field absent" see the null sentinel the upstream returned.
    setupMockSdkClient([], {
      id: 'resp_1',
      model: 'openai/gpt-4o-mini',
      output: [
        {
          type: 'message',
          id: 'msg_1',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                name: 'Alice',
                age: 30,
                nickname: null,
              }),
            },
          ],
        },
      ],
      usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
    })

    const adapter = createAdapter()
    const result = await adapter.structuredOutput({
      chatOptions: {
        model: 'openai/gpt-4o-mini' as any,
        messages: [{ role: 'user', content: 'profile?' }],
        logger: testLogger,
      },
      outputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          nickname: { type: ['string', 'null'] },
        },
        required: ['name', 'age', 'nickname'],
      },
    })

    expect(result.data).toEqual({
      name: 'Alice',
      age: 30,
      nickname: null,
    })
    // Critical: nickname should be `null`, not `undefined`.
    expect((result.data as any).nickname).toBeNull()
  })
})

describe('OpenRouter responses adapter — SDK constructor wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lastOpenRouterConfig = undefined
  })

  it('forwards app-attribution headers (httpReferer, appTitle) to the SDK constructor', () => {
    void createOpenRouterResponsesText('openai/gpt-4o-mini', 'test-key', {
      httpReferer: 'https://app.example.com',
      appTitle: 'TestApp',
    } as any)
    expect(lastOpenRouterConfig).toBeDefined()
    expect(lastOpenRouterConfig.apiKey).toBe('test-key')
    expect(lastOpenRouterConfig.httpReferer).toBe('https://app.example.com')
    expect(lastOpenRouterConfig.appTitle).toBe('TestApp')
  })

  it('propagates the abort signal to the SDK call', async () => {
    setupMockSdkClient([
      {
        type: 'response.completed',
        sequenceNumber: 1,
        response: {
          model: 'm',
          output: [],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
      },
    ])
    const adapter = createAdapter()
    const controller = new AbortController()
    for await (const _ of adapter.chatStream({
      model: 'openai/gpt-4o-mini' as any,
      messages: [{ role: 'user', content: 'hi' }],
      logger: testLogger,
      request: { signal: controller.signal } as any,
    })) {
      // consume
    }
    const [, options] = mockSend.mock.calls[0]!
    expect(options.signal).toBe(controller.signal)
  })

  it('forwards caller-supplied request headers to the SDK call', async () => {
    setupMockSdkClient([
      {
        type: 'response.completed',
        sequenceNumber: 1,
        response: {
          model: 'm',
          output: [],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
      },
    ])
    const adapter = createAdapter()
    const headers = { 'X-Trace-Id': 'trace-r1' }
    for await (const _ of adapter.chatStream({
      model: 'openai/gpt-4o-mini' as any,
      messages: [{ role: 'user', content: 'hi' }],
      logger: testLogger,
      request: { headers } as any,
    })) {
      // consume
    }
    const [, options] = mockSend.mock.calls[0]!
    expect(options.headers).toEqual(headers)
  })
})
