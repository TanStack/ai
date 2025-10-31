# Unified Chat API - Implementation Summary

> **Note**: This document describes the historical implementation with the `as` option. The current API uses separate methods: `chat()` for streaming and `chatCompletion()` for promise-based completion. See `docs/UNIFIED_CHAT_API.md` for current API documentation.

## Overview

The chat API was previously unified using an `as` configuration option. The current implementation separates streaming and promise-based completion into distinct methods:

- **`chat()`** - Always returns `AsyncIterable<StreamChunk>` (streaming)
- **`chatCompletion()`** - Always returns `Promise<ChatCompletionResult>` (promise-based)

## Current API Design

### Method Separation

```typescript
class AI<TAdapter> {
  // Streaming method
  chat(options): AsyncIterable<StreamChunk> {
    return this.adapter.chatStream(options);
  }

  // Promise-based method
  async chatCompletion(options): Promise<ChatCompletionResult> {
    return this.adapter.chatCompletion(options);
  }
}
```

### Benefits of Separate Methods

✅ **Clearer API**: Method names indicate return type  
✅ **Better Type Inference**: TypeScript knows exact return type without overloads  
✅ **Simpler Implementation**: No need for discriminated unions  
✅ **Easier to Use**: Less cognitive overhead

## Usage Examples

### 1. Promise Mode (chatCompletion)

```typescript
const result = await ai.chatCompletion({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
});
```

### 2. Stream Mode (chat)

```typescript
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
});

for await (const chunk of stream) {
  console.log(chunk);
}
```

### 3. HTTP Response Mode

```typescript
import { toStreamResponse } from "@tanstack/ai/stream-to-response";

const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
});

return toStreamResponse(stream);
```

## Historical Context

The `as` option approach was implemented to unify `chat()` and `streamChat()` methods. However, separate methods provide better developer experience and type safety.

### Migration Path

See `docs/MIGRATION_UNIFIED_CHAT.md` for migration guide from the `as` option API to the current separate methods API.

## Features Preserved

✅ **All features still supported**:
- Discriminated union types for adapter-model pairs
- Fallback mechanism (single-with-fallbacks or fallbacks-only)
- Tool execution with auto-execution
- Error chunk detection for streaming
- Type-safe model selection

✅ **No breaking changes** to core functionality:
- Streaming behavior matches old `streamChat()` method
- Promise behavior matches old `chat()` method
- Error handling and fallbacks work identically

## Files Changed

### Core Implementation
- ✅ `packages/ai/src/ai.ts`
  - Removed `as` option from `chat()` method
  - Made `chat()` streaming-only
  - Added `chatCompletion()` method for promise-based calls
  - Removed `streamToResponse()` private method (use `toStreamResponse()` from `stream-to-response.ts`)

### Documentation
- ✅ `docs/UNIFIED_CHAT_API.md` - Updated API documentation
- ✅ `docs/MIGRATION_UNIFIED_CHAT.md` - Migration guide
- ✅ `docs/UNIFIED_CHAT_QUICK_REFERENCE.md` - Quick reference updated

## Benefits of Current Approach

1. **Simpler API Surface** - Two clear methods instead of one with options
2. **Consistent Interface** - Same options across both methods
3. **HTTP Streaming Made Easy** - Use `toStreamResponse()` helper
4. **Better Developer Experience** - Clear intent with method names
5. **Type Safety Maintained** - All discriminated unions still work
6. **Backward Compatible Migration** - Easy to migrate from old API
7. **Fallbacks Everywhere** - Both methods support same fallback mechanism

## Testing Recommendations

Test scenarios:
1. ✅ Promise mode with primary adapter
2. ✅ Promise mode with fallbacks
3. ✅ Stream mode with primary adapter
4. ✅ Stream mode with fallbacks
5. ✅ HTTP response mode with primary adapter
6. ✅ HTTP response mode with fallbacks
7. ✅ Tool execution in both modes
8. ✅ Error chunk detection triggers fallbacks
9. ✅ Type inference for both methods
10. ✅ Fallback-only mode (no primary adapter)

## Next Steps

### For Users
1. **Update method calls**: 
   - `chat({ as: "promise" })` → `chatCompletion()`
   - `chat({ as: "stream" })` → `chat()`
   - `chat({ as: "response" })` → `chat()` + `toStreamResponse()`
2. **Update imports**: Add `toStreamResponse` import if needed
3. **Test fallback behavior**: Verify seamless failover in all modes

### Future Enhancements
- Consider adding structured output support to streaming
- Add streaming response mode to embeddings
- Document SSE format for client-side consumption
- Add examples for different frameworks (Express, Fastify, etc.)

## Conclusion

Separating `chat()` and `chatCompletion()` provides a cleaner, more intuitive interface while maintaining all existing functionality. The two-method design covers all common use cases with clear, type-safe APIs.

**Key Achievement**: Clear separation of concerns with `chat()` for streaming and `chatCompletion()` for promises, eliminating the need for a configuration option.
