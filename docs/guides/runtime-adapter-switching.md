---
title: Runtime Adapter Switching
id: runtime-adapter-switching
order: 12
---

# Runtime Adapter Switching with Type Safety

Learn how to build interfaces where users can switch between LLM providers at runtime while maintaining full TypeScript type safety.

## The Simple Approach

With TanStack AI, the model is passed directly to the adapter factory function. This gives you full type safety and autocomplete at the point of definition:

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'

type Provider = 'openai' | 'anthropic'

// Define adapters with their models - autocomplete works here!
const adapters = {
  anthropic: () => anthropicText('claude-sonnet-4-5'),  // ✅ Autocomplete!
  openai: () => openaiText('gpt-5.2'),  // ✅ Autocomplete!
}

// In your request handler:
const provider: Provider = request.body.provider || 'openai'

const stream = chat({
  adapter: adapters[provider](),
  messages,
})
```

## Why This Works

Each adapter factory function accepts a model name as its first argument and returns a fully typed adapter:

```typescript
// These are equivalent:
const adapter1 = openaiText('gpt-5.2')
const adapter2 = new OpenAITextAdapter({ apiKey: process.env.OPENAI_API_KEY }, 'gpt-5.2')

// The model is stored on the adapter
console.log(adapter1.selectedModel) // 'gpt-5.2'
```

When you pass an adapter to `chat()`, it uses the model from `adapter.selectedModel`. This means:

- **Full autocomplete** - When typing the model name, TypeScript knows valid options
- **Type validation** - Invalid model names cause compile errors
- **Clean code** - No separate `model` parameter needed

## Full Example

Here's a complete example showing a multi-provider chat API:

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { ollamaText } from '@tanstack/ai-ollama'

type Provider = 'openai' | 'anthropic' | 'gemini' | 'ollama'

// Define adapters with their models
const adapters = {
  anthropic: () => anthropicText('claude-sonnet-4-5'),
  gemini: () => geminiText('gemini-2.0-flash-exp'),
  ollama: () => ollamaText('mistral:7b'),
  openai: () => openaiText('gpt-5.2'),
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const abortController = new AbortController()
        const body = await request.json()
        const { messages, data } = body

        const provider: Provider = data?.provider || 'openai'

        const stream = chat({
          adapter: adapters[provider](),
          tools: [...],
          systemPrompts: [...],
          messages,
          abortController,
        })

        return toServerSentEventsResponse(stream, { abortController })
      },
    },
  },
})
```

## Using with Image Adapters

The same pattern works for image generation:

```typescript
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'
import { geminiImage } from '@tanstack/ai-gemini'

const imageAdapters = {
  openai: () => openaiImage('gpt-image-1'),
  gemini: () => geminiImage('gemini-2.0-flash-preview-image-generation'),
}

// Usage
const result = await generateImage({
  adapter: imageAdapters[provider](),
  prompt: 'A beautiful sunset over mountains',
  size: '1024x1024',
})
```

## Using with Summarize Adapters

And for summarization:

```typescript
import { summarize } from '@tanstack/ai'
import { openaiSummarize } from '@tanstack/ai-openai'
import { anthropicSummarize } from '@tanstack/ai-anthropic'

const summarizeAdapters = {
  openai: () => openaiSummarize('gpt-5-mini'),
  anthropic: () => anthropicSummarize('claude-sonnet-4-5'),
}

// Usage
const result = await summarize({
  adapter: summarizeAdapters[provider](),
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
    model = 'gpt-5.2'
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
const adapters = {
  anthropic: () => anthropicText('claude-sonnet-4-5'),
  openai: () => openaiText('gpt-5.2'),
}

const stream = chat({
  adapter: adapters[provider](),
  messages,
})
```

The key changes:

1. Replace the switch statement with an object of factory functions
2. Each factory function creates an adapter with the model included
3. No more `as any` casts - full type safety!
