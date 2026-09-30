import { chat } from '@tanstack/ai'
import { createOpenRouterText } from '../src/adapters/text'
import { createOpenRouterResponsesText } from '../src/adapters/responses-text'

const messages = [{ role: 'user' as const, content: 'hi' }]

chat({
  adapter: createOpenRouterText('openai/gpt-5.5', 'k'),
  messages,
  reasoning: 'xhigh',
})

chat({
  adapter: createOpenRouterText('google/gemini-2.5-pro', 'k'),
  messages,
  // @ts-expect-error the chat request schema has no token budget field
  reasoning: { level: 'high', budgetTokens: 4000 },
})

// The Responses API takes the budget.
chat({
  adapter: createOpenRouterResponsesText('google/gemini-2.5-pro', 'k'),
  messages,
  reasoning: { level: 'high', budgetTokens: 4000 },
})

chat({
  adapter: createOpenRouterText('openai/gpt-5.5', 'k'),
  messages,
  // @ts-expect-error reasoning lives on chat({ reasoning }), not modelOptions
  modelOptions: { reasoning: { effort: 'high' } },
})
