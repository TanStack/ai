# @tanstack/ai-bedrock

Amazon Bedrock adapter for TanStack AI — the native Converse API (default) plus the OpenAI-compatible Chat Completions and Responses APIs, with streaming, tool calling, and reasoning.

## Installation

```bash
pnpm add @tanstack/ai-bedrock
# or
npm install @tanstack/ai-bedrock
# or
yarn add @tanstack/ai-bedrock
```

## Setup

Get a Bedrock API key from the [Amazon Bedrock console](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html) and set it as an environment variable:

```bash
BEDROCK_API_KEY=your-bedrock-api-key
```

Alternatively, configure AWS credentials for SigV4 auth (see below).

## Usage

```typescript
import { bedrockText } from '@tanstack/ai-bedrock'
import { chat } from '@tanstack/ai'

const adapter = bedrockText('us.anthropic.claude-haiku-4-5-20251001-v1:0', {
  region: 'us-east-1',
})

for await (const chunk of chat({
  adapter,
  messages: [{ role: 'user', content: 'Hello from Bedrock!' }],
})) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT')
    process.stdout.write(chunk.delta ?? '')
}
```

### Responses API

```typescript
import { bedrockText } from '@tanstack/ai-bedrock'

const adapter = bedrockText('openai.gpt-oss-120b-1:0', {
  region: 'us-east-1',
  api: 'responses',
})
```

### With Explicit API Key

```typescript
import { createBedrockText } from '@tanstack/ai-bedrock'

const adapter = createBedrockText(
  'us.amazon.nova-pro-v1:0',
  'your-bedrock-api-key',
  { region: 'us-west-2' },
)
```

## Authentication

Auth is resolved in this order:

1. Explicit `apiKey` passed to the factory
2. `BEDROCK_API_KEY` environment variable
3. `AWS_BEARER_TOKEN_BEDROCK` environment variable
4. SigV4 via the AWS credential chain

SigV4 signing is built in (via the bundled `@smithy/signature-v4`) — no
additional packages required. Set `auth: 'sigv4'` and provide AWS credentials
through the standard credential chain (env vars, shared config, instance role):

```typescript
const adapter = bedrockText('us.anthropic.claude-haiku-4-5-20251001-v1:0', {
  auth: 'sigv4',
  region: 'us-east-1',
})
```

## Documentation

Full documentation: [TanStack AI — Amazon Bedrock adapter](https://tanstack.com/ai/latest/docs/adapters/bedrock)

## License

MIT
