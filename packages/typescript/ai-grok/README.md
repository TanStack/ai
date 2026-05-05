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

const adapter = grokText('grok-4.3')

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

const adapter = grokSummarize('grok-4.3')

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

const adapter = grokImage('grok-imagine-image')

const result = await generateImages({
  adapter,
  prompt: 'A beautiful sunset over mountains',
  numberOfImages: 1,
  size: '1024x1024',
})

console.log(result.images[0].url)
```

### With Explicit API Key

```typescript
import { createGrokText } from '@tanstack/ai-grok'

const adapter = createGrokText('grok-4.3', 'xai-your-api-key-here')
```

## Supported Models

### Chat Models

- `grok-4.3` - Latest flagship reasoning model
- `grok-4.2` - Previous flagship reasoning model
- `grok-4-2-non-reasoning` - Non-reasoning model

### Image Models

- `grok-imagine-image` - Image generation

## Features

- ✅ xAI **Responses API** (`/v1/responses`)
- ✅ Streaming chat with reasoning (`REASONING_*` AG-UI events)
- ✅ Requests encrypted reasoning content by default (`store: false` + `include: ['reasoning.encrypted_content']`) for stateless Responses-API workflows
- ✅ Structured output (JSON Schema via `text.format`)
- ✅ Function/tool calling (Responses-API flat function tools, `strict: true`)
- ✅ Multimodal input (text + images for vision models)
- ✅ Image generation
- ✅ Text summarization
- ❌ Embeddings (not supported by xAI)

## Provider options

Common knobs (`temperature`, `topP`, `maxTokens`, `metadata`) live on the top-level `chat()` / `generate()` call. Pass anything Responses-API-specific in `modelOptions`:

```typescript
import { chat } from '@tanstack/ai'
import { grokText } from '@tanstack/ai-grok'

await chat({
  adapter: grokText('grok-4.3'),
  messages: [{ role: 'user', content: 'Walk me through your reasoning.' }],
  temperature: 0.7,
  maxTokens: 1024,
  modelOptions: {
    // Not every xAI model accepts every reasoning sub-option. For example,
    // grok-4.3 and grok-4.2 reject reasoning.effort and should rely on default reasoning.
    parallel_tool_calls: true,
    // store and include are set to encrypted-reasoning defaults automatically.
    // Override here if you want server-side response storage instead:
    // store: true,
    // include: [],
  },
})
```

### Encrypted reasoning defaults

By default the adapter sends `store: false` and `include: ['reasoning.encrypted_content']`. This makes the response stateless and asks xAI to return an encrypted blob alongside each reasoning item when the model emits reasoning. The adapter does not yet replay those reasoning items automatically on the next turn; this default currently guarantees retrieval, not full round-trip continuity. To opt back into server-side response storage, pass `modelOptions: { store: true, include: [] }`.

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
