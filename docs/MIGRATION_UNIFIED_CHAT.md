# Migration Guide: From `as` Option to Separate Methods

## Overview

The `as` option has been removed from the `chat()` method. Instead, use:
- **`chat()`** - For streaming (returns `AsyncIterable<StreamChunk>`)
- **`chatCompletion()`** - For promise-based completion (returns `Promise<ChatCompletionResult>`)

## Migration Examples

### Before (Using `as` option)

```typescript
import { createAPIFileRoute } from "@tanstack/start/api";
import { ai } from "~/lib/ai-client";

export const Route = createAPIFileRoute("/api/tanchat")({
  POST: async ({ request }) => {
    const { messages, tools } = await request.json();

    // Old way: Using as: "response"
    return ai.chat({
      model: "gpt-4o",
      adapter: "openAi",
      fallbacks: [
        {
          adapter: "ollama",
          model: "gpt-oss:20b"
        }
      ],
      messages: allMessages,
      temperature: 0.7,
      toolChoice: "auto",
      maxIterations: 5,
      as: "response", // ← Old way
    });
  }
});
```

### After (Using separate methods)

```typescript
import { createAPIFileRoute } from "@tanstack/start/api";
import { ai } from "~/lib/ai-client";
import { toStreamResponse } from "@tanstack/ai";

export const Route = createAPIFileRoute("/api/tanchat")({
  POST: async ({ request }) => {
    const { messages, tools } = await request.json();

    // New way: Use chat() + toStreamResponse()
    const stream = ai.chat({
      model: "gpt-4o",
      adapter: "openAi",
      fallbacks: [
        {
          adapter: "ollama",
          model: "gpt-oss:20b"
        }
      ],
      messages: allMessages,
      temperature: 0.7,
      toolChoice: "auto",
      maxIterations: 5,
    });

    return toStreamResponse(stream);
  }
});
```

## Key Changes

1. **Removed**: `as: "response"` option
2. **Changed**: `chat()` now always returns `AsyncIterable<StreamChunk>`
3. **Added**: `chatCompletion()` method for promise-based calls
4. **Added**: Import `toStreamResponse()` helper for HTTP responses

## Migration Patterns

### Pattern 1: Non-streaming (Promise mode)

**Before:**
```typescript
const result = await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [],
  as: "promise", // or omit - it was the default
});
```

**After:**
```typescript
const result = await ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: [],
});
```

### Pattern 2: Streaming

**Before:**
```typescript
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [],
  as: "stream",
});
```

**After:**
```typescript
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [],
});
// No as option needed - chat() is now streaming-only
```

### Pattern 3: HTTP Response

**Before:**
```typescript
return ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [],
  as: "response",
});
```

**After:**
```typescript
import { toStreamResponse } from "@tanstack/ai";

const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [],
});

return toStreamResponse(stream);
```

## Complete Example

Here's a complete updated file:

```typescript
import { createAPIFileRoute } from "@tanstack/start/api";
import { ai } from "~/lib/ai-client";
import { toStreamResponse } from "@tanstack/ai";

const SYSTEM_PROMPT = `You are a helpful AI assistant...`;

export const Route = createAPIFileRoute("/api/tanchat")({
  POST: async ({ request }) => {
    try {
      const body = await request.json();
      const { messages, tools } = body;

      const allMessages = tools
        ? messages
        : [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

      // Use chat() for streaming, then convert to Response
      const stream = ai.chat({
        adapter: "openAi",
        model: "gpt-4o",
        messages: allMessages,
        temperature: 0.7,
        tools,
        toolChoice: "auto",
        maxIterations: 5,
        fallbacks: [
          {
            adapter: "ollama",
            model: "gpt-oss:20b"
          }
        ]
      });

      return toStreamResponse(stream);
    } catch (error: any) {
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }
});
```

## Benefits

✅ **Simpler code**: Clearer intent with separate methods  
✅ **Same functionality**: Still returns SSE-formatted Response  
✅ **Same fallback behavior**: OpenAI → Ollama failover still works  
✅ **Same tool execution**: Tools are still executed automatically  
✅ **Type-safe**: TypeScript knows exact return types  
✅ **Better naming**: `chatCompletion()` clearly indicates promise-based completion

## Testing

The client-side code doesn't need any changes! It still consumes the SSE stream the same way:

```typescript
const response = await fetch("/api/tanchat", {
  method: "POST",
  body: JSON.stringify({ messages, tools })
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const text = decoder.decode(value);
  // Parse SSE format and handle chunks
}
```

Everything works exactly the same, just with a cleaner API! 🎉
