import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { ChatRequest$outboundSchema } from '@openrouter/sdk/models'
import { createOpenRouterText } from '../src/adapters/text'
import { webSearchTool } from '../src/tools'
import type { ChatRequest } from '@openrouter/sdk/models'
import type {
  ModelMessage,
  ResolvedPromptCache,
  TextOptions,
  Tool,
} from '@tanstack/ai'

// The SDK is the network boundary. The tests read the request it gets.
const mockSend = vi.hoisted(() =>
  vi.fn<(params: { chatRequest: ChatRequest }) => Promise<Array<never>>>(),
)

vi.mock('@openrouter/sdk', () => {
  function OpenRouter(this: { chat: { send: typeof mockSend } }) {
    this.chat = { send: mockSend }
  }
  return { OpenRouter }
})

const testLogger = resolveDebugOption(false)

const weather: Tool = { name: 'get_weather', description: 'Get the weather' }
const search: Tool = { name: 'search_docs', description: 'Search the docs' }

const conversation: Array<ModelMessage> = [
  { role: 'user', content: 'Weather in Berlin?' },
  { role: 'assistant', content: 'Let me check.' },
  { role: 'user', content: 'And Paris?' },
]

const toolCallTurn: ModelMessage = {
  role: 'assistant',
  content: null,
  toolCalls: [
    {
      id: 'call-1',
      type: 'function',
      function: { name: 'get_weather', arguments: '{}' },
    },
  ],
}

const short: ResolvedPromptCache = { retention: 'short', key: 'thread-1' }

/** Run one chatStream call and return the request the SDK got. */
async function sentRequest({
  model = 'anthropic/claude-sonnet-4.5',
  messages = conversation,
  systemPrompts = ['Be brief.'],
  tools = [weather, search],
  ...rest
}: {
  model?: 'anthropic/claude-sonnet-4.5' | 'openai/gpt-4o-mini'
  messages?: Array<ModelMessage>
  systemPrompts?: TextOptions['systemPrompts']
  tools?: TextOptions['tools']
  promptCache?: ResolvedPromptCache
  modelOptions?: { sessionId: string }
}) {
  mockSend.mockResolvedValue([])
  const adapter = createOpenRouterText(model, 'test-key')
  for await (const _ of adapter.chatStream({
    ...rest,
    model,
    messages,
    systemPrompts,
    tools,
    logger: testLogger,
  })) {
    // drain
  }
  return mockSend.mock.calls[0]![0].chatRequest
}

function toolMarkers(request: ChatRequest) {
  return request.tools?.map((tool) =>
    'cacheControl' in tool ? tool.cacheControl : undefined,
  )
}

