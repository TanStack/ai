# TanStack AI

A powerful, type-safe AI SDK for building AI-powered applications with React, Node.js, and other JavaScript frameworks.

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
import { ai, toStreamResponse } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const aiInstance = ai(openai());
  const { messages } = await request.json();

  const stream = aiInstance.chat({
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
import { ai, toStreamResponse } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const aiInstance = ai(openai());
        const { messages } = await request.json();

        const stream = aiInstance.chat({
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
            <strong>{message.role}:</strong>{" "}
            {message.parts
              .filter((p) => p.type === "text")
              .map((p) => p.content)
              .join("")}
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

- ✅ **Type-Safe** - Full TypeScript support
- ✅ **Streaming** - Real-time responses
- ✅ **Tools** - Server and client-side function calling
- ✅ **Framework Agnostic** - Works with React, Vue, Solid, and more
- ✅ **Multiple Providers** - OpenAI, Anthropic, Gemini, Ollama, and more

## Core Packages

- **@tanstack/ai** - Core AI library
- **@tanstack/ai-client** - Framework-agnostic headless client
- **@tanstack/ai-react** - React hooks

## Adapters

- **@tanstack/ai-openai** - OpenAI (GPT-4, GPT-3.5)
- **@tanstack/ai-anthropic** - Anthropic (Claude)
- **@tanstack/ai-gemini** - Google Gemini
- **@tanstack/ai-ollama** - Ollama (local models)
