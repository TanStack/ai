import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  chat,
  StreamProcessor,
  type Tool,
  type StreamChunk,
  type UIMessage,
} from '@tanstack/ai'
import { AnthropicTextAdapter } from '../src/adapters/text'
import type { AnthropicTextProviderOptions } from '../src/adapters/text'
import { ANTHROPIC_MAX_NONSTREAMING_TOKENS } from '../src/model-meta'
import { z } from 'zod'

const mocks = vi.hoisted(() => {
  const betaMessagesCreate = vi.fn()
  const messagesCreate = vi.fn()

  const client = {
    beta: {
      messages: {
        create: betaMessagesCreate,
      },
    },
    messages: {
      create: messagesCreate,
    },
  }

  return { betaMessagesCreate, messagesCreate, client }
})

vi.mock('@anthropic-ai/sdk', () => {
  const { client } = mocks

  class MockAnthropic {
    beta = client.beta
    messages = client.messages

    constructor(_: { apiKey: string }) {}
  }

  return { default: MockAnthropic }
})

const createAdapter = <TModel extends 'claude-opus-4-1'>(model: TModel) =>
  new AnthropicTextAdapter({ apiKey: 'test-key' }, model)

const toolArguments = JSON.stringify({ location: 'Berlin' })

const weatherTool: Tool = {
  name: 'lookup_weather',
  description: 'Return the weather for a city',
  inputSchema: z.object({
    location: z.string(),
  }),
}

function createTextStream(text: string) {
  return (async function* () {
    yield {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    }
    yield {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    }
    yield { type: 'content_block_stop', index: 0 }
    yield {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: 5 },
    }
    yield { type: 'message_stop' }
  })()
}

