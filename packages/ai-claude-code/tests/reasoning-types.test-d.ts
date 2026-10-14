import { chat } from '@tanstack/ai'
import { claudeCodeText } from '../src'

const messages = [{ role: 'user' as const, content: 'hi' }]

// Haiku thinks with a token budget.
chat({
  adapter: claudeCodeText('claude-haiku-4-5'),
  messages,
  reasoning: { level: 'high', budgetTokens: 4000 },
})

chat({
  adapter: claudeCodeText('claude-opus-4-8'),
  messages,
  // @ts-expect-error claude-opus-4-8 takes no token budget
  reasoning: { level: 'high', budgetTokens: 4000 },
})

chat({
  adapter: claudeCodeText('claude-haiku-4-5'),
  messages,
  // @ts-expect-error claude-haiku-4-5 has no max level
  reasoning: 'max',
})
