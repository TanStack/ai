import { describe, expect, it, vi } from 'vitest'
import OpenAI from 'openai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  OpenAICompatibleChatAdapter,
  OpenAICompatibleResponsesAdapter,
} from '../src/compatible/adapter'
import { openaiCompatible, openaiCompatibleText } from '../src/compatible'
import type {
  ModelMessage,
  ReasoningMap,
  ReasoningRequest,
  ResolvedPromptCache,
} from '@tanstack/ai'
import type { CompatibleModelConfig } from '../src/compatible/adapter'
import type { OpenAICompatibleCompat } from '../src/compatible/quirks'

const logger = resolveDebugOption(false)
const OPENAI_URL = 'https://api.openai.com/v1'
const CUSTOM_URL = 'https://llm.example.com/v1'

async function* noChunks() {}

async function drain(stream: AsyncIterable<unknown>) {
  for await (const _chunk of stream) {
    // Drain the stream.
  }
}

/** Only the `prompt_cache*` fields of a request body. */
function promptCacheFieldsOf(body: object) {
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => key.startsWith('prompt_cache')),
  )
}

/** Run one call and return the request body and request options it sent. */
async function send(
  config: CompatibleModelConfig,
  options: {
    reasoning?: ReasoningRequest
    messages?: Array<ModelMessage>
    systemPrompts?: Array<string>
    modelOptions?: Record<string, unknown>
    tools?: boolean
    conversationId?: string
    promptCache?: ResolvedPromptCache
    baseURL?: string
  } = {},
) {
  // The base URL is always set, so an OPENAI_BASE_URL env value cannot
  // change the result.
  const client = new OpenAI({
    apiKey: 'test',
    baseURL: options.baseURL ?? OPENAI_URL,
  })
  const create = vi.fn().mockResolvedValue(noChunks())
  client.chat.completions.create =
    create as typeof client.chat.completions.create
  const adapter = new OpenAICompatibleChatAdapter(
    client,
    'm',
    'test',
    {},
    config,
  )
  await drain(
    adapter.chatStream({
      logger,
      model: 'm',
      messages: options.messages ?? [{ role: 'user', content: 'hi' }],
      ...(options.systemPrompts
        ? { systemPrompts: options.systemPrompts }
        : {}),
      ...(options.reasoning ? { reasoning: options.reasoning } : {}),
      ...(options.modelOptions ? { modelOptions: options.modelOptions } : {}),
      ...(options.conversationId
        ? { conversationId: options.conversationId }
        : {}),
      ...(options.promptCache ? { promptCache: options.promptCache } : {}),
      ...(options.tools
        ? {
            tools: [
              {
                name: 'lookup',
                description: 'Look up a word',
                inputSchema: {
                  type: 'object',
                  properties: { word: { type: 'string' } },
                  required: ['word'],
                },
              },
            ],
          }
        : {}),
    }),
  )
  const [body, requestOptions] = create.mock.calls[0] ?? []
  return {
    body: body as Record<string, any>,
    requestOptions: requestOptions as Record<string, any>,
  }
}

/** Run one compatible Responses call and return the cache fields it sent. */
async function sendResponses(
  model: string,
  config: CompatibleModelConfig,
  promptCache: ResolvedPromptCache,
  modelOptions?: Record<string, unknown>,
) {
  const client = new OpenAI({ apiKey: 'test', baseURL: CUSTOM_URL })
  // The SDK `create` returns an APIPromise, which a mock cannot build.
  const create = vi.fn().mockResolvedValue(noChunks())
  client.responses.create = create as typeof client.responses.create
  const adapter = new OpenAICompatibleResponsesAdapter(
    client,
    model,
    'test',
    {},
    config,
  )
  await drain(
    adapter.chatStream({
      logger,
      model,
      messages: [{ role: 'user', content: 'hi' }],
      promptCache,
      ...(modelOptions ? { modelOptions } : {}),
    }),
  )
  return promptCacheFieldsOf(create.mock.calls[0]?.[0])
}

/**
 * A `fetch` for the OpenAI SDK that answers with an empty event stream and
 * keeps each JSON request body.
 */
function recordingFetch() {
  const bodies: Array<object> = []
  const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)))
    return new Response('', {
      headers: { 'content-type': 'text/event-stream' },
    })
  })
  return { fetch, bodies }
}

