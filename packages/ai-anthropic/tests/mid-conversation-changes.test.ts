import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createAnthropicChat, createAnthropicChatWithClient } from '../src'
import { AnthropicTextAdapter } from '../src/adapters/text'
import { ANTHROPIC_MODEL_MID_CONVERSATION_CHANNELS } from '../src/model-meta'
import { applyAnthropicPromptCache } from '../src/prompt-cache'
import { webSearchTool } from '../src/tools'
import { convertToolsToProviderFormat } from '../src/tools/tool-converter'
import type {
  MidConversationChanges,
  ModelMessage,
  TextOptions,
  Tool,
} from '@tanstack/ai'
import type { AnthropicTextConfig } from '../src/adapters/text'
import type { AnthropicChatModel } from '../src/model-meta'

const mocks = vi.hoisted(() => {
  const betaMessagesCreate = vi.fn()
  const client = {
    beta: { messages: { create: betaMessagesCreate } },
    messages: { create: vi.fn() },
  }
  return { betaMessagesCreate, client }
})

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    beta = mocks.client.beta
    messages = mocks.client.messages
    constructor(_: { apiKey: string }) {}
  }
  return { default: MockAnthropic }
})

const logger = resolveDebugOption(false)
const BETA = 'mid-conversation-tool-changes-2026-07-01'
const SHORT = { type: 'ephemeral' }

// A proxy in ANTHROPIC_BASE_URL on this machine would turn the default off.
// Clear it, so each test starts from Anthropic's own API.
beforeEach(() => {
  vi.stubEnv('ANTHROPIC_BASE_URL', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
})
const PLACEHOLDER = {
  name: '__tanstack_deferred_placeholder__',
  description: 'Reserved placeholder. Never available. Never call this.',
  input_schema: { type: 'object', properties: {}, required: [] },
  defer_loading: true,
}

function textStream() {
  return (async function* () {
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
    yield { type: 'content_block_stop', index: 0 }
    yield {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: 1 },
    }
    yield { type: 'message_stop' }
  })()
}

/** Run one call and give back the request body that the client got. */
async function send(
  model: AnthropicChatModel,
  options: Pick<
    TextOptions,
    | 'messages'
    | 'tools'
    | 'systemPrompts'
    | 'midConversationChanges'
    | 'promptCache'
  >,
  config: Omit<AnthropicTextConfig, 'apiKey'> = {},
) {
  mocks.betaMessagesCreate.mockClear()
  const adapter = new AnthropicTextAdapter(
    { apiKey: 'test-key', ...config },
    model,
  )
  for await (const chunk of adapter.chatStream({
    logger,
    model,
    ...options,
  })) {
    if (chunk.type === 'RUN_ERROR') throw new Error(chunk.message)
  }
  const [body] = mocks.betaMessagesCreate.mock.calls[0]!
  return body
}

const roles = (body: { messages: Array<{ role: string }> }) =>
  body.messages.map((message) => message.role)

const both = { tools: true, systemPrompts: true }
/** Configs that do not talk to Anthropic's own API. The Cloudflare binding
 *  route of the E2E app uses a custom `fetch`. */
const customEndpoints = [
  { baseURL: 'https://gateway.example.com' },
  { fetch: vi.fn() },
]
const injectedClient = { beta: { messages: { create: vi.fn() } } }

const lookup: Tool = { name: 'lookup', description: 'Look a thing up' }
const fetchPage: Tool = { name: 'fetch_page', description: 'Fetch a page' }

/** A user turn, an answer that called `lookup`, and the tool result. */
const toolTurn: Array<ModelMessage> = [
  { role: 'user', content: 'Find the page' },
  {
    role: 'assistant',
    content: null,
    toolCalls: [
      {
        id: 'call-1',
        type: 'function',
        function: { name: 'lookup', arguments: '{}' },
      },
    ],
  },
  { role: 'tool', toolCallId: 'call-1', content: 'https://example.com' },
]

/** After the tool result, `fetch_page` and a second prompt came. */
const endChange: MidConversationChanges = {
  start: { tools: ['lookup'], systemPrompts: 1 },
  changes: [{ before: 3, tools: ['fetch_page'], systemPrompts: 1 }],
}

