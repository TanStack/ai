# Unified Chat API - Quick Reference

## Two Methods for Different Use Cases

```typescript
// 1. CHATCOMPLETION - Returns Promise<ChatCompletionResult>
const result = await ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
});

// 2. CHAT - Returns AsyncIterable<StreamChunk>
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
});
for await (const chunk of stream) {
  console.log(chunk);
}
```

## Quick Comparison

| Feature | chatCompletion | chat |
|---------|----------------|------|
| **Return Type** | `Promise<ChatCompletionResult>` | `AsyncIterable<StreamChunk>` |
| **When to Use** | Need complete response | Custom stream handling |
| **Async/Await** | ✅ Yes | ✅ Yes (for await) |
| **Fallbacks** | ✅ Yes | ✅ Yes |
| **Tool Execution** | ✅ Yes | ✅ Yes |
| **Type-Safe Models** | ✅ Yes | ✅ Yes |
| **Structured Output** | ✅ Yes | ❌ No |

## Common Patterns

### API Endpoint (TanStack Start)

```typescript
import { toStreamResponse } from "@tanstack/ai/stream-to-response";

export const Route = createAPIFileRoute("/api/chat")({
  POST: async ({ request }) => {
    const { messages } = await request.json();
    
    const stream = ai.chat({
      adapter: "openAi",
      model: "gpt-4o",
      messages,
      fallbacks: [{ adapter: "ollama", model: "llama2" }]
    });

    return toStreamResponse(stream);
  }
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

Both methods support tools:

```typescript
const tools = [
  {
    type: "function" as const,
    function: {
      name: "get_weather",
      description: "Get weather for a location",
      parameters: { /* ... */ }
    },
    execute: async (args: any) => {
      return JSON.stringify({ temp: 72, condition: "sunny" });
    }
  }
];

// Promise mode
const result = await ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "What's the weather in SF?" }],
  tools,
  toolChoice: "auto",
  maxIterations: 5,
});

// Stream mode
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "What's the weather in SF?" }],
  tools,
  toolChoice: "auto",
  maxIterations: 5,
});

// HTTP response (for API)
import { toStreamResponse } from "@tanstack/ai/stream-to-response";

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
import { toStreamResponse } from "@tanstack/ai/stream-to-response";

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
  as: "promise"
});

// Streaming
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [],
  as: "stream"
});

// HTTP Response
const response = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [],
  as: "response"
});
```

### After (separate methods)

```typescript
// Non-streaming - use chatCompletion()
const result = await ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: []
});

// Streaming - use chat()
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: []
});

// HTTP Response - use chat() + toStreamResponse()
import { toStreamResponse } from "@tanstack/ai/stream-to-response";

const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: []
});
return toStreamResponse(stream);
```

## Type Inference

TypeScript automatically infers the correct return type:

```typescript
// Type: Promise<ChatCompletionResult>
const promise = ai.chatCompletion({ adapter: "openai", model: "gpt-4", messages: [] });

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

| What You Want | Use This | Example |
|---------------|----------|---------|
| Complete response | `chatCompletion()` | `const result = await ai.chatCompletion({...})` |
| Custom streaming | `chat()` | `for await (const chunk of ai.chat({...}))` |
| API endpoint | `chat()` + `toStreamResponse()` | `return toStreamResponse(ai.chat({...}))` |
| With fallbacks | Add `fallbacks: [...]` | `fallbacks: [{ adapter: "ollama", model: "llama2" }]` |
| With tools | Add `tools: [...]` | `tools: [{...}, {...}], toolChoice: "auto"` |
| Multiple adapters | Use `fallbacks` only | `fallbacks: [{ adapter: "a", model: "m1" }, {...}]` |
| Structured output | Use `chatCompletion()` with `output` | `chatCompletion({..., output: schema })` |

## Documentation

- **Full API Docs**: `docs/UNIFIED_CHAT_API.md`
- **Migration Guide**: `docs/MIGRATION_UNIFIED_CHAT.md`
- **Implementation**: `docs/UNIFIED_CHAT_IMPLEMENTATION.md`
