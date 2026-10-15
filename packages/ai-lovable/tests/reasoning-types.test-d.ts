import { chat } from '@tanstack/ai'
import { createLovableText } from '../src'

const messages = [{ role: 'user' as const, content: 'hi' }]

chat({
  adapter: createLovableText('openai/gpt-5', 'k'),
  messages,
  reasoning: 'minimal',
})

chat({
  adapter: createLovableText('openai/gpt-5', 'k'),
  messages,
  // @ts-expect-error gpt-5 has no max level
  reasoning: 'max',
})

chat({
  adapter: createLovableText('openai/gpt-5', 'k'),
  messages,
  // @ts-expect-error reasoning is the chat() option, not a model option
  modelOptions: { reasoning: { effort: 'low' } },
})
