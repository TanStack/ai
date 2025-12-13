# TanStack AI Migration Guide (Pre-1.0)

This guide covers migrating from early TanStack AI releases to the new unified `ai()` API with tree-shakeable adapters. This is a pre-release migration guide for versions 0.0.x.

## Overview of Changes

The major architectural changes in this release:

1. **Unified `ai()` function** - Replaces separate `chat()`, `embedding()`, and `summarize()` functions
2. **Tree-shakeable adapters** - Separate adapter imports for each capability (text, embed, summarize, image, etc.)
3. **Renamed types** - `ChatOptions` → `TextOptions`, `chatOptions()` → `textOptions()`
4. **New capabilities** - Image generation, text-to-speech, transcription, video generation (experimental)
5. **Structured output support** - Native `outputSchema` option with Zod schemas
6. **Non-streaming mode** - New `stream: false` option for simpler one-shot responses

---

## Quick Migration Reference

| Old API | New API |
|---------|---------|
| `import { chat } from '@tanstack/ai'` | `import { ai } from '@tanstack/ai'` |
| `import { embedding } from '@tanstack/ai'` | `import { ai } from '@tanstack/ai'` |
| `import { summarize } from '@tanstack/ai'` | `import { ai } from '@tanstack/ai'` |
| `import { chatOptions } from '@tanstack/ai'` | `import { textOptions } from '@tanstack/ai'` |
| `import { openai } from '@tanstack/ai-openai'` | `import { openaiText } from '@tanstack/ai-openai'` |
| `import { anthropic } from '@tanstack/ai-anthropic'` | `import { anthropicText } from '@tanstack/ai-anthropic'` |
| `import { gemini } from '@tanstack/ai-gemini'` | `import { geminiText } from '@tanstack/ai-gemini'` |
| `import { ollama } from '@tanstack/ai-ollama'` | `import { ollamaText } from '@tanstack/ai-ollama'` |

---

## Migrating from `chat()` to `ai()`

### Before

```typescript
import { chat, toStreamResponse } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openai(),
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
  tools: [myTool],
})

return toStreamResponse(stream)
```

### After

```typescript
import { ai, toStreamResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = ai({
  adapter: openaiText(),
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
  tools: [myTool],
})

return toStreamResponse(stream)
```

### Key Changes

1. `chat()` → `ai()`
2. `openai()` → `openaiText()`
3. Everything else stays the same!

---

## Migrating from `embedding()` to `ai()`

### Before

```typescript
import { embedding } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'

const result = await embedding({
  adapter: openai(),
  model: 'text-embedding-3-small',
  input: 'Hello, world!',
})

console.log(result.embeddings)
```

### After

```typescript
import { ai } from '@tanstack/ai'
import { openaiEmbed } from '@tanstack/ai-openai'

const result = await ai({
  adapter: openaiEmbed(),
  model: 'text-embedding-3-small',
  input: 'Hello, world!',
})

console.log(result.embeddings)
```

### Key Changes

1. `embedding()` → `ai()`
2. `openai()` → `openaiEmbed()`
3. The result type remains the same (`EmbeddingResult`)

---

## Migrating from `summarize()` to `ai()`

### Before

```typescript
import { summarize } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'

const result = await summarize({
  adapter: openai(),
  model: 'gpt-4o-mini',
  text: 'Long text to summarize...',
  maxLength: 100,
})

console.log(result.summary)
```

### After

```typescript
import { ai } from '@tanstack/ai'
import { openaiSummarize } from '@tanstack/ai-openai'

const result = await ai({
  adapter: openaiSummarize(),
  model: 'gpt-4o-mini',
  text: 'Long text to summarize...',
  maxLength: 100,
})

console.log(result.summary)
```

### Key Changes

1. `summarize()` → `ai()`
2. `openai()` → `openaiSummarize()`
3. The result type remains the same (`SummarizationResult`)

---

## Adapter Migration by Provider

### OpenAI

```typescript
// Before (monolithic)
import { openai } from '@tanstack/ai-openai'
const adapter = openai()

// After (tree-shakeable)
import { 
  openaiText,       // Chat/text generation
  openaiEmbed,      // Embeddings
  openaiSummarize,  // Summarization
  openaiImage,      // Image generation (NEW)
  openaiTTS,        // Text-to-speech (NEW)
  openaiTranscription, // Speech-to-text (NEW)
  openaiVideo,      // Video generation (NEW, experimental)
} from '@tanstack/ai-openai'
```

### Anthropic

```typescript
// Before
import { anthropic } from '@tanstack/ai-anthropic'

// After
import { 
  anthropicText,      // Chat/text generation
  anthropicSummarize, // Summarization
} from '@tanstack/ai-anthropic'
// Note: Anthropic does not support embeddings natively
```

### Gemini

```typescript
// Before
import { gemini } from '@tanstack/ai-gemini'

// After
import { 
  geminiText,       // Chat/text generation
  geminiEmbed,      // Embeddings
  geminiSummarize,  // Summarization
  geminiImage,      // Image generation (NEW)
  geminiTTS,        // Text-to-speech (NEW, experimental)
} from '@tanstack/ai-gemini'
```

### Ollama

```typescript
// Before
import { ollama } from '@tanstack/ai-ollama'

// After
import { 
  ollamaText,       // Chat/text generation
  ollamaEmbed,      // Embeddings
  ollamaSummarize,  // Summarization
} from '@tanstack/ai-ollama'
```

---

## Type Renames

If you're using types directly, update these references:

