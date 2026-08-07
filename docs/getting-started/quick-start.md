---
title: "Quick Start: React"
id: quick-start
order: 2
description: "Add streaming chat to React with useChat and an OpenAI (or OpenRouter) backend."
keywords:
  - tanstack ai
  - react
  - quick start
  - useChat
  - streaming chat
  - openai
  - tutorial
  - ai chatbot
---

If you need React chat → install packages, add a server route, wire `useChat`. Other stacks: [Vue](./quick-start-vue), [Svelte](./quick-start-svelte), [server-only](./quick-start-server), [React Native](./quick-start-react-native).

Prefer one key for many models → [OpenRouter](../adapters/openrouter).

## 1. Install

```bash
npm install @tanstack/ai @tanstack/ai-react @tanstack/ai-openai
# or
pnpm add @tanstack/ai @tanstack/ai-react @tanstack/ai-openai
#or
yarn add @tanstack/ai @tanstack/ai-react @tanstack/ai-openai
```

## 2. Server route

Pick one. Both stream SSE via `toServerSentEventsResponse`.

### TanStack Start

```typescript ignore
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Check for API key
        if (!process.env.OPENAI_API_KEY) {
          return new Response(
            JSON.stringify({
              error: "OPENAI_API_KEY not configured",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const body = await request.json();

        try {
          // Create a streaming chat response. `chat()` reads the AG-UI
          // `threadId` for devtools correlation when available.
          const stream = chat({
            adapter: openaiText("gpt-5.5"),
            messages: body.messages,
          });

          // Convert stream to HTTP response
          return toServerSentEventsResponse(stream);
        } catch (error) {
          return new Response(
            JSON.stringify({
              error:
                error instanceof Error ? error.message : "An error occurred",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      },
    },
  },
});
```

### Next.js

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({
        error: "OPENAI_API_KEY not configured",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const body = await request.json();

  try {
    // Create a streaming chat response. `chat()` reads the AG-UI
    // `threadId` for devtools correlation when available.
    const stream = chat({
      adapter: openaiText("gpt-5.5"),
      messages: body.messages,
    });

    // Convert stream to HTTP response
    return toServerSentEventsResponse(stream);
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "An error occurred",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
```

## 3. Client component

```tsx
// components/Chat.tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const [input, setInput] = useState("");

  const { messages, sendMessage, isLoading, error } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage(input);
      setInput("");
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`mb-4 ${
              message.role === "assistant" ? "text-blue-600" : "text-gray-800"
            }`}
          >
            <div className="font-semibold mb-1">
              {message.role === "assistant" ? "Assistant" : "You"}
            </div>
            <div>
              {message.parts.map((part, idx) => {
                if (part.type === "thinking") {
                  return (
                    <div
                      key={idx}
                      className="text-sm text-gray-500 italic mb-2"
                    >
                      💭 Thinking: {part.content}
                    </div>
                  );
                }
                if (part.type === "text") {
                  return <div key={idx}>{part.content}</div>;
                }
                return null;
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <p role="alert" className="px-4 text-red-600">
          {error.message}
        </p>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border rounded-lg"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
```

`useChat` owns message state, streaming, loading, and errors.

## 4. API keys

Create `.env.local` (or `.env`). Server only — never ship keys to the browser.

```bash
# OpenRouter (recommended — access 300+ models with one key)
OPENROUTER_API_KEY=sk-or-...

# OpenAI
OPENAI_API_KEY=your-openai-api-key

# Anthropic
ANTHROPIC_API_KEY=your-anthropic-api-key

# Google Gemini
GEMINI_API_KEY=your-gemini-api-key
```

## Optional: tools on the server

```typescript
import { chat, toolDefinition } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'
import { db } from './db'

const getProductsDef = toolDefinition({
  name: 'getProducts',
  description: 'Search the product catalog',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.array(z.object({ id: z.string(), name: z.string() })),
})

const getProducts = getProductsDef.server(async ({ query }) => {
  return await db.products.search(query)
})

const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages: [{ role: 'user', content: 'Find products' }],
  tools: [getProducts],
})
```

## Next

- [Tools](../tools/tools)
- [Client Tools](../tools/client-tools)
- [API Reference](../api/ai)
