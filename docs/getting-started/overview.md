# Overview

TanStack AI is a powerful, type-safe AI SDK for building AI-powered applications with React, Node.js, and other JavaScript frameworks.

## Core Packages

### `@tanstack/ai`
The core AI library that provides:
- AI adapter interface for connecting to LLM providers
- Chat completion and streaming
- Tool/function calling support
- Agent loop strategies
- Type-safe tool definitions

### `@tanstack/ai-client`
A framework-agnostic headless client for managing chat state:
- Message management
- Streaming support
- Connection adapters (SSE, HTTP stream, custom)
- Tool call handling
- Client-side tool execution

### `@tanstack/ai-react`
React hooks for TanStack AI:
- `useChat` hook for chat interfaces
- Automatic state management
- Tool approval flow support
- Type-safe message handling

## Adapters

TanStack AI supports multiple LLM providers through adapters:

- **@tanstack/ai-openai** - OpenAI (GPT-4, GPT-3.5, etc.)
- **@tanstack/ai-anthropic** - Anthropic (Claude)
- **@tanstack/ai-gemini** - Google Gemini
- **@tanstack/ai-ollama** - Ollama (local models)

## Key Features

- ✅ **Type-Safe** - Full TypeScript support with inference
- ✅ **Streaming** - Built-in streaming support for real-time responses
- ✅ **Tools** - Powerful tool/function calling with server and client execution
- ✅ **Framework Agnostic** - Core library works anywhere, React hooks for convenience
- ✅ **Flexible** - Support for multiple LLM providers
- ✅ **Approval Flow** - Built-in support for tool approval workflows

## Next Steps

- [Quick Start Guide](./quick-start) - Get up and running in minutes
- [Tools Guide](../guides/tools) - Learn about server and client tools
- [API Reference](../api/ai) - Explore the full API

