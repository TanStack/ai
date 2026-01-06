---
title: Overview
id: overview
order: 1
---

TanStack AI is a lightweight, type-safe SDK for building production-ready AI experiences. Its framework-agnostic core provides type-safe tool/function calling, streaming responses, and first-class React and Solid integrations, with adapters for multiple LLM providers — enabling predictable, composable, and testable AI features across any stack.

## Key Features

- ✅ **Type-Safe** - Full TypeScript support with Zod schema inference
- ✅ **Streaming** - Built-in streaming support for real-time responses
- ✅ **Isomorphic Tools** - Define once with `toolDefinition()`, implement with `.server()` or `.client()`
- ✅ **Framework Agnostic** - Core library works anywhere
- ✅ **Multiple Providers** - OpenAI, Anthropic, Gemini, Ollama, and more
- ✅ **Approval Flow** - Built-in support for tool approval workflows
- ✅ **Automatic Execution** - Both server and client tools execute automatically

## Framework Agnostic

The framework-agnostic core of TanStack AI provides the building blocks for creating AI experiences in any environment, including:

- **Next.js** - API routes and App Router
- **TanStack Start** - React Start or Solid Start (recommended!)
- **Express** - Node.js server
- **React Router v7** - Loaders and actions

TanStack AI lets you define a tool once and provide environment-specific implementations. Using `toolDefinition()` to declare the tool's input/output types and the server behavior with `.server()` (or a client implementation with `.client()`). These isomorphic tools can be invoked from the AI runtime regardless of framework.

```typescript
import { chat } from '@tanstack/ai'
import { toolDefinition } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// Define a tool
const getProductsDef = toolDefinition({
  name: 'getProducts',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.array(z.object({ id: z.string(), name: z.string() })),
})

// Create server implementation
const getProducts = getProductsDef.server(async ({ query }) => {
  return await db.products.search(query)
})

// Use in AI chat
chat({
  adapter: openaiText('gpt-4o'),
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

## Adapters

With the help of adapters, TanStack AI can connect to various LLM providers. Available adapters include:

- **@tanstack/ai-openai** - OpenAI (GPT-4, GPT-3.5, etc.)
- **@tanstack/ai-anthropic** - Anthropic (Claude)
- **@tanstack/ai-gemini** - Google Gemini
- **@tanstack/ai-ollama** - Ollama (local models)

## Next Steps

- [Quick Start Guide](./quick-start) - Get up and running in minutes
- [Tools Guide](../guides/tools) - Learn about the isomorphic tool system
- [API Reference](../api/ai) - Explore the full API
