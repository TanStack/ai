# @tanstack/ai-orcarouter

[OrcaRouter](https://www.orcarouter.ai) adapter for TanStack AI — one OpenAI-compatible endpoint that routes chat, tool calling, and structured outputs across many models with adaptive routing, automatic failover, zero-markup inference, observability, guardrails, and agent-tool governance.

## Installation

```bash
npm install @tanstack/ai-orcarouter
# or
pnpm add @tanstack/ai-orcarouter
# or
yarn add @tanstack/ai-orcarouter
```

## Setup

Get your API key from the [OrcaRouter dashboard](https://www.orcarouter.ai) and set it as an environment variable:

```bash
export ORCAROUTER_API_KEY="sk-orca_..."
```

## Usage

### Text/Chat Adapter

```typescript
import { orcaRouterText } from '@tanstack/ai-orcarouter'
import { chat } from '@tanstack/ai'

const stream = chat({
  adapter: orcaRouterText('openai/gpt-5.5-pro'),
  messages: [
    { role: 'user', content: 'Explain quantum computing in simple terms' },
  ],
})
```

### With Explicit API Key

```typescript
import { createOrcaRouterText } from '@tanstack/ai-orcarouter'

const adapter = createOrcaRouterText('openai/gpt-5.5-pro', 'sk-orca_api_key')
```

### Self-Hosted Gateways

OrcaRouter is self-hostable — point `baseURL` at your own deployment:

```typescript
import { createOrcaRouterText } from '@tanstack/ai-orcarouter'

const adapter = createOrcaRouterText('openai/gpt-5.5-pro', 'sk-orca_api_key', {
  baseURL: 'https://gateway.example.com/v1',
})
```

## Models

Any model listed on [orcarouter.ai/models](https://www.orcarouter.ai) works — pass its id as the model name. A curated set of flagship models additionally carries per-model type metadata (input modalities, provider options) with autocomplete, including `openai/gpt-5.5-pro`, `anthropic/claude-opus-4.8`, `google/gemini-3.1-pro-preview`, `deepseek/deepseek-v4-pro-0813`, and more (see `ORCAROUTER_CHAT_MODELS`).

Model ids use the `provider/model` prefix to pin routing to a specific provider, and `orcarouter/fusion` enables adaptive automatic routing across fallback models:

```typescript
orcaRouterText('orcarouter/fusion') // adaptive routing across fallback models
orcaRouterText('openai/gpt-5.5-pro') // pinned to OpenAI
```

## Features

- ✅ Streaming chat completions
- ✅ Structured output (JSON Schema)
- ✅ Function/tool calling
- ✅ Multimodal input (text + images for vision models)
- ✅ Reasoning output (`reasoning_content` deltas from reasoning models)
- ✅ Summarization (`orcaRouterSummarize`)
- ✅ Adaptive routing, automatic failover, observability, guardrails, and agent-tool governance — applied gateway-side, no application code changes

## Tree-Shakeable Adapters

This package uses tree-shakeable adapters, so you only import what you need:

```typescript
// Text/chat only
import { orcaRouterText } from '@tanstack/ai-orcarouter'

// Summarization only
import { orcaRouterSummarize } from '@tanstack/ai-orcarouter'
```

## Documentation

- [TanStack AI Documentation](https://tanstack.com/ai)
- [OrcaRouter Documentation](https://www.orcarouter.ai)
