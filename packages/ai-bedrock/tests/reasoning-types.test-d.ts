import { chat } from '@tanstack/ai'
import { bedrockText } from '../src'

const messages = [{ role: 'user' as const, content: 'hi' }]
const config = { region: 'us-east-1' }

// gpt-oss takes low, medium, and high.
chat({
  adapter: bedrockText('openai.gpt-oss-120b-1:0', config),
  messages,
  reasoning: 'high',
})

chat({
  adapter: bedrockText('openai.gpt-oss-120b-1:0', config),
  messages,
  // @ts-expect-error - gpt-oss has no max level
  reasoning: 'max',
})

// Claude on Converse takes a token budget.
chat({
  adapter: bedrockText('us.anthropic.claude-haiku-4-5-20251001-v1:0', config),
  messages,
  reasoning: { level: 'high', budgetTokens: 4096 },
})

chat({
  adapter: bedrockText('openai.gpt-oss-20b-1:0', config),
  messages,
  // @ts-expect-error - gpt-oss takes no token budget
  reasoning: { level: 'high', budgetTokens: 4096 },
})

chat({
  adapter: bedrockText('us.amazon.nova-pro-v1:0', config),
  messages,
  // @ts-expect-error - Nova does not reason
  reasoning: 'low',
})
