# Unified Chat API

## Overview

The chat API provides two methods for different use cases:

- **`chat()`** - Returns `AsyncIterable<StreamChunk>` - streaming chunks for manual handling
- **`chatCompletion()`** - Returns `Promise<ChatCompletionResult>` - standard non-streaming chat with optional structured output

## Migration Guide

### Before (Using `as` option)

```typescript
// For non-streaming
const result = await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
  as: "promise"
});

// For streaming
const stream = ai.chat({
  adapter: "openai", 
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
  as: "stream"
});
for await (const chunk of stream) {
  console.log(chunk);
}

// For HTTP response
const response = ai.chat({
  adapter: "openai",
  model: "gpt-4", 
  messages: [{ role: "user", content: "Hello" }],
  as: "response"
});
return response;
```

### After (Separate Methods)

```typescript
// For non-streaming - use chatCompletion()
const result = await ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }]
});

// For streaming - use chat()
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }]
});
for await (const chunk of stream) {
  console.log(chunk);
}

// For HTTP response - use chat() + toStreamResponse()
import { toStreamResponse } from "@tanstack/ai/stream-to-response";

const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }]
});
return toStreamResponse(stream);
```

## Usage Examples

### 1. Promise Mode (chatCompletion)

Standard non-streaming chat completion:

```typescript
const result = await ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "What is TypeScript?" }
  ],
  temperature: 0.7,
});

console.log(result.content);
console.log(`Tokens used: ${result.usage.totalTokens}`);
```

### 2. Stream Mode (chat)

Manual streaming for custom handling:

```typescript
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Write a story" }]
});

for await (const chunk of stream) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.delta);
  } else if (chunk.type === "tool_call") {
    console.log(`Tool: ${chunk.toolCall.function.name}`);
  } else if (chunk.type === "done") {
    console.log(`\nFinished: ${chunk.finishReason}`);
    console.log(`Tokens: ${chunk.usage?.totalTokens}`);
  }
}
```

### 3. HTTP Response Mode

Perfect for API endpoints:

```typescript
import { toStreamResponse } from "@tanstack/ai/stream-to-response";

// TanStack Start API Route
export const POST = async ({ request }: { request: Request }) => {
  const { messages } = await request.json();

  const stream = ai.chat({
    adapter: "openai",
    model: "gpt-4o",
    messages,
    temperature: 0.7,
  });

  // Convert stream to Response with SSE headers
  return toStreamResponse(stream);
};
```

## With Fallbacks

Both methods support fallbacks:

```typescript
// Promise mode with fallbacks
const result = await ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
  fallbacks: [
    { adapter: "anthropic", model: "claude-3-sonnet-20240229" },
    { adapter: "ollama", model: "llama2" }
  ]
});

// Stream mode with fallbacks
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
  fallbacks: [
    { adapter: "anthropic", model: "claude-3-sonnet-20240229" }
  ]
});

// HTTP response with fallbacks (seamless failover in HTTP streaming!)
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
  fallbacks: [
    { adapter: "ollama", model: "llama2" }
  ]
});
return toStreamResponse(stream);
```

## Tool Execution

Tool execution works in both modes:

```typescript
const tools = [
  {
    type: "function" as const,
    function: {
      name: "get_weather",
      description: "Get weather for a location",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string" }
        }
      }
    },
    execute: async (args: { location: string }) => {
      return JSON.stringify({ temp: 72, condition: "sunny" });
    }
  }
];

// Promise mode - waits for all tool executions to complete
const result = await ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "What's the weather in SF?" }],
  tools,
  toolChoice: "auto",
  maxIterations: 5,
});

// Stream mode - see tool execution happen in real-time
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "What's the weather in SF?" }],
  tools,
  toolChoice: "auto",
  maxIterations: 5,
});

for await (const chunk of stream) {
  if (chunk.type === "tool_call") {
    console.log(`Calling tool: ${chunk.toolCall.function.name}`);
  }
}

// Response mode - stream tool execution to client
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "What's the weather in SF?" }],
  tools,
  toolChoice: "auto",
  maxIterations: 5,
});
return toStreamResponse(stream);
```

## Type Safety

TypeScript automatically infers the correct return type:

```typescript
// Type: Promise<ChatCompletionResult>
const promise = ai.chatCompletion({ adapter: "openai", model: "gpt-4", messages: [] });

// Type: AsyncIterable<StreamChunk>
const stream = ai.chat({ adapter: "openai", model: "gpt-4", messages: [] });
```

## Benefits

1. **Clearer API**: Separate methods for different use cases
2. **Consistent Interface**: Same options across both methods
3. **HTTP Streaming Made Easy**: Use `toStreamResponse()` helper
4. **Fallbacks Everywhere**: Both methods support the same fallback mechanism
5. **Type Safety**: TypeScript infers the correct return type
6. **Structured Outputs**: Available in `chatCompletion()` method

## Real-World Example: TanStack Start API

```typescript
import { createAPIFileRoute } from "@tanstack/start/api";
import { ai } from "~/lib/ai-client";
import { toStreamResponse } from "@tanstack/ai/stream-to-response";

export const Route = createAPIFileRoute("/api/chat")({
  POST: async ({ request }) => {
    const { messages, tools } = await request.json();

    const stream = ai.chat({
      adapter: "openAi",
      model: "gpt-4o",
      messages,
      tools,
      toolChoice: "auto",
      maxIterations: 5,
      temperature: 0.7,
      fallbacks: [
        { adapter: "ollama", model: "llama2" }
      ]
    });

    return toStreamResponse(stream);
  }
});
```

Client-side consumption:

```typescript
const response = await fetch("/api/chat", {
  method: "POST",
  body: JSON.stringify({ messages, tools })
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const text = decoder.decode(value);
  const lines = text.split("\n\n");
  
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = line.slice(6);
      if (data === "[DONE]") continue;
      
      const chunk = JSON.parse(data);
      if (chunk.type === "content") {
        console.log(chunk.delta); // Stream content to UI
      }
    }
  }
}
```

## Summary

The unified chat API provides:
- **Two methods**: `chat()` for streaming, `chatCompletion()` for promises
- **Same options** across both methods
- **Built-in HTTP streaming** helper (`toStreamResponse`)
- **Full fallback support** in both methods
- **Type-safe** return types
- **Simpler code** for common patterns
