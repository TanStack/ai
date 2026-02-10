import { describe, it, expect, beforeEach, vi } from 'vitest'
import { chat, type Tool, type StreamChunk } from '@tanstack/ai'
import { AnthropicTextAdapter } from '../src/adapters/text'
import type { AnthropicTextProviderOptions } from '../src/adapters/text'
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

const createAdapter = <TModel extends 'claude-3-7-sonnet-20250219'>(
  model: TModel,
) => new AnthropicTextAdapter({ apiKey: 'test-key' }, model)

const toolArguments = JSON.stringify({ location: 'Berlin' })

const weatherTool: Tool = {
  name: 'lookup_weather',
  description: 'Return the weather for a city',
  inputSchema: z.object({
    location: z.string(),
  }),
}

describe('Anthropic adapter option mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
      system: 'Respond with JSON',
    } satisfies AnthropicTextProviderOptions & { system: string }

    const adapter = createAdapter('claude-3-7-sonnet-20250219')

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
      maxTokens: 3000,
      temperature: 0.4,
      modelOptions: providerOptions,
    })) {
      chunks.push(chunk)
    }

    expect(mocks.betaMessagesCreate).toHaveBeenCalledTimes(1)
    const [payload] = mocks.betaMessagesCreate.mock.calls[0]

    expect(payload).toMatchObject({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 3000,
      temperature: 0.4,
      container: providerOptions.container,
      mcp_servers: providerOptions.mcp_servers,
      service_tier: providerOptions.service_tier,
      stop_sequences: providerOptions.stop_sequences,
      thinking: providerOptions.thinking,
      top_k: providerOptions.top_k,
      system: providerOptions.system,
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

    const adapter = createAdapter('claude-3-7-sonnet-20250219')

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
    const [payload] = mocks.betaMessagesCreate.mock.calls[0]

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

    const adapter = createAdapter('claude-3-7-sonnet-20250219')

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
    const [payload] = mocks.betaMessagesCreate.mock.calls[0]

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

    const adapter = createAdapter('claude-3-7-sonnet-20250219')

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
    const [payload] = mocks.betaMessagesCreate.mock.calls[0]

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

    const adapter = createAdapter('claude-3-7-sonnet-20250219')

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
    const [payload] = mocks.betaMessagesCreate.mock.calls[0]

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

    const adapter = createAdapter('claude-3-7-sonnet-20250219')

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
      finishReason: 'stop',
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

    const adapter = createAdapter('claude-3-7-sonnet-20250219')

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
      finishReason: 'tool_calls',
    })
  })
})
