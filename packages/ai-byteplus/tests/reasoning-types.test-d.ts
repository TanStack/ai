import { chat } from '@tanstack/ai'
import { createBytePlusText } from '../src'

const messages = [{ role: 'user' as const, content: 'hi' }]

chat({
  adapter: createBytePlusText('glm-5-2-260617', 'k'),
  messages,
  reasoning: 'off',
})

chat({
  adapter: createBytePlusText('gpt-oss-120b-250805', 'k'),
  messages,
  // @ts-expect-error gpt-oss on Ark has no max level
  reasoning: 'max',
})

chat({
  adapter: createBytePlusText('glm-5-2-260617', 'k'),
  messages,
  // @ts-expect-error thinking is the chat() reasoning option now
  modelOptions: { thinking: { type: 'enabled' } },
})
