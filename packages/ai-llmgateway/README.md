# @tanstack/ai-llmgateway

[LLM Gateway](https://llmgateway.io) adapter for TanStack AI — one OpenAI-compatible endpoint that routes chat, tool calling, and structured outputs to hundreds of models across many providers.

## Installation

```bash
npm install @tanstack/ai-llmgateway
# or
pnpm add @tanstack/ai-llmgateway
# or
yarn add @tanstack/ai-llmgateway
```

## Setup

Get your API key from the [LLM Gateway dashboard](https://llmgateway.io) and set it as an environment variable:

```bash
export LLM_GATEWAY_API_KEY="llmgtwy_..."
```

## Usage

### Text/Chat Adapter

```typescript
import { llmGatewayText } from '@tanstack/ai-llmgateway'
import { chat } from '@tanstack/ai'

const stream = chat({
  adapter: llmGatewayText('gpt-5.6-terra'),
  messages: [
    { role: 'user', content: 'Explain quantum computing in simple terms' },
  ],
})
```

### With Explicit API Key

```typescript
import { createLLMGatewayText } from '@tanstack/ai-llmgateway'

const adapter = createLLMGatewayText('gpt-5.6-terra', 'llmgtwy_api_key')
```

### Self-Hosted Gateways

LLM Gateway is open source and self-hostable — point `baseURL` at your own deployment:

```typescript
import { createLLMGatewayText } from '@tanstack/ai-llmgateway'

const adapter = createLLMGatewayText('gpt-5.6-terra', 'llmgtwy_api_key', {
  baseURL: 'https://gateway.example.com/v1',
})
```

## Models

Any model listed on [llmgateway.io/models](https://llmgateway.io/models) works — pass its id as the model name. A curated set of flagship models additionally carries per-model type metadata (input modalities, provider options) with autocomplete, including `gpt-5.6-terra`, `claude-sonnet-5`, `gemini-pro-latest`, `kimi-k3`, `glm-5.2`, `deepseek-v4-pro`, and more (see `LLMGATEWAY_CHAT_MODELS`).

Model ids accept an optional `provider/` prefix to pin routing to a specific provider:

```typescript
llmGatewayText('kimi-k3') // gateway picks the best available provider
llmGatewayText('moonshot/kimi-k3') // always routed to Moonshot
```

## Features

- ✅ Streaming chat completions
- ✅ Structured output (JSON Schema)
- ✅ Function/tool calling
- ✅ Multimodal input (text + images for vision models)
- ✅ Reasoning output (`reasoning_content` deltas from reasoning models)
- ✅ Summarization (`llmGatewaySummarize`)

## Tree-Shakeable Adapters

This package uses tree-shakeable adapters, so you only import what you need:

```typescript
// Text/chat only
import { llmGatewayText } from '@tanstack/ai-llmgateway'

// Summarization only
import { llmGatewaySummarize } from '@tanstack/ai-llmgateway'
```

## Documentation

- [TanStack AI Documentation](https://tanstack.com/ai)
- [LLM Gateway Documentation](https://docs.llmgateway.io)
