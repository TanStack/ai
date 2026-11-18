import { chat } from '@tanstack/ai'
import { bedrockText } from '../../src'

const adapter = bedrockText('us.anthropic.claude-sonnet-4-5-20250929-v1:0')
const messages = [{ role: 'user' as const, content: 'hi' }]

for (const serviceTier of [
  'priority',
  'default',
  'flex',
  'reserved',
] as const) {
  chat({
    adapter,
    messages,
    threadId: 'thread-1',
    modelOptions: {
      requestMetadata: { application: 'my-app', environment: 'production' },
      serviceTier,
    },
  })
}

chat({
  adapter,
  messages,
  threadId: 'thread-1',
  modelOptions: {
    // @ts-expect-error - Bedrock's standard tier is named 'default'.
    serviceTier: 'standard',
  },
})

chat({
  adapter,
  messages,
  threadId: 'thread-1',
  modelOptions: {
    // @ts-expect-error - The adapter accepts a tier name, not the AWS wire object.
    serviceTier: { type: 'priority' },
  },
})

chat({
  adapter,
  messages,
  threadId: 'thread-1',
  modelOptions: {
    // @ts-expect-error - Request metadata values must be strings.
    requestMetadata: { count: 1 },
  },
})
