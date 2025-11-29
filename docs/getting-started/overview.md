# Overview

TanStack AI is a powerful, type-safe AI SDK for building AI-powered applications with React, Node.js, and other JavaScript frameworks.

## Works With Any Framework

TanStack AI works great with:
- **Next.js** - API routes and App Router
- **TanStack Start** - React Start or Solid Start (recommended!)
- **Express** - Node.js server
- **Remix** - Loaders and actions
- **Any framework** - Framework-agnostic core

## Enhanced with TanStack Start

TanStack AI works with any framework using `toolDefinition()` and `.server()`. 

**With TanStack Start**, you get a bonus: `createServerFnTool` lets you share implementations between AI tools and server functions:

**Example:**
```typescript
import { createServerFnTool } from '@tanstack/ai-react'

// Define once, get both AI tool AND callable server function
const getProducts = createServerFnTool({
  name: 'getProducts',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.array(z.object({ id: z.string(), name: z.string() })),
  execute: async ({ query }) => db.products.search(query),
})

// Use in AI chat
chat({ tools: [getProducts.server] })

// Call directly from components (TanStack Start only!)
const products = await getProducts.serverFn({ query: 'guitar' })
```

**TanStack Start Benefits:**
- ✅ No duplicate logic between AI tools and server functions
- ✅ Call server functions directly from components (no API endpoints needed)
- ✅ Full type safety everywhere

See [Server Function Tools](../guides/server-function-tools.md) for more details.

**Note:** The base library works with any framework. `createServerFnTool` is optional and TanStack Start-specific.

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
- `createServerFnTool` for TanStack Start integration

### `@tanstack/ai-solid`
Solid hooks for TanStack AI:
- `useChat` hook for chat interfaces
- Automatic state management
- Tool approval flow support
- Type-safe message handling with `InferChatMessages`
- `createServerFnTool` for Solid Start integration

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
- ✅ **TanStack Start Integration** - Share logic between AI tools and server functions with `createServerFnTool`
- ✅ **Multiple Providers** - OpenAI, Anthropic, Gemini, Ollama, and more
- ✅ **Approval Flow** - Built-in support for tool approval workflows
- ✅ **Automatic Execution** - Both server and client tools execute automatically

## Next Steps

- [Quick Start Guide](./quick-start) - Get up and running in minutes
- [Tools Guide](../guides/tools) - Learn about the isomorphic tool system
- [Server Function Tools](../guides/server-function-tools) - TanStack Start integration
- [API Reference](../api/ai) - Explore the full API

