# @tanstack/ai-grok

Grok (xAI) adapter for TanStack AI

## Installation

```bash
npm install @tanstack/ai-grok
# or
pnpm add @tanstack/ai-grok
# or
yarn add @tanstack/ai-grok
```

## Setup

Get your API key from [xAI Console](https://console.x.ai) and set it as an environment variable:

```bash
export XAI_API_KEY="xai-..."
```

## Usage

### Text/Chat Adapter

```typescript
import { grokText } from '@tanstack/ai-grok'
import { generate } from '@tanstack/ai'

const adapter = grokText('grok-build-0.1')

const result = await generate({
  adapter,
  messages: [
    { role: 'user', content: 'Explain quantum computing in simple terms' },
  ],
})

console.log(result.text)
```

### Summarization Adapter

```typescript
import { grokSummarize } from '@tanstack/ai-grok'
import { summarize } from '@tanstack/ai'

const adapter = grokSummarize('grok-build-0.1')

const result = await summarize({
  adapter,
  text: 'Long article text...',
  style: 'bullet-points',
})

console.log(result.summary)
```

### Image Generation Adapter

```typescript
import { grokImage } from '@tanstack/ai-grok'
import { generateImages } from '@tanstack/ai'

const adapter = grokImage()

const result = await generateImages({
  adapter,
  model: 'grok-2-image-1212',
  prompt: 'A beautiful sunset over mountains',
  numberOfImages: 1,
  size: '1024x1024',
})

console.log(result.images[0].url)
```

### With Explicit API Key

```typescript
import { createGrokText } from '@tanstack/ai-grok'

const adapter = createGrokText('grok-build-0.1', 'xai-your-api-key-here')
```

## Supported Chat Models

- `grok-build-0.1` - Build-focused reasoning model with text + image input
- `grok-4.3` - Reasoning, structured outputs, tool calling, text + image input

## Features

- ✅ Streaming chat via xAI Responses API
- ✅ Structured output (JSON Schema)
- ✅ Function/tool calling
- ✅ Multimodal input (text + images for vision models)
- ✅ Image generation
- ✅ Text summarization
- ❌ Embeddings (not supported by xAI)

## Tree-Shakeable Adapters

This package uses tree-shakeable adapters, so you only import what you need:

```typescript
// Only imports text adapter
import { grokText } from '@tanstack/ai-grok'

// Only imports image adapter
import { grokImage } from '@tanstack/ai-grok'
```

This keeps your bundle size small!

## License

MIT
