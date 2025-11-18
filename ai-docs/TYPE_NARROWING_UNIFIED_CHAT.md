# Type Narrowing in Chat API

> **Note**: This document describes type narrowing with the current API using separate methods. The previous `as` option approach has been replaced with `chat()` for streaming and `chatCompletion()` for promise-based completion.

## Overview

The chat API uses separate methods, which provides automatic type narrowing without needing discriminated unions or const assertions:

- **`chat()`** - Always returns `AsyncIterable<StreamChunk>`
- **`chatCompletion()`** - Always returns `Promise<ChatCompletionResult>`

TypeScript automatically knows the exact return type based on which method you call!

## Type Narrowing Rules

| Method | Return Type | Usage |
|--------|-------------|-------|
| `chat()` | `AsyncIterable<StreamChunk>` | Can use `for await...of`, iterate chunks |
| `chatCompletion()` | `Promise<ChatCompletionResult>` | Can `await`, access `.content`, `.usage`, etc. |

## Examples with Type Checking

### 1. Promise Mode (chatCompletion) - Type is `Promise<ChatCompletionResult>`

```typescript
const result = ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
});

// TypeScript knows result is Promise<ChatCompletionResult>
const resolved = await result;

// ✅ These work - properties exist on ChatCompletionResult
console.log(resolved.content);
console.log(resolved.role);
console.log(resolved.usage.totalTokens);

// ❌ TypeScript error - headers doesn't exist on ChatCompletionResult
console.log(resolved.headers); // Type error!
```

### 2. Stream Mode (chat) - Type is `AsyncIterable<StreamChunk>`

```typescript
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
});

// TypeScript knows stream is AsyncIterable<StreamChunk>
// ✅ This works - can iterate async iterable
for await (const chunk of stream) {
  console.log(chunk.type);
  console.log(chunk.id);
  console.log(chunk.model);
}

// ❌ TypeScript error - content doesn't exist on AsyncIterable
console.log(stream.content); // Type error!

// ❌ TypeScript error - headers doesn't exist on AsyncIterable
console.log(stream.headers); // Type error!
```

### 3. HTTP Response Mode

```typescript
import { toStreamResponse } from "@tanstack/ai";

const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
});

const response = toStreamResponse(stream);

// TypeScript knows response is Response
// ✅ These work - properties exist on Response
console.log(response.headers);
console.log(response.body);
console.log(response.status);
console.log(response.ok);

const contentType = response.headers.get("Content-Type");

// ❌ TypeScript error - content doesn't exist on Response
console.log(response.content); // Type error!
```

## Function Return Type Inference

TypeScript correctly infers return types in functions:

### API Handler - Returns `Response`

```typescript
import { toStreamResponse } from "@tanstack/ai";

function apiHandler() {
  const stream = ai.chat({
    adapter: "openai",
    model: "gpt-4",
    messages: [...],
  });
  
  return toStreamResponse(stream);
  // TypeScript infers: function apiHandler(): Response ✅
}
```

### Type-safe API Handler

```typescript
import { toStreamResponse } from "@tanstack/ai";

function apiHandler(): Response {
  const stream = ai.chat({
    adapter: "openai",
    model: "gpt-4",
    messages: [...],
  });
  
  return toStreamResponse(stream); // ✅ Correct - returns Response
}

function wrongApiHandler(): Response {
  const result = ai.chatCompletion({
    adapter: "openai",
    model: "gpt-4",
    messages: [...],
  });
  
  return result; // ❌ TypeScript error - returns Promise, not Response
}
```

### Streaming Handler

```typescript
async function* streamHandler() {
  const stream = ai.chat({
    adapter: "openai",
    model: "gpt-4",
    messages: [...],
  });
  
  // TypeScript knows stream is AsyncIterable<StreamChunk>
  for await (const chunk of stream) {
    yield chunk; // ✅ Works perfectly
  }
}
```

## With Fallbacks - Type Narrowing Still Works

```typescript
// Promise with fallbacks - Type: Promise<ChatCompletionResult>
const promise = ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
  fallbacks: [{ adapter: "ollama", model: "llama2" }]
});
const resolved = await promise;
console.log(resolved.content); // ✅ Works

// Stream with fallbacks - Type: AsyncIterable<StreamChunk>
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
  fallbacks: [{ adapter: "ollama", model: "llama2" }]
});
for await (const chunk of stream) {
  console.log(chunk.type); // ✅ Works
}
```

## How It Works (Technical Details)

With separate methods, TypeScript doesn't need function overloads or conditional types:

```typescript
class AI<TAdapter> {
  // Simple method signatures - no overloads needed!
  chat(options: ChatOptions): AsyncIterable<StreamChunk> {
    return this.adapter.chatStream(options);
  }
  
  async chatCompletion(options: ChatOptions): Promise<ChatCompletionResult> {
    return this.adapter.chatCompletion(options);
  }
}
```

TypeScript's type inference is straightforward:
- Call `chat()` → get `AsyncIterable<StreamChunk>`
- Call `chatCompletion()` → get `Promise<ChatCompletionResult>`

No need for `as const` assertions or discriminated unions!

## Benefits

✅ **Type Safety**: TypeScript knows exact return type at compile time  
✅ **IntelliSense**: Autocomplete shows correct properties for each method  
✅ **Compile-Time Errors**: Catch type mismatches before runtime  
✅ **Refactoring Safety**: Changes are caught automatically  
✅ **Self-Documenting**: Methods serve as inline documentation  
✅ **Simpler**: No need for const assertions or overloads

## Summary

The separate methods API provides perfect type narrowing automatically:

| Code | Return Type |
|------|-------------|
| `chat()` | `AsyncIterable<StreamChunk>` |
| `chatCompletion()` | `Promise<ChatCompletionResult>` |

TypeScript enforces these types at compile time, providing complete type safety without any special syntax! 🎉