| Old Type | New Type |
|----------|----------|
| `ChatOptions` | `TextOptions` |
| `ChatCompletionChunk` | `TextCompletionChunk` |
| `ChatStreamOptionsForModel` | `TextStreamOptionsForModel` |
| `ChatStreamOptionsUnion` | `TextStreamOptionsUnion` |

### Utility Function Rename

```typescript
// Before
import { chatOptions } from '@tanstack/ai'

// After
import { textOptions } from '@tanstack/ai'
```

---

## New Features

### Structured Output with Zod Schemas

The new `outputSchema` option enables type-safe structured output:

```typescript
import { ai } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
  interests: z.array(z.string()),
})

// Result is fully typed as { name: string, age: number, interests: string[] }
const person = await ai({
  adapter: openaiText(),
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Generate a fictional person profile' }],
  outputSchema: PersonSchema,
})

console.log(person.name, person.age)
```

When using `outputSchema`:
- Tools are executed first (if provided)
- Final response is constrained to match the schema
- Result is validated against the Zod schema
- Return type is `Promise<z.infer<TSchema>>` instead of `AsyncIterable<StreamChunk>`

### Non-Streaming Mode

Get a simple string response without streaming:

```typescript
import { ai } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// Returns Promise<string> instead of AsyncIterable
const text = await ai({
  adapter: openaiText(),
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
  stream: false,
})

console.log(text) // "Hello! How can I help you today?"
```

### Image Generation

```typescript
import { ai } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

const result = await ai({
  adapter: openaiImage(),
  model: 'dall-e-3',
  prompt: 'A beautiful sunset over mountains',
  size: '1024x1024',
})

console.log(result.images[0].url)
```

See the [Image Generation Guide](./image-generation.md) for full details.

### Text-to-Speech

```typescript
import { ai } from '@tanstack/ai'
import { openaiTTS } from '@tanstack/ai-openai'

const result = await ai({
  adapter: openaiTTS(),
  model: 'tts-1',
  text: 'Hello, welcome to TanStack AI!',
  voice: 'alloy',
})

// result.audio contains base64-encoded audio
```

See the [Text-to-Speech Guide](./text-to-speech.md) for full details.

### Audio Transcription

```typescript
import { ai } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'

const result = await ai({
  adapter: openaiTranscription(),
  model: 'whisper-1',
  audio: audioFile,
  language: 'en',
})

console.log(result.text)
```

See the [Transcription Guide](./transcription.md) for full details.

### Video Generation (Experimental)

```typescript
import { ai } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

// Create a video job
const { jobId } = await ai({
  adapter: openaiVideo(),
  model: 'sora-2',
  prompt: 'A cat playing piano',
})

// Poll for status
const status = await ai({
  adapter: openaiVideo(),
  model: 'sora-2',
  jobId,
  request: 'status',
})

// Get video URL when complete
const { url } = await ai({
  adapter: openaiVideo(),
  model: 'sora-2',
  jobId,
  request: 'url',
})
```

See the [Video Generation Guide](./video-generation.md) for full details.

---

## Stream Helper: `streamToText()`

A new utility to collect streaming output into a string:

```typescript
import { ai, streamToText } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = ai({
  adapter: openaiText(),
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
})

const text = await streamToText(stream)
console.log(text) // Complete response as string
```

---

## Legacy Adapter Support

The old monolithic adapters (`openai()`, `anthropic()`, etc.) are still available but deprecated:

```typescript
// Still works, but deprecated
import { openai } from '@tanstack/ai-openai'

// TypeScript will show deprecation warning
const adapter = openai() // ⚠️ @deprecated
```

We recommend migrating to the new tree-shakeable adapters for:
- Smaller bundle sizes
- Clearer intent
- Better type inference
- Access to new capabilities

---

## Complete Migration Example

### Before (Old API)

```typescript
// api/chat.ts
import { chat, toStreamResponse } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages } = await request.json()
  
  const stream = chat({
    adapter: openai(),
    model: 'gpt-4o',
    messages,
    tools: [myTool],
  })
  
  return toStreamResponse(stream)
}

// api/embed.ts
import { embedding } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { text } = await request.json()
  
  const result = await embedding({
    adapter: openai(),
    model: 'text-embedding-3-small',
    input: text,
  })
  
  return Response.json(result)
}
```

### After (New API)

```typescript
// api/chat.ts
import { ai, toStreamResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages } = await request.json()
  
  const stream = ai({
    adapter: openaiText(),
    model: 'gpt-4o',
    messages,
    tools: [myTool],
  })
  
  return toStreamResponse(stream)
}

// api/embed.ts
import { ai } from '@tanstack/ai'
import { openaiEmbed } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { text } = await request.json()
  
  const result = await ai({
    adapter: openaiEmbed(),
    model: 'text-embedding-3-small',
    input: text,
  })
  
  return Response.json(result)
}
```

---

## FAQ

### Why rename `chat()` to `ai()`?

The unified `ai()` function:
1. Works with all adapter types (text, embed, summarize, image, etc.)
2. Infers the correct return type from the adapter
3. Provides a single, consistent entry point
4. Better represents that this is an AI operation, not just chat

### Why separate adapters?

Tree-shakeable adapters provide:
1. Smaller bundle sizes (only include what you use)
2. Clearer code (explicit about which capability you need)
3. Better type inference per capability
4. Foundation for future capabilities

### Do I need to update my React/Vue/Solid hooks?

No! The `useChat` hook and other framework integrations remain unchanged. They work with the same streaming protocol.

### Are the old APIs still supported?

Yes, the legacy `chat()`, `embedding()`, `summarize()` functions and monolithic adapters are still exported but marked as deprecated. They will be removed in a future major version.
