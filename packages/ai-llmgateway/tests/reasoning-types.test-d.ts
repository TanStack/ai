import { chat } from '@tanstack/ai'
import { createLLMGatewayText } from '../src'

const messages = [{ role: 'user' as const, content: 'hi' }]

chat({
  adapter: createLLMGatewayText('gpt-5.5', 'k'),
  messages,
  reasoning: 'xhigh',
})

chat({
  adapter: createLLMGatewayText('gpt-5.5', 'k'),
  messages,
  // @ts-expect-error gpt-5.5 has no max level
  reasoning: 'max',
})

chat({
  adapter: createLLMGatewayText('gpt-5.5', 'k'),
  messages,
  // @ts-expect-error this API has no token budget field
  reasoning: { level: 'high', budgetTokens: 4000 },
})