const on = (level: ReasoningRequest['level']): ReasoningRequest => ({
  level,
  summary: true,
})
const DEEPSEEK_MAP: ReasoningMap = {
  off: 'none',
  minimal: null,
  low: 'low',
  medium: null,
  high: 'high',
  xhigh: null,
  max: 'max',
}

describe('openaiCompatible thinking formats (pi buildParams)', () => {
  it('openai: reasoning_effort, and the off value when the model has one', async () => {
    const high = await send(
      { reasoning: { off: 'none' } },
      { reasoning: on('high') },
    )
    expect(high.body.reasoning_effort).toBe('high')
    const off = await send(
      { reasoning: { off: 'none' } },
      { reasoning: on('off') },
    )
    expect(off.body.reasoning_effort).toBe('none')
    const noOffValue = await send({ reasoning: true }, { reasoning: on('off') })
    expect(noOffValue.body).not.toHaveProperty('reasoning_effort')
  })

  it('deepseek: thinking enabled with the mapped effort, disabled for off', async () => {
    const compat = { thinkingFormat: 'deepseek' as const }
    const max = await send(
      { reasoning: DEEPSEEK_MAP, compat },
      { reasoning: on('max') },
    )
    expect(max.body).toMatchObject({
      thinking: { type: 'enabled' },
      reasoning_effort: 'max',
    })
    // `medium` is not a DeepSeek level: it clamps up to `high`.
    const medium = await send(
      { reasoning: DEEPSEEK_MAP, compat },
      { reasoning: on('medium') },
    )
    expect(medium.body.reasoning_effort).toBe('high')
    const off = await send(
      { reasoning: DEEPSEEK_MAP, compat },
      { reasoning: on('off') },
    )
    expect(off.body.thinking).toEqual({ type: 'disabled' })
    expect(off.body).not.toHaveProperty('reasoning_effort')
  })

  it('zai: thinking with clear_thinking false, and disabled for off', async () => {
    const compat = { thinkingFormat: 'zai' as const }
    const high = await send(
      { reasoning: true, compat },
      { reasoning: on('high') },
    )
    expect(high.body).toMatchObject({
      thinking: { type: 'enabled', clear_thinking: false },
      reasoning_effort: 'high',
    })
    const off = await send(
      { reasoning: true, compat },
      { reasoning: on('off') },
    )
    expect(off.body.thinking).toEqual({ type: 'disabled' })
  })

  it('qwen and qwen-chat-template: enable_thinking', async () => {
    const qwen = await send(
      {
        reasoning: true,
        compat: { thinkingFormat: 'qwen', supportsReasoningEffort: false },
      },
      { reasoning: on('low') },
    )
    expect(qwen.body.enable_thinking).toBe(true)
    expect(qwen.body).not.toHaveProperty('reasoning_effort')
    const template = await send(
      { reasoning: true, compat: { thinkingFormat: 'qwen-chat-template' } },
      { reasoning: on('off') },
    )
    expect(template.body.chat_template_kwargs).toEqual({
      enable_thinking: false,
      preserve_thinking: true,
    })
  })

  it('chat-template and baseten: template values from the compat', async () => {
    const template = await send(
      {
        reasoning: true,
        compat: {
          thinkingFormat: 'chat-template',
          chatTemplateKwargs: { enable_thinking: { $var: 'thinking.enabled' } },
        },
      },
      { reasoning: on('high') },
    )
    expect(template.body.chat_template_kwargs).toEqual({
      enable_thinking: true,
    })
    const baseten = await send(
      {
        reasoning: true,
        compat: {
          thinkingFormat: 'baseten',
          chatTemplateArgs: { enable_thinking: { $var: 'thinking.enabled' } },
        },
      },
      { reasoning: on('off') },
    )
    expect(baseten.body.chat_template_args).toEqual({ enable_thinking: false })
  })

  it('openrouter: reasoning.effort, and none for off', async () => {
    const compat = { thinkingFormat: 'openrouter' as const }
    const high = await send(
      { reasoning: true, compat },
      { reasoning: on('high') },
    )
    expect(high.body.reasoning).toEqual({ effort: 'high' })
    const off = await send(
      { reasoning: true, compat },
      { reasoning: on('off') },
    )
    expect(off.body.reasoning).toEqual({ effort: 'none' })
  })

  it('together: reasoning.enabled', async () => {
    const compat = {
      thinkingFormat: 'together' as const,
      supportsReasoningEffort: false,
    }
    const high = await send(
      { reasoning: true, compat },
      { reasoning: on('high') },
    )
    expect(high.body.reasoning).toEqual({ enabled: true })
    expect(high.body).not.toHaveProperty('reasoning_effort')
  })

  it('string-thinking and ant-ling', async () => {
    const thinking = await send(
      { reasoning: true, compat: { thinkingFormat: 'string-thinking' } },
      { reasoning: on('off') },
    )
    expect(thinking.body.thinking).toBe('none')
    const antLing = await send(
      {
        reasoning: { off: null, high: 'high' },
        compat: { thinkingFormat: 'ant-ling' },
      },
      { reasoning: on('high') },
    )
    expect(antLing.body.reasoning).toEqual({ effort: 'high' })
  })

  it('sends no thinking for a model that does not reason', async () => {
    const { body } = await send({ reasoning: false }, { reasoning: on('high') })
    expect(body).not.toHaveProperty('reasoning_effort')
    expect(body).not.toHaveProperty('thinking')
  })

  it('adds the thinking token budget field when set', async () => {
    const { body } = await send(
      {
        reasoning: true,
        compat: { thinkingTokenBudgetField: 'thinking_token_budget' },
      },
      { reasoning: on('low'), modelOptions: { max_tokens: 10_000 } },
    )
    expect(body.thinking_token_budget).toBe(2048)
  })
})

