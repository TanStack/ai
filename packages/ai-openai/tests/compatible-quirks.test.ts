import { describe, expect, it, vi } from 'vitest'
import OpenAI from 'openai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAICompatibleChatAdapter } from '../src/compatible/adapter'
import type { ModelMessage, ReasoningMap, ReasoningRequest } from '@tanstack/ai'
import type { CompatibleModelConfig } from '../src/compatible/adapter'

const logger = resolveDebugOption(false)

async function* noChunks() {}

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
  } = {},
) {
  const client = new OpenAI({ apiKey: 'test' })
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
  for await (const _chunk of adapter.chatStream({
    logger,
    model: 'm',
    messages: options.messages ?? [{ role: 'user', content: 'hi' }],
    ...(options.systemPrompts ? { systemPrompts: options.systemPrompts } : {}),
    ...(options.reasoning ? { reasoning: options.reasoning } : {}),
    ...(options.modelOptions ? { modelOptions: options.modelOptions } : {}),
    ...(options.conversationId
      ? { conversationId: options.conversationId }
      : {}),
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
  })) {
    // Drain the stream.
  }
  const [body, requestOptions] = create.mock.calls[0] ?? []
  return {
    body: body as Record<string, any>,
    requestOptions: requestOptions as Record<string, any>,
  }
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

  it('adds Anthropic cache markers for Claude through OpenRouter', async () => {
    const { body } = await send(
      { compat: { cacheControlFormat: 'anthropic' } },
      { systemPrompts: ['Be brief.'], tools: true },
    )
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'Be brief.', cache_control: { type: 'ephemeral' } },
    ])
    expect(body.messages.at(-1).content[0].cache_control).toEqual({
      type: 'ephemeral',
    })
    expect(body.tools.at(-1).cache_control).toEqual({ type: 'ephemeral' })
  })

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
