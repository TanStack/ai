---
title: Overview
id: overview
order: 1
description: "Type-safe, provider-agnostic TypeScript SDK for streaming chat, tools, and AI features."
keywords:
  - tanstack ai
  - ai sdk
  - typescript ai
  - streaming chat
  - tool calling
  - isomorphic tools
  - framework agnostic
  - llm sdk
---

If you need a working chat UI → [Quick Start](./quick-start). Server only → [Server Quick Start](./quick-start-server).

TanStack AI is a type-safe TypeScript SDK for streaming chat, tool calling, and multi-provider AI apps. Core is framework-agnostic; React, Solid, Vue, Svelte, and Preact ship first-class clients.

## When to use it

**Must-have capabilities**

- Type-safe tools and model options (Zod + per-model narrowing)
- Streaming chat with automatic tool execution
- Isomorphic tools: define once, `.server()` / `.client()`
- Adapters for OpenRouter, OpenAI, Anthropic, Gemini, Ollama, and more
- Approval flows for human-in-the-loop tools

**Runs in**

Next.js, TanStack Start, Express, React Router v7, React Native / Expo (absolute URL + XHR stream).

## Define a tool once

```typescript
import { chat, toolDefinition } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'
import { db } from './db'

const getProductsDef = toolDefinition({
  name: 'getProducts',
  description: 'Search for products by query',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.array(z.object({ id: z.string(), name: z.string() })),
})

const getProducts = getProductsDef.server(async ({ query }) => {
  return await db.products.search(query)
})

chat({
  adapter: openaiText('gpt-5.2'),
  messages: [{ role: 'user', content: 'Find products' }],
  tools: [getProducts]
})
```

## Packages

| Package | Use for |
| --- | --- |
| `@tanstack/ai` | `chat()`, adapters, tools, agent loops, typed modalities |
| `@tanstack/ai-client` | Headless chat state, SSE/HTTP/custom connections |
| `@tanstack/ai-react` | React `useChat` |
| `@tanstack/ai-solid` | Solid `useChat` |

Framework packages wrap the same headless client (messages, streaming, auto tool execution, approvals).

## Adapters

**Do now (common)**

- `@tanstack/ai-openrouter` — 300+ models, one API key (recommended to start)
- `@tanstack/ai-openai` — GPT series
- `@tanstack/ai-anthropic` — Claude
- `@tanstack/ai-gemini` — Google Gemini
- `@tanstack/ai-ollama` — local models

**Also available**

`@tanstack/ai-groq`, `@tanstack/ai-grok`, `@tanstack/ai-bedrock`, `@tanstack/ai-byteplus`, `@tanstack/ai-fal`

## Next

- [Quick Start: React](./quick-start)
- [Quick Start: React Native](./quick-start-react-native)
- [Tools](../tools/tools)
- [API Reference](../api/ai)
