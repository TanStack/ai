<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png"
      alt="TanStack AI"
      width="900"
    />
  </picture>
</div>

<br />

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

const adapter = groqText('openai/gpt-oss-120b')

const result = await generate({
  adapter,
  model: 'openai/gpt-oss-120b',
  messages: [
    { role: 'user', content: 'Explain quantum computing in simple terms' },
  ],
})

console.log(result.text)
```

### With Explicit API Key

```typescript
import { createGroqText } from '@tanstack/ai-groq'

const adapter = createGroqText('openai/gpt-oss-120b', 'gsk_api_key')
```

## Supported Models

### Chat Models

- `meta-llama/llama-prompt-guard-2-86m` - Meta Llama Prompt Guard (content moderation)
- `meta-llama/llama-prompt-guard-2-22m` - Meta Llama Prompt Guard (content moderation)
- `openai/gpt-oss-120b` - GPT OSS 120B (reasoning, tools, search)
- `openai/gpt-oss-20b` - GPT OSS 20B (reasoning, search)
- `openai/gpt-oss-safeguard-20b` - GPT OSS Safeguard 20B (content moderation, reasoning)
- `qwen/qwen3.8-27b` - Qwen3.8 27B (reasoning, tools, vision)

## Features

- ✅ Streaming chat completions
- ✅ Structured output (JSON Schema)
- ✅ Function/tool calling
- ✅ Multimodal input (text + images for vision models)
- ✅ Summarization (`groqSummarize`)
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
