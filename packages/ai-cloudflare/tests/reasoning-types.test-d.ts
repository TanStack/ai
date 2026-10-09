import { chat } from '@tanstack/ai'
import { createCloudflareText } from '../src'

const messages = [{ role: 'user' as const, content: 'hi' }]
const config = { accountId: 'a', apiKey: 'k' }

chat({
  adapter: createCloudflareText('@cf/zai-org/glm-5.3', config),
  messages,
  reasoning: 'max',
})

chat({
  adapter: createCloudflareText('@cf/zai-org/glm-5.3', config),
  messages,
  // @ts-expect-error glm-5.3 cannot turn thinking off
  reasoning: 'off',
})

chat({
  adapter: createCloudflareText('@cf/qwen/qwq-32b', config),
  messages,
  // @ts-expect-error reasoning_effort is the chat() reasoning option now
  modelOptions: { reasoning_effort: 'low' },
})
