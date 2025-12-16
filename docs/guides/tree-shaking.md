# Tree-Shaking & Bundle Optimization

TanStack AI is designed from the ground up for maximum tree-shakeability. The entire system—from activity functions to adapters—uses a functional, modular architecture that ensures you only bundle the code you actually use.

## Design Philosophy

Instead of a monolithic API that includes everything, TanStack AI provides:

- **Individual activity functions** - Import only the activities you need (`chat`, `embedding`, `summarize`, etc.)
- **Individual adapter functions** - Import only the adapters you need (`openaiChat`, `openaiEmbedding`, etc.)
- **Functional API design** - Pure functions that can be easily eliminated by bundlers
- **Separate modules** - Each activity and adapter lives in its own module

This design means that if you only use `chat` with OpenAI, you won't bundle code for embeddings, summarization, image generation, or other providers.

## Activity Functions

Each AI activity is exported as a separate function from `@tanstack/ai`:

```ts
// Import only the activities you need
import { chat } from '@tanstack/ai'              // Chat/text generation
import { embedding } from '@tanstack/ai'         // Embeddings
import { summarize } from '@tanstack/ai'          // Summarization
import { generateImage } from '@tanstack/ai'      // Image generation
import { generateSpeech } from '@tanstack/ai'     // Text-to-speech
import { generateTranscription } from '@tanstack/ai' // Audio transcription
import { generateVideo } from '@tanstack/ai'       // Video generation
```

### Example: Chat Only

If you only need chat functionality:

```ts
// Only chat code is bundled
import { chat } from '@tanstack/ai'
import { openaiChat } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiChat(),
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
})
```

Your bundle will **not** include:
- Embedding logic
- Summarization logic
- Image generation logic
- Other activity implementations

## Adapter Functions

Each provider package exports individual adapter functions for each activity type:

### OpenAI

```ts
import {
  openaiChat,       // Chat/text generation
  openaiEmbedding,  // Embeddings
  openaiSummarize,  // Summarization
  openaiImage,      // Image generation
  openaiSpeech,     // Text-to-speech
  openaiTranscription, // Audio transcription
  openaiVideo,      // Video generation
} from '@tanstack/ai-openai'
```

### Anthropic

```ts
import {
  anthropicChat,       // Chat/text generation
  anthropicSummarize,  // Summarization
} from '@tanstack/ai-anthropic'
```

> Note: Anthropic does not support embeddings natively.

### Gemini

```ts
import {
  geminiChat,       // Chat/text generation
  geminiEmbedding,  // Embeddings
  geminiSummarize,  // Summarization
  geminiImage,      // Image generation
  geminiSpeech,     // Text-to-speech (experimental)
} from '@tanstack/ai-gemini'
```

### Ollama

```ts
import {
  ollamaChat,       // Chat/text generation
  ollamaEmbedding,  // Embeddings
  ollamaSummarize,  // Summarization
} from '@tanstack/ai-ollama'
```

## Complete Example

Here's how the tree-shakeable design works in practice:

```ts
// Only import what you need
import { chat } from '@tanstack/ai'
import { openaiChat } from '@tanstack/ai-openai'

// Chat generation - returns AsyncIterable<StreamChunk>
const chatResult = chat({
  adapter: openaiChat(),
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
})

for await (const chunk of chatResult) {
  console.log(chunk)
}
```

**What gets bundled:**
- ✅ `chat` function and its dependencies
- ✅ `openaiChat` adapter and its dependencies
- ✅ Chat-specific streaming and tool handling logic

**What doesn't get bundled:**
- ❌ `embedding` function
- ❌ `summarize` function
- ❌ `generateImage` function
- ❌ Other adapter implementations (Anthropic, Gemini, etc.)
- ❌ Other activity implementations

## Using Multiple Activities

If you need multiple activities, import only what you use:

```ts
import { chat, embedding, summarize } from '@tanstack/ai'
import { 
  openaiChat, 
  openaiEmbedding, 
  openaiSummarize 
} from '@tanstack/ai-openai'

// Each activity is independent
const chatResult = chat({
  adapter: openaiChat(),
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
})

const embedResult = await embedding({
  adapter: openaiEmbedding(),
  model: 'text-embedding-3-small',
  input: 'Hello, world!',
})

const summarizeResult = await summarize({
  adapter: openaiSummarize(),
  model: 'gpt-4o-mini',
  text: 'Long text to summarize...',
})
```