describe('OpenRouter automatic prompt cache', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it.each([
    ['short', { type: 'ephemeral' }],
    ['long', { type: 'ephemeral', ttl: '1h' }],
  ] as const)(
    'marks the system message, the last tool, and the last message for a %s retention',
    async (retention, marker) => {
      const request = await sentRequest({
        promptCache: { retention, key: 'thread-1' },
      })

      expect(request.messages).toEqual([
        {
          role: 'system',
          content: [{ type: 'text', text: 'Be brief.', cacheControl: marker }],
        },
        { role: 'user', content: 'Weather in Berlin?' },
        { role: 'assistant', content: 'Let me check.' },
        {
          role: 'user',
          content: [{ type: 'text', text: 'And Paris?', cacheControl: marker }],
        },
      ])
      expect(toolMarkers(request)).toEqual([undefined, marker])
      expect(request.sessionId).toBe('thread-1')

      // The SDK keeps the markers when it writes the snake_case wire body.
      expect(ChatRequest$outboundSchema.parse(request)).toMatchObject({
        messages: [
          { role: 'system', content: [{ cache_control: marker }] },
          {},
          {},
          { role: 'user', content: [{ cache_control: marker }] },
        ],
        tools: [{}, { cache_control: marker }],
        session_id: 'thread-1',
      })
    },
  )

  it.each([
    ['none', { retention: 'none', key: 'thread-1' }],
    ['absent', undefined],
  ] as const)(
    'sends the request with no cache fields when promptCache is %s',
    async (_label, promptCache) => {
      const request = await sentRequest({ promptCache })

      expect(request.messages).toEqual([
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: 'Weather in Berlin?' },
        { role: 'assistant', content: 'Let me check.' },
        { role: 'user', content: 'And Paris?' },
      ])
      expect(toolMarkers(request)).toEqual([undefined, undefined])
      expect(request).not.toHaveProperty('sessionId')
    },
  )

  it('sets only sessionId for a model that is not anthropic/*', async () => {
    const request = await sentRequest({
      model: 'openai/gpt-4o-mini',
      promptCache: short,
    })

    expect(request.sessionId).toBe('thread-1')
    expect(request.messages[0]).toEqual({
      role: 'system',
      content: 'Be brief.',
    })
    expect(request.messages[3]).toEqual({ role: 'user', content: 'And Paris?' })
    expect(toolMarkers(request)).toEqual([undefined, undefined])
  })

  it('adds no marker when a system prompt has a manual cache_control', async () => {
    const request = await sentRequest({
      promptCache: short,
      systemPrompts: [
        {
          content: 'Be brief.',
          metadata: { cache_control: { type: 'ephemeral', ttl: '1h' } },
        },
      ],
    })

    expect(request.messages[0]).toEqual({
      role: 'system',
      content: [
        {
          type: 'text',
          text: 'Be brief.',
          cacheControl: { type: 'ephemeral', ttl: '1h' },
        },
      ],
    })
    expect(request.messages[3]).toEqual({ role: 'user', content: 'And Paris?' })
    expect(toolMarkers(request)).toEqual([undefined, undefined])
    expect(request.sessionId).toBe('thread-1')
  })

  it('adds no marker when a tool has a manual cacheControl', async () => {
    const request = await sentRequest({
      promptCache: short,
      tools: [
        { ...weather, metadata: { cacheControl: { type: 'ephemeral' } } },
        search,
      ],
    })

    expect(toolMarkers(request)).toEqual([{ type: 'ephemeral' }, undefined])
    expect(request.messages[0]).toEqual({
      role: 'system',
      content: 'Be brief.',
    })
    expect(request.messages[3]).toEqual({ role: 'user', content: 'And Paris?' })
  })

  it('keeps the sessionId that the caller sets in modelOptions', async () => {
    const request = await sentRequest({
      promptCache: short,
      modelOptions: { sessionId: 'caller-session' },
    })

    expect(request.sessionId).toBe('caller-session')
  })

  it('sends no sessionId when there is no cache key', async () => {
    const request = await sentRequest({ promptCache: { retention: 'short' } })

    expect(request).not.toHaveProperty('sessionId')
    expect(request.messages[3]).toEqual({
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'And Paris?',
          cacheControl: { type: 'ephemeral' },
        },
      ],
    })
  })

  it('cuts a long cache key to the 256 characters OpenRouter accepts', async () => {
    const request = await sentRequest({
      promptCache: { retention: 'short', key: 'k'.repeat(300) },
    })

    expect(request.sessionId).toBe('k'.repeat(256))
  })

  it('marks a tool result when it is the last message', async () => {
    const request = await sentRequest({
      promptCache: short,
      messages: [
        { role: 'user', content: 'Weather in Berlin?' },
        toolCallTurn,
        { role: 'tool', content: 'Sunny', toolCallId: 'call-1' },
      ],
    })

    expect(request.messages[3]).toEqual({
      role: 'tool',
      toolCallId: 'call-1',
      content: [
        { type: 'text', text: 'Sunny', cacheControl: { type: 'ephemeral' } },
      ],
    })
  })

  it('marks the text block of a last message that also has an image', async () => {
    const request = await sentRequest({
      promptCache: short,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', content: 'What is this?' },
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/a.png' },
            },
          ],
        },
      ],
    })

    expect(request.messages[1]).toEqual({
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'What is this?',
          cacheControl: { type: 'ephemeral' },
        },
        {
          type: 'image_url',
          imageUrl: { url: 'https://example.com/a.png', detail: 'auto' },
        },
      ],
    })
  })

  const assistantLasts: Array<[string, ModelMessage, string | null]> = [
    ['only tool calls', toolCallTurn, null],
    ['empty text', { role: 'assistant', content: '' }, ''],
  ]
  it.each(assistantLasts)(
    'does not mark a last assistant message with %s',
    async (_label, last, content) => {
      const request = await sentRequest({
        promptCache: short,
        messages: [{ role: 'user', content: 'hi' }, last],
      })

      expect(request.messages[2]).toMatchObject({ role: 'assistant', content })
      expect(request.messages[0]).toEqual({
        role: 'system',
        content: [
          {
            type: 'text',
            text: 'Be brief.',
            cacheControl: { type: 'ephemeral' },
          },
        ],
      })
    },
  )

  it('marks the last function tool when a server tool comes after it', async () => {
    const request = await sentRequest({
      promptCache: short,
      tools: [weather, webSearchTool()],
    })

    expect(toolMarkers(request)).toEqual([{ type: 'ephemeral' }, undefined])
  })
})
