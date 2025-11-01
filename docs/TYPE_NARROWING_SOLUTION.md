# Type Narrowing with Separate Methods ✅

> **Note**: This document describes type narrowing with the current API. The previous `as` option approach has been replaced with separate methods.

## The Solution

With separate methods, type narrowing is automatic and simple:

```typescript
// Streaming - returns AsyncIterable<StreamChunk>
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
});
// Type: AsyncIterable<StreamChunk> ✅

// Promise-based - returns Promise<ChatCompletionResult>
const result = ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
});
// Type: Promise<ChatCompletionResult> ✅
```

No need for `as const` assertions or discriminated unions - TypeScript automatically knows the return type!

## How to Use

### ✅ Correct Usage - Type is Automatically Narrowed

```typescript
// Returns AsyncIterable<StreamChunk>
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
});

for await (const chunk of stream) {
  // TypeScript knows chunk is StreamChunk ✅
  console.log(chunk.type);
}

// Returns Promise<ChatCompletionResult>
const result = await ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
});

// TypeScript knows result is ChatCompletionResult ✅
console.log(result.content);
console.log(result.usage.totalTokens);
```

### Type Inference Examples

```typescript
// 1. Stream mode - returns AsyncIterable<StreamChunk>
const stream = ai.chat({ adapter: "openai", model: "gpt-4", messages: [] });
// Type: AsyncIterable<StreamChunk> ✅

// 2. Promise mode - returns Promise<ChatCompletionResult>
const promise = ai.chatCompletion({ adapter: "openai", model: "gpt-4", messages: [] });
// Type: Promise<ChatCompletionResult> ✅

// 3. After await - ChatCompletionResult
const result = await ai.chatCompletion({ adapter: "openai", model: "gpt-4", messages: [] });
// Type: ChatCompletionResult ✅
```

## Real-World Example: API Handler

```typescript
import { toStreamResponse } from "@tanstack/ai";

export const Route = createAPIFileRoute("/api/chat")({
  POST: async ({ request }): Promise<Response> => {
    const { messages } = await request.json();
    
    // TypeScript knows this returns AsyncIterable<StreamChunk> ✅
    const stream = ai.chat({
      adapter: "openAi",
      model: "gpt-4o",
      messages,
      fallbacks: [
        { adapter: "ollama", model: "llama2" }
      ]
    });

    // Convert to Response
    return toStreamResponse(stream);
  }
});
```

## Why Separate Methods Are Better

With the old `as` option approach:
```typescript
const as = "response"; // Type: string
const result = ai.chat({ adapter: "openai", model: "gpt-4", messages: [], as });
// Return type: Promise<ChatCompletionResult> | AsyncIterable<StreamChunk> | Response
// ❌ TypeScript doesn't know which specific type
// Need: as: "response" as const
```

With separate methods:
```typescript
const stream = ai.chat({ adapter: "openai", model: "gpt-4", messages: [] });
// Return type: AsyncIterable<StreamChunk>
// ✅ TypeScript knows exact type automatically!
```

## Technical Explanation

The separate methods approach is simpler:

```typescript
class AI<TAdapter> {
  chat(options: ChatOptions): AsyncIterable<StreamChunk> {
    // Implementation...
  }
  
  async chatCompletion(options: ChatOptions): Promise<ChatCompletionResult> {
    // Implementation...
  }
}
```

TypeScript's type inference:
1. Call `chat()` → method signature says it returns `AsyncIterable<StreamChunk>`
2. Call `chatCompletion()` → method signature says it returns `Promise<ChatCompletionResult>`
3. No conditional types needed - just straightforward method signatures!

## Benefits

✅ **Type Safety**: TypeScript knows exact return type at compile time  
✅ **IntelliSense**: Autocomplete shows correct properties for each method  
✅ **Compile-Time Errors**: Catch type mismatches before runtime  
✅ **Refactoring Safety**: Changes are caught automatically  
✅ **Self-Documenting**: Methods serve as inline documentation  
✅ **Simpler**: No `as const` needed, no overloads needed

## Summary

The separate methods API provides perfect type narrowing without any special syntax:

| Method | Return Type |
|--------|-------------|
| `chat()` | `AsyncIterable<StreamChunk>` |
| `chatCompletion()` | `Promise<ChatCompletionResult>` |

**Pro Tip**: Just call the method you need - TypeScript handles the rest! 🎉
