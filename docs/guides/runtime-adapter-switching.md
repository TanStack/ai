---
title: Runtime Adapter Switching
id: runtime-adapter-switching
order: 12
---

# Runtime Adapter Switching with Type Safety

Learn how to build interfaces where users can switch between LLM providers at runtime while maintaining full TypeScript type safety.

## The Problem

When building a UI that lets users choose their provider (OpenAI, Anthropic, Gemini, etc.), you typically end up with code like this:

```typescript
// ❌ The old way - loses type safety
let adapter
let model

switch (provider) {
  case 'anthropic':
    adapter = anthropicText()
    model = 'claude-sonnet-4-5'
    break
  case 'openai':
  default:
    adapter = openaiText()
    model = 'gpt-4o'
    break
}

// No autocomplete, no type checking - forced to use `as any`
const stream = chat({
  adapter: adapter as any,
  model: model as any,  // 😢 Could be a typo!
  messages,
})
```

This approach has several problems:

- **No model autocomplete** - You have to remember valid model names
- **No type validation** - Typos in model names won't be caught until runtime
- **Messy `as any` casts** - TypeScript can't help you at all

## The Solution: `createChatOptions`

The `createChatOptions` helper lets you pre-define typed configurations for each provider:

```typescript
import { chat, createChatOptions, toStreamResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'

// ✅ Define typed configurations - you get autocomplete here!
const adapterConfig = {
  anthropic: () =>
    createChatOptions({
      adapter: anthropicText(),
      model: 'claude-sonnet-4-5',  // ✅ Autocomplete works!
    }),
  openai: () =>
    createChatOptions({
      adapter: openaiText(),
      model: 'gpt-4o',  // ✅ Autocomplete works!
    }),
}

// In your request handler:
const provider = request.body.provider // 'anthropic' | 'openai'

const options = adapterConfig[provider]()
const stream = chat({
  ...options,
  messages,
  // ... other runtime options
})
```

## How It Works

`createChatOptions` is a simple identity function with the **exact same type signature** as `chat()`. It doesn't execute anything - it just returns the options object you pass in.

The magic is in the types: when you call `createChatOptions({ adapter: openaiText(), model: '...' })`, TypeScript knows which models are valid for the OpenAI chat adapter and provides autocomplete.

```typescript
// This is essentially what createChatOptions does:
export function createChatOptions<TAdapter, TModel, ...>(
  options: TextActivityOptionsFor<TAdapter, TModel, ...>
): TextActivityOptionsFor<TAdapter, TModel, ...> {
  return options  // Just returns what you pass in!
}
```

## Benefits

1. **Model autocomplete at definition time** - When writing the config, you get suggestions for valid model names
2. **Type validation catches typos** - Invalid model names are caught at compile time
3. **Clean separation** - Configuration is defined once, separately from execution
4. **Works for all adapter types** - Text, image, embedding, summarize, and video adapters

## Full Example

Here's a complete example showing a multi-provider chat API:

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions, maxIterations, toStreamResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { ollamaText } from '@tanstack/ai-ollama'

type Provider = 'openai' | 'anthropic' | 'gemini' | 'ollama'

// Pre-define typed adapter configurations
const adapterConfig = {
  anthropic: () =>
    createChatOptions({
      adapter: anthropicText(),
      model: 'claude-sonnet-4-5',
    }),
  gemini: () =>
    createChatOptions({
      adapter: geminiText(),
      model: 'gemini-2.0-flash-exp',
    }),
  ollama: () =>
    createChatOptions({
      adapter: ollamaText(),
      model: 'mistral:7b',
    }),
  openai: () =>
    createChatOptions({
      adapter: openaiText(),
      model: 'gpt-4o',
    }),
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const abortController = new AbortController()
        const body = await request.json()
        const { messages, data } = body

        const provider: Provider = data?.provider || 'openai'

        // Get typed options for the selected provider
        const options = adapterConfig[provider]()

        const stream = chat({
          ...options,
          tools: [...],
          systemPrompts: [...],
          messages,
          abortController,
        })

        return toStreamResponse(stream, { abortController })
      },
    },
  },
})
```

## Using with Image Adapters

The same pattern works for image generation:

```typescript
import { createImageOptions } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'
import { geminiImage } from '@tanstack/ai-gemini'

const imageConfig = {
  openai: () =>
    createImageOptions({
      adapter: openaiImage(),
      model: 'gpt-image-1',  // ✅ Autocomplete for OpenAI image models
    }),
  gemini: () =>
    createImageOptions({
      adapter: geminiImage(),
      model: 'gemini-2.0-flash-preview-image-generation',
    }),
}

// Usage
const options = imageConfig[provider]()
const result = await generateImage({
  ...options,
  prompt: 'A beautiful sunset over mountains',
  size: '1024x1024',
})
```

## Using with Summarize Adapters

And for summarization:

```typescript
import { createSummarizeOptions } from '@tanstack/ai'
import { openaiSummarize } from '@tanstack/ai-openai'
import { anthropicSummarize } from '@tanstack/ai-anthropic'

const summarizeConfig = {
  openai: () =>
    createSummarizeOptions({
      adapter: openaiSummarize(),
      model: 'gpt-4o-mini',
    }),
  anthropic: () =>
    createSummarizeOptions({
      adapter: anthropicSummarize(),
      model: 'claude-sonnet-4-5',
    }),
}

// Usage
const options = summarizeConfig[provider]()
const result = await summarize({
  ...options,
  text: longDocument,
  maxLength: 100,
  style: 'concise',
})
```

## Migration from Switch Statements

If you have existing code using switch statements, here's how to migrate:

### Before

```typescript
let adapter
let model

switch (provider) {
  case 'anthropic':
    adapter = anthropicText()
    model = 'claude-sonnet-4-5'
    break
  case 'openai':
  default:
    adapter = openaiText()
    model = 'gpt-4o'
    break
}

const stream = chat({
  adapter: adapter as any,
  model: model as any,
  messages,
})
```

### After

```typescript
const adapterConfig = {
  anthropic: () =>
    createChatOptions({
      adapter: anthropicText(),
      model: 'claude-sonnet-4-5',
    }),
  openai: () =>
    createChatOptions({
      adapter: openaiText(),
      model: 'gpt-4o',
    }),
}

const options = adapterConfig[provider]()
const stream = chat({
  ...options,
  messages,
})
```

The key changes:

1. Replace the switch statement with an object of factory functions
2. Each factory function uses `createChatOptions` for type safety
3. Spread the options into `chat()` - no more `as any`!