describe('openaiCompatible request quirks', () => {
  it('keeps the request as today without compat or reasoning', async () => {
    const { body } = await send({}, { systemPrompts: ['Be brief.'] })
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Be brief.' })
    expect(body.stream_options).toEqual({ include_usage: true })
    expect(Object.keys(body).sort()).toEqual(
      ['messages', 'model', 'stream', 'stream_options'].sort(),
    )
  })

  it('sends developer only for a reasoning model with supportsDeveloperRole', async () => {
    const reasoning = await send(
      { reasoning: true, compat: { supportsDeveloperRole: true } },
      { systemPrompts: ['Be brief.'] },
    )
    expect(reasoning.body.messages[0].role).toBe('developer')
    const plain = await send(
      { reasoning: false, compat: { supportsDeveloperRole: true } },
      { systemPrompts: ['Be brief.'] },
    )
    expect(plain.body.messages[0].role).toBe('system')
    const refused = await send(
      { reasoning: true, compat: { supportsDeveloperRole: false } },
      { systemPrompts: ['Be brief.'] },
    )
    expect(refused.body.messages[0].role).toBe('system')
  })

  it('renames the token limit to maxTokensField', async () => {
    const { body } = await send(
      { compat: { maxTokensField: 'max_tokens' } },
      { modelOptions: { max_completion_tokens: 500 } },
    )
    expect(body.max_tokens).toBe(500)
    expect(body).not.toHaveProperty('max_completion_tokens')
  })

  it('replays reasoning_content on the second DeepSeek turn', async () => {
    const { body } = await send(
      {
        reasoning: DEEPSEEK_MAP,
        compat: {
          thinkingFormat: 'deepseek',
          requiresReasoningContentOnAssistantMessages: true,
        },
      },
      {
        reasoning: on('high'),
        messages: [
          { role: 'user', content: 'What is 2 + 2?' },
          {
            role: 'assistant',
            content: '4',
            thinking: [{ content: 'Two plus two is four.' }],
          },
          { role: 'user', content: 'And 3 + 3?' },
          { role: 'assistant', content: '6' },
          { role: 'user', content: 'Thanks' },
        ],
      },
    )
    const assistants = body.messages.filter((m: any) => m.role === 'assistant')
    expect(assistants[0].reasoning_content).toBe('Two plus two is four.')
    // A turn with no thinking still carries the field, or DeepSeek refuses it.
    expect(assistants[1].reasoning_content).toBe('')
  })

  it('drops store, sends non-strict tools, and adds tool_stream', async () => {
    const { body } = await send(
      {
        compat: {
          supportsStore: false,
          supportsStrictMode: false,
          zaiToolStream: true,
        },
      },
      { modelOptions: { store: true }, tools: true },
    )
    expect(body).not.toHaveProperty('store')
    expect(body.tools[0].function.strict).toBe(false)
    expect(body.tool_stream).toBe(true)
  })

  const markerCases: Array<{
    name: string
    promptCache?: ResolvedPromptCache
    compat?: OpenAICompatibleCompat
    marker: { type: 'ephemeral'; ttl?: '1h' }
  }> = [
    { name: 'no promptCache', marker: { type: 'ephemeral' } },
    {
      name: 'short',
      promptCache: { retention: 'short' },
      marker: { type: 'ephemeral' },
    },
    {
      name: 'long',
      promptCache: { retention: 'long' },
      marker: { type: 'ephemeral', ttl: '1h' },
    },
    {
      name: 'long, provider without long retention',
      promptCache: { retention: 'long' },
      compat: { supportsLongCacheRetention: false },
      marker: { type: 'ephemeral' },
    },
  ]

  it.each(markerCases)(
    'adds Anthropic cache markers for Claude through OpenRouter: $name',
    async ({ promptCache, compat, marker }) => {
      const { body } = await send(
        { compat: { cacheControlFormat: 'anthropic', ...compat } },
        {
          systemPrompts: ['Be brief.'],
          tools: true,
          ...(promptCache ? { promptCache } : {}),
        },
      )
      expect(body.messages[0].content).toEqual([
        { type: 'text', text: 'Be brief.', cache_control: marker },
      ])
      expect(body.messages.at(-1).content).toEqual([
        { type: 'text', text: 'hi', cache_control: marker },
      ])
      expect(body.tools.at(-1).cache_control).toEqual(marker)
    },
  )

  it('adds no Anthropic cache markers for a none retention', async () => {
    const { body } = await send(
      { compat: { cacheControlFormat: 'anthropic' } },
      {
        systemPrompts: ['Be brief.'],
        tools: true,
        promptCache: { retention: 'none' },
      },
    )
    expect(body.messages).toEqual([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'hi' },
    ])
    expect(body.tools.at(-1)).not.toHaveProperty('cache_control')
  })

  it.each([
    { format: 'openrouter', headers: { 'x-session-id': 'k-1' } },
    {
      format: 'openai',
      headers: {
        session_id: 'k-1',
        'x-client-request-id': 'k-1',
        'x-session-affinity': 'k-1',
      },
    },
    {
      format: 'openai-nosession',
      headers: { 'x-client-request-id': 'k-1', 'x-session-affinity': 'k-1' },
    },
  ] as const)(
    'sends the promptCache key as $format session headers',
    async ({ format, headers }) => {
      const { requestOptions } = await send(
        {
          compat: {
            sendSessionAffinityHeaders: true,
            sessionAffinityFormat: format,
          },
        },
        {
          conversationId: 'c1',
          promptCache: { retention: 'short', key: 'k-1' },
        },
      )
      expect(requestOptions.headers).toEqual(headers)
    },
  )

  it('sends session headers, and leaves out streaming usage when refused', async () => {
    const openrouter = await send(
      {
        compat: {
          sendSessionAffinityHeaders: true,
          sessionAffinityFormat: 'openrouter',
        },
      },
      { conversationId: 'c1' },
    )
    expect(openrouter.requestOptions.headers).toEqual({ 'x-session-id': 'c1' })
    const openai = await send(
      {
        compat: {
          sendSessionAffinityHeaders: true,
          supportsUsageInStreaming: false,
        },
      },
      { conversationId: 'c1' },
    )
    expect(openai.requestOptions.headers).toEqual({
      session_id: 'c1',
      'x-client-request-id': 'c1',
      'x-session-affinity': 'c1',
    })
    expect(openai.body).not.toHaveProperty('stream_options')
  })
})

