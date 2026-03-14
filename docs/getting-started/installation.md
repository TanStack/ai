---
title: Installation
id: installation
order: 2
---

Install TanStack AI along with a framework integration and an adapter for your preferred LLM provider.

## Core

Every project needs the core package:

```bash
npm install @tanstack/ai
# or
pnpm add @tanstack/ai
# or
yarn add @tanstack/ai
```

## React

```bash
npm install @tanstack/ai-react
```

The React integration provides the `useChat` hook for managing chat state. See the [@tanstack/ai-react API docs](../api/ai-react) for full details.

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

function Chat() {
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });
  // ...
}
```

## Solid

```bash
npm install @tanstack/ai-solid
```

The Solid integration provides the `useChat` primitive for managing chat state. See the [@tanstack/ai-solid API docs](../api/ai-solid) for full details.

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-solid";

function Chat() {
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });
  // ...
}
```

## Preact

```bash
npm install @tanstack/ai-preact
```

The Preact integration provides the `useChat` hook for managing chat state. See the [@tanstack/ai-preact API docs](../api/ai-preact) for full details.

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-preact";

function Chat() {
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });
  // ...
}
```

## Vue

```bash
npm install @tanstack/ai-vue
```

## Svelte

```bash
npm install @tanstack/ai-svelte
```

## Headless (Framework-Agnostic)

If you're using a framework without a dedicated integration, or building a custom solution, use the headless client directly:

```bash
npm install @tanstack/ai-client
```

See the [@tanstack/ai-client API docs](../api/ai-client) for full details.

## Adapters

You also need an adapter for your LLM provider. Install one (or more) of the following:

```bash
# OpenRouter (recommended — 300+ models with one API key)
npm install @tanstack/ai-openrouter

# OpenAI
npm install @tanstack/ai-openai

# Anthropic
npm install @tanstack/ai-anthropic

# Google Gemini
npm install @tanstack/ai-gemini

# Ollama (local models)
npm install @tanstack/ai-ollama

# Groq
npm install @tanstack/ai-groq

# Grok (xAI)
npm install @tanstack/ai-grok
```

See the [Adapters section](../adapters/openai) for provider-specific setup guides.

## Next Steps

- [Quick Start Guide](./quick-start) - Build a chat app in minutes
- [Tools Guide](../guides/tools) - Learn about the isomorphic tool system
