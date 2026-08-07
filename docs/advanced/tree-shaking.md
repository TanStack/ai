---
title: Tree-Shaking
id: tree-shaking
order: 7
description: "Import only the activities and adapters you use for minimal TanStack AI bundle size."
keywords:
  - tanstack ai
  - tree-shaking
  - bundle size
  - modular imports
  - performance
  - tree-shakeable
---

If you care about bundle size → import named activity functions and per-activity adapters only. Never `import *`.

## Import what you use

```ts
import { chat } from '@tanstack/ai'
import { summarize } from '@tanstack/ai'
import { generateImage } from '@tanstack/ai'
import { generateSpeech } from '@tanstack/ai'
import { generateTranscription } from '@tanstack/ai'
import { generateVideo } from '@tanstack/ai'
```

Chat-only app:

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages: [{ role: 'user', content: 'Hello!' }],
})
```

Bundles `chat` + `openaiText` — not summarize, image, or other providers.

## Adapter imports by provider

**OpenAI**

```ts
import {
  openaiText,
  openaiSummarize,
  openaiImage,
  openaiSpeech,
  openaiTranscription,
  openaiVideo,
} from '@tanstack/ai-openai'
```

**Anthropic**

```ts
import { anthropicText, anthropicSummarize } from '@tanstack/ai-anthropic'
```

**Gemini**

```ts
import {
  geminiText,
  geminiSummarize,
  geminiImage,
  geminiSpeech, // experimental
} from '@tanstack/ai-gemini'
```

**Ollama**

```ts
import { ollamaText, ollamaSummarize } from '@tanstack/ai-ollama'
```

## Multiple activities

```ts
import { chat, summarize } from '@tanstack/ai'
import { openaiText, openaiSummarize } from '@tanstack/ai-openai'

const chatResult = chat({
  adapter: openaiText('gpt-5.5'),
  messages: [{ role: 'user', content: 'Hello!' }],
})

const summarizeResult = await summarize({
  adapter: openaiSummarize('gpt-5.4-mini'),
  text: 'Long text to summarize...',
})
```

## Typed options helpers

Also tree-shakeable:

```ts
import { createChatOptions } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const chatOptions = createChatOptions({
  adapter: openaiText('gpt-5.5'),
})
```

## Do / don't

```ts
// Do
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// Don't
import * as ai from '@tanstack/ai'
import * as openai from '@tanstack/ai-openai'
```

**Must:**

1. Named imports only
2. Specific adapters (`openaiText`, not a monolith)
3. Keep provider SDKs server-side; mobile chat screens import `useChat` + connection adapters only — [Quick Start: React Native](../getting-started/quick-start-react-native)

**Optional:**

- Split activities by route
- Dynamic import for code-split routes

## Adapter kinds

| Interface | Method | `kind` example |
|-----------|--------|----------------|
| `ChatAdapter` | `chatStream()` | `'text'` |
| `SummarizeAdapter` | `summarize()` | `'summarize'` |
| `ImageAdapter` | `generateImage()` | — |
| `TTSAdapter` | `generateSpeech()` | — |
| `TranscriptionAdapter` | `generateTranscription()` | — |
| `VideoAdapter` | `generateVideo()` | — |

```ts
import { openaiText, openaiSummarize } from '@tanstack/ai-openai'

console.log(openaiText('gpt-5.5').kind) // 'text'
console.log(openaiSummarize('gpt-5.4-mini').kind) // 'summarize'
```

## Why bundlers drop unused code

1. Named ES module exports
2. Separate modules per activity/adapter
3. No module-level side effects
4. Type-only imports stripped at build

Type safety is unchanged — each adapter still narrows models:

```ts ignore
import { openaiText, type OpenAIChatModel } from '@tanstack/ai-openai'

const model: OpenAIChatModel = 'gpt-5.5' // ok
// const model2: OpenAIChatModel = 'invalid' // error
```
