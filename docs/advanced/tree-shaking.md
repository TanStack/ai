---
title: Tree-Shaking
id: tree-shaking
order: 7
description: "Import only the activities and adapters that you use. Your bundle then holds only the code for those features and providers."
keywords:
  - tanstack ai
  - tree-shaking
  - bundle size
  - modular imports
  - performance
  - tree-shakeable
---

You add chat with one provider, and you do not want code for image generation or five other providers in your bundle.

TanStack AI exports each activity and each adapter as a separate named function. Import only the ones you use, and your bundler drops the rest.

## Quick setup

1. Import the activity that you use from `@tanstack/ai`.
2. Import the one adapter that you use from the provider package.

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Hello!' }],
})

for await (const chunk of stream) {
  console.log(chunk)
}
```

Your bundle now holds:

- The `chat` function, with its streaming and tool code.
- The `openaiText` adapter.

It does not hold `summarize`, `generateImage`, the other activities, or the adapters of other providers.

## Use named imports

Import each function by name. Some bundlers cannot drop the unused exports of a namespace import:

```ts
// Good: only what you use
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
```

```ts
// Avoid: a namespace import can pull in every export
import * as ai from '@tanstack/ai'
import * as openai from '@tanstack/ai-openai'
```

## Use more than one activity

Import each activity and its adapter. Each one is independent:

```ts
import { chat, summarize } from '@tanstack/ai'
import { openaiSummarize, openaiText } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Hello!' }],
})

const summary = await summarize({
  adapter: openaiSummarize('gpt-5.4-mini'),
  text: 'Long text to summarize.',
})
```

The `create*Options` helpers are separate exports too. See [Typed Pre-Configured Options](./typed-options).

## Tips for smaller bundles

- Use a specific adapter function, for example `openaiText`, for each activity.
- Put different activities in different API routes.
- Load code-split routes with dynamic imports.
- In React Native and Expo, keep the chat screens client-only. Import `useChat` and the connection adapters there. Do not import provider SDKs, server response helpers, React DOM UI, devtools UI, or other framework packages. See [Quick Start: React Native](../getting-started/quick-start-react-native) for the server-only provider boundary and the mobile transport setup.

## How it works

- Each function is a named ES module export, not a default export.
- Each activity and adapter lives in its own module.
- `@tanstack/ai` declares `"sideEffects": false` in its `package.json`, so bundlers can drop modules that you do not import.
- Type-only imports are removed at build time.

Bundlers such as Vite, Webpack, Rollup, and esbuild follow the static imports and drop the code that you do not reference.

## Advanced

### Activity functions

Each activity is a separate export of `@tanstack/ai`:

| Function | Activity |
|---|---|
| `chat` | Chat and text generation |
| `summarize` | Summarization |
| `generateImage` | Image generation |
| `generateSpeech` | Text-to-speech |
| `generateTranscription` | Audio transcription |
| `generateVideo` | Video generation |
| `generateLiveVideo` | Live video sessions |
| `generateWorld` | Live world sessions |

### Adapter functions by provider

Each provider package exports one function for each activity. Some examples:

| Package | Adapters |
|---|---|
| `@tanstack/ai-openai` | `openaiText`, `openaiSummarize`, `openaiImage`, `openaiSpeech`, `openaiTranscription`, `openaiVideo`, `openaiEmbedding` |
| `@tanstack/ai-anthropic` | `anthropicText`, `anthropicSummarize` |
| `@tanstack/ai-gemini` | `geminiText`, `geminiSummarize`, `geminiImage`, `geminiSpeech` (experimental), `geminiEmbedding` |
| `@tanstack/ai-ollama` | `ollamaText`, `ollamaSummarize`, `ollamaEmbedding` |

Each adapter page lists the full set for its provider.

### Adapter types

Each adapter type has its own interface and a `kind` property:

| Interface | Main method | `kind` |
|---|---|---|
| `TextAdapter` | `chatStream()` | `'text'` |
| `SummarizeAdapter` | `summarize()` | `'summarize'` |
| `ImageAdapter` | `generateImages()` | `'image'` |
| `TTSAdapter` | `generateSpeech()` | `'tts'` |
| `TranscriptionAdapter` | `transcribe()` | `'transcription'` |
| `VideoAdapter` | `createVideoJob()`, `getVideoStatus()`, `getVideo()` | `'video'` |
| `LiveVideoAdapter` | `createLiveVideo()` | `'liveVideo'` |
| `WorldAdapter` | `createWorld()` | `'world'` |

```ts
import { openaiSummarize, openaiText } from '@tanstack/ai-openai'

const chatAdapter = openaiText('gpt-6.1-sol')
console.log(chatAdapter.kind) // 'text'

const summarizeAdapter = openaiSummarize('gpt-5.4-mini')
console.log(summarizeAdapter.kind) // 'summarize'
```

### Type safety

Separate exports keep the full types. Each adapter knows the models of its provider:

```ts ignore
import { openaiText, type OpenAIChatModel } from '@tanstack/ai-openai'

const adapter = openaiText('gpt-6.1-sol')

const model: OpenAIChatModel = 'gpt-6.1-sol' // OK
const model2: OpenAIChatModel = 'invalid' // Type error
```
