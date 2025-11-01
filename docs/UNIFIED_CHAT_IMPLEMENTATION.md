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
  // Streaming method with automatic tool execution loop
  async *chat(options): AsyncIterable<StreamChunk> {
    // Manages tool execution internally using ToolCallManager
    const toolCallManager = new ToolCallManager(options.tools || []);
    
    while (iterationCount < maxIterations) {
      // Stream from adapter
      for await (const chunk of this.adapter.chatStream(options)) {
        yield chunk;
        
        // Track tool calls
        if (chunk.type === "tool_call") {
          toolCallManager.addToolCallChunk(chunk);
        }
      }
      
      // Execute tools if needed
      if (shouldExecuteTools && toolCallManager.hasToolCalls()) {
        const toolResults = yield* toolCallManager.executeTools(doneChunk);
        messages = [...messages, ...toolResults];
        continue; // Next iteration
      }
      
      break; // Done
    }
  }

  // Promise-based method (no tool execution loop)
  async chatCompletion(options): Promise<ChatCompletionResult> {
    return this.adapter.chatCompletion(options);
  }
}
```

### ToolCallManager Class

The tool execution logic is extracted into a dedicated `ToolCallManager` class:

```typescript
class ToolCallManager {
  // Accumulate tool calls from streaming chunks
  addToolCallChunk(chunk): void;
  
  // Check if there are tool calls to execute
  hasToolCalls(): boolean;
  
  // Get all complete tool calls
  getToolCalls(): ToolCall[];
  
  // Execute tools and yield tool_result chunks
  async *executeTools(doneChunk): AsyncGenerator<ToolResultStreamChunk, Message[]>;
  
  // Clear for next iteration
  clear(): void;
}
```

**Benefits:**
- ✅ **Separation of concerns** - tool logic isolated from chat logic
- ✅ **Testable** - ToolCallManager can be unit tested independently
- ✅ **Maintainable** - changes to tool execution don't affect chat method
- ✅ **Reusable** - can be used in other contexts if needed

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
import { toStreamResponse } from "@tanstack/ai";

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
- **Automatic tool execution loop** (via `ToolCallManager`)
- Error chunk detection for streaming
- Type-safe model selection

✅ **No breaking changes** to core functionality:
- Streaming behavior matches old `streamChat()` method
- Promise behavior matches old `chat()` method
- Error handling and fallbacks work identically
- **Tool execution now handled by `ToolCallManager` class**

## Files Changed

### Core Implementation
- ✅ `packages/ai/src/ai.ts`
  - Removed `as` option from `chat()` method
  - Made `chat()` streaming-only with automatic tool execution loop
  - Added `chatCompletion()` method for promise-based calls
  - Removed `streamToResponse()` private method (use `toStreamResponse()` from `stream-to-response.ts`)
  - Refactored to use `ToolCallManager` for tool execution

- ✅ `packages/ai/src/tool-call-manager.ts` (NEW)
  - Encapsulates tool call accumulation, validation, and execution
  - Independently testable
  - Yields `tool_result` chunks during execution
  - Returns tool result messages for conversation history

- ✅ `packages/ai/src/types.ts`
  - Added `ToolResultStreamChunk` type
  - Added `"tool_result"` to `StreamChunkType` union
  - Updated `StreamChunk` union to include `ToolResultStreamChunk`

### Documentation
- ✅ `docs/UNIFIED_CHAT_API.md` - Updated API documentation with tool execution details
- ✅ `docs/MIGRATION_UNIFIED_CHAT.md` - Migration guide
- ✅ `docs/UNIFIED_CHAT_QUICK_REFERENCE.md` - Quick reference updated
- ✅ `docs/TOOL_EXECUTION_LOOP.md` (NEW) - Comprehensive tool execution guide
- ✅ `README.md` - Updated with tool execution loop documentation
- ✅ `examples/cli/README.md` - Updated with automatic tool execution details
- ✅ `packages/ai-react/README.md` - Updated backend examples with tool execution
- ✅ `packages/ai-client/README.md` - Added backend example with tool execution

## Benefits of Current Approach

1. **Simpler API Surface** - Two clear methods instead of one with options
2. **Consistent Interface** - Same options across both methods
3. **HTTP Streaming Made Easy** - Use `toStreamResponse()` helper
4. **Better Developer Experience** - Clear intent with method names
5. **Type Safety Maintained** - All discriminated unions still work
6. **Backward Compatible Migration** - Easy to migrate from old API
7. **Fallbacks Everywhere** - Both methods support same fallback mechanism
8. **Automatic Tool Execution** - `chat()` handles tool calling in a loop via `ToolCallManager`
9. **Testable Architecture** - Tool execution logic isolated in separate class
10. **Clean Separation** - `chat()` for streaming+tools, `chatCompletion()` for promises+structured output

## Testing Recommendations

Test scenarios:
1. ✅ Promise mode with primary adapter
2. ✅ Promise mode with fallbacks
3. ✅ Stream mode with primary adapter
4. ✅ Stream mode with fallbacks
5. ✅ HTTP response mode with primary adapter
6. ✅ HTTP response mode with fallbacks
7. ✅ Automatic tool execution in `chat()` (via `ToolCallManager`)
8. ✅ Manual tool handling in `chatCompletion()`
9. ✅ Error chunk detection triggers fallbacks
10. ✅ Type inference for both methods
11. ✅ Fallback-only mode (no primary adapter)
12. ✅ `ToolCallManager` unit tests (accumulation, validation, execution)
13. ✅ Multi-round tool execution (up to `maxIterations`)
14. ✅ Tool execution error handling

## Next Steps

### For Users
1. **Update method calls**: 
   - `chat({ as: "promise" })` → `chatCompletion()`
   - `chat({ as: "stream" })` → `chat()`
   - `chat({ as: "response" })` → `chat()` + `toStreamResponse()`
2. **Update imports**: Add `toStreamResponse` import if needed
3. **Test fallback behavior**: Verify seamless failover in all modes

### Testing ToolCallManager

The `ToolCallManager` class is independently testable. See `packages/ai/src/tool-call-manager.test.ts` for unit tests.

Test scenarios:
- ✅ Accumulating streaming tool call chunks
- ✅ Filtering incomplete tool calls
- ✅ Executing tools with valid arguments
- ✅ Handling tool execution errors
- ✅ Handling tools without execute functions
- ✅ Multiple tool calls in one iteration
- ✅ Clearing tool calls between iterations

### Future Enhancements
- Consider adding structured output support to streaming
- Add streaming response mode to embeddings
- Document SSE format for client-side consumption
- Add examples for different frameworks (Express, Fastify, etc.)

## Conclusion

Separating `chat()` and `chatCompletion()` provides a cleaner, more intuitive interface while maintaining all existing functionality. The two-method design covers all common use cases with clear, type-safe APIs.

**Key Achievement**: Clear separation of concerns with `chat()` for streaming and `chatCompletion()` for promises, eliminating the need for a configuration option.
