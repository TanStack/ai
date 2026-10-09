import { chat } from '@tanstack/ai'
import { createMistralText } from '../src'

const messages = [{ role: 'user' as const, content: 'hi' }]

chat({
  adapter: createMistralText('mistral-small-latest', 'k'),
  messages,
  reasoning: 'off',
})

chat({
  adapter: createMistralText('mistral-small-latest', 'k'),
  messages,
  // @ts-expect-error mistral-small-latest has only off and high
  reasoning: 'low',
})

chat({
  adapter: createMistralText('mistral-large-latest', 'k'),
  messages,
  // @ts-expect-error mistral-large-latest does not reason
  reasoning: 'high',
})