describe('openaiCompatible Chat Completions: chat({ promptCache })', () => {
  /** Run one call through a provider compat and return its cache fields. */
  async function chatCacheFields(
    promptCache: ResolvedPromptCache,
    options: {
      baseURL?: string
      compat?: OpenAICompatibleCompat
      modelOptions?: Record<string, unknown>
    } = {},
  ) {
    const { body } = await send(
      { compat: options.compat ?? {} },
      {
        promptCache,
        baseURL: options.baseURL ?? CUSTOM_URL,
        ...(options.modelOptions ? { modelOptions: options.modelOptions } : {}),
      },
    )
    return promptCacheFieldsOf(body)
  }

  it('sends the key to api.openai.com for a short retention', async () => {
    expect(
      await chatCacheFields(
        { retention: 'short', key: 'k-1' },
        { baseURL: OPENAI_URL },
      ),
    ).toStrictEqual({ prompt_cache_key: 'k-1' })
  })

  it('sends no key to another server for a short retention', async () => {
    expect(
      await chatCacheFields({ retention: 'short', key: 'k-1' }),
    ).toStrictEqual({})
  })

  it('sends the key and 24h for a long retention', async () => {
    expect(
      await chatCacheFields({ retention: 'long', key: 'k-1' }),
    ).toStrictEqual({ prompt_cache_key: 'k-1', prompt_cache_retention: '24h' })
  })

  it('sends nothing for a long retention when the provider has no long cache', async () => {
    expect(
      await chatCacheFields(
        { retention: 'long', key: 'k-1' },
        { compat: { supportsLongCacheRetention: false } },
      ),
    ).toStrictEqual({})
  })

  it('keeps the values the caller set in modelOptions', async () => {
    expect(
      await chatCacheFields(
        { retention: 'long', key: 'k-1' },
        {
          modelOptions: {
            prompt_cache_key: 'caller-key',
            prompt_cache_retention: 'in_memory',
          },
        },
      ),
    ).toStrictEqual({
      prompt_cache_key: 'caller-key',
      prompt_cache_retention: 'in_memory',
    })
  })
})

