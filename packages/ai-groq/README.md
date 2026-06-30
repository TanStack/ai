# @tanstack/ai-groq

Groq adapter for TanStack AI

## Installation

```bash
npm install @tanstack/ai-groq
# or
pnpm add @tanstack/ai-groq
# or
yarn add @tanstack/ai-groq
```

## Setup

Get your API key from [Groq Console](https://console.groq.com) and set it as an environment variable:

```bash
export GROQ_API_KEY="gsk_..."
```

## Usage

### Text/Chat Adapter

```typescript
import { groqText } from '@tanstack/ai-groq'
import { generate } from '@tanstack/ai'

const adapter = groqText('llama-3.3-70b-versatile')

const result = await generate({
  adapter,
  model: 'llama-3.3-70b-versatile',
  messages: [
    { role: 'user', content: 'Explain quantum computing in simple terms' },
  ],
})

console.log(result.text)
```

### With Explicit API Key

```typescript
import { createGroqText } from '@tanstack/ai-groq'

const adapter = createGroqText('llama-3.3-70b-versatile', 'gsk_api_key')
```

## Supported Models

### Chat Models

- `llama-3.3-70b-versatile` - Meta Llama 3.3 70B (131k context)
- `llama-3.1-8b-instant` - Meta Llama 3.1 8B (131k context)
- `meta-llama/llama-4-maverick-17b-128e-instruct` - Meta Llama 4 Maverick (vision)
- `meta-llama/llama-4-scout-17b-16e-instruct` - Meta Llama 4 Scout
- `meta-llama/llama-guard-4-12b` - Meta Llama Guard 4 (content moderation, vision)
- `meta-llama/llama-prompt-guard-2-86m` - Meta Llama Prompt Guard (content moderation)
- `meta-llama/llama-prompt-guard-2-22m` - Meta Llama Prompt Guard (content moderation)
- `openai/gpt-oss-120b` - GPT OSS 120B (reasoning, tools, search)
- `openai/gpt-oss-20b` - GPT OSS 20B (reasoning, search)
- `openai/gpt-oss-safeguard-20b` - GPT OSS Safeguard 20B (content moderation, reasoning)
- `moonshotai/kimi-k2-instruct-0905` - Kimi K2 Instruct (262k context)
- `qwen/qwen3-32b` - Qwen3 32B (reasoning, tools)

## Features

- ✅ Streaming chat completions
- ✅ Structured output (JSON Schema)
- ✅ Function/tool calling
- ✅ Multimodal input (text + images for vision models)
- ❌ Embeddings (not supported by Groq)
- ❌ Image generation (not supported by Groq)

## Tree-Shakeable Adapters

This package uses tree-shakeable adapters, so you only import what you need:

```typescript
// Only imports text adapter
import { groqText } from '@tanstack/ai-groq'
```

This keeps your bundle size small!

## License

MIT
