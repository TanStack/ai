import { chat } from '@tanstack/ai'
import { createGroqText } from '../src'

const messages = [{ role: 'user' as const, content: 'hi' }]

chat({
  adapter: createGroqText('qwen/qwen3-32b', 'k'),
  messages,
  reasoning: 'off',
})

chat({
  adapter: createGroqText('openai/gpt-oss-120b', 'k'),
  messages,
  // @ts-expect-error gpt-oss cannot turn thinking off
  reasoning: 'off',
})

chat({
  adapter: createGroqText('openai/gpt-oss-120b', 'k'),
  messages,
  // @ts-expect-error reasoning_effort is the chat() reasoning option now
  modelOptions: { reasoning_effort: 'low' },
})
