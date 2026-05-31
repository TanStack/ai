---
title: Amazon Bedrock
id: bedrock-adapter
order: 7
description: "Use Amazon Bedrock with TanStack AI — the Converse API is the default, reaching Claude, Nova, Llama, Mistral, DeepSeek, and more. Opt into OpenAI-compatible Chat Completions or Responses for open-weight and gpt-oss models. Supports streaming, tools, reasoning, and API-key or SigV4 auth."
keywords:
  - tanstack ai
  - amazon bedrock
  - aws
  - bedrock
  - converse api
  - openai compatible
  - chat completions
  - responses api
  - sigv4
  - claude
  - nova
  - llama
  - adapter
---

The Bedrock adapter connects TanStack AI to [Amazon Bedrock](https://aws.amazon.com/bedrock/) with three API paths:

- **Converse** (default) — Bedrock's model-agnostic API built on `@aws-sdk/client-bedrock-runtime`. Reaches the broad chat catalog including Anthropic Claude, Amazon Nova, Meta Llama, Mistral, DeepSeek, Cohere, AI21, and OpenAI gpt-oss models.
- **Chat Completions** (`api: 'chat'`) — Bedrock's OpenAI-compatible Chat Completions endpoint. Reaches open-weight models only (gpt-oss, DeepSeek V3.x, Gemma, Qwen, Mistral open models, GLM, etc.). Does NOT reach Claude, Nova, or Llama.
- **Responses** (`api: 'responses'`) — Bedrock's OpenAI-compatible Responses API, mantle-only. Currently the OpenAI gpt-oss family.

All paths support streaming, client-side tool calling, and reasoning.

## Installation

```bash
pnpm add @tanstack/ai-bedrock
```

No additional packages are required. SigV4 authentication is handled by `@aws-sdk/client-bedrock-runtime`, which is a direct dependency.

## Quick Start (Converse — default)

The default `bedrockText` call uses the Converse API and reaches the broad model catalog:

```typescript
import { bedrockText } from '@tanstack/ai-bedrock'
import { chat } from '@tanstack/ai'

const adapter = bedrockText('us.anthropic.claude-haiku-4-5-20251001-v1:0', {
  region: 'us-east-1',
})

for await (const chunk of chat({
  adapter,
  messages: [{ role: 'user', content: 'What is the capital of France?' }],
})) {
  if (chunk.type === 'content') process.stdout.write(chunk.delta)
}
```

Equivalent to passing `{ api: 'converse' }` explicitly. Returns a `bedrock-converse` adapter.

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

For workloads using IAM roles, instance profiles, or `~/.aws/credentials`, set `auth: 'sigv4'` (or leave it as `'auto'` with no API key in the environment). SigV4 works out of the box via `@aws-sdk/client-bedrock-runtime` — no additional packages required.

```bash
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_SESSION_TOKEN=...   # optional, for temporary credentials
```

### Auth resolution order (`auth: 'auto'`, the default)

1. Explicit `apiKey` passed to the factory
2. `BEDROCK_API_KEY` environment variable
3. `AWS_BEARER_TOKEN_BEDROCK` environment variable
4. SigV4 via the standard AWS credential chain

## Configuration

`BedrockClientConfig` accepts the following options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `api` | `'converse' \| 'chat' \| 'responses'` | `'converse'` | Bedrock API to use |
| `region` | `string` | `'us-east-1'` | AWS region string (e.g. `'us-west-2'`) |
| `auth` | `'apikey' \| 'sigv4' \| 'auto'` | `'auto'` | Authentication mode |
| `apiKey` | `string` | — | Explicit API key (overrides env vars) |
| `baseURL` | `string` | — | Override the computed base URL entirely |
| `endpoint` | `'runtime' \| 'mantle'` | `'runtime'` | Bedrock endpoint to target (Chat Completions path only) |

The `endpoint` option only applies when `api: 'chat'`. The `runtime` endpoint (`bedrock-runtime`) hosts the broad open-weight catalog; `mantle` is an alternative. The Responses API always targets mantle.

## Converse API (default)

`bedrockText(model)` or `bedrockText(model, { api: 'converse' })` returns a `bedrock-converse` adapter backed by `@aws-sdk/client-bedrock-runtime`. This is Bedrock's model-agnostic conversational API and is the recommended path for most use cases.

**Model scope:** Anthropic Claude, Amazon Nova, Meta Llama, Mistral, DeepSeek, Cohere, AI21, OpenAI gpt-oss, and other models accessible in your account. See [Model availability](#model-availability) below.

```typescript
import { bedrockText } from '@tanstack/ai-bedrock'
import { chat } from '@tanstack/ai'

// Claude via Converse
const claudeAdapter = bedrockText('us.anthropic.claude-haiku-4-5-20251001-v1:0', {
  region: 'us-east-1',
})

// Amazon Nova via Converse
const novaAdapter = bedrockText('us.amazon.nova-pro-v1:0', {
  region: 'us-east-1',
})

// Meta Llama via Converse
const llamaAdapter = bedrockText('us.meta.llama3-3-70b-instruct-v1:0', {
  region: 'us-east-1',
})
```

### Explicit API key (Converse)

```typescript
import { createBedrockText } from '@tanstack/ai-bedrock'

const adapter = createBedrockText(
  'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  'your-bedrock-api-key',
  { region: 'us-west-2' },
)
```

## Chat Completions API (`api: 'chat'`)

Set `api: 'chat'` to use Bedrock's OpenAI-compatible Chat Completions endpoint. Returns a `bedrock` adapter.

**Model scope:** Open-weight models only — gpt-oss, DeepSeek V3.x, Gemma, Qwen, Mistral open models, GLM, and similar. Claude, Nova, and Llama are NOT available on this endpoint. See the [AWS API compatibility matrix](https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html) for the current list.

```typescript
import { bedrockText } from '@tanstack/ai-bedrock'
import { chat } from '@tanstack/ai'

const adapter = bedrockText('openai.gpt-oss-mini-1:0', {
  region: 'us-east-1',
  api: 'chat',
})

for await (const chunk of chat({
  adapter,
  messages: [{ role: 'user', content: 'What is the capital of France?' }],
})) {
  if (chunk.type === 'content') process.stdout.write(chunk.delta)
}
```

## Responses API (`api: 'responses'`)

Set `api: 'responses'` to use Bedrock's OpenAI-compatible Responses API. Returns a `bedrock-responses` adapter. This API is mantle-only.

**Model scope:** Currently the OpenAI gpt-oss family. The Responses API is stateful — pass `previous_response_id` and `store` through `modelOptions` to continue a conversation server-side.

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

The adapter ships with a hand-seeded snapshot catalog (`src/model-catalog.generated.ts`) of confirmed model IDs. This catalog can be refreshed by the maintainer script `scripts/fetch-bedrock-models.ts`, which calls `ListFoundationModels` with AWS credentials.

**Actual model availability depends on your AWS account's model access configuration and the region you are targeting.** Enable model access in the [Amazon Bedrock console](https://console.aws.amazon.com/bedrock/home#/modelaccess) before use.

For the full list of models and which API endpoints they support, see the [AWS API compatibility matrix](https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html).

## Supported Capabilities

- Streaming chat completions
- Client-side tool calling
- Reasoning (extended thinking)
- Multimodal input (text, images, documents — model-dependent)
- JSON schema / structured output

## API Reference

### `bedrockText(model, config?)`

Creates a Bedrock adapter using environment-variable auth.

- `model` — Model ID (e.g. `'us.anthropic.claude-haiku-4-5-20251001-v1:0'`)
- `config.api` — `'converse'` (default), `'chat'`, or `'responses'`
- `config.region` — AWS region string (default `'us-east-1'`)
- `config.auth` — `'auto'` (default), `'apikey'`, or `'sigv4'`
- `config.apiKey` — Explicit API key (overrides env vars)
- `config.baseURL` — Override base URL
- `config.endpoint` — `'runtime'` (default) or `'mantle'` (Chat Completions path only)

Returns a chat adapter for use with `chat()` or `generate()`.

| `api` value | Adapter name | Underlying SDK |
|---|---|---|
| `'converse'` (default) | `bedrock-converse` | `@aws-sdk/client-bedrock-runtime` |
| `'chat'` | `bedrock` | `openai` (OpenAI-compatible) |
| `'responses'` | `bedrock-responses` | `openai` (OpenAI-compatible) |

### `createBedrockText(model, apiKey, config?)`

Creates a Bedrock adapter with an explicit API key, bypassing the environment-variable lookup.

## Next Steps

- [Amazon Bedrock API keys](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html) — Create and manage API keys
- [Amazon Bedrock model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) — Enable models in your account
- [AWS API compatibility matrix](https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html) — Which models work with which APIs
- [Converse API reference](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html) — Native Converse API docs
- [Streaming Guide](../chat/streaming) — Learn about streaming responses
- [Tools Guide](../tools/tools) — Learn about tool calling
