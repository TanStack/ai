import { chat, summarize } from '@tanstack/ai'
import { expectTypeOf } from 'vitest'
import {
  createNeonText,
  createNeonSummarize,
  neonText,
  neonSummarize,
  NEON_CHAT_MODELS,
} from '../src'
import type {
  NeonAnthropicTextAdapter,
  NeonResponsesTextAdapter,
  NeonTextAdapter,
} from '../src'

const messages = [{ role: 'user' as const, content: 'hi' }]

// Each model gets the adapter of its route.
expectTypeOf(createNeonText('claude-sonnet-5-5', 'k')).toEqualTypeOf<
  NeonAnthropicTextAdapter<'claude-sonnet-5-5'>
>()
expectTypeOf(createNeonText('gpt-5-3-codex', 'k')).toEqualTypeOf<
  NeonResponsesTextAdapter<'gpt-5-3-codex'>
>()
expectTypeOf(
  createNeonText('gpt-5-4', 'k', { api: 'responses' }),
).toEqualTypeOf<NeonResponsesTextAdapter<'gpt-5-4'>>()
expectTypeOf(createNeonText('gemini-3-8-flash', 'k')).toEqualTypeOf<
  NeonTextAdapter<'gemini-3-8-flash'>
>()

// @ts-expect-error the Responses route does not serve Gemini
createNeonText('gemini-3-8-flash', 'k', { api: 'responses' })

// @ts-expect-error a Responses-only model cannot select Chat Completions
createNeonText('gpt-5-3-codex', 'k', { api: 'chat' })
// @ts-expect-error the environment factory has the same route restriction
neonText('gpt-5-5-pro', { api: 'chat' })
// @ts-expect-error Claude always uses the Anthropic Messages route
createNeonText('claude-opus-5-5', 'k', { api: 'chat' })
// @ts-expect-error Claude cannot take OpenAI route options
neonText('claude-opus-5-5', { api: 'responses' })

expectTypeOf(
  createNeonText('gemini-3-8-flash', 'k')['~types']['inputModalities'],
).toEqualTypeOf<readonly ['text', 'image']>()
expectTypeOf(
  createNeonText('gpt-5-4', 'k', { api: 'responses' })['~types'][
    'inputModalities'
  ],
).toEqualTypeOf<readonly ['text', 'image', 'document']>()

chat({
  adapter: createNeonText('gpt-5-3-codex', 'k'),
  messages,
  threadId: 'thread-1',
  // @ts-expect-error the Responses API uses max_output_tokens
  modelOptions: { max_tokens: 10 },
})

chat({
  adapter: createNeonText('gemini-3-8-flash', 'k'),
  messages,
  threadId: 'thread-1',
  reasoning: 'high',
})

chat({
  adapter: createNeonText('gemini-3-8-flash', 'k'),
  messages,
  threadId: 'thread-1',
  // @ts-expect-error gemini-3-8-flash has no max level
  reasoning: 'max',
})

chat({
  adapter: createNeonText('gpt-5-4', 'k'),
  messages,
  threadId: 'thread-1',
  // @ts-expect-error the gateway's OpenAI routes take no token budget
  reasoning: { level: 'high', budgetTokens: 4000 },
})

chat({
  adapter: createNeonText('meta-llama-3-3-70b-instruct', 'k'),
  messages,
  threadId: 'thread-1',
  // @ts-expect-error the model does not reason
  reasoning: 'low',
})

// Claude keeps the Anthropic adapter's token budget.
chat({
  adapter: createNeonText('claude-sonnet-4-5', 'k'),
  messages,
  threadId: 'thread-1',
  reasoning: { level: 'high', budgetTokens: 4000 },
})

// Each route's summarize adapter fits `summarize()`.
void summarize({
  adapter: neonSummarize('gpt-6-1-sol'),
  threadId: 'thread-1',
  text: 'A long text.',
})
void summarize({
  adapter: neonSummarize('gpt-5-3-codex'),
  threadId: 'thread-1',
  text: 'A long text.',
})
void summarize({
  adapter: neonSummarize('claude-opus-5-5'),
  threadId: 'thread-1',
  text: 'A long text.',
})

// A runtime selection from the full catalog keeps automatic routing.
for (const model of NEON_CHAT_MODELS) {
  chat({ adapter: createNeonText(model, 'k'), messages, threadId: 'thread-1' })
  chat({ adapter: neonText(model), messages, threadId: 'thread-1' })
  void summarize({
    adapter: neonSummarize(model),
    threadId: 'thread-1',
    text: 'A long text.',
  })
  // @ts-expect-error not every member of the model union supports Chat Completions
  createNeonText(model, 'k', { api: 'chat' })
  // @ts-expect-error not every member of the model union supports Responses
  neonText(model, { api: 'responses' })
}

// Summarize enforces the same model/route pairs as chat.
// @ts-expect-error Gemini does not support Responses
createNeonSummarize('gemini-3-8-flash', 'k', { api: 'responses' })
// @ts-expect-error Claude uses Anthropic Messages
neonSummarize('claude-opus-5-5', { api: 'responses' })
// @ts-expect-error a Responses-only model cannot select Chat Completions
neonSummarize('gpt-5-3-codex', { api: 'chat' })

void summarize({
  adapter: createNeonSummarize('gpt-6-1-sol', 'k', { api: 'responses' }),
  threadId: 'thread-1',
  text: 'A long text.',
  modelOptions: { max_output_tokens: 100, truncation: 'auto' },
})
void summarize({
  adapter: neonSummarize('gpt-6-1-sol', { api: 'responses' }),
  threadId: 'thread-1',
  text: 'A long text.',
  // @ts-expect-error Responses uses max_output_tokens
  modelOptions: { max_tokens: 100 },
})
void summarize({
  adapter: neonSummarize('gpt-6-1-sol'),
  threadId: 'thread-1',
  text: 'A long text.',
  modelOptions: { max_tokens: 100 },
})
void summarize({
  adapter: neonSummarize('gpt-6-1-sol'),
  threadId: 'thread-1',
  text: 'A long text.',
  // @ts-expect-error Chat Completions uses max_tokens
  modelOptions: { max_output_tokens: 100 },
})
