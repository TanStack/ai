---
title: Amazon Bedrock
id: bedrock-adapter
order: 7
description: "Amazon Bedrock via Converse (default), Chat Completions, or Responses — Claude, Nova, Llama, gpt-oss, and more."
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

If you need AWS Bedrock models → install, auth, call `bedrockText(model, { region })`.

## When do I need which API?

| Path | Use for |
| --- | --- |
| **Converse** (default) | Claude, Nova, Llama, Mistral, DeepSeek, Cohere, AI21, gpt-oss — broad catalog |
| **Chat Completions** (`api: 'chat'`) | Open-weight only (gpt-oss, DeepSeek, Gemma, Qwen, …). **Not** Claude/Nova/Llama |
| **Responses** (`api: 'responses'`) | gpt-oss on mantle; stateful via `previous_response_id` / `store` |

Streaming + client tools on all paths. Reasoning surfaces when the model emits it; request-side Claude thinking budget is not wired on Converse yet.

## Install

```bash
pnpm add @tanstack/ai-bedrock
```

SigV4 uses `@aws-sdk/client-bedrock-runtime` (direct dependency).

## Auth

### API key

From [AWS Console](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html):

```bash
BEDROCK_API_KEY=your-bedrock-api-key
# or legacy:
AWS_BEARER_TOKEN_BEDROCK=your-bedrock-api-key
```

### SigV4

```bash
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_SESSION_TOKEN=...   # optional
```

Set `auth: 'sigv4'`, or leave `auth: 'auto'` with no API key.

### Resolution (`auth: 'auto'`)

1. Explicit `apiKey` on factory
2. `BEDROCK_API_KEY`
3. `AWS_BEARER_TOKEN_BEDROCK`
4. SigV4 credential chain

## Do this (Converse)

```typescript ignore
// ignore: iterating chat() stream needs @ag-ui/core base fields; see
// getting-started/quick-start-server for the type-checked consumption shape.
import { bedrockText } from '@tanstack/ai-bedrock'
import { chat } from '@tanstack/ai'

const adapter = bedrockText('us.anthropic.claude-haiku-4-5-20251001-v1:0', {
  region: 'us-east-1',
})

for await (const chunk of chat({
  adapter,
  messages: [{ role: 'user', content: 'What is the capital of France?' }],
})) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') process.stdout.write(chunk.delta ?? '')
}
```

```typescript
import { bedrockText } from '@tanstack/ai-bedrock'
import { chat } from '@tanstack/ai'

const claudeAdapter = bedrockText('us.anthropic.claude-haiku-4-5-20251001-v1:0', {
  region: 'us-east-1',
})

const novaAdapter = bedrockText('us.amazon.nova-pro-v1:0', {
  region: 'us-east-1',
})

const llamaAdapter = bedrockText('us.meta.llama4-maverick-17b-instruct-v1:0', {
  region: 'us-east-1',
})
```

### Explicit API key

```typescript
import { createBedrockText } from '@tanstack/ai-bedrock'

const adapter = createBedrockText(
  'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  'your-bedrock-api-key',
  { region: 'us-west-2' },
)
```

### Chat Completions

```typescript ignore
import { bedrockText } from '@tanstack/ai-bedrock'
import { chat } from '@tanstack/ai'

const adapter = bedrockText('openai.gpt-oss-20b-1:0', {
  region: 'us-east-1',
  api: 'chat',
})

for await (const chunk of chat({
  adapter,
  messages: [{ role: 'user', content: 'What is the capital of France?' }],
})) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') process.stdout.write(chunk.delta ?? '')
}
```

### Responses

```typescript ignore
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
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') process.stdout.write(chunk.delta ?? '')
}
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `api` | `'converse' \| 'chat' \| 'responses'` | `'converse'` | API path |
| `region` | `string` | `'us-east-1'` | AWS region |
| `auth` | `'apikey' \| 'sigv4' \| 'auto'` | `'auto'` | Auth mode |
| `apiKey` | `string` | — | Explicit key |
| `baseURL` | `string` | — | Override base URL |
| `endpoint` | `'runtime' \| 'mantle'` | `'runtime'` | Chat Completions only; Responses always mantle |

## Model availability

Catalog ships in `src/model-catalog.generated.ts` (refresh via `scripts/fetch-bedrock-models.ts`). **Enable models in your account/region** in the [console](https://console.aws.amazon.com/bedrock/home#/modelaccess). Compatibility: [AWS matrix](https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html).

## Supported

- Streaming chat
- Client-side tools
- Reasoning when the model emits it
- Multimodal (model-dependent)
- JSON schema / structured output

## API reference

### `bedrockText(model, config?)`

| `api` | Adapter name | SDK |
|---|---|---|
| `'converse'` | `bedrock-converse` | `@aws-sdk/client-bedrock-runtime` |
| `'chat'` | `bedrock` | `openai` (compatible) |
| `'responses'` | `bedrock-responses` | `openai` (compatible) |

### `createBedrockText(model, apiKey, config?)`

Explicit API key; skips env lookup.

## Next steps

- [Bedrock API keys](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html)
- [Model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)
- [API compatibility matrix](https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html)
- [Converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)
- [Streaming](../chat/streaming) · [Tools](../tools/tools)
