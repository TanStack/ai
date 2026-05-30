# @tanstack/ai-bedrock

Amazon Bedrock adapter for TanStack AI — OpenAI-compatible Chat Completions and Responses APIs with streaming, tool calling, and reasoning.

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

const adapter = bedrockText('us.anthropic.claude-3-7-sonnet-20250219-v1:0', {
  region: 'us-east-1',
})

for await (const chunk of chat({
  adapter,
  messages: [{ role: 'user', content: 'Hello from Bedrock!' }],
})) {
  if (chunk.type === 'content') process.stdout.write(chunk.delta)
}
```

### Responses API

```typescript
import { bedrockText } from '@tanstack/ai-bedrock'

const adapter = bedrockText('openai.gpt-oss-120b', {
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
4. SigV4 via the AWS credential chain (requires `pnpm add aws-sigv4-fetch`)

To use SigV4, install the optional peer dependency and set `auth: 'sigv4'`:

```bash
pnpm add aws-sigv4-fetch
```

```typescript
const adapter = bedrockText('us.anthropic.claude-3-7-sonnet-20250219-v1:0', {
  auth: 'sigv4',
  region: 'us-east-1',
})
```

## Documentation

Full documentation: [TanStack AI — Amazon Bedrock adapter](https://tanstack.com/ai/latest/docs/adapters/bedrock)

## License

MIT
