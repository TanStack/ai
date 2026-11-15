// PROTOTYPE: checks the proposed reasoning support on the OpenAI-compatible adapters.
import { describe, expect, it, vi } from 'vitest'
import OpenAI from 'openai'
import { chat } from '@tanstack/ai'
import {
  resolveDebugOption,
  resolveReasoning,
} from '@tanstack/ai/adapter-internals'
import {
  OpenAICompatibleChatAdapter,
  OpenAICompatibleResponsesAdapter,
} from '../src/compatible/adapter'
import type { ReasoningRequest, TextOptions } from '@tanstack/ai'
import type { ModelReasoningCapability } from '@tanstack/ai/adapter-internals'

const testLogger = resolveDebugOption(false)

function emptyStream(): AsyncIterable<never> {
  return {
    [Symbol.asyncIterator]: () => ({
      next: async () => ({ value: undefined as never, done: true }),
    }),
  }
}

// ---------------------------------------------------------------------------
// Style 1: subclass + modelReasoning (default field)
// ---------------------------------------------------------------------------

const DEEPSEEK_REASONING = {
  levels: { low: 'low', high: 'high' },
  budget: false,
} as const

class DeepSeekAdapter extends OpenAICompatibleChatAdapter<
  'deepseek-reasoner',
  Record<string, any>,
  readonly ['text'],
  readonly [],
  ModelReasoningCapability<typeof DEEPSEEK_REASONING>
> {
  protected override modelReasoning() {
    return DEEPSEEK_REASONING
  }
}

// ---------------------------------------------------------------------------
// Style 2: subclass with a provider-specific field (on/off model)
// ---------------------------------------------------------------------------

interface QwenOptions {
  enable_thinking?: boolean
  temperature?: number
}

const QWEN_REASONING = {
  levels: { off: 'disabled', high: 'enabled' },
  budget: false,
} as const

class QwenAdapter extends OpenAICompatibleChatAdapter<
  'qwen3-max',
  QwenOptions,
  readonly ['text'],
  readonly [],
  ModelReasoningCapability<typeof QWEN_REASONING>
> {
  protected override modelReasoning() {
    return QWEN_REASONING
  }
  protected override mapOptionsToRequest(options: TextOptions) {
    // The base sends `reasoning_effort`; Qwen takes `enable_thinking` instead.
    const { reasoning_effort: _, ...request } = super.mapOptionsToRequest(options)
    const reasoning = resolveReasoning(options.reasoning, QWEN_REASONING)
    return reasoning
      ? { ...request, enable_thinking: reasoning.level !== 'off' }
      : request
  }
}

// ---------------------------------------------------------------------------
// Runtime helpers
// ---------------------------------------------------------------------------

async function sent(
  adapter: { chatStream: OpenAICompatibleChatAdapter<string>['chatStream'] },
  create: ReturnType<typeof vi.fn>,
  model: string,
  reasoning: ReasoningRequest | undefined,
) {
  for await (const _ of adapter.chatStream({
    threadId: 't',
    logger: testLogger,
    model,
    messages: [{ role: 'user', content: 'hi' }],
    reasoning,
  })) {
    // drain
  }
  return create.mock.calls[0]![0] as Record<string, unknown>
}

function chatClient() {
  const client = new OpenAI({ apiKey: 'k' })
  const create = vi.fn().mockResolvedValue(emptyStream())
  client.chat.completions.create =
    create as typeof client.chat.completions.create
  return { client, create }
}

function responsesClient() {
  const client = new OpenAI({ apiKey: 'k' })
  const create = vi.fn().mockResolvedValue(emptyStream())
  client.responses.create = create as typeof client.responses.create
  return { client, create }
}

describe('style 1: subclass, default field', () => {
  it('sends reasoning_effort', async () => {
    const { client, create } = chatClient()
    const req = await sent(new DeepSeekAdapter(client, 'deepseek-reasoner', 'ds'), create, 'deepseek-reasoner', { level: 'high', summary: true })
    expect(req.reasoning_effort).toBe('high')
  })
  it('clamps an undeclared level (medium -> high)', async () => {
    const { client, create } = chatClient()
    const req = await sent(new DeepSeekAdapter(client, 'deepseek-reasoner', 'ds'), create, 'deepseek-reasoner', { level: 'medium', summary: true })
    expect(req.reasoning_effort).toBe('high')
  })
})

