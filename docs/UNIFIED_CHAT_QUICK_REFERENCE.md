# Unified Chat API - Quick Reference

> **🔄 Automatic Tool Execution:** The `chat()` method runs an automatic tool execution loop. Tools with `execute` functions are automatically called, results are added to messages, and the conversation continues - all handled internally by the SDK!
>
> **📚 See also:** [Complete Tool Execution Loop Documentation](TOOL_EXECUTION_LOOP.md)

## Two Methods for Different Use Cases

```typescript
// 1. CHATCOMPLETION - Returns Promise<ChatCompletionResult>
const result = await ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
});

// 2. CHAT - Returns AsyncIterable<StreamChunk> with automatic tool execution loop
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
  tools: [weatherTool], // Optional: auto-executed when called
  agentLoopStrategy: maxIterations(5), // Optional: control loop
});
for await (const chunk of stream) {
  if (chunk.type === "content") process.stdout.write(chunk.delta);
  else if (chunk.type === "tool_call") console.log("Calling tool...");
  else if (chunk.type === "tool_result") console.log("Tool executed!");
}
```

## Quick Comparison

| Feature               | chatCompletion                  | chat                         |
| --------------------- | ------------------------------- | ---------------------------- |
| **Return Type**       | `Promise<ChatCompletionResult>` | `AsyncIterable<StreamChunk>` |
| **When to Use**       | Need complete response          | Real-time streaming          |
| **Async/Await**       | ✅ Yes                          | ✅ Yes (for await)           |
| **Fallbacks**         | ✅ Yes                          | ✅ Yes                       |
| **Tool Execution**    | ❌ No (manual)                  | ✅ **Automatic loop**        |
| **Type-Safe Models**  | ✅ Yes                          | ✅ Yes                       |
| **Structured Output** | ✅ Yes                          | ❌ No                        |

## Common Patterns

### API Endpoint (TanStack Start)

```typescript
import { toStreamResponse } from "@tanstack/ai";

export const Route = createAPIFileRoute("/api/chat")({
  POST: async ({ request }) => {
    const { messages } = await request.json();

    const stream = ai.chat({
      adapter: "openAi",
      model: "gpt-4o",
      messages,
      fallbacks: [{ adapter: "ollama", model: "llama2" }],
    });

    return toStreamResponse(stream);
  },
});
```

### CLI Application

```typescript
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: userInput }],
});

for await (const chunk of stream) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.delta);
  }
}
```

### Batch Processing

```typescript
const result = await ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: document }],
});

await saveToDatabase(result.content);
```

## With Tools

### Automatic Execution (chat)

The `chat()` method **automatically executes tools in a loop**:

```typescript
const tools = [
  {
    type: "function" as const,
    function: {
      name: "get_weather",
      description: "Get weather for a location",
      parameters: {
        /* ... */
      },
    },
    execute: async (args: any) => {
      // SDK automatically calls this when model calls the tool
      return JSON.stringify({ temp: 72, condition: "sunny" });
    },
  },
];

// Stream mode with automatic tool execution
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
    process.stdout.write(chunk.delta);
  } else if (chunk.type === "tool_call") {
    console.log(`→ Calling: ${chunk.toolCall.function.name}`);
  } else if (chunk.type === "tool_result") {
    console.log(`✓ Result: ${chunk.content}`);
  }
}
```

**How it works:**

1. Model decides to call a tool → `tool_call` chunk
2. SDK executes `tool.execute()` → `tool_result` chunk
3. SDK adds result to messages → continues conversation
4. Repeats until complete (up to `maxIterations`)

### Manual Execution (chatCompletion)

The `chatCompletion()` method does NOT execute tools automatically:

```typescript
// chatCompletion returns tool calls but doesn't execute them
const result = await ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "What's the weather in SF?" }],
  tools,
});

// Check if model wants to call tools
if (result.toolCalls) {
  console.log("Model wants to call:", result.toolCalls);
  // You must execute manually and call chatCompletion again
}
```

## With Fallbacks

Both methods support the same fallback mechanism:

```typescript
// Promise with fallbacks
const result = await ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
  fallbacks: [
    { adapter: "anthropic", model: "claude-3-sonnet-20240229" },
    { adapter: "ollama", model: "llama2" }
  ]
});

// Stream with fallbacks
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
  fallbacks: [
    { adapter: "ollama", model: "llama2" }
  ]
});

// HTTP response with fallbacks (seamless HTTP failover!)
import { toStreamResponse } from "@tanstack/ai";

const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
  fallbacks: [
    { adapter: "ollama", model: "llama2" }
  ]
});
return toStreamResponse(stream);
```

## Fallback-Only Mode

No primary adapter, just try fallbacks in order:

```typescript
const result = await ai.chatCompletion({
  messages: [...],
  fallbacks: [
    { adapter: "openai", model: "gpt-4" },
    { adapter: "anthropic", model: "claude-3-sonnet-20240229" },
    { adapter: "ollama", model: "llama2" }
  ],
});
```

## Migration from Old API

### Before (using `as` option)

```typescript
// Non-streaming
const result = await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [],
  as: "promise",
});

// Streaming
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [],
  as: "stream",
});

// HTTP Response
const response = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [],
  as: "response",
});
```

### After (separate methods)

```typescript
// Non-streaming - use chatCompletion()
const result = await ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: [],
});

// Streaming - use chat()
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [],
});

// HTTP Response - use chat() + toStreamResponse()
import { toStreamResponse } from "@tanstack/ai";

const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [],
});
return toStreamResponse(stream);
```

## Type Inference

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

## Error Handling

Both methods throw errors if all adapters fail:

```typescript
try {
  const result = await ai.chatCompletion({
    adapter: "openai",
    model: "gpt-4",
    messages: [...],
    fallbacks: [{ adapter: "ollama", model: "llama2" }]
  });
} catch (error: any) {
  console.error("All adapters failed:", error.message);
}
```

## Cheat Sheet

| What You Want     | Use This                             | Example                                               |
| ----------------- | ------------------------------------ | ----------------------------------------------------- |
| Complete response | `chatCompletion()`                   | `const result = await ai.chatCompletion({...})`       |
| Custom streaming  | `chat()`                             | `for await (const chunk of ai.chat({...}))`           |
| API endpoint      | `chat()` + `toStreamResponse()`      | `return toStreamResponse(ai.chat({...}))`             |
| With fallbacks    | Add `fallbacks: [...]`               | `fallbacks: [{ adapter: "ollama", model: "llama2" }]` |
| With tools        | Add `tools: [...]`                   | `tools: [{...}, {...}], toolChoice: "auto"`           |
| Multiple adapters | Use `fallbacks` only                 | `fallbacks: [{ adapter: "a", model: "m1" }, {...}]`   |
| Structured output | Use `chatCompletion()` with `output` | `chatCompletion({..., output: schema })`              |

## Documentation

- **Full API Docs**: `docs/UNIFIED_CHAT_API.md`
- **Migration Guide**: `docs/MIGRATION_UNIFIED_CHAT.md`
- **Implementation**: `docs/UNIFIED_CHAT_IMPLEMENTATION.md`
