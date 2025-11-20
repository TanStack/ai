# Quick Start

Get started with TanStack AI in minutes. This guide will walk you through creating a simple chat application.

## Installation

```bash
npm install @tanstack/ai @tanstack/ai-react @tanstack/ai-openai
# or
pnpm add @tanstack/ai @tanstack/ai-react @tanstack/ai-openai
# or
yarn add @tanstack/ai @tanstack/ai-react @tanstack/ai-openai
```

## Server Setup

First, create an API route that handles chat requests. Here's a simplified example:

```typescript
// app/api/chat/route.ts (Next.js)
// or src/routes/api/chat.ts (TanStack Start)
import { ai, toStreamResponse } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  // Create AI instance with OpenAI adapter
  const aiInstance = ai(openai());

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

  const { messages } = await request.json();

  try {
    // Create a streaming chat response
    const stream = aiInstance.chat({
      messages,
      model: "gpt-4o",
    });

    // Convert stream to HTTP response
    return toStreamResponse(stream);
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error.message || "An error occurred",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
```

## Client Setup

Now create a React component that uses the chat:

```typescript
// components/Chat.tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const [input, setInput] = useState("");

  const { messages, sendMessage, isLoading } = useChat({
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
              {message.parts
                .filter((part) => part.type === "text")
                .map((part, idx) => (
                  <div key={idx}>{part.content}</div>
                ))}
            </div>
          </div>
        ))}
      </div>

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

## Environment Variables

Create a `.env.local` file (or `.env` depending on your setup):

```bash
OPENAI_API_KEY=your-api-key-here
```

## That's It!

You now have a working chat application. The `useChat` hook handles:
- Message state management
- Streaming responses
- Loading states
- Error handling

## Next Steps

- Learn about [Tools](../guides/tools) to add function calling
- Explore [Server Tools](../guides/server-tools) for backend operations
- Check out [Client Tools](../guides/client-tools) for frontend operations
- See the [API Reference](../api/ai) for more options

