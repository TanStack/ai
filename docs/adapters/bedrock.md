---
title: Amazon Bedrock
id: bedrock-adapter
order: 7
description: "Use Amazon Bedrock's OpenAI-compatible Chat Completions and Responses APIs with TanStack AI — streaming, tools, reasoning, API-key or SigV4 auth, and configurable runtime/mantle endpoints."
keywords:
  - tanstack ai
  - amazon bedrock
  - aws
  - bedrock
  - openai compatible
  - chat completions
  - responses api
  - sigv4
  - claude
  - nova
  - llama
  - adapter
---

The Bedrock adapter connects TanStack AI to [Amazon Bedrock](https://aws.amazon.com/bedrock/) via Bedrock's OpenAI-compatible Chat Completions and Responses APIs. It is built on top of the `openai` SDK and supports streaming, client-side tool calling, and reasoning.

## Installation

```bash
pnpm add @tanstack/ai-bedrock
```

If you want to use **SigV4 authentication** (AWS credentials instead of an API key), also install the optional peer:

```bash
pnpm add aws-sigv4-fetch
```

`aws-sigv4-fetch` is not bundled with `@tanstack/ai-bedrock` — it is an optional install you only need when `auth: 'sigv4'` (or `auth: 'auto'` with no API key in the environment).

## Authentication

Bedrock supports two authentication modes.

### API Key

Bedrock issues API keys from the AWS Console. See the [Bedrock API keys guide](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html) for instructions.

Set one of the following environment variables and the adapter picks it up automatically:

```bash
BEDROCK_API_KEY=your-bedrock-api-key
# or the legacy name:
AWS_BEARER_TOKEN_BEDROCK=your-bedrock-api-key
```

### SigV4 (AWS credential chain)

For workloads that use IAM roles, instance profiles, or `~/.aws/credentials`, set `auth: 'sigv4'`. The adapter uses the standard AWS credential chain (environment variables, shared credential file, instance metadata, etc.) via `aws-sigv4-fetch`.

```bash
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_SESSION_TOKEN=...   # optional, for temporary credentials
```

### Auth resolution order (`auth: 'auto'`, the default)

1. Explicit `apiKey` passed to the factory
2. `BEDROCK_API_KEY` environment variable
3. `AWS_BEARER_TOKEN_BEDROCK` environment variable
4. SigV4 via the AWS credential chain (requires `aws-sigv4-fetch`)

## Configuration

`BedrockClientConfig` accepts the following options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `region` | `string` | `'us-east-1'` | Full AWS region string (e.g. `'us-west-2'`) |
| `endpoint` | `'runtime' \| 'mantle'` | `'runtime'` | Bedrock endpoint to target (Chat API only) |
| `auth` | `'apikey' \| 'sigv4' \| 'auto'` | `'auto'` | Authentication mode |
| `apiKey` | `string` | — | Explicit API key (overrides env vars) |
| `baseURL` | `string` | — | Override the computed base URL entirely |

The `endpoint` option applies only when `api: 'chat'` (or omitted). The `runtime` endpoint (`bedrock-runtime`) hosts the broad model catalog; `mantle` is an optional alternative. The Responses API always targets mantle.

## Chat Completions (default)

Use `bedrockText` with no `api` option, or `api: 'chat'`, to call Bedrock's Chat Completions endpoint. This gives you access to the broadest model catalog: Claude, Amazon Nova, Meta Llama, Mistral, DeepSeek, and OpenAI gpt-oss models.

```typescript
import { bedrockText } from '@tanstack/ai-bedrock'
import { chat } from '@tanstack/ai'

const adapter = bedrockText('us.anthropic.claude-3-7-sonnet-20250219-v1:0', {
  region: 'us-east-1',
})

for await (const chunk of chat({
  adapter,
  messages: [{ role: 'user', content: 'What is the capital of France?' }],
})) {
  if (chunk.type === 'content') process.stdout.write(chunk.delta)
}
```

### Explicit API key

```typescript
import { createBedrockText } from '@tanstack/ai-bedrock'

const adapter = createBedrockText(
  'us.amazon.nova-pro-v1:0',
  'your-bedrock-api-key',
  { region: 'us-west-2' },
)
```

## Responses API

Set `api: 'responses'` to use Bedrock's Responses API. This API is mantle-only, supports a narrower model set (currently the OpenAI gpt-oss family), and is stateful — you can pass `previous_response_id` and `store` through `modelOptions` to continue a conversation server-side.

```typescript
import { bedrockText } from '@tanstack/ai-bedrock'
import { chat } from '@tanstack/ai'

const adapter = bedrockText('openai.gpt-oss-120b-1:0', {
  region: 'us-east-1',
  api: 'responses',
})

for await (const chunk of chat({
  adapter,
  messages: [{ role: 'user', content: 'Summarize the Bedrock pricing page.' }],
})) {
  if (chunk.type === 'content') process.stdout.write(chunk.delta)
}
```

## Model Availability

The model catalog (`BEDROCK_CHAT_MODELS`, `BEDROCK_RESPONSES_MODELS`) is a hand-seeded snapshot of cross-region inference profile IDs. **Actual model availability depends on your AWS account's model access configuration and the region you are targeting.** Enable model access in the [Amazon Bedrock console](https://console.aws.amazon.com/bedrock/home#/modelaccess) before use. A maintainer refresh script (`scripts/fetch-bedrock-models.ts`) can regenerate the catalog.

## Supported Capabilities

- Streaming chat completions
- Client-side tool calling
- Reasoning (extended thinking)
- Multimodal input (text, images, documents — model-dependent)
- JSON schema / structured output

## API Reference

### `bedrockText(model, config?)`

Creates a Bedrock adapter using environment-variable auth.

- `model` — Model ID (e.g. `'us.anthropic.claude-3-7-sonnet-20250219-v1:0'`)
- `config.api` — `'chat'` (default) or `'responses'`
- `config.region` — AWS region string (default `'us-east-1'`)
- `config.endpoint` — `'runtime'` (default) or `'mantle'` (Chat API only)
- `config.auth` — `'auto'` (default), `'apikey'`, or `'sigv4'`
- `config.baseURL` — Override base URL

Returns a chat adapter for use with `chat()` or `generate()`.

### `createBedrockText(model, apiKey, config?)`

Creates a Bedrock adapter with an explicit API key, bypassing the environment-variable lookup.

## Next Steps

- [Amazon Bedrock API keys](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html) — Create and manage API keys
- [Amazon Bedrock model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) — Enable models in your account
- [Streaming Guide](../chat/streaming) — Learn about streaming responses
- [Tools Guide](../tools/tools) — Learn about tool calling
