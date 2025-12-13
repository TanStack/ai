# Tree-Shakeable Adapters

TanStack AI provides tree-shakeable adapters that allow you to import only the functionality you need, resulting in smaller bundle sizes.

## Overview

Instead of importing a monolithic adapter that includes chat, embedding, and summarization capabilities all at once, you can now import only the specific functionality you need:

- **Text Adapters** - For chat and text generation
- **Embed Adapters** - For creating embeddings
- **Summarize Adapters** - For text summarization

## Installation

Each provider package (e.g., `@tanstack/ai-openai`, `@tanstack/ai-anthropic`) exports tree-shakeable adapters:

```ts
// Import only what you need
import { openaiText } from '@tanstack/ai-openai'
import { openaiEmbed } from '@tanstack/ai-openai'
import { openaiSummarize } from '@tanstack/ai-openai'
```

## Available Adapters

### OpenAI

```ts
import {
  openaiText,       // Chat/text generation
  openaiEmbed,      // Embeddings
  openaiSummarize,  // Summarization
  createOpenAIText,
  createOpenAIEmbed,
  createOpenAISummarize,
} from '@tanstack/ai-openai'
```

### Anthropic

```ts
import {
  anthropicText,       // Chat/text generation
  anthropicSummarize,  // Summarization
  createAnthropicText,
  createAnthropicSummarize,
} from '@tanstack/ai-anthropic'
```

> Note: Anthropic does not support embeddings natively.

### Gemini

```ts
import {
  geminiText,       // Chat/text generation
  geminiEmbed,      // Embeddings
  geminiSummarize,  // Summarization
  createGeminiText,
  createGeminiEmbed,
  createGeminiSummarize,
} from '@tanstack/ai-gemini'
```

### Ollama

```ts
import {
  ollamaText,       // Chat/text generation
  ollamaEmbed,      // Embeddings
  ollamaSummarize,  // Summarization
  createOllamaText,
  createOllamaEmbed,
  createOllamaSummarize,
} from '@tanstack/ai-ollama'
```

## Usage

### Basic Usage

Each adapter type has two ways to create instances:

1. **Factory function** (recommended for quick setup):

```ts
import { openaiText } from '@tanstack/ai-openai'

const textAdapter = openaiText()

```

2. **Class constructor** (for more control):

```ts
import { createOpenAIText } from '@tanstack/ai-openai/adapters'

const textAdapter = createOpenAIText({
  apiKey: 'your-api-key',
  // additional configuration...
})
```

### Using the `generate` Function

The `generate` function provides a unified API that adapts based on the adapter type:

```ts
import { generate } from '@tanstack/ai'
import { openaiText, openaiEmbed, openaiSummarize } from '@tanstack/ai-openai/adapters'

// Chat generation - returns AsyncIterable<StreamChunk>
const chatResult = generate({
  adapter: openaiText(),
  model: 'gpt-4o',
  messages: [{ role: 'user', content: [{ type: 'text', content: 'Hello!' }] }],
})

for await (const chunk of chatResult) {
  console.log(chunk)
}

// Embeddings - returns Promise<EmbeddingResult>
const embedResult = await generate({
  adapter: openaiEmbed(),
  model: 'text-embedding-3-small',
  input: ['Hello, world!'],
})

console.log(embedResult.embeddings)

// Summarization - returns Promise<SummarizationResult>
const summarizeResult = await generate({
  adapter: openaiSummarize(),
  model: 'gpt-4o-mini',
  text: 'Long text to summarize...',
})

console.log(summarizeResult.summary)
```

### Type Safety

Each adapter provides full type safety for its supported models and options:

```ts
import { openaiText, type OpenAITextModel } from '@tanstack/ai-openai'

const adapter = openaiText()

// TypeScript knows the exact models supported
const model: OpenAITextModel = 'gpt-4o' // ✓ Valid
const model2: OpenAITextModel = 'invalid' // ✗ Type error
```

## Migration from Monolithic Adapters

The legacy monolithic adapters are still available but deprecated:

```ts
// Legacy (deprecated)
import { openai } from '@tanstack/ai-openai'

// New tree-shakeable approach
import { openaiText, openaiEmbed } from '@tanstack/ai-openai/adapters'
```

## Bundle Size Benefits

Using tree-shakeable adapters means:

- Only the code you use is included in your bundle
- Unused adapter types are completely eliminated
- Smaller bundles lead to faster load times

For example, if you only need chat functionality:

```ts
// Only chat code is bundled
import { openaiText } from '@tanstack/ai-openai'
```

vs.

```ts
// All functionality is bundled (chat, embed, summarize)
import { openai } from '@tanstack/ai-openai'
```

## Adapter Types

Each adapter type implements a specific interface:

- `ChatAdapter` - Provides `chatStream()` method for streaming chat responses
- `EmbeddingAdapter` - Provides `createEmbeddings()` method for vector embeddings
- `SummarizeAdapter` - Provides `summarize()` method for text summarization

All adapters have a `kind` property that indicates their type:

```ts
const textAdapter = openaiText()
console.log(textAdapter.kind) // 'chat'

const embedAdapter = openaiEmbed()
console.log(embedAdapter.kind) // 'embedding'

const summarizeAdapter = openaiSummarize()
console.log(summarizeAdapter.kind) // 'summarize'
```
