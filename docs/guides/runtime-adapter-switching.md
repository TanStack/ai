---
title: Runtime Adapter Switching
id: runtime-adapter-switching
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
const stream = ai({
  adapter: adapter as any,
  model: model as any,  // 😢 Could be a typo!
  messages,
})
```

This approach has several problems:

- **No model autocomplete** - You have to remember valid model names
- **No type validation** - Typos in model names won't be caught until runtime
- **Messy `as any` casts** - TypeScript can't help you at all

## The Solution: `createOptions`

The `createOptions` helper lets you pre-define typed configurations for each provider:

```typescript
import { ai, createOptions, toStreamResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'

// ✅ Define typed configurations - you get autocomplete here!
const adapterConfig = {
  anthropic: () =>
    createOptions({
      adapter: anthropicText(),
      model: 'claude-sonnet-4-5',  // ✅ Autocomplete works!
    }),
  openai: () =>
    createOptions({
      adapter: openaiText(),
      model: 'gpt-4o',  // ✅ Autocomplete works!
    }),
}

// In your request handler:
const provider = request.body.provider // 'anthropic' | 'openai'

const options = adapterConfig[provider]()
const stream = ai({
  ...options,
  messages,
  // ... other runtime options
})
```

## How It Works

`createOptions` is a simple identity function with the **exact same type signature** as `ai()`. It doesn't execute anything - it just returns the options object you pass in.

The magic is in the types: when you call `createOptions({ adapter: openaiText(), model: '...' })`, TypeScript knows which models are valid for the OpenAI text adapter and provides autocomplete.

```typescript
// This is essentially what createOptions does:
export function createOptions<TAdapter, TModel, ...>(
  options: AIOptionsFor<TAdapter, TModel, ...>
): AIOptionsFor<TAdapter, TModel, ...> {
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
import { ai, createOptions, maxIterations, toStreamResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { ollamaText } from '@tanstack/ai-ollama'

type Provider = 'openai' | 'anthropic' | 'gemini' | 'ollama'

// Pre-define typed adapter configurations
const adapterConfig = {
  anthropic: () =>
    createOptions({
      adapter: anthropicText(),
      model: 'claude-sonnet-4-5',
    }),
  gemini: () =>
    createOptions({
      adapter: geminiText(),
      model: 'gemini-2.0-flash-exp',
    }),
  ollama: () =>
    createOptions({
      adapter: ollamaText(),
      model: 'mistral:7b',
    }),
  openai: () =>
    createOptions({
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

        const stream = ai({
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
import { createOptions } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'
import { geminiImage } from '@tanstack/ai-gemini'

const imageConfig = {
  openai: () =>
    createOptions({
      adapter: openaiImage(),
      model: 'gpt-image-1',  // ✅ Autocomplete for OpenAI image models
    }),
  gemini: () =>
    createOptions({
      adapter: geminiImage(),
      model: 'gemini-2.0-flash-preview-image-generation',
    }),
}

// Usage
const options = imageConfig[provider]()
const result = await ai({
  ...options,
  prompt: 'A beautiful sunset over mountains',
  size: '1024x1024',
})
```

## Using with Summarize Adapters

And for summarization:

```typescript
import { createOptions } from '@tanstack/ai'
import { openaiSummarize } from '@tanstack/ai-openai'
import { anthropicSummarize } from '@tanstack/ai-anthropic'

const summarizeConfig = {
  openai: () =>
    createOptions({
      adapter: openaiSummarize(),
      model: 'gpt-4o-mini',
    }),
  anthropic: () =>
    createOptions({
      adapter: anthropicSummarize(),
      model: 'claude-sonnet-4-5',
    }),
}

// Usage
const options = summarizeConfig[provider]()
const result = await ai({
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

const stream = ai({
  adapter: adapter as any,
  model: model as any,
  messages,
})
```

### After

```typescript
const adapterConfig = {
  anthropic: () =>
    createOptions({
      adapter: anthropicText(),
      model: 'claude-sonnet-4-5',
    }),
  openai: () =>
    createOptions({
      adapter: openaiText(),
      model: 'gpt-4o',
    }),
}

const options = adapterConfig[provider]()
const stream = ai({
  ...options,
  messages,
})
```

The key changes:

1. Replace the switch statement with an object of factory functions
2. Each factory function uses `createOptions` for type safety
3. Spread the options into `ai()` - no more `as any`!
