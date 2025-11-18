# Unified Chat API

## Overview

The chat API provides two methods for different use cases:

- **`chat()`** - Returns `AsyncIterable<StreamChunk>` - streaming with **automatic tool execution loop**
- **`chatCompletion()`** - Returns `Promise<ChatCompletionResult>` - standard non-streaming chat with optional structured output

### 🔄 Automatic Tool Execution in `chat()`

**IMPORTANT:** The `chat()` method runs an automatic tool execution loop. When you provide tools with `execute` functions:

1. **Model calls a tool** → SDK executes it automatically
2. **SDK emits chunks** for tool calls and results (`tool_call`, `tool_result`)
3. **SDK adds results** to messages and continues conversation
4. **Loop repeats** until stopped by `agentLoopStrategy` (default: `maxIterations(5)`)

**You don't need to manually execute tools or manage conversation state** - the SDK handles everything internally!

**📚 See also:** [Complete Tool Execution Loop Documentation](TOOL_EXECUTION_LOOP.md)

## Migration Guide

### Before (Using `as` option)

```typescript
// For non-streaming
const result = await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
  as: "promise",
});

// For streaming
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
  as: "stream",
});
for await (const chunk of stream) {
  console.log(chunk);
}

// For HTTP response
const response = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
  as: "response",
});
return response;
```

### After (Separate Methods)

```typescript
// For non-streaming - use chatCompletion()
const result = await ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
});

// For streaming - use chat()
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
});
for await (const chunk of stream) {
  console.log(chunk);
}

// For HTTP response - use chat() + toStreamResponse()
import { toStreamResponse } from "@tanstack/ai";

const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
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
    { role: "user", content: "What is TypeScript?" },
  ],
  temperature: 0.7,
});

console.log(result.content);
console.log(`Tokens used: ${result.usage.totalTokens}`);
```

### 2. Stream Mode (chat)

Streaming with automatic tool execution loop:

```typescript
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Write a story" }],
  tools: [weatherTool], // Optional: tools are auto-executed
  agentLoopStrategy: maxIterations(5), // Optional: control loop
});

for await (const chunk of stream) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.delta); // Stream text response
  } else if (chunk.type === "tool_call") {
    console.log(`→ Calling tool: ${chunk.toolCall.function.name}`);
  } else if (chunk.type === "tool_result") {
    console.log(`✓ Tool result: ${chunk.content}`);
  } else if (chunk.type === "done") {
    console.log(`\nFinished: ${chunk.finishReason}`);
    console.log(`Tokens: ${chunk.usage?.totalTokens}`);
  }
}
```

**Chunk Types:**

- `content` - Text content from the model (use `chunk.delta` for streaming)
- `tool_call` - Model is calling a tool (emitted by model, auto-executed by SDK)
- `tool_result` - Tool execution result (emitted after SDK executes tool)
- `done` - Stream complete (includes `finishReason` and token usage)
- `error` - An error occurred

### 3. HTTP Response Mode

Perfect for API endpoints:

```typescript
import { toStreamResponse } from "@tanstack/ai";

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
    { adapter: "ollama", model: "llama2" },
  ],
});

// Stream mode with fallbacks
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
  fallbacks: [{ adapter: "anthropic", model: "claude-3-sonnet-20240229" }],
});

// HTTP response with fallbacks (seamless failover in HTTP streaming!)
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
  fallbacks: [{ adapter: "ollama", model: "llama2" }],
});
return toStreamResponse(stream);
```

## Tool Execution with Automatic Loop

**The `chat()` method automatically executes tools in a loop** - no manual management needed!

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
          location: { type: "string" },
        },
        required: ["location"],
      },
    },
    execute: async (args: { location: string }) => {
      // This function is automatically called by the SDK
      const weather = await fetchWeatherAPI(args.location);
      return JSON.stringify(weather);
    },
  },
];

// Streaming chat with automatic tool execution
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "What's the weather in SF?" }],
  tools, // Tools with execute functions are auto-executed
  toolChoice: "auto",
  agentLoopStrategy: maxIterations(5), // Control loop behavior
});

for await (const chunk of stream) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.delta); // Stream text response
  } else if (chunk.type === "tool_call") {
    // Model decided to call a tool - SDK will execute it automatically
    console.log(`→ Calling: ${chunk.toolCall.function.name}`);
  } else if (chunk.type === "tool_result") {
    // SDK executed the tool and got a result
    console.log(`✓ Result: ${chunk.content}`);
  } else if (chunk.type === "done") {
    console.log(`Finished: ${chunk.finishReason}`);
  }
}
```

**🔄 What Happens Internally:**

1. User asks: "What's the weather in SF?"
2. Model decides to call `get_weather` tool
   - SDK emits `tool_call` chunk
3. **SDK automatically executes** `tools[0].execute({ location: "SF" })`
   - SDK emits `tool_result` chunk
4. SDK adds assistant message (with tool call) + tool result to messages
5. **SDK automatically continues** conversation by calling model again
6. Model responds: "The weather in SF is sunny, 72°F"
   - SDK emits `content` chunks
7. SDK emits `done` chunk

**Key Points:**

- ✅ Tools are **automatically executed** by the SDK (you don't call `execute`)
- ✅ Tool results are **automatically added** to messages
- ✅ Conversation **automatically continues** after tool execution
- ✅ Loop controlled by `agentLoopStrategy` (default: `maxIterations(5)`)
- ✅ All you do is handle chunks for display
- ✅ Custom strategies available for advanced control

**Promise Mode (No Tool Execution):**

The `chatCompletion()` method does NOT execute tools - it returns the model's response immediately:

```typescript
// chatCompletion does not execute tools
const result = await ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "What's the weather in SF?" }],
  tools,
});

// If model wanted to call a tool, result.toolCalls will contain the calls
// but they won't be executed. This is useful if you want manual control.
if (result.toolCalls) {
  console.log("Model wants to call:", result.toolCalls);
  // You would execute manually and call chatCompletion again
}
```

## Type Safety

TypeScript automatically infers the correct return type:

```typescript
// Type: Promise<ChatCompletionResult>
const promise = ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: [],
});

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
import { toStreamResponse } from "@tanstack/ai";

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
      fallbacks: [{ adapter: "ollama", model: "llama2" }],
    });

    return toStreamResponse(stream);
  },
});
```

Client-side consumption:

```typescript
const response = await fetch("/api/chat", {
  method: "POST",
  body: JSON.stringify({ messages, tools }),
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
