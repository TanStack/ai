import { chat, summarize } from '@tanstack/ai'
import { expectTypeOf } from 'vitest'
import { createNeonText, neonSummarize } from '../src'
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

chat({
  adapter: createNeonText('gemini-3-8-flash', 'k'),
  messages,
  reasoning: 'high',
})

chat({
  adapter: createNeonText('gemini-3-8-flash', 'k'),
  messages,
  // @ts-expect-error gemini-3-8-flash has no max level
  reasoning: 'max',
})

chat({
  adapter: createNeonText('gpt-5-4', 'k'),
  messages,
  // @ts-expect-error the gateway's OpenAI routes take no token budget
  reasoning: { level: 'high', budgetTokens: 4000 },
})

chat({
  adapter: createNeonText('meta-llama-3-3-70b-instruct', 'k'),
  messages,
  // @ts-expect-error the model does not reason
  reasoning: 'low',
})

// Claude keeps the Anthropic adapter's token budget.
chat({
  adapter: createNeonText('claude-sonnet-4-5', 'k'),
  messages,
  reasoning: { level: 'high', budgetTokens: 4000 },
})

// Each route's summarize adapter fits `summarize()`.
void summarize({ adapter: neonSummarize('gpt-6-1-sol'), text: 'A long text.' })
void summarize({
  adapter: neonSummarize('gpt-5-3-codex'),
  text: 'A long text.',
})
void summarize({
  adapter: neonSummarize('claude-opus-5-5'),
  text: 'A long text.',
})
