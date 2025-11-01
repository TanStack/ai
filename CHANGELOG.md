# Changelog

## Recent Refactoring (October 2025)

### Breaking Changes

#### Chat API Refactored

The `chat()` method has been split into two distinct methods with different behaviors:

**Before:**
```typescript
// Promise mode
const result = await ai.chat({
  model: "gpt-4",
  messages: [...],
  as: "promise"
});

// Stream mode
const stream = ai.chat({
  model: "gpt-4",
  messages: [...],
  as: "stream"
});

// Response mode
const response = ai.chat({
  model: "gpt-4",
  messages: [...],
  as: "response"
});
```

**After:**
```typescript
// Promise-based completion (no automatic tool execution)
const result = await ai.chatCompletion({
  model: "gpt-4",
  messages: [...]
});

// Streaming with automatic tool execution loop
const stream = ai.chat({
  model: "gpt-4",
  messages: [...],
  tools: [weatherTool] // Auto-executed when called
});

// HTTP streaming
const stream = ai.chat({
  model: "gpt-4",
  messages: [...]
});
return toStreamResponse(stream); // Exported from @tanstack/ai
```

### New Features

#### 1. Automatic Tool Execution Loop

The `chat()` method now includes an automatic tool execution loop:

```typescript
import { chat, tool, maxIterations } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [{ role: "user", content: "What's the weather in Paris?" }],
  tools: [weatherTool],
  agentLoopStrategy: maxIterations(5), // Optional: control loop
});

// SDK automatically:
// 1. Detects tool calls from model
// 2. Executes tool.execute() functions
// 3. Adds results to conversation
// 4. Continues conversation with model
// 5. Emits tool_call and tool_result chunks
```

**New Chunk Types:**
- `tool_call` - Model is calling a tool
- `tool_result` - Tool execution result (new!)

#### 2. Agent Loop Strategies

Control the tool execution loop with flexible strategies:

```typescript
import { maxIterations, untilFinishReason, combineStrategies } from "@tanstack/ai";

// Built-in strategies
agentLoopStrategy: maxIterations(10)
agentLoopStrategy: untilFinishReason(["stop", "length"])
agentLoopStrategy: combineStrategies([
  maxIterations(10),
  ({ messages }) => messages.length < 100
])

// Custom strategy
agentLoopStrategy: ({ iterationCount, messages, finishReason }) => {
  return iterationCount < 10 && messages.length < 50;
}
```

#### 3. ToolCallManager Class

Tool execution logic extracted into a testable class:

```typescript
import { ToolCallManager } from "@tanstack/ai";

const manager = new ToolCallManager(tools);

// Accumulate tool calls from stream
manager.addToolCallChunk(chunk);

// Check if tools need execution
if (manager.hasToolCalls()) {
  const results = yield* manager.executeTools(doneChunk);
}

// Clear for next iteration
manager.clear();
```

#### 4. Explicit Server-Sent Events Helpers

```typescript
import { toStreamResponse, toServerSentEventsStream } from "@tanstack/ai";

// Full HTTP Response with SSE headers
return toStreamResponse(stream);

// Just the ReadableStream (for custom response)
return new Response(toServerSentEventsStream(stream), {
  headers: { "X-Custom": "value" }
});
```

### New Exports

```typescript
// From @tanstack/ai
export { chat, chatCompletion };  // Separate streaming and promise methods
export { toStreamResponse, toServerSentEventsStream };  // HTTP helpers
export { ToolCallManager };  // Tool execution manager
export { maxIterations, untilFinishReason, combineStrategies };  // Loop strategies
export type { AgentLoopStrategy, AgentLoopState };  // Strategy types
export type { ToolResultStreamChunk };  // New chunk type
```

### Migration Guide

See [docs/MIGRATION_UNIFIED_CHAT.md](docs/MIGRATION_UNIFIED_CHAT.md) for complete migration guide.

**Quick migration:**

1. Replace `chat({ as: "promise" })` with `chatCompletion()`
2. Replace `chat({ as: "stream" })` with `chat()`
3. Replace `chat({ as: "response" })` with `chat()` + `toStreamResponse()`
4. Import `toStreamResponse` from `@tanstack/ai` (not subpath)
5. Update `maxIterations: 5` to `agentLoopStrategy: maxIterations(5)` (optional)

### Architecture Improvements

- **Smaller chat() method**: Reduced from ~180 lines to ~85 lines
- **Testable components**: ToolCallManager and strategies have unit tests (23 tests, all passing)
- **Separation of concerns**: Tool execution logic isolated from chat logic
- **Strategy pattern**: Flexible control over tool execution loop
- **Better documentation**: Comprehensive guides for all features

### Documentation

New documentation:
- [Tool Execution Loop](docs/TOOL_EXECUTION_LOOP.md) - How automatic execution works
- [Agent Loop Strategies](docs/AGENT_LOOP_STRATEGIES.md) - Controlling the loop
- [Unified Chat API](docs/UNIFIED_CHAT_API.md) - Updated API reference

### Testing

```bash
# Run all tests
pnpm test

# Run tests for @tanstack/ai
cd packages/ai && pnpm test

# Test coverage:
# - ToolCallManager: 7 tests
# - Agent Loop Strategies: 16 tests
# - Total: 23 tests, all passing
```

### Backwards Compatibility

- `maxIterations` as a number still works (converted to strategy automatically)
- All existing functionality preserved
- Gradual migration path available

### Breaking Changes Summary

1. **`chat()` method**:
   - No longer accepts `as` option
   - Now streaming-only
   - Includes automatic tool execution loop

2. **New `chatCompletion()` method**:
   - Promise-based
   - Supports structured output
   - No automatic tool execution

3. **Import changes**:
   - `toStreamResponse` now from `@tanstack/ai` (not subpath)

### Benefits

✅ **Clearer API** - Method names indicate behavior  
✅ **Automatic tool execution** - No manual management  
✅ **Flexible control** - Strategy pattern for loops  
✅ **Better organized** - Tool logic in separate class  
✅ **Well tested** - 23 unit tests  
✅ **Better docs** - Comprehensive guides  
✅ **Type-safe** - Full TypeScript support  

---

For questions or issues, see the [documentation](docs/) or [examples](examples/).

