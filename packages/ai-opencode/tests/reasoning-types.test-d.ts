import { chat } from '@tanstack/ai'
import { opencodeText } from '../src'

const messages = [{ role: 'user' as const, content: 'hi' }]

chat({
  adapter: opencodeText('anthropic/claude-sonnet-4-5'),
  messages,
  reasoning: { level: 'high', budgetTokens: 4000 },
})

chat({
  adapter: opencodeText('openai/gpt-5.1-codex'),
  messages,
  // @ts-expect-error gpt-5.1-codex cannot turn thinking off
  reasoning: 'off',
})