describe('style 2: subclass, provider field', () => {
  it('on -> enable_thinking: true, no reasoning_effort', async () => {
    const { client, create } = chatClient()
    const req = await sent(new QwenAdapter(client, 'qwen3-max', 'qwen'), create, 'qwen3-max', { level: 'high', summary: true })
    expect(req.enable_thinking).toBe(true)
    expect(req).not.toHaveProperty('reasoning_effort')
  })
  it('off -> enable_thinking: false', async () => {
    const { client, create } = chatClient()
    const req = await sent(new QwenAdapter(client, 'qwen3-max', 'qwen'), create, 'qwen3-max', { level: 'off', summary: true })
    expect(req.enable_thinking).toBe(false)
  })
  it('no reasoning -> nothing sent', async () => {
    const { client, create } = chatClient()
    const req = await sent(new QwenAdapter(client, 'qwen3-max', 'qwen'), create, 'qwen3-max', undefined)
    expect(req).not.toHaveProperty('enable_thinking')
    expect(req).not.toHaveProperty('reasoning_effort')
  })
})

describe('style 3: constructor option, no subclass', () => {
  it('chat completions sends reasoning_effort', async () => {
    const { client, create } = chatClient()
    const adapter = new OpenAICompatibleChatAdapter(client, 'deepseek-reasoner', 'ds', { reasoning: DEEPSEEK_REASONING })
    const req = await sent(adapter, create, 'deepseek-reasoner', { level: 'low', summary: true })
    expect(req.reasoning_effort).toBe('low')
  })
  it('responses sends reasoning { effort, summary }', async () => {
    const { client, create } = responsesClient()
    const adapter = new OpenAICompatibleResponsesAdapter(client, 'deepseek-reasoner', 'ds', { reasoning: DEEPSEEK_REASONING })
    const req = await sent(adapter, create, 'deepseek-reasoner', { level: 'high', summary: true })
    expect(req.reasoning).toEqual({ effort: 'high', summary: 'auto' })
  })
  it('no option -> unchanged behaviour (nothing sent)', async () => {
    const { client, create } = chatClient()
    const adapter = new OpenAICompatibleChatAdapter(client, 'plain', 'p')
    const req = await sent(adapter, create, 'plain', { level: 'high', summary: true })
    expect(req).not.toHaveProperty('reasoning_effort')
  })
})

// ---------------------------------------------------------------------------
// Types (never executed)
// ---------------------------------------------------------------------------

type DeepSeekCap = ModelReasoningCapability<typeof DEEPSEEK_REASONING>

export function typeChecks(client: OpenAI) {
  const messages = [{ role: 'user' as const, content: 'hi' }]
  const ds = new DeepSeekAdapter(client, 'deepseek-reasoner', 'ds')
  const qwen = new QwenAdapter(client, 'qwen3-max', 'qwen')

  chat({ adapter: ds, messages, threadId: 't', reasoning: 'high' })
  chat({ adapter: ds, messages, threadId: 't', reasoning: { level: 'low', summary: false } })
  // @ts-expect-error 'medium' is not a declared level
  chat({ adapter: ds, messages, threadId: 't', reasoning: 'medium' })
  // @ts-expect-error no budget on this model
  chat({ adapter: ds, messages, threadId: 't', reasoning: { level: 'high', budgetTokens: 1000 } })

  chat({ adapter: qwen, messages, threadId: 't', reasoning: 'off' })
  chat({ adapter: qwen, messages, threadId: 't', reasoning: 'high', modelOptions: { temperature: 0.2 } })
  // @ts-expect-error not a Qwen option
  chat({ adapter: qwen, messages, threadId: 't', modelOptions: { enable_thinkng: true } })

  // constructor option with the generic written out
  const withOption = new OpenAICompatibleChatAdapter<'deepseek-reasoner', Record<string, any>, readonly ['text'], readonly [], DeepSeekCap>(
    client, 'deepseek-reasoner', 'ds', { reasoning: DEEPSEEK_REASONING },
  )
  chat({ adapter: withOption, messages, threadId: 't', reasoning: 'high' })

  // no generic -> reasoning stays a type error (unchanged)
  const plain = new OpenAICompatibleChatAdapter(client, 'plain', 'p')
  // @ts-expect-error a model without reasoning takes no reasoning option
  chat({ adapter: plain, messages, threadId: 't', reasoning: 'high' })
}
