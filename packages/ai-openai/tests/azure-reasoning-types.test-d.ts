import { chat } from '@tanstack/ai'
import { createAzureOpenaiText } from '../src'

const messages = [{ role: 'user' as const, content: 'hi' }]
const config = { resourceName: 'resource', deploymentName: 'prod-chat' }

chat({
  adapter: createAzureOpenaiText('gpt-5.5', 'key', config),
  messages,
  reasoning: 'high',
})

chat({
  adapter: createAzureOpenaiText('gpt-5.2', 'key', config),
  messages,
  // @ts-expect-error gpt-5.2 has no max level
  reasoning: 'max',
})

chat({
  adapter: createAzureOpenaiText('gpt-5.5', 'key', config),
  messages,
  // @ts-expect-error reasoning is the chat() option, not a model option
  modelOptions: { reasoning: { effort: 'high' } },
})

chat({
  adapter: createAzureOpenaiText('my-deployment', 'key', config),
  messages,
  // @ts-expect-error a deployment name is not an OpenAI model, so no levels
  reasoning: 'high',
})
