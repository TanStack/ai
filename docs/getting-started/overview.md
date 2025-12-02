# Overview

TanStack AI is a powerful, type-safe AI SDK for building AI-powered applications with React, Node.js, and other JavaScript frameworks.

## Works With Any Framework

TanStack AI works great with:
- **Next.js** - API routes and App Router
- **TanStack Start** - React Start or Solid Start (recommended!)
- **Express** - Node.js server
- **Remix Router v7** - Loaders and actions
- **Any framework** - Framework-agnostic core

## Framework Agnostic

TanStack AI works with any framework using `toolDefinition()` and `.server()`:

```typescript
import { toolDefinition } from '@tanstack/ai'

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
chat({ tools: [getProducts] })
```

The base library works with any framework!

## Core Packages

### `@tanstack/ai`
The core AI library that provides:
- AI adapter interface for connecting to LLM providers
- Chat completion and streaming
- Isomorphic tool/function calling system
- Agent loop strategies
- Type-safe tool definitions with `toolDefinition()`

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

TanStack AI supports multiple LLM providers through adapters:

- **@tanstack/ai-openai** - OpenAI (GPT-4, GPT-3.5, etc.)
- **@tanstack/ai-anthropic** - Anthropic (Claude)
- **@tanstack/ai-gemini** - Google Gemini
- **@tanstack/ai-ollama** - Ollama (local models)

## Key Features

- ✅ **Type-Safe** - Full TypeScript support with Zod schema inference
- ✅ **Streaming** - Built-in streaming support for real-time responses
- ✅ **Isomorphic Tools** - Define once with `toolDefinition()`, implement with `.server()` or `.client()`
- ✅ **Framework Agnostic** - Core library works anywhere
- ✅ **Multiple Providers** - OpenAI, Anthropic, Gemini, Ollama, and more
- ✅ **Approval Flow** - Built-in support for tool approval workflows
- ✅ **Automatic Execution** - Both server and client tools execute automatically

## Next Steps

- [Quick Start Guide](./quick-start) - Get up and running in minutes
- [Tools Guide](../guides/tools) - Learn about the isomorphic tool system
- [API Reference](../api/ai) - Explore the full API

