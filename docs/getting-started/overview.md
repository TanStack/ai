---
title: Overview
id: overview
order: 1
description: "TanStack AI is a type-safe, provider-agnostic TypeScript SDK for building streaming chat, tool calling, and AI features that work across any framework."
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

TanStack AI is a lightweight, type-safe SDK for building production-ready AI experiences. Its framework-agnostic core provides type-safe tool/function calling, streaming responses, and first-class React and Solid integrations, with adapters for multiple LLM providers — enabling predictable, composable, and testable AI features across any stack.

## Key Features

- ✅ **Type-Safe** - Full TypeScript support with Zod schema inference
- ✅ **Streaming** - Built-in streaming support for real-time responses
- ✅ **Isomorphic Tools** - Define once with `toolDefinition()`, implement with `.server()` or `.client()`
- ✅ **Framework Agnostic** - Core library works anywhere
- ✅ **Multiple Providers** - OpenRouter, OpenAI, Anthropic, Gemini, Ollama, and more
- ✅ **Approval Flow** - Built-in support for tool approval workflows
- ✅ **Automatic Execution** - Both server and client tools execute automatically

Users can paste their own provider API keys in the browser. See [Bring Your Own Key](../advanced/byok).

## Framework Agnostic

The framework-agnostic core of TanStack AI provides the building blocks for creating AI experiences in any environment, including:

- **Next.js** - API routes and App Router
- **TanStack Start** - React Start or Solid Start (recommended!)
- **Remix 3** - Controllers return SSE. Call `createChat` in a `clientEntry` island
- **React Native / Expo** - Native chat screens with `useChat`, absolute server URLs, and XHR streaming transports
- **Express** - Node.js server
- **React Router v7** - Loaders and actions

TanStack AI lets you define a tool once and provide environment-specific implementations. Using `toolDefinition()` to declare the tool's input/output types and the server behavior with `.server()` (or a client implementation with `.client()`). These isomorphic tools can be invoked from the AI runtime regardless of framework.

```typescript
import { chat, toolDefinition } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'
import { db } from './db'

// Define a tool
const getProductsDef = toolDefinition({
  name: 'getProducts',
  description: 'Search for products by query',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.array(z.object({ id: z.string(), name: z.string() })),
})

// Create server implementation
const getProducts = getProductsDef.server(async ({ query }) => {
  return await db.products.search(query)
})

// Use in AI chat
chat({
  adapter: openaiText('gpt-5.2'),
  messages: [{ role: 'user', content: 'Find products' }],
  tools: [getProducts]
})
```

## Core Packages

The TanStack AI ecosystem consists of several packages:

### `@tanstack/ai`
The core AI library that provides:
- AI adapter interface for connecting to LLM providers
- Chat completion and streaming
- Isomorphic tool/function calling system
- Agent loop strategies
- Type-safe tool definitions with `toolDefinition()`
- Type-safe Model Options based on adapter & model selection
- Type-safe content modalities (text, image, audio, video, document) based on model capabilities

### `@tanstack/ai-client`
A framework-agnostic headless client for managing chat state:
- Message management with full type safety
- Streaming support
- Connection adapters (SSE, HTTP stream, custom)
- Automatic tool execution (server and client)
- Tool approval flow handling

### `@tanstack/ai-react`
React hooks for TanStack AI:
- `useChat` hook for chat interfaces
- Automatic state management
- Tool approval flow support
- Type-safe message handling with `InferChatMessages`

### `@tanstack/ai-solid`
Solid hooks for TanStack AI:
- `useChat` hook for chat interfaces
- Automatic state management
- Tool approval flow support
- Type-safe message handling with `InferChatMessages`

### `@tanstack/ai-octane`
Octane hooks for TanStack AI:
- `useChat` hook for chat interfaces
- Same hook names as `@tanstack/ai-react`
- Compiled by the Octane plugin from `.tsrx` source

## Adapters

With the help of adapters, TanStack AI can connect to various LLM providers. Available adapters include:

- **@tanstack/ai-openrouter** - OpenRouter (300+ models via a single API key — recommended)
- **@tanstack/ai-openai** - OpenAI (GPT series)
- **@tanstack/ai-anthropic** - Anthropic (Claude)
- **@tanstack/ai-gemini** - Google Gemini
- **@tanstack/ai-vertex** - Gemini on Google Vertex AI. Claude, Grok, and Mistral on Vertex live on `@tanstack/ai-anthropic/vertex`, `@tanstack/ai-grok/vertex`, and `@tanstack/ai-mistral/vertex`.
- **@tanstack/ai-ollama** - Ollama (local models)
- **@tanstack/ai-groq** - Groq
- **@tanstack/ai-grok** - xAI Grok
- **@tanstack/ai-bedrock** - Amazon Bedrock (Claude, Nova, Llama, and more via AWS)
- **@tanstack/ai-byteplus** - BytePlus (Seed chat, Seedance video, Seedream image, Seed Speech)
- **@tanstack/ai-fal** - fal (image & video generation)
- **@tanstack/ai-llmgateway** - LLM Gateway (hundreds of models via one OpenAI-compatible endpoint, self-hostable)
- **@tanstack/ai-cloudflare** - Cloudflare Workers AI (chat, embeddings, image, speech, transcription) and AI Gateway routing
- **@tanstack/ai-lovable** - Lovable AI Gateway (Google and OpenAI chat, image, video, embeddings, and speech via one project key)

## Next Steps

- [Quick Start](./quick-start) - Add streaming chat. Pick your framework at the top of the page.
- [Quick Start: React Native](./quick-start-react-native) - Add mobile chat with Expo and a server-owned provider boundary
- [Tools Guide](../tools/tools) - Learn about the isomorphic tool system
- [API Reference](../api/ai) - Explore the full API
