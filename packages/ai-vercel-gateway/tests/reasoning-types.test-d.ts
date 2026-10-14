import { chat } from '@tanstack/ai'
import { createVercelGatewayText } from '../src'

const messages = [{ role: 'user' as const, content: 'hi' }]

// Chat Completions takes a token budget on a budget model.
chat({
  adapter: createVercelGatewayText('google/gemini-2.5-pro', 'k', {
    api: 'chat',
  }),
  messages,
  reasoning: { level: 'high', budgetTokens: 4000 },
})

chat({
  adapter: createVercelGatewayText('google/gemini-2.5-pro', 'k', {
    api: 'chat',
  }),
  messages,
  // @ts-expect-error gemini-2.5-pro has no max level
  reasoning: 'max',
})

chat({
  adapter: createVercelGatewayText('google/gemini-2.5-pro', 'k'),
  messages,
  // @ts-expect-error the Responses API has no token budget field
  reasoning: { level: 'high', budgetTokens: 4000 },
})
