import { chat } from '@tanstack/ai'
import { codexText } from '../src'

const messages = [{ role: 'user' as const, content: 'hi' }]

chat({
  adapter: codexText('gpt-5.1-codex'),
  messages,
  reasoning: 'high',
})

chat({
  adapter: codexText('gpt-5.1-codex'),
  messages,
  // @ts-expect-error gpt-5.1-codex has no max level
  reasoning: 'max',
})

chat({
  adapter: codexText('gpt-5.1-codex'),
  messages,
  // @ts-expect-error modelReasoningEffort is the chat() reasoning option now
  modelOptions: { modelReasoningEffort: 'low' },
})