describe('Anthropic adapter option mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes systemPrompts as TextBlockParam[] for prompt caching support', async () => {
    const mockStream = (async function* () {
      yield {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      }
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 3 },
      }
      yield { type: 'message_stop' }
    })()

    mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream)

    const adapter = createAdapter('claude-opus-4-1')

    const chunks: StreamChunk[] = []
    for await (const chunk of chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      systemPrompts: ['You are a helpful assistant.', 'Be concise.'],
    })) {
      chunks.push(chunk)
    }

    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!

    // system should be an array of TextBlockParam, not a joined string
    expect(payload.system).toEqual([
      { type: 'text', text: 'You are a helpful assistant.' },
      { type: 'text', text: 'Be concise.' },
    ])
  })

  it('attaches cache_control to system TextBlockParams via systemPrompts metadata', async () => {
    const mockStream = (async function* () {
      yield {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'ok' },
      }
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 1 },
      }
      yield { type: 'message_stop' }
    })()

    mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream)

    const adapter = createAdapter('claude-opus-4-1')

    for await (const _ of chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      systemPrompts: [
        {
          content: 'Stable instructions — cache me.',
          // metadata is narrowed to AnthropicSystemPromptMetadata via the
          // adapter's `~types['systemPromptMetadata']` declaration — no
          // `satisfies` needed.
          metadata: { cache_control: { type: 'ephemeral', ttl: '5m' } },
        },
        'Volatile per-request instruction.',
      ],
    })) {
      // consume stream
    }

    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!

    // Object-form prompts attach their metadata cache_control; plain strings
    // produce a TextBlockParam with no cache_control.
    expect(payload.system).toEqual([
      {
        type: 'text',
        text: 'Stable instructions — cache me.',
        cache_control: { type: 'ephemeral', ttl: '5m' },
      },
      {
        type: 'text',
        text: 'Volatile per-request instruction.',
      },
    ])
  })

  it('drops unknown modelOptions keys (e.g. `system`) and warns via logger.error', async () => {
    const mockStream = (async function* () {
      yield {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'ok' },
      }
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 1 },
      }
      yield { type: 'message_stop' }
    })()

    mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream)

    const adapter = createAdapter('claude-opus-4-1')

    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    for await (const _ of chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      systemPrompts: ['real system prompt'],
      modelOptions: {
        system: 'ignored escape hatch',
        bogus_key: 'also ignored',
      } as unknown as AnthropicTextProviderOptions,
      debug: { logger, errors: true },
    })) {
      // consume stream
    }

    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!

    // systemPrompts wins; modelOptions.system was dropped.
    expect(payload.system).toEqual([
      { type: 'text', text: 'real system prompt' },
    ])
    // bogus_key did not leak into the request either.
    expect(payload).not.toHaveProperty('bogus_key')

    // The drop is loud — error fired with both keys named and a hint for `system`.
    expect(logger.error).toHaveBeenCalled()
    const errorCall = logger.error.mock.calls.find((call) =>
      String(call[0]).includes('dropped unknown modelOptions key'),
    )
    expect(errorCall).toBeDefined()
    const [, meta] = errorCall!
    expect((meta as { droppedKeys: Array<string> }).droppedKeys).toEqual(
      expect.arrayContaining(['system', 'bogus_key']),
    )
    expect((meta as { hint?: string }).hint).toMatch(/systemPrompts/)
  })

  it('maps normalized options and Anthropic provider settings', async () => {
    // Mock the streaming response
    const mockStream = (async function* () {
      yield {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'It will be sunny' },
      }
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 5 },
      }
      yield {
        type: 'message_stop',
      }
    })()

    mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream)

    const providerOptions = {
      container: {
        id: 'container-weather',
        skills: [{ skill_id: 'forecast', type: 'custom', version: '1' }],
      },
      mcp_servers: [
        {
          name: 'world-weather',
          url: 'https://mcp.example.com',
          type: 'url',
          authorization_token: 'secret',
          tool_configuration: {
            allowed_tools: ['lookup_weather'],
            enabled: true,
          },
        },
      ],
      service_tier: 'standard_only',
      stop_sequences: ['</done>'],
      thinking: { type: 'enabled', budget_tokens: 1500 },
      top_k: 5,
      max_tokens: 3000,
      temperature: 0.4,
    } satisfies AnthropicTextProviderOptions

    const adapter = createAdapter('claude-opus-4-1')

    // Consume the stream to trigger the API call
    const chunks: StreamChunk[] = []
    for await (const chunk of chat({
      adapter,
      messages: [
        { role: 'user', content: 'What is the forecast?' },
        {
          role: 'assistant',
          content: 'Checking',
          toolCalls: [
            {
              id: 'call_weather',
              type: 'function',
              function: { name: 'lookup_weather', arguments: toolArguments },
            },
          ],
        },
        { role: 'tool', toolCallId: 'call_weather', content: '{"temp":72}' },
      ],
      tools: [weatherTool],
      modelOptions: providerOptions,
    })) {
      chunks.push(chunk)
    }

    expect(mocks.betaMessagesCreate).toHaveBeenCalledTimes(1)
    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!

    expect(payload).toMatchObject({
      model: 'claude-opus-4-1',
      max_tokens: 3000,
      temperature: 0.4,
      container: providerOptions.container,
      mcp_servers: providerOptions.mcp_servers,
      service_tier: providerOptions.service_tier,
      stop_sequences: providerOptions.stop_sequences,
      thinking: providerOptions.thinking,
      top_k: providerOptions.top_k,
    })
    expect(payload.stream).toBe(true)

    expect(payload.messages).toEqual([
      {
        role: 'user',
        content: 'What is the forecast?',
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Checking' },
          {
            type: 'tool_use',
            id: 'call_weather',
            name: 'lookup_weather',
            input: { location: 'Berlin' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call_weather',
            content: '{"temp":72}',
          },
        ],
      },
    ])

    expect(payload.tools?.[0]).toMatchObject({
      name: 'lookup_weather',
      type: 'custom',
    })
  })

  it('sources temperature and max_tokens from modelOptions', async () => {
    mocks.betaMessagesCreate.mockResolvedValueOnce(createTextStream('ok'))

    const adapter = createAdapter('claude-opus-4-1')

    for await (const _ of chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      modelOptions: {
        temperature: 0.4,
        max_tokens: 2048,
      } satisfies AnthropicTextProviderOptions,
    })) {
      // consume stream
    }

    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!
    expect(payload.temperature).toBe(0.4)
    expect(payload.max_tokens).toBe(2048)
  })

  it('does not warn about dropped keys when max_tokens is passed via modelOptions', async () => {
    mocks.betaMessagesCreate.mockResolvedValueOnce(createTextStream('ok'))

    const adapter = createAdapter('claude-opus-4-1')

    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    for await (const _ of chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      modelOptions: {
        max_tokens: 2048,
      } satisfies AnthropicTextProviderOptions,
      debug: { logger, errors: true },
    })) {
      // consume stream
    }

    // max_tokens is read via the dedicated defaultMaxTokens path; it must not
    // be flagged as an unknown/dropped modelOptions key.
    const droppedKeyError = logger.error.mock.calls.find((call) =>
      String(call[0]).includes('dropped unknown modelOptions key'),
    )
    expect(droppedKeyError).toBeUndefined()

    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!
    expect(payload.max_tokens).toBe(2048)
  })

  it('sources top_p from modelOptions', async () => {
    // top_p is mutually exclusive with temperature, so exercise it alone.
    mocks.betaMessagesCreate.mockResolvedValueOnce(createTextStream('ok'))

    const adapter = createAdapter('claude-opus-4-1')

    for await (const _ of chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      modelOptions: {
        top_p: 0.7,
      } satisfies AnthropicTextProviderOptions,
    })) {
      // consume stream
    }

    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!
    expect(payload.top_p).toBe(0.7)
  })

  it("defaults max_tokens to the model's max_output_tokens when not provided via modelOptions (#849)", async () => {
    mocks.betaMessagesCreate.mockResolvedValueOnce(createTextStream('ok'))

    const adapter = createAdapter('claude-opus-4-1')

    for await (const _ of chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      // consume stream
    }

    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!
    // claude-opus-4-1's model-meta max_output_tokens is 64_000 — not the old
    // hard-coded 1024 floor that silently truncated long responses.
    expect(payload.max_tokens).toBe(64_000)
  })

  it('warns when the default max_tokens cap truncates the response (#849)', async () => {
    // Stream that ends with stop_reason: "max_tokens" — the model hit the cap.
    const truncatedStream = (async function* () {
      yield {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'partial output' },
      }
      yield { type: 'content_block_stop', index: 0 }
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'max_tokens' },
        usage: { output_tokens: 64_000 },
      }
      yield { type: 'message_stop' }
    })()
    mocks.betaMessagesCreate.mockResolvedValueOnce(truncatedStream)

    const adapter = createAdapter('claude-opus-4-1')

    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    for await (const _ of chat({
      adapter,
      messages: [{ role: 'user', content: 'Write a long essay' }],
      debug: { logger, errors: true },
    })) {
      // consume stream
    }

    const truncationWarning = logger.warn.mock.calls.find((call) =>
      String(call[0]).includes('truncated at the default max_tokens'),
    )
    expect(truncationWarning).toBeDefined()
  })

  it('does not warn about truncation when the caller set max_tokens explicitly (#849)', async () => {
    const truncatedStream = (async function* () {
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'max_tokens' },
        usage: { output_tokens: 100 },
      }
      yield { type: 'message_stop' }
    })()
    mocks.betaMessagesCreate.mockResolvedValueOnce(truncatedStream)

    const adapter = createAdapter('claude-opus-4-1')

    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    for await (const _ of chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      modelOptions: { max_tokens: 100 } satisfies AnthropicTextProviderOptions,
      debug: { logger, errors: true },
    })) {
      // consume stream
    }

    const truncationWarning = logger.warn.mock.calls.find((call) =>
      String(call[0]).includes('truncated at the default max_tokens'),
    )
    expect(truncationWarning).toBeUndefined()
  })

  it('clamps the default max_tokens on the non-streaming structured-output path so it never trips the SDK 10-minute guard (#849)', async () => {
    // The structured-output fallback issues a NON-streaming
    // `messages.create({ stream: false })`. The Anthropic SDK throws
    // "Streaming is required for operations that may take longer than 10
    // minutes" once max_tokens exceeds ~21_333, so the defaulted ceiling must
    // be clamped here even though the streaming chat path keeps the full 64K.
    mocks.betaMessagesCreate.mockResolvedValueOnce({
      id: 'msg_structured',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-4-1',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_structured_output',
          name: 'structured_output',
          input: { recommendation: 'Strat', price: 1299 },
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, output_tokens: 20 },
    })

    const adapter = createAdapter('claude-opus-4-1')

    for await (const _ of chat({
      adapter,
      messages: [{ role: 'user', content: 'recommend a guitar as json' }],
      outputSchema: z.object({
        recommendation: z.string(),
        price: z.number(),
      }),
      stream: true,
    })) {
      // consume stream
    }

    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!
    expect(payload.stream).toBe(false)
    // Clamped to the non-streaming limit — NOT claude-opus-4-1's full 64K
    // streaming ceiling, which would make the SDK throw before the request.
    expect(payload.max_tokens).toBe(ANTHROPIC_MAX_NONSTREAMING_TOKENS)
    expect(payload.max_tokens).toBeLessThanOrEqual(21_333)
  })

  it('native combined mode (#605): wires outputSchema into output_format alongside tools on Claude 4.5+', async () => {
    // Final-turn JSON the model emits when output_format is in play.
    const finalJson = JSON.stringify({ city: 'Berlin', temp: 18 })

    mocks.betaMessagesCreate.mockResolvedValueOnce(
      (async function* () {
        yield {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        }
        yield {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: finalJson },
        }
        yield { type: 'content_block_stop', index: 0 }
        yield {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 8 },
        }
        yield { type: 'message_stop' }
      })(),
    )

    const adapter = new AnthropicTextAdapter(
      { apiKey: 'test-key' },
      'claude-sonnet-4-5',
    )
    expect(adapter.supportsCombinedToolsAndSchema()).toBe(true)

    const ForecastSchema = z.object({
      city: z.string(),
      temp: z.number(),
    })

    const result = await chat({
      adapter,
      messages: [{ role: 'user', content: 'forecast for Berlin' }],
      tools: [weatherTool],
      outputSchema: ForecastSchema,
    })

    expect(result).toEqual({ city: 'Berlin', temp: 18 })

    expect(mocks.betaMessagesCreate).toHaveBeenCalledTimes(1)
    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!
    expect(payload).toMatchObject({
      model: 'claude-sonnet-4-5',
      output_config: {
        format: {
          type: 'json_schema',
          schema: expect.objectContaining({ type: 'object' }),
        },
      },
    })
    expect(payload.tools?.[0]).toMatchObject({
      name: 'lookup_weather',
    })
    // No second beta.messages.create — the engine harvested from the agent
    // loop and did NOT issue a separate finalization call.
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
  })

  it('native combined mode (#605): pre-4.5 models keep the forced-tool finalization path', async () => {
    const adapter = new AnthropicTextAdapter(
      { apiKey: 'test-key' },
      'claude-opus-4-1',
    )
    expect(adapter.supportsCombinedToolsAndSchema()).toBe(false)
  })

  it('native combined mode (#605): claude-sonnet-5, claude-fable-5, and claude-opus-4-8 use the single-request path', () => {
    const sonnet5 = new AnthropicTextAdapter(
      { apiKey: 'test-key' },
      'claude-sonnet-5',
    )
    expect(sonnet5.supportsCombinedToolsAndSchema()).toBe(true)

    const fable5 = new AnthropicTextAdapter(
      { apiKey: 'test-key' },
      'claude-fable-5',
    )
    expect(fable5.supportsCombinedToolsAndSchema()).toBe(true)

    const opus48 = new AnthropicTextAdapter(
      { apiKey: 'test-key' },
      'claude-opus-4-8',
    )
    expect(opus48.supportsCombinedToolsAndSchema()).toBe(true)
  })

  it('merges consecutive user messages when tool results precede a follow-up user message', async () => {
    // This is the core multi-turn bug: after a tool call + result, the next user message
    // creates consecutive role:'user' messages (tool_result as user + new user message).
    // Anthropic's API requires strictly alternating user/assistant roles.
    const mockStream = (async function* () {
      yield {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Here is a recommendation' },
      }
      yield {
        type: 'content_block_stop',
        index: 0,
      }
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 10 },
      }
      yield { type: 'message_stop' }
    })()

    mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream)

    const adapter = createAdapter('claude-opus-4-1')

    // Multi-turn: user -> assistant(tool_calls) -> tool_result -> follow-up user
    const chunks: StreamChunk[] = []
    for await (const chunk of chat({
      adapter,
      messages: [
        { role: 'user', content: 'What is the weather in Berlin?' },
        {
          role: 'assistant',
          content: 'Let me check the weather.',
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'lookup_weather', arguments: toolArguments },
            },
          ],
        },
        { role: 'tool', toolCallId: 'call_1', content: '{"temp":72}' },
        { role: 'user', content: 'What about Paris?' },
      ],
      tools: [weatherTool],
    })) {
      chunks.push(chunk)
    }

    expect(mocks.betaMessagesCreate).toHaveBeenCalledTimes(1)
    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!

    // The tool_result (user) and follow-up user message should be merged into one user message
    expect(payload.messages).toEqual([
      {
        role: 'user',
        content: 'What is the weather in Berlin?',
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me check the weather.' },
          {
            type: 'tool_use',
            id: 'call_1',
            name: 'lookup_weather',
            input: { location: 'Berlin' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call_1',
            content: '{"temp":72}',
          },
          { type: 'text', text: 'What about Paris?' },
        ],
      },
    ])

    // Verify roles strictly alternate: user, assistant, user
    const roles = payload.messages.map((m: any) => m.role)
    for (let i = 1; i < roles.length; i++) {
      expect(roles[i]).not.toBe(roles[i - 1])
    }
  })

  it('replays signed thinking blocks before tool use in multi-turn history', async () => {
    mocks.betaMessagesCreate.mockResolvedValueOnce(
      createTextStream('Follow-up answer'),
    )

    const adapter = createAdapter('claude-opus-4-1')

    const chunks: StreamChunk[] = []
    for await (const chunk of chat({
      adapter,
      messages: [
        { role: 'user', content: 'What is the weather in Berlin?' },
        {
          role: 'assistant',
          content: null,
          thinking: [
            {
              content: 'Need to fetch weather before answering.',
              signature: 'signed-thinking-1',
            },
          ],
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'lookup_weather', arguments: toolArguments },
            },
          ],
        },
        { role: 'tool', toolCallId: 'call_1', content: '{"temp":72}' },
        { role: 'user', content: 'What should I wear?' },
      ],
      tools: [weatherTool],
      modelOptions: {
        thinking: { type: 'enabled', budget_tokens: 1024 },
      } satisfies AnthropicTextProviderOptions,
    })) {
      chunks.push(chunk)
    }

    expect(mocks.betaMessagesCreate).toHaveBeenCalledTimes(1)
    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!

    expect(payload.betas).toEqual(['interleaved-thinking-2025-05-14'])
    expect(payload.messages[1].content).toEqual([
      {
        type: 'thinking',
        thinking: 'Need to fetch weather before answering.',
        signature: 'signed-thinking-1',
      },
      {
        type: 'tool_use',
        id: 'call_1',
        name: 'lookup_weather',
        input: { location: 'Berlin' },
      },
    ])
  })

  it('replays signed thinking blocks for assistant messages without tool calls', async () => {
    mocks.betaMessagesCreate.mockResolvedValueOnce(
      createTextStream('Next answer'),
    )

    const adapter = createAdapter('claude-opus-4-1')

    const chunks: StreamChunk[] = []
    for await (const chunk of chat({
      adapter,
      messages: [
        { role: 'user', content: 'Think then answer.' },
        {
          role: 'assistant',
          content: 'Prior answer.',
          thinking: [
            {
              content: 'Prior signed thinking.',
              signature: 'signed-thinking-text-only',
            },
          ],
        },
        { role: 'user', content: 'Continue.' },
      ],
      modelOptions: {
        thinking: { type: 'enabled', budget_tokens: 1024 },
      } satisfies AnthropicTextProviderOptions,
    })) {
      chunks.push(chunk)
    }

    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!

    expect(payload.messages[1].content).toEqual([
      {
        type: 'thinking',
        thinking: 'Prior signed thinking.',
        signature: 'signed-thinking-text-only',
      },
      { type: 'text', text: 'Prior answer.' },
    ])
  })

  it('merges multiple consecutive tool result messages into one user message', async () => {
    // When multiple tools are called, each tool result becomes a role:'user' message.
    // These must be merged into a single user message.
    const mockStream = (async function* () {
      yield {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Here are the results' },
      }
      yield {
        type: 'content_block_stop',
        index: 0,
      }
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 5 },
      }
      yield { type: 'message_stop' }
    })()

    mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream)

    const adapter = createAdapter('claude-opus-4-1')

    const chunks: StreamChunk[] = []
    for await (const chunk of chat({
      adapter,
      messages: [
        { role: 'user', content: 'Weather in Berlin and Paris?' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call_berlin',
              type: 'function',
              function: {
                name: 'lookup_weather',
                arguments: JSON.stringify({ location: 'Berlin' }),
              },
            },
            {
              id: 'call_paris',
              type: 'function',
              function: {
                name: 'lookup_weather',
                arguments: JSON.stringify({ location: 'Paris' }),
              },
            },
          ],
        },
        { role: 'tool', toolCallId: 'call_berlin', content: '{"temp":72}' },
        { role: 'tool', toolCallId: 'call_paris', content: '{"temp":68}' },
      ],
      tools: [weatherTool],
    })) {
      chunks.push(chunk)
    }

    expect(mocks.betaMessagesCreate).toHaveBeenCalledTimes(1)
    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!

    // Both tool results should be merged into a single user message
    expect(payload.messages).toEqual([
      {
        role: 'user',
        content: 'Weather in Berlin and Paris?',
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'call_berlin',
            name: 'lookup_weather',
            input: { location: 'Berlin' },
          },
          {
            type: 'tool_use',
            id: 'call_paris',
            name: 'lookup_weather',
            input: { location: 'Paris' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call_berlin',
            content: '{"temp":72}',
          },
          {
            type: 'tool_result',
            tool_use_id: 'call_paris',
            content: '{"temp":68}',
          },
        ],
      },
    ])

    // Verify roles strictly alternate
    const roles = payload.messages.map((m: any) => m.role)
    for (let i = 1; i < roles.length; i++) {
      expect(roles[i]).not.toBe(roles[i - 1])
    }
  })

  it('handles full multi-turn flow with duplicate tool results, empty assistant, and follow-up', async () => {
    // This reproduces the exact bug scenario from the testing panel:
    // 1. Assistant calls getGuitars + recommendGuitar (with text)
    // 2. Tool results include duplicates (from both tool-result and tool-call output)
    // 3. An empty assistant message exists (from the client tool round-trip)
    // 4. User sends a follow-up message
    // All of: duplicates, empty assistant, consecutive user messages must be handled.
    const mockStream = (async function* () {
      yield {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Electric guitars available' },
      }
      yield { type: 'content_block_stop', index: 0 }
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 5 },
      }
      yield { type: 'message_stop' }
    })()

    mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream)

    const adapter = createAdapter('claude-opus-4-1')

    const chunks: StreamChunk[] = []
    for await (const chunk of chat({
      adapter,
      messages: [
        { role: 'user', content: "what's a good acoustic guitar?" },
        {
          role: 'assistant',
          content: "I'll help you find a good acoustic guitar!",
          toolCalls: [
            {
              id: 'toolu_getGuitars',
              type: 'function',
              function: { name: 'getGuitars', arguments: '' },
            },
            {
              id: 'toolu_recommend',
              type: 'function',
              function: {
                name: 'recommendGuitar',
                arguments: '{"id": 7}',
              },
            },
          ],
        },
        // Tool result from tool-result part
        {
          role: 'tool',
          toolCallId: 'toolu_getGuitars',
          content: '[{"id":7,"name":"Guitar"}]',
        },
        // Tool result from tool-result part
        {
          role: 'tool',
          toolCallId: 'toolu_recommend',
          content: '{"id":7}',
        },
        // DUPLICATE tool result from tool-call output field
        {
          role: 'tool',
          toolCallId: 'toolu_recommend',
          content: '{"id":7}',
        },
        // Empty assistant from client tool round-trip
        { role: 'assistant', content: null },
        // User follow-up
        { role: 'user', content: "what's a good electric guitar?" },
      ],
      tools: [weatherTool],
    })) {
      chunks.push(chunk)
    }

    expect(mocks.betaMessagesCreate).toHaveBeenCalledTimes(1)
    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!

    // Verify: no consecutive same-role messages, no empty assistants, no duplicate tool_results
    const roles = payload.messages.map((m: any) => m.role)
    for (let i = 1; i < roles.length; i++) {
      expect(roles[i]).not.toBe(roles[i - 1])
    }

    // Should have exactly 3 messages: user, assistant, user (merged tool results + follow-up)
    expect(payload.messages).toHaveLength(3)
    expect(payload.messages[0].role).toBe('user')
    expect(payload.messages[1].role).toBe('assistant')
    expect(payload.messages[2].role).toBe('user')

    // The merged user message should have tool results (de-duplicated) + follow-up text
    const lastUserContent = payload.messages[2].content
    expect(Array.isArray(lastUserContent)).toBe(true)

    // Count tool_result blocks - should have 2 (one per tool), not 3 (no duplicate)
    const toolResultBlocks = lastUserContent.filter(
      (b: any) => b.type === 'tool_result',
    )
    expect(toolResultBlocks).toHaveLength(2)

    // Should have the follow-up text
    const textBlocks = lastUserContent.filter((b: any) => b.type === 'text')
    expect(textBlocks).toHaveLength(1)
    expect(textBlocks[0].text).toBe("what's a good electric guitar?")
  })

  it('filters out empty assistant messages from conversation history', async () => {
    // An empty assistant message (from a previous failed request) should be filtered out.
    const mockStream = (async function* () {
      yield {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Response' },
      }
      yield {
        type: 'content_block_stop',
        index: 0,
      }
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 3 },
      }
      yield { type: 'message_stop' }
    })()

    mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream)

    const adapter = createAdapter('claude-opus-4-1')

    const chunks: StreamChunk[] = []
    for await (const chunk of chat({
      adapter,
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: '' }, // Empty assistant from failed request
        { role: 'user', content: 'Try again' },
      ],
    })) {
      chunks.push(chunk)
    }

    expect(mocks.betaMessagesCreate).toHaveBeenCalledTimes(1)
    const [payload] = mocks.betaMessagesCreate.mock.calls[0]!

    // The empty assistant message should be filtered out, and consecutive
    // user messages should be merged
    expect(payload.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: 'Try again' },
        ],
      },
    ])
  })
})

