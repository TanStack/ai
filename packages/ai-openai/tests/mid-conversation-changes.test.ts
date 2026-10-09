import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAITextAdapter, createOpenaiChat } from '../src/adapters/text'
import { OPENAI_MODEL_MID_CONVERSATION_CHANNELS } from '../src/model-meta'
import { convertToolsToProviderFormat, webSearchTool } from '../src/tools'
import type {
  MidConversationChanges,
  ModelMessage,
  TextOptions,
  Tool,
} from '@tanstack/ai'
import type { OpenAITextConfig } from '../src/adapters/text'

const logger = resolveDebugOption(false)
// Constructing the SDK client makes no network call.
const config = { apiKey: 'sk-test' }

// A proxy in OPENAI_BASE_URL on this machine would turn the default off.
// Clear it, so each test starts from OpenAI's own API.
beforeEach(() => {
  vi.stubEnv('OPENAI_BASE_URL', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
})
const both = { tools: true, systemPrompts: true }
/** Configs that do not talk to OpenAI's own API. */
const customEndpoints = [
  { baseURL: 'https://gateway.example.com/v1' },
  { fetch: vi.fn() },
]

/** A Responses stream that completes at once. */
function completedStream() {
  return (async function* () {
    yield {
      type: 'response.created',
      response: { id: 'resp-1', model: 'gpt-5.5', status: 'in_progress' },
    }
    yield {
      type: 'response.completed',
      response: {
        id: 'resp-1',
        model: 'gpt-5.5',
        status: 'completed',
        output: [],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      },
    }
  })()
}

/** Run one call on a stub client and give back the request body. */
async function send(
  model: 'gpt-5.5' | 'gpt-4o',
  options: Pick<
    TextOptions,
    | 'messages'
    | 'tools'
    | 'systemPrompts'
    | 'midConversationChanges'
    | 'promptCache'
  >,
  extra: Omit<OpenAITextConfig, 'apiKey'> = {},
) {
  const adapter = new OpenAITextAdapter({ ...config, ...extra }, model)
  const create = vi.fn<(...args: Array<any>) => any>(() =>
    Promise.resolve(completedStream()),
  )
  Object.assign(adapter, { client: { responses: { create } } })
  for await (const chunk of adapter.chatStream({
    logger,
    model,
    ...options,
  })) {
    if (chunk.type === 'RUN_ERROR') throw new Error(chunk.message)
  }
  return create.mock.calls[0]![0]
}

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

describe('OpenAI mid-conversation channels', () => {
  it('lists the models from pi that have a model record, with both channels', () => {
    expect(Object.keys(OPENAI_MODEL_MID_CONVERSATION_CHANNELS).sort()).toEqual(
      [
        'gpt-5.4-mini',
        'gpt-5.5',
        'gpt-5.6-luna',
        'gpt-5.6-sol',
        'gpt-5.6-terra',
        'gpt-6-astra',
        'gpt-6-luna',
        'gpt-6-sol',
      ].sort(),
    )
    for (const channels of Object.values(
      OPENAI_MODEL_MID_CONVERSATION_CHANNELS,
    )) {
      expect(channels).toEqual(both)
    }
  })

  it('gives the adapter the channels of its model', () => {
    expect(
      new OpenAITextAdapter(config, 'gpt-5.5').midConversationChannels,
    ).toEqual(both)
    expect(
      new OpenAITextAdapter(config, 'gpt-4o').midConversationChannels,
    ).toBeUndefined()
  })

  it('is off by default with a custom baseURL or a custom fetch', () => {
    for (const endpoint of customEndpoints) {
      expect(
        new OpenAITextAdapter({ ...config, ...endpoint }, 'gpt-5.5')
          .midConversationChannels,
      ).toBeUndefined()
    }
  })

  it('is off by default when the SDK reads a proxy from OPENAI_BASE_URL', () => {
    vi.stubEnv('OPENAI_BASE_URL', 'https://proxy.example.com/v1')
    try {
      expect(
        new OpenAITextAdapter(config, 'gpt-5.5').midConversationChannels,
      ).toBeUndefined()
      expect(
        new OpenAITextAdapter(
          { ...config, midConversationChannels: true },
          'gpt-5.5',
        ).midConversationChannels,
      ).toEqual(both)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('turns on with midConversationChannels: true on a custom endpoint', () => {
    for (const endpoint of customEndpoints) {
      expect(
        new OpenAITextAdapter(
          { ...config, ...endpoint, midConversationChannels: true },
          'gpt-5.5',
        ).midConversationChannels,
      ).toEqual(both)
    }
  })

  it('is off with midConversationChannels: false, and outside the map even with true', () => {
    expect(
      new OpenAITextAdapter(
        { ...config, midConversationChannels: false },
        'gpt-5.5',
      ).midConversationChannels,
    ).toBeUndefined()
    expect(
      createOpenaiChat('gpt-5.5', 'sk-test', { midConversationChannels: false })
        .midConversationChannels,
    ).toBeUndefined()
    expect(
      new OpenAITextAdapter(
        { ...config, midConversationChannels: true },
        'gpt-4o',
      ).midConversationChannels,
    ).toBeUndefined()
  })
})

describe('OpenAI mid-conversation request', () => {
  it('converts the start set and additional_tools with the OpenAI tool converter', async () => {
    const body = await send('gpt-5.5', {
      messages: toolTurn,
      tools: [lookup, fetchPage],
      systemPrompts: ['Be brief.', 'Cite sources.'],
      midConversationChanges: endChange,
    })

    expect(body.tools).toEqual(convertToolsToProviderFormat([lookup]))
    expect(body.instructions).toBe('Be brief.')
    expect(body.input.slice(3)).toEqual([
      {
        type: 'additional_tools',
        role: 'developer',
        tools: convertToolsToProviderFormat([fetchPage]),
      },
      { role: 'developer', content: 'Cite sources.' },
    ])
  })

  it('keeps the full tools list and the web search include for a provider tool', async () => {
    const webSearch = webSearchTool({ type: 'web_search' })
    const body = await send('gpt-5.5', {
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
    expect(body.include).toContain('web_search_call.action.sources')
    expect(body.input.slice(3)).toEqual([
      { role: 'developer', content: 'Cite sources.' },
    ])
  })

  it('keeps the prompt cache fields next to additional_tools', async () => {
    const body = await send('gpt-5.5', {
      messages: toolTurn,
      tools: [lookup, fetchPage],
      systemPrompts: ['Be brief.', 'Cite sources.'],
      midConversationChanges: endChange,
      promptCache: { retention: 'long', key: 'thread-1' },
    })

    expect(body.prompt_cache_key).toBe('thread-1')
    expect(body.prompt_cache_retention).toBe('24h')
    expect(body.tools).toEqual(convertToolsToProviderFormat([lookup]))
    expect(body.input[3]).toEqual({
      type: 'additional_tools',
      role: 'developer',
      tools: convertToolsToProviderFormat([fetchPage]),
    })
  })

  it("sends today's request when off, on a custom endpoint, and outside the map", async () => {
    const options = {
      messages: toolTurn,
      tools: [lookup, fetchPage],
      systemPrompts: ['Be brief.', 'Cite sources.'],
      promptCache: { retention: 'short' as const, key: 'thread-1' },
    }
    const cases = [
      ['gpt-5.5', { midConversationChannels: false }],
      ['gpt-5.5', { baseURL: 'https://gateway.example.com/v1' }],
      ['gpt-4o', {}],
    ] as const
    for (const [model, extra] of cases) {
      const today = await send(model, options, extra)
      const body = await send(
        model,
        { ...options, midConversationChanges: endChange },
        extra,
      )

      expect(JSON.stringify(body)).toBe(JSON.stringify(today))
      expect(today.tools).toEqual(
        convertToolsToProviderFormat([lookup, fetchPage]),
      )
      expect(today.prompt_cache_key).toBe('thread-1')
    }
  })
})