describe('Anthropic mid-conversation channels', () => {
  it('gives the five models from pi both channels', () => {
    const models = [
      'claude-opus-4-8',
      'claude-opus-5',
      'claude-opus-5-5',
      'claude-fable-5',
      'claude-fable-5-1',
    ] as const
    expect(
      Object.keys(ANTHROPIC_MODEL_MID_CONVERSATION_CHANNELS).sort(),
    ).toEqual([...models].sort())
    for (const model of models) {
      expect(
        new AnthropicTextAdapter({ apiKey: 'test-key' }, model)
          .midConversationChannels,
      ).toEqual(both)
    }
  })

  it('is off by default with a custom baseURL, a custom fetch, or an injected client', () => {
    for (const endpoint of customEndpoints) {
      expect(
        createAnthropicChat('claude-opus-5-5', 'test-key', endpoint)
          .midConversationChannels,
      ).toBeUndefined()
    }
    // anthropicVertexText builds its adapter this way.
    expect(
      createAnthropicChatWithClient('claude-opus-5', injectedClient)
        .midConversationChannels,
    ).toBeUndefined()
  })

  it('is off by default when the SDK reads a proxy from ANTHROPIC_BASE_URL', () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://proxy.example.com')
    try {
      expect(
        createAnthropicChat('claude-opus-5-5', 'test-key')
          .midConversationChannels,
      ).toBeUndefined()
      expect(
        createAnthropicChat('claude-opus-5-5', 'test-key', {
          midConversationChannels: true,
        }).midConversationChannels,
      ).toEqual(both)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('turns on with midConversationChannels: true on a custom endpoint', () => {
    for (const endpoint of customEndpoints) {
      expect(
        createAnthropicChat('claude-opus-5-5', 'test-key', {
          ...endpoint,
          midConversationChannels: true,
        }).midConversationChannels,
      ).toEqual(both)
    }
    expect(
      new AnthropicTextAdapter(
        { client: injectedClient, midConversationChannels: true },
        'claude-opus-5-5',
      ).midConversationChannels,
    ).toEqual(both)
  })

  it('turns on only the channels an object names', () => {
    expect(
      createAnthropicChat('claude-opus-5-5', 'test-key', {
        baseURL: 'https://gateway.example.com',
        midConversationChannels: { systemPrompts: true },
      }).midConversationChannels,
    ).toEqual({ tools: false, systemPrompts: true })
    expect(
      createAnthropicChat('claude-opus-5-5', 'test-key', {
        midConversationChannels: { tools: true },
      }).midConversationChannels,
    ).toEqual({ tools: true, systemPrompts: false })
    expect(
      createAnthropicChat('claude-sonnet-5-5', 'test-key', {
        midConversationChannels: { systemPrompts: true },
      }).midConversationChannels,
    ).toBeUndefined()
  })

  it('is off with midConversationChannels: false, and outside the map even with true', () => {
    expect(
      createAnthropicChat('claude-opus-5-5', 'test-key', {
        midConversationChannels: false,
      }).midConversationChannels,
    ).toBeUndefined()
    expect(
      new AnthropicTextAdapter({ apiKey: 'test-key' }, 'claude-sonnet-5-5')
        .midConversationChannels,
    ).toBeUndefined()
    expect(
      new AnthropicTextAdapter(
        { apiKey: 'test-key', midConversationChannels: true },
        'claude-sonnet-5-5',
      ).midConversationChannels,
    ).toBeUndefined()
  })
})

describe('Anthropic mid-conversation request', () => {
  beforeEach(() => {
    mocks.betaMessagesCreate.mockReset()
    mocks.betaMessagesCreate.mockImplementation(() =>
      Promise.resolve(textStream()),
    )
  })

  it('sends the beta and the placeholder from the first call', async () => {
    const body = await send('claude-opus-5-5', {
      messages: [{ role: 'user', content: 'Find the page' }],
      tools: [lookup],
      midConversationChanges: {
        start: { tools: ['lookup'], systemPrompts: 0 },
        changes: [],
      },
    })

    expect(body.betas).toContain(BETA)
    expect(body.tools).toEqual([
      ...convertToolsToProviderFormat([lookup]),
      PLACEHOLDER,
    ])
    expect(roles(body)).toEqual(['user'])
  })

  it('defers an added tool and announces it with a tool_addition block', async () => {
    const body = await send('claude-opus-5-5', {
      messages: toolTurn,
      tools: [lookup, fetchPage],
      systemPrompts: ['Be brief.', 'Cite sources.'],
      midConversationChanges: endChange,
    })

    expect(body.betas).toContain(BETA)
    expect(body.tools).toEqual([
      ...convertToolsToProviderFormat([lookup]),
      PLACEHOLDER,
      { ...convertToolsToProviderFormat([fetchPage])[0], defer_loading: true },
    ])
    expect(body.system).toEqual([{ type: 'text', text: 'Be brief.' }])
    expect(roles(body)).toEqual(['user', 'assistant', 'user', 'system'])
    expect(body.messages[3]).toEqual({
      role: 'system',
      content: [
        { type: 'text', text: 'Cite sources.' },
        {
          type: 'tool_addition',
          tool: { type: 'tool_reference', name: 'fetch_page' },
        },
      ],
    })
  })

  it('with { systemPrompts: true } on a custom baseURL: the prompt in place, the tools as the full list', async () => {
    const body = await send(
      'claude-opus-5-5',
      {
        messages: toolTurn,
        tools: [lookup, fetchPage],
        systemPrompts: ['Be brief.', 'Cite sources.'],
        midConversationChanges: endChange,
      },
      {
        baseURL: 'https://gateway.example.com',
        midConversationChannels: { systemPrompts: true },
      },
    )

    expect(body.system).toEqual([{ type: 'text', text: 'Be brief.' }])
    expect(roles(body)).toEqual(['user', 'assistant', 'user', 'system'])
    expect(body.messages[3]).toEqual({
      role: 'system',
      content: [{ type: 'text', text: 'Cite sources.' }],
    })
    expect(body.tools).toEqual(
      convertToolsToProviderFormat([lookup, fetchPage]),
    )
    expect(body.betas ?? []).not.toContain(BETA)
  })

  it('puts an added prompt in a system message before the next assistant message', async () => {
    const body = await send('claude-opus-5-5', {
      messages: [
        ...toolTurn,
        { role: 'assistant', content: 'Here it is.' },
        { role: 'user', content: 'Thanks' },
      ],
      tools: [lookup],
      systemPrompts: ['Be brief.', 'Cite sources.'],
      // The change sits before the tool result. The system message waits for
      // the next assistant message, so tool_result still follows tool_use.
      midConversationChanges: {
        start: { tools: ['lookup'], systemPrompts: 1 },
        changes: [{ before: 2, systemPrompts: 1 }],
      },
    })

    expect(roles(body)).toEqual([
      'user',
      'assistant',
      'user',
      'system',
      'assistant',
      'user',
    ])
    expect(body.messages[2].content[0].type).toBe('tool_result')
    expect(body.messages[3]).toEqual({
      role: 'system',
      content: [{ type: 'text', text: 'Cite sources.' }],
    })
  })

  it('keeps cache_control on the start prompts', async () => {
    const body = await send('claude-opus-5-5', {
      messages: toolTurn,
      tools: [lookup],
      systemPrompts: [
        {
          content: 'Stable rules.',
          metadata: { cache_control: { type: 'ephemeral' } },
        },
        {
          content: 'Late rule.',
          metadata: { cache_control: { type: 'ephemeral' } },
        },
      ],
      midConversationChanges: {
        start: { tools: ['lookup'], systemPrompts: 1 },
        changes: [{ before: 3, systemPrompts: 1 }],
      },
    })

    expect(body.system).toEqual([
      {
        type: 'text',
        text: 'Stable rules.',
        cache_control: { type: 'ephemeral' },
      },
    ])
    // The added prompt goes out as text only.
    expect(body.messages.at(-1)).toEqual({
      role: 'system',
      content: [{ type: 'text', text: 'Late rule.' }],
    })
  })

  it('keeps the full tools list when a provider tool takes part', async () => {
    const webSearch = webSearchTool({
      name: 'web_search',
      type: 'web_search_20250305',
    })
    const body = await send('claude-opus-5-5', {
      messages: toolTurn,
      tools: [lookup, webSearch, fetchPage],
      systemPrompts: ['Be brief.', 'Cite sources.'],
      midConversationChanges: {
        start: { tools: ['lookup', 'web_search'], systemPrompts: 1 },
        changes: [{ before: 3, tools: ['fetch_page'], systemPrompts: 1 }],
      },
    })

    expect(body.tools).toEqual(
      convertToolsToProviderFormat([lookup, webSearch, fetchPage]),
    )
    expect(body.betas).toBeUndefined()
    // The prompt channel still works, with no tool_addition block.
    expect(body.messages.at(-1)).toEqual({
      role: 'system',
      content: [{ type: 'text', text: 'Cite sources.' }],
    })
  })

  it("sends today's request when off, on a custom endpoint, and outside the map", async () => {
    const options = {
      messages: toolTurn,
      tools: [lookup, fetchPage],
      systemPrompts: ['Be brief.', 'Cite sources.'],
    }
    const cases = [
      ['claude-opus-5-5', { midConversationChannels: false }],
      ['claude-opus-5-5', { baseURL: 'https://gateway.example.com' }],
      ['claude-sonnet-5-5', {}],
    ] as const
    for (const [model, config] of cases) {
      const today = await send(model, options, config)
      const body = await send(
        model,
        { ...options, midConversationChanges: endChange },
        config,
      )

      expect(JSON.stringify(body)).toBe(JSON.stringify(today))
      expect(today.betas).toBeUndefined()
      expect(roles(today)).toEqual(['user', 'assistant', 'user'])
    }
  })

  it('puts the automatic tool cache marker on the last start tool', async () => {
    const body = await send('claude-opus-5-5', {
      messages: [
        ...toolTurn,
        { role: 'assistant', content: 'Here it is.' },
        { role: 'user', content: 'Thanks' },
      ],
      tools: [lookup, fetchPage],
      systemPrompts: ['Be brief.', 'Cite sources.'],
      // A change in the history: the system message sits before an
      // assistant message, so the last message is still the user's.
      midConversationChanges: {
        start: { tools: ['lookup'], systemPrompts: 1 },
        changes: [{ before: 3, tools: ['fetch_page'], systemPrompts: 1 }],
      },
      promptCache: { retention: 'short' },
    })

    expect(body.tools).toEqual([
      { ...convertToolsToProviderFormat([lookup])[0], cache_control: SHORT },
      PLACEHOLDER,
      { ...convertToolsToProviderFormat([fetchPage])[0], defer_loading: true },
    ])
    expect(body.messages[3]).toEqual({
      role: 'system',
      content: [
        { type: 'text', text: 'Cite sources.' },
        {
          type: 'tool_addition',
          tool: { type: 'tool_reference', name: 'fetch_page' },
        },
      ],
    })
    expect(body.messages.at(-1)).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'Thanks', cache_control: SHORT }],
    })
  })

  it('puts the message cache marker on the last block of a system message at the end', async () => {
    const body = await send('claude-opus-5-5', {
      messages: toolTurn,
      tools: [lookup, fetchPage],
      systemPrompts: ['Be brief.', 'Cite sources.'],
      // before === messages.length: the change goes at the end.
      midConversationChanges: endChange,
      promptCache: { retention: 'short' },
    })

    expect(body.messages.at(-1)).toEqual({
      role: 'system',
      content: [
        { type: 'text', text: 'Cite sources.' },
        {
          type: 'tool_addition',
          tool: { type: 'tool_reference', name: 'fetch_page' },
          cache_control: SHORT,
        },
      ],
    })
    // The tool_result before it gets no marker.
    expect(body.messages[2].content[0]).not.toHaveProperty('cache_control')
    expect(body.tools[0].cache_control).toEqual(SHORT)
    expect(body.tools.slice(1)).toEqual([
      PLACEHOLDER,
      { ...convertToolsToProviderFormat([fetchPage])[0], defer_loading: true },
    ])
    expect(body.system).toEqual([
      { type: 'text', text: 'Be brief.', cache_control: SHORT },
    ])
  })

  it("adds no cache marker in tool mode with promptCache: 'none'", async () => {
    const body = await send('claude-opus-5-5', {
      messages: toolTurn,
      tools: [lookup, fetchPage],
      systemPrompts: ['Be brief.', 'Cite sources.'],
      midConversationChanges: endChange,
      promptCache: { retention: 'none' },
    })

    expect(body.betas).toContain(BETA)
    expect(JSON.stringify(body)).not.toMatch(/"cache_control":\{/)
  })

  it('keeps the tool marker on the last tool outside tool mode, also when that tool is deferred', () => {
    // A caller's own deferred tool, with no placeholder in the request.
    const lastTool = {
      ...convertToolsToProviderFormat([fetchPage])[0]!,
      defer_loading: true,
    }
    const body = applyAnthropicPromptCache(
      {
        model: 'claude-opus-5-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'hi' }],
        tools: [...convertToolsToProviderFormat([lookup]), lastTool],
      },
      { retention: 'short' },
    )

    expect(body.tools).toEqual([
      ...convertToolsToProviderFormat([lookup]),
      { ...lastTool, cache_control: SHORT },
    ])
  })
})