describe('openaiCompatible Responses: chat({ promptCache })', () => {
  it('turns automatic caching off for none with supportsExplicitPromptCacheMode', async () => {
    expect(
      await sendResponses(
        'my-deployment',
        { compat: { supportsExplicitPromptCacheMode: true } },
        { retention: 'none', key: 'k-1' },
      ),
    ).toStrictEqual({ prompt_cache_options: { mode: 'explicit' } })
  })

  it('uses explicit mode for a gpt-5.6 deployment name without the flag', async () => {
    expect(
      await sendResponses('gpt-5.6', {}, { retention: 'none', key: 'k-1' }),
    ).toStrictEqual({ prompt_cache_options: { mode: 'explicit' } })
  })

  it('sends the key and 24h for long on an older model', async () => {
    expect(
      await sendResponses(
        'my-deployment',
        {},
        { retention: 'long', key: 'k-1' },
      ),
    ).toStrictEqual({ prompt_cache_key: 'k-1', prompt_cache_retention: '24h' })
  })

  it('sends only the key for long when the provider has no long cache', async () => {
    expect(
      await sendResponses(
        'my-deployment',
        { compat: { supportsLongCacheRetention: false } },
        { retention: 'long', key: 'k-1' },
      ),
    ).toStrictEqual({ prompt_cache_key: 'k-1' })
  })

  it('keeps the values the caller set in modelOptions', async () => {
    expect(
      await sendResponses(
        'gpt-5.6',
        {},
        { retention: 'long', key: 'k-1' },
        { prompt_cache_key: 'caller-key', prompt_cache_options: { ttl: '5m' } },
      ),
    ).toStrictEqual({
      prompt_cache_key: 'caller-key',
      prompt_cache_options: { ttl: '5m' },
    })
  })

  it('gets the provider compat from openaiCompatible and openaiCompatibleText', async () => {
    const { fetch, bodies } = recordingFetch()
    const clientConfig = {
      baseURL: CUSTOM_URL,
      apiKey: 'test',
      api: 'responses',
      compat: { supportsExplicitPromptCacheMode: true },
      fetch,
    } as const
    const provider = openaiCompatible({
      ...clientConfig,
      models: ['my-deployment'],
    })
    const adapters = [
      provider('my-deployment'),
      openaiCompatibleText('my-deployment', clientConfig),
    ]
    for (const adapter of adapters)
      await drain(
        adapter.chatStream({
          logger,
          model: 'my-deployment',
          messages: [{ role: 'user', content: 'hi' }],
          promptCache: { retention: 'none' },
        }),
      )
    expect(bodies.map(promptCacheFieldsOf)).toStrictEqual([
      { prompt_cache_options: { mode: 'explicit' } },
      { prompt_cache_options: { mode: 'explicit' } },
    ])
  })
})