describe('Anthropic stream processing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not emit duplicate RUN_FINISHED from message_stop after message_delta', async () => {
    // message_delta with stop_reason already emits RUN_FINISHED.
    // message_stop should NOT emit another one.
    const mockStream = (async function* () {
      yield {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      }
      yield {
        type: 'content_block_stop',
        index: 0,
      }
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 3 },
      }
      yield { type: 'message_stop' }
    })()

    mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream)

    const adapter = createAdapter('claude-opus-4-1')

    const chunks: StreamChunk[] = []
    for await (const chunk of chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      chunks.push(chunk)
    }

    // Should have exactly ONE RUN_FINISHED event (from message_delta), not two
    const runFinished = chunks.filter((c) => c.type === 'RUN_FINISHED')
    expect(runFinished).toHaveLength(1)
    expect(runFinished[0]).toMatchObject({
      type: 'RUN_FINISHED',
    })
  })

  it('does not leak server_tool_use input deltas into the prior client tool', async () => {
    const mockStream = (async function* () {
      yield {
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'tool_use',
          id: 'tool_client',
          name: 'lookup_weather',
        },
      }
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"location":"Berlin"}',
        },
      }
      yield { type: 'content_block_stop', index: 0 }
      yield {
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'server_tool_use',
          id: 'srv_fetch',
          name: 'web_fetch',
        },
      }
      yield {
        type: 'content_block_delta',
        index: 1,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"url":"https://example.com"}',
        },
      }
      yield { type: 'content_block_stop', index: 1 }
      yield {
        type: 'content_block_start',
        index: 2,
        content_block: {
          type: 'web_fetch_tool_result',
          tool_use_id: 'srv_fetch',
          content: {
            type: 'web_fetch_result',
            url: 'https://example.com',
            content: { type: 'document', source: { type: 'text', data: 'ok' } },
            retrieved_at: '2026-01-01T00:00:00Z',
          },
        },
      }
      yield { type: 'content_block_stop', index: 2 }
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'tool_use' },
        usage: { output_tokens: 10 },
      }
      yield { type: 'message_stop' }
    })()

    mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream)

    const adapter = createAdapter('claude-opus-4-1')

    const chunks: StreamChunk[] = []
    for await (const chunk of chat({
      adapter,
      messages: [{ role: 'user', content: 'Weather + fetch' }],
      tools: [weatherTool],
    })) {
      chunks.push(chunk)
    }

    // The client tool's input must NOT absorb the server tool's deltas.
    const clientEnd = chunks.find(
      (c) =>
        c.type === 'TOOL_CALL_END' &&
        (c as { toolCallId: string }).toolCallId === 'tool_client',
    )
    expect(clientEnd).toMatchObject({
      toolCallId: 'tool_client',
      input: { location: 'Berlin' },
    })

    // The server tool now round-trips as a provider-executed tool call carrying
    // its own input plus the raw result block.
    const serverStart = chunks.find(
      (c) =>
        c.type === 'TOOL_CALL_START' &&
        (c as { toolCallId: string }).toolCallId === 'srv_fetch',
    ) as (StreamChunk & { metadata?: Record<string, unknown> }) | undefined
    expect(serverStart).toBeDefined()
    expect(serverStart!.metadata).toMatchObject({
      providerExecuted: true,
      anthropic: {
        serverToolType: 'web_fetch',
        resultBlockType: 'web_fetch_tool_result',
      },
    })
    const serverEnd = chunks.find(
      (c) =>
        c.type === 'TOOL_CALL_END' &&
        (c as { toolCallId: string }).toolCallId === 'srv_fetch',
    )
    expect(serverEnd).toMatchObject({
      toolCallId: 'srv_fetch',
      input: { url: 'https://example.com' },
    })
  })

  it.each([
    [
      'web_fetch',
      'web_fetch_tool_result',
      {
        type: 'web_fetch_result',
        url: 'https://example.com',
        content: { type: 'document', source: { type: 'text', data: 'ok' } },
        retrieved_at: '2026-01-01T00:00:00Z',
      },
    ],
    [
      'web_search',
      'web_search_tool_result',
      [
        {
          type: 'web_search_result',
          encrypted_content: 'enc',
          page_age: null,
          title: 'Example',
          url: 'https://example.com',
        },
      ],
    ],
  ] as const)(
    'emits a provider-executed tool call for a server-only %s response with no prior client tool_use',
    async (toolName, resultType, resultContent) => {
      // With no prior client tool_use, currentToolIndex is -1; the server tool
      // must emit its own provider-executed call without crashing or colliding
      // with a phantom client tool call.
      const mockStream = (async function* () {
        yield {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'server_tool_use',
            id: 'srv_only',
            name: toolName,
          },
        }
        yield {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"url":"https://example.com"}',
          },
        }
        yield { type: 'content_block_stop', index: 0 }
        yield {
          type: 'content_block_start',
          index: 1,
          content_block: {
            type: resultType,
            tool_use_id: 'srv_only',
            content: resultContent,
          },
        }
        yield { type: 'content_block_stop', index: 1 }
        yield {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 5 },
        }
        yield { type: 'message_stop' }
      })()

      mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream)

      const adapter = createAdapter('claude-opus-4-1')

      const chunks: StreamChunk[] = []
      for await (const chunk of chat({
        adapter,
        messages: [{ role: 'user', content: 'Use the server tool' }],
      })) {
        chunks.push(chunk)
      }

      const start = chunks.find((c) => c.type === 'TOOL_CALL_START') as
        | (StreamChunk & { metadata?: Record<string, unknown> })
        | undefined
      expect(start).toMatchObject({
        toolCallId: 'srv_only',
        toolCallName: toolName,
      })
      expect(start!.metadata).toMatchObject({
        providerExecuted: true,
        anthropic: {
          serverToolType: toolName,
          resultBlockType: resultType,
          result: resultContent,
        },
      })

      const end = chunks.find((c) => c.type === 'TOOL_CALL_END')
      expect(end).toMatchObject({
        toolCallId: 'srv_only',
        input: { url: 'https://example.com' },
      })

      const runFinished = chunks.filter((c) => c.type === 'RUN_FINISHED')
      expect(runFinished).toHaveLength(1)
    },
  )

  it('round-trips web_search evidence across turns (issue #839)', async () => {
    // Turn 1: thinking + server_tool_use(web_search) + result + final text.
    const searchResults = [
      {
        type: 'web_search_result',
        encrypted_content: 'enc-1',
        page_age: null,
        title: 'Defense Drone Market',
        url: 'https://example.com/drones',
      },
    ]
    const turn1 = (async function* () {
      yield {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking', thinking: '' },
      }
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'I should search.' },
      }
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'signature_delta', signature: 'sig-abc' },
      }
      yield { type: 'content_block_stop', index: 0 }
      yield {
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'server_tool_use',
          id: 'srv_search',
          name: 'web_search',
        },
      }
      yield {
        type: 'content_block_delta',
        index: 1,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"query":"defense drone market"}',
        },
      }
      yield { type: 'content_block_stop', index: 1 }
      yield {
        type: 'content_block_start',
        index: 2,
        content_block: {
          type: 'web_search_tool_result',
          tool_use_id: 'srv_search',
          content: searchResults,
        },
      }
      yield { type: 'content_block_stop', index: 2 }
      yield {
        type: 'content_block_start',
        index: 3,
        content_block: { type: 'text', text: '' },
      }
      yield {
        type: 'content_block_delta',
        index: 3,
        delta: { type: 'text_delta', text: 'Found one source.' },
      }
      yield { type: 'content_block_stop', index: 3 }
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 20 },
      }
      yield { type: 'message_stop' }
    })()

    mocks.betaMessagesCreate.mockResolvedValueOnce(turn1)

    const adapter = createAdapter('claude-opus-4-1')

    const firstMessages = [
      { role: 'user' as const, content: 'Search the drone market.' },
    ]
    // Seed the processor with the same (ModelMessage-shaped) messages passed to
    // chat() — exactly the pattern from issue #839. The processor must tolerate
    // these parts-less entries.
    const processor = new StreamProcessor({
      initialMessages: firstMessages as unknown as Array<UIMessage>,
    })
    for await (const chunk of chat({ adapter, messages: firstMessages })) {
      processor.processChunk(chunk)
    }
    processor.finalizeStream()

    const afterTurn1 = processor.getMessages()
    const assistant = afterTurn1.find((m) => m.role === 'assistant')
    // The assistant message carries the server tool as a provider-executed
    // tool-call part with the raw result on its metadata.
    const serverPart = assistant?.parts.find(
      (p) => p.type === 'tool-call' && p.id === 'srv_search',
    )
    expect(serverPart).toBeDefined()
    expect((serverPart as { metadata?: unknown }).metadata).toMatchObject({
      providerExecuted: true,
      anthropic: {
        serverToolType: 'web_search',
        resultBlockType: 'web_search_tool_result',
        result: searchResults,
      },
    })

    // Turn 2: replay prior messages + a new user turn. Assert the request the
    // adapter sends preserves the server_tool_use + result blocks.
    mocks.betaMessagesCreate.mockResolvedValueOnce(createTextStream('Sources:'))

    for await (const _ of chat({
      adapter,
      messages: [
        ...afterTurn1,
        { role: 'user', content: 'List the sources you used.' },
      ],
    })) {
      // consume
    }

    expect(mocks.betaMessagesCreate).toHaveBeenCalledTimes(2)
    const [secondPayload] = mocks.betaMessagesCreate.mock.calls[1]!
    const replayedAssistant = (
      secondPayload.messages as Array<{
        role: string
        content: unknown
      }>
    ).find((m) => m.role === 'assistant')
    expect(Array.isArray(replayedAssistant?.content)).toBe(true)
    const blocks = replayedAssistant!.content as Array<{ type: string }>
    const serverToolUse = blocks.find((b) => b.type === 'server_tool_use')
    const resultBlock = blocks.find((b) => b.type === 'web_search_tool_result')
    expect(serverToolUse).toMatchObject({
      type: 'server_tool_use',
      id: 'srv_search',
      name: 'web_search',
      input: { query: 'defense drone market' },
    })
    expect(resultBlock).toMatchObject({
      type: 'web_search_tool_result',
      tool_use_id: 'srv_search',
      content: searchResults,
    })
  })

  it('logs an error when a server tool result block carries an error variant', async () => {
    // A failed web_fetch (e.g. url_not_accessible) is otherwise invisible —
    // the model just keeps going. Surface it via the debug logger.
    const mockStream = (async function* () {
      yield {
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'server_tool_use',
          id: 'srv_err',
          name: 'web_fetch',
        },
      }
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"url":"https://blocked.example"}',
        },
      }
      yield { type: 'content_block_stop', index: 0 }
      yield {
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'web_fetch_tool_result',
          tool_use_id: 'srv_err',
          content: {
            type: 'web_fetch_tool_result_error',
            error_code: 'url_not_accessible',
          },
        },
      }
      yield { type: 'content_block_stop', index: 1 }
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 5 },
      }
      yield { type: 'message_stop' }
    })()

    mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream)

    const adapter = createAdapter('claude-opus-4-1')

    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    for await (const _ of chat({
      adapter,
      messages: [{ role: 'user', content: 'Fetch it' }],
      debug: { logger, errors: true },
    })) {
      // consume stream
    }

    const errorCall = logger.error.mock.calls.find((call) =>
      String(call[0]).includes('web_fetch_tool_result'),
    )
    expect(errorCall).toBeDefined()
    expect(errorCall![1]).toMatchObject({
      toolUseId: 'srv_err',
      errorCode: 'url_not_accessible',
    })
  })

  it('does not emit TEXT_MESSAGE_END for tool_use content blocks', async () => {
    // When text is followed by a tool_use block, TEXT_MESSAGE_END should only
    // fire once (for the text block), not again when the tool block stops.
    const mockStream = (async function* () {
      // Text block
      yield {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Let me check' },
      }
      yield { type: 'content_block_stop', index: 0 }
      // Tool use block
      yield {
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'tool_use',
          id: 'tool_1',
          name: 'lookup_weather',
        },
      }
      yield {
        type: 'content_block_delta',
        index: 1,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"location":"Berlin"}',
        },
      }
      yield { type: 'content_block_stop', index: 1 }
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'tool_use' },
        usage: { output_tokens: 10 },
      }
      yield { type: 'message_stop' }
    })()

    mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream)

    const adapter = createAdapter('claude-opus-4-1')

    const chunks: StreamChunk[] = []
    for await (const chunk of chat({
      adapter,
      messages: [{ role: 'user', content: 'Weather in Berlin?' }],
      tools: [weatherTool],
    })) {
      chunks.push(chunk)
    }

    // TEXT_MESSAGE_END should appear exactly once (for the text block)
    const textMessageEnds = chunks.filter((c) => c.type === 'TEXT_MESSAGE_END')
    expect(textMessageEnds).toHaveLength(1)

    // RUN_FINISHED should appear exactly once (from message_delta with tool_use)
    const runFinished = chunks.filter((c) => c.type === 'RUN_FINISHED')
    expect(runFinished).toHaveLength(1)
    expect(runFinished[0]).toMatchObject({
      type: 'RUN_FINISHED',
    })
  })

  it('emits parentMessageId on tool-first tool call chunks', async () => {
    const mockStream = (async function* () {
      yield {
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'tool_use',
          id: 'toolu_weather',
          name: 'lookup_weather',
          input: {},
        },
      }
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"location":"Berlin"}',
        },
      }
      yield { type: 'content_block_stop', index: 0 }
      yield {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'text', text: '' },
      }
      yield {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'text_delta', text: 'It is sunny.' },
      }
      yield { type: 'content_block_stop', index: 1 }
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 7 },
      }
      yield { type: 'message_stop' }
    })()

    mocks.betaMessagesCreate.mockResolvedValueOnce(mockStream)

    const adapter = createAdapter('claude-opus-4-1')

    const chunks: StreamChunk[] = []
    for await (const chunk of chat({
      adapter,
      messages: [{ role: 'user', content: 'What is the weather in Berlin?' }],
      tools: [weatherTool],
    })) {
      chunks.push(chunk)
    }

    const textStart = chunks.find(
      (chunk): chunk is Extract<StreamChunk, { type: 'TEXT_MESSAGE_START' }> =>
        chunk.type === 'TEXT_MESSAGE_START',
    )
    const toolStart = chunks.find(
      (chunk): chunk is Extract<StreamChunk, { type: 'TOOL_CALL_START' }> =>
        chunk.type === 'TOOL_CALL_START',
    )

    expect(textStart).toBeDefined()
    expect(toolStart).toBeDefined()
    expect(toolStart?.parentMessageId).toBe(textStart?.messageId)
  })
})

describe('Anthropic adapter error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("forwards the SDK error's `.error` body as RUN_ERROR.rawEvent", async () => {
    const providerBody = { type: 'rate_limit_error', message: 'slow down' }
    mocks.betaMessagesCreate.mockRejectedValueOnce(
      Object.assign(new Error('429'), {
        status: 429,
        error: providerBody,
      }),
    )

    const adapter = createAdapter('claude-opus-4-1')
    const chunks: StreamChunk[] = []
    for await (const chunk of adapter.chatStream({
      model: 'claude-opus-4-1',
      messages: [{ role: 'user', content: 'hi' }],
      logger: { request: () => {}, errors: () => {} } as any,
    })) {
      chunks.push(chunk)
    }

    const runError = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(runError).toBeDefined()
    if (runError?.type === 'RUN_ERROR') {
      expect(runError.rawEvent).toEqual(providerBody)
      expect(runError.code).toBe('429')
    }
  })
})