Each activity is in its own module, so bundlers can eliminate unused ones.

## Type Safety

The tree-shakeable design doesn't sacrifice type safety. Each adapter provides full type safety for its supported models:

```ts
import { openaiChat, type OpenAIChatModel } from '@tanstack/ai-openai'

const adapter = openaiChat()

// TypeScript knows the exact models supported
const model: OpenAIChatModel = 'gpt-4o' // ✓ Valid
const model2: OpenAIChatModel = 'invalid' // ✗ Type error
```

## Create Options Functions

The `create___Options` functions are also tree-shakeable:

```ts
import { 
  createChatOptions,
  createEmbeddingOptions,
  createImageOptions 
} from '@tanstack/ai'

// Only import what you need
const chatOptions = createChatOptions({
  adapter: openaiChat(),
  model: 'gpt-4o',
})
```

## Bundle Size Benefits

The functional, modular design provides significant bundle size benefits:

### Before (Monolithic Approach)

```ts
// ❌ Everything gets bundled
import { ai } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'

// Even if you only use chat, you get:
// - All activity implementations
// - All adapter implementations
// - All provider-specific code
```

### After (Tree-Shakeable Approach)

```ts
// ✅ Only what you use gets bundled
import { chat } from '@tanstack/ai'
import { openaiChat } from '@tanstack/ai-openai'

// You only get:
// - Chat activity implementation
// - OpenAI chat adapter
// - Chat-specific dependencies
```

### Real-World Impact

For a typical chat application:

- **Monolithic approach**: ~200KB+ (all activities + all adapters)
- **Tree-shakeable approach**: ~50KB (only chat + one adapter)

That's a **75% reduction** in bundle size for most applications!

## How It Works

The tree-shakeability is achieved through:

1. **ES Module exports** - Each function is a named export, not a default export
2. **Separate modules** - Each activity and adapter lives in its own file
3. **No side effects** - Functions are pure and don't have module-level side effects
4. **Functional composition** - Functions compose together, allowing dead code elimination
5. **Type-only imports** - Type imports are stripped at build time

Modern bundlers (Vite, Webpack, Rollup, esbuild) can easily eliminate unused code because:

- Functions are statically analyzable
- No dynamic imports of unused code
- No module-level side effects
- Clear dependency graphs

## Best Practices

1. **Import only what you need** - Don't import entire namespaces
2. **Use specific adapter functions** - Import `openaiChat` not `openai`
3. **Separate activities by route** - Different API routes can use different activities
4. **Lazy load when possible** - Use dynamic imports for code-split routes

```ts
// ✅ Good - Only imports chat
import { chat } from '@tanstack/ai'
import { openaiChat } from '@tanstack/ai-openai'

// ❌ Bad - Imports everything
import * as ai from '@tanstack/ai'
import * as openai from '@tanstack/ai-openai'
```

## Adapter Types

Each adapter type implements a specific interface:

- `ChatAdapter` - Provides `chatStream()` method for streaming chat responses
- `EmbeddingAdapter` - Provides `createEmbeddings()` method for vector embeddings
- `SummarizeAdapter` - Provides `summarize()` method for text summarization
- `ImageAdapter` - Provides `generateImage()` method for image generation
- `TTSAdapter` - Provides `generateSpeech()` method for text-to-speech
- `TranscriptionAdapter` - Provides `generateTranscription()` method for audio transcription
- `VideoAdapter` - Provides `generateVideo()` method for video generation

All adapters have a `kind` property that indicates their type:

```ts
const chatAdapter = openaiChat()
console.log(chatAdapter.kind) // 'text'

const embedAdapter = openaiEmbedding()
console.log(embedAdapter.kind) // 'embedding'

const summarizeAdapter = openaiSummarize()
console.log(summarizeAdapter.kind) // 'summarize'
```

## Summary

TanStack AI's tree-shakeable design means:

- ✅ **Smaller bundles** - Only include code you actually use
- ✅ **Faster load times** - Less JavaScript to download and parse
- ✅ **Better performance** - Less code means faster execution
- ✅ **Type safety** - Full TypeScript support without runtime overhead
- ✅ **Flexibility** - Mix and match activities and adapters as needed

The functional, modular architecture ensures that modern bundlers can eliminate unused code effectively, resulting in optimal bundle sizes for your application.

