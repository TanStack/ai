# TanStack AI

A powerful, type-safe AI SDK for building AI-powered applications with React, Node.js, and other JavaScript frameworks.

## Framework Agnostic

TanStack AI works with **any** framework using `toolDefinition()` and `.server()`:

```typescript
// Use toolDefinition().server() - works everywhere
const getTool = toolDefinition({...}).server(async (args) => {...})
chat({ tools: [getTool] })
```

The core library works with any framework!

## Quick Start

Get up and running in minutes with a simple chat application.

### 1. Install

```bash
npm install @tanstack/ai @tanstack/ai-react @tanstack/ai-openai
```

### 2. Create API Route

In NextJS:

```typescript
// app/api/chat/route.ts
import { chat, toStreamResponse } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openai(),
    messages,
    model: "gpt-4o",
  });

  return toStreamResponse(stream);
}
```

In TanStack Start:

```typescript
// src/routes/api.chat.ts
import { createFileRoute } from "@tanstack/react-router";
import { chat, toStreamResponse } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = await request.json();

        const stream = chat({
          adapter: openai(),
          messages,
          model: "gpt-4o",
        });

        return toStreamResponse(stream);
      },
    },
  },
});
```

### 3. Create Chat Component

```typescript
// components/Chat.tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const [input, setInput] = useState("");

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  return (
    <div>
      <div>
        {messages.map((message) => (
          <div key={message.id}>
            <strong>{message.role}:</strong>
            {message.parts.map((part, index) => {
              if (part.type === "thinking") {
                return (
                  <div key={index} className="thinking-section">
                    💭 Thinking: {part.content}
                  </div>
                );
              }
              if (part.type === "text") {
                return <span key={index}>{part.content}</span>;
              }
              return null;
            })}
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) {
            sendMessage(input);
            setInput("");
          }
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}
```

### 4. Set Environment Variable

```bash
OPENAI_API_KEY=your-api-key-here
```

## That's It!

You now have a working chat application with streaming responses and automatic state management.

## What's Next?

- **[Full Quick Start Guide](./getting-started/quick-start)** - Detailed walkthrough
- **[Tools Guide](./guides/tools)** - Add function calling to your app
- **[API Reference](./api/ai)** - Explore the full API

## Key Features

- ✅ **Type-Safe** - Full TypeScript support with Zod schema inference
- ✅ **Streaming** - Real-time responses
- ✅ **Isomorphic Tools** - Define once with `toolDefinition()`, implement with `.server()` or `.client()`
- ✅ **Framework Agnostic** - Works with any JavaScript framework
- ✅ **Multiple Providers** - OpenAI, Anthropic, Gemini, Ollama, and more
- ✅ **Automatic Execution** - Server and client tools execute automatically

## Core Packages

- **@tanstack/ai** - Core AI library
- **@tanstack/ai-client** - Framework-agnostic headless client
- **@tanstack/ai-react** - React hooks

## Adapters

- **@tanstack/ai-openai** - OpenAI (GPT-4, GPT-3.5)
- **@tanstack/ai-anthropic** - Anthropic (Claude)
- **@tanstack/ai-gemini** - Google Gemini
- **@tanstack/ai-ollama** - Ollama (local models)
