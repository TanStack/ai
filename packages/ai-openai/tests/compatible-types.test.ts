import { expectTypeOf, test } from 'vitest'
import OpenAI from 'openai'
import { chat, createModel } from '@tanstack/ai'
import {
  OpenAICompatibleChatAdapter,
  OpenAICompatibleResponsesAdapter,
  openaiCompatible,
  openaiCompatibleText,
} from '../src/compatible/index'
import type { ModelReasoningCapability } from '@tanstack/ai/adapter-internals'
import type { ModelNameOf, ResolveCompatInput } from '../src/compatible/types'

const models = [
  'plain-model',
  createModel('reasoner', { input: ['text'], features: ['reasoning'] }),
] as const

test('ModelNameOf unions bare strings and def names', () => {
  expectTypeOf<ModelNameOf<typeof models>>().toEqualTypeOf<
    'plain-model' | 'reasoner'
  >()
})

test('ResolveCompatInput uses optimistic default for bare strings', () => {
  expectTypeOf<
    ResolveCompatInput<typeof models, 'plain-model'>
  >().toEqualTypeOf<readonly ['text', 'image']>()
})

test('ResolveCompatInput uses declared input for rich defs', () => {
  expectTypeOf<ResolveCompatInput<typeof models, 'reasoner'>>().toEqualTypeOf<
    readonly ['text']
  >()
})

test('provider rejects unknown model names', () => {
  const p = openaiCompatible({
    baseURL: 'https://x/v1',
    apiKey: 'k',
    models: ['known'] as const,
  })
  // @ts-expect-error 'nope' is not a declared model
  p('nope')
  p('known')
})

test('apiKey accepts an OpenAI token-provider function', () => {
  const tokenProvider = async () => 'token'
  openaiCompatible({
    baseURL: 'https://x/v1',
    apiKey: tokenProvider,
    models: ['known'] as const,
  })
  openaiCompatibleText('known', {
    baseURL: 'https://x/v1',
    apiKey: tokenProvider,
  })
})

const REASONING = {
  levels: { low: 'low', high: 'high' },
  budget: false,
} as const

test('chat({ reasoning }) takes the levels of the TReasoning generic', () => {
  const client = new OpenAI({ apiKey: 'k' })
  const messages = [{ role: 'user' as const, content: 'Hi' }]
  const adapter = new OpenAICompatibleChatAdapter<
    'deepseek-reasoner',
    Record<string, unknown>,
    readonly ['text'],
    readonly [],
    ModelReasoningCapability<typeof REASONING>
  >(client, 'deepseek-reasoner', 'deepseek', { reasoning: REASONING })

  chat({ adapter, messages, threadId: 't', reasoning: 'high' })
  chat({ adapter, messages, threadId: 't', reasoning: { level: 'low' } })
  // @ts-expect-error 'medium' is not a level of this model
  chat({ adapter, messages, threadId: 't', reasoning: 'medium' })
  chat({
    adapter,
    messages,
    threadId: 't',
    // @ts-expect-error this model takes no thinking budget
    reasoning: { level: 'high', budgetTokens: 1000 },
  })
})

test('the reasoning option must match the TReasoning generic', () => {
  const client = new OpenAI({ apiKey: 'k' })
  type Levels = ModelReasoningCapability<typeof REASONING>
  const ChatWithLevels = OpenAICompatibleChatAdapter<
    'm',
    Record<string, unknown>,
    readonly ['text'],
    readonly [],
    Levels
  >
  const ResponsesWithLevels = OpenAICompatibleResponsesAdapter<
    'm',
    Record<string, unknown>,
    readonly ['text'],
    readonly [],
    Levels
  >

  new ChatWithLevels(client, 'm', 'p', { reasoning: REASONING })
  new ResponsesWithLevels(client, 'm', 'p', { reasoning: REASONING })

  // @ts-expect-error the generic is set, so the reasoning option is required
  new ChatWithLevels(client, 'm', 'p')
  // @ts-expect-error the generic is set, so the reasoning option is required
  new ResponsesWithLevels(client, 'm', 'p', {})
  new ChatWithLevels(client, 'm', 'p', {
    reasoning: {
      // @ts-expect-error 'high' is a level of the generic, so it must be here
      levels: { low: 'low' },
      budget: false,
    },
  })
  new OpenAICompatibleChatAdapter(client, 'm', 'p', {
    // @ts-expect-error without the generic, chat() takes no reasoning
    reasoning: REASONING,
  })
})

test('chat({ reasoning }) stays a type error without the generic', () => {
  const client = new OpenAI({ apiKey: 'k' })
  const adapter = new OpenAICompatibleChatAdapter(client, 'plain', 'p')
  chat({
    adapter,
    messages: [{ role: 'user', content: 'Hi' }],
    threadId: 't',
    // @ts-expect-error a model without reasoning takes no reasoning option
    reasoning: 'high',
  })
})

test('the factories type chat({ reasoning }) from the levels of the model', () => {
  const base = {
    messages: [{ role: 'user' as const, content: 'Hi' }],
    threadId: 't',
  }
  const provider = openaiCompatible({
    baseURL: 'https://x/v1',
    apiKey: 'k',
    models: [
      'plain',
      createModel('reasoner', { input: ['text'], reasoning: REASONING }),
    ] as const,
  })

  chat({ ...base, adapter: provider('reasoner'), reasoning: 'high' })
  // @ts-expect-error 'medium' is not a level of this model
  chat({ ...base, adapter: provider('reasoner'), reasoning: 'medium' })
  // @ts-expect-error a model without levels takes no reasoning option
  chat({ ...base, adapter: provider('plain'), reasoning: 'high' })

  const single = openaiCompatibleText('reasoner', {
    baseURL: 'https://x/v1',
    apiKey: 'k',
    reasoning: REASONING,
  })
  chat({ ...base, adapter: single, reasoning: 'low' })
  // @ts-expect-error 'medium' is not a level of this model
  chat({ ...base, adapter: single, reasoning: 'medium' })

  const plain = openaiCompatibleText('plain', {
    baseURL: 'https://x/v1',
    apiKey: 'k',
  })
  // @ts-expect-error a model without levels takes no reasoning option
  chat({ ...base, adapter: plain, reasoning: 'high' })
})
