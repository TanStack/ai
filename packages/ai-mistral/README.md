# @tanstack/ai-mistral

Mistral adapter for TanStack AI.

## Installation

```bash
npm install @tanstack/ai-mistral
# or
pnpm add @tanstack/ai-mistral
# or
yarn add @tanstack/ai-mistral
```

## Setup

Get your API key from [Mistral Console](https://console.mistral.ai/) and set it as an environment variable:

```bash
export MISTRAL_API_KEY="..."
```

## Usage

### Text/Chat Adapter

```typescript
import { mistralText } from '@tanstack/ai-mistral'
import { generate } from '@tanstack/ai'

const adapter = mistralText('mistral-large-latest')

const result = await generate({
  adapter,
  model: 'mistral-large-latest',
  messages: [
    { role: 'user', content: 'Explain quantum computing in simple terms' },
  ],
})

console.log(result.text)
```

### With Explicit API Key

```typescript
import { createMistralText } from '@tanstack/ai-mistral'

const adapter = createMistralText(
  'mistral-large-latest',
  process.env.MISTRAL_API_KEY!,
)
```

## Supported Models

### Chat Models

- `mistral-large-latest` - Frontier flagship model (128k context)
- `mistral-medium-latest` - Balanced multimodal model (vision)
- `mistral-small-latest` - Fast, affordable multimodal model (vision)
- `ministral-8b-latest` - 8B edge model
- `ministral-3b-latest` - 3B edge model
- `codestral-latest` - Code-specialized model (256k context)
- `pixtral-large-latest` - Large vision model
- `pixtral-12b-2409` - 12B vision model
- `magistral-medium-latest` - Reasoning model
- `magistral-small-latest` - Small reasoning model
- `open-mistral-nemo` - Open 12B model

See [Mistral model comparison](https://docs.mistral.ai/getting-started/models/compare) for full details.

## Features

- ✅ Streaming chat completions
- ✅ Structured output (JSON Schema)
- ✅ Function/tool calling
- ✅ Reasoning (magistral-\_ models — streamed as `REASONING\__` events)
- ✅ Multimodal input (text + images) — requires a vision-capable model (`pixtral-large-latest`, `pixtral-12b-2409`, `mistral-medium-latest`, or `mistral-small-latest`)
- ❌ Embeddings (use [@mistralai/mistralai](https://github.com/mistralai/client-ts) directly)
- ❌ Image generation

## Tree-Shakeable Adapters

This package uses tree-shakeable adapters, so you only import what you need:

```typescript
import { mistralText } from '@tanstack/ai-mistral'
```

## License

MIT
