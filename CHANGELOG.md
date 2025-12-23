# Changelog

## Reverts

### Revert: ci: sync config between projects (#53)

**Reverted:** Commit [349c24c](https://github.com/TanStack/ai/commit/349c24cf58e59f956e10137b6b6d5516399c0931)

This commit was reverted due to a regression that was breaking the main branch. The changes affected CI configuration syncing between projects.

**Changes reverted:**

- Reverted workflow changes in `.github/workflows/autofix.yml`
- Reverted nx.json configuration changes
- Reverted package.json script changes
- Reverted ai-solid package changes (tsconfig, test utilities, package scripts)
- Restored `scripts/clean.sh`
- Renamed `scripts/generate-docs.ts` back to `scripts/generateDocs.ts`
- Restored size-limit configuration and dependencies
- Restored pnpm overrides

## Recent Refactoring (November 2025)

### New Packages

#### @tanstack/ai-client

**New Package:** Framework-agnostic headless client for TanStack AI chat functionality.

**Installation:**

```bash
npm install @tanstack/ai-client
```

**Features:**

- ✅ Framework-agnostic (works with React, Vue, Svelte, vanilla JS, etc.)
- ✅ Headless client with state management
- ✅ Connection adapters for SSE, HTTP streams, and server functions
- ✅ Stream processing with smart chunking strategies
- ✅ Automatic tool call handling

**See:** [Package Documentation](packages/typescript/ai-client/README.md)

#### @tanstack/ai-react-ui

**New Package:** Pre-built React UI components for chat interfaces.

**Installation:**

```bash
npm install @tanstack/ai-react-ui
```

**Features:**

- ✅ Pre-built chat UI components
- ✅ Customizable styling
- ✅ Works with `@tanstack/ai-react`

#### tanstack-ai (Python)

**New Package:** Python utilities for converting AI provider events to TanStack AI StreamChunk format.

**Installation:**

```bash
pip install tanstack-ai
```

**Features:**

- ✅ Message formatting for Anthropic and OpenAI
- ✅ Stream chunk conversion from provider events
- ✅ SSE formatting utilities
- ✅ Type-safe with Pydantic models

**Usage:**

```python
from tanstack_ai import StreamChunkConverter, format_sse_chunk

converter = StreamChunkConverter(model="claude-3-haiku-20240307", provider="anthropic")

async for event in anthropic_stream:
    chunks = await converter.convert_event(event)
    for chunk in chunks:
        yield format_sse_chunk(chunk)
```

**See:** [Package Documentation](packages/python/tanstack-ai/README.md) | [Python FastAPI Example](examples/python-fastapi/README.md)

#### tanstack/ai (PHP)

**New Package:** PHP utilities for converting AI provider events to TanStack AI StreamChunk format.

**Installation:**

```bash
composer require tanstack/ai
```

**Features:**

- ✅ Message formatting for Anthropic and OpenAI
- ✅ Stream chunk conversion from provider events
- ✅ SSE formatting utilities
- ✅ PHP 8.1+ with type safety

**Usage:**

```php
use TanStack\AI\StreamChunkConverter;
use TanStack\AI\SSEFormatter;

$converter = new StreamChunkConverter(
    model: "claude-3-haiku-20240307",
    provider: "anthropic"
);

foreach ($anthropicStream as $event) {
    $chunks = $converter->convertEvent($event);
    foreach ($chunks as $chunk) {
        echo SSEFormatter::formatChunk($chunk);
    }
}
```

**See:** [Package Documentation](packages/php/tanstack-ai/README.md) | [PHP Slim Example](examples/php-slim/README.md)

### New Examples

#### Vanilla Chat Example

**New Example:** Framework-free chat application using pure JavaScript and `@tanstack/ai-client`.

**Features:**

- ✅ Pure vanilla JavaScript (no frameworks!)
- ✅ Real-time streaming with `@tanstack/ai-client`
- ✅ Beautiful, responsive UI
- ✅ Connects to Python FastAPI backend

**See:** [Vanilla Chat Example](examples/vanilla-chat/README.md)

#### Python FastAPI Server Example

**New Example:** FastAPI server that streams AI responses in SSE format.

**Features:**

- ✅ FastAPI with SSE streaming
- ✅ Converts Anthropic/OpenAI events to StreamChunk format
- ✅ Compatible with `@tanstack/ai-client`
- ✅ Tool call support

**See:** [Python FastAPI Example](examples/python-fastapi/README.md)

#### PHP Slim Framework Server Example

**New Example:** PHP Slim Framework server with Anthropic and OpenAI support.

**Features:**

- ✅ Slim Framework with SSE streaming
- ✅ Converts Anthropic/OpenAI events to StreamChunk format
- ✅ Compatible with `@tanstack/ai-client`
- ✅ PHP 8.1+ with type safety

**See:** [PHP Slim Example](examples/php-slim/README.md)

### Stream Processing Features

**New Feature:** Smart chunking strategies for optimal UX in `@tanstack/ai-client`.

**Built-in Strategies:**

- `ImmediateStrategy` - Emit content immediately
- `PunctuationStrategy` - Emit at sentence boundaries
- `BatchStrategy` - Batch N characters before emitting
- `WordBoundaryStrategy` - Emit at word boundaries
- `CompositeStrategy` - Combine multiple strategies

**Usage:**

```typescript
import {
  ChatClient,
  fetchServerSentEvents,
  PunctuationStrategy,
} from '@tanstack/ai-client'

const client = new ChatClient({
  connection: fetchServerSentEvents('/api/chat'),
  chunkingStrategy: new PunctuationStrategy(),
})
```

**See:** [Stream Processing Quick Start](packages/typescript/ai-client/docs/STREAM_QUICKSTART.md)

### Connection Adapters Added

**New Feature:** `@tanstack/ai-client` now uses flexible connection adapters for streaming.

**API:**

```typescript
import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'

const client = new ChatClient({
  connection: fetchServerSentEvents('/api/chat', {
    headers: { Authorization: 'Bearer token' },
  }),
})
```

**Benefits:**

- ✅ Support SSE, HTTP streams, WebSockets, server functions, etc.
- ✅ Easy to test with custom adapters
- ✅ Extensible for any streaming scenario

**Built-in Adapters:**

- `fetchServerSentEvents(url, options)` - For SSE (default)
- `fetchHttpStream(url, options)` - For newline-delimited JSON
- `stream(factory)` - For direct async iterables (server functions)

**With React:**

```typescript
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

const chat = useChat({
  connection: fetchServerSentEvents('/api/chat'),
})
```

**Create Custom Adapters:**

```typescript
import type { ConnectionAdapter } from '@tanstack/ai-client'

const wsAdapter: ConnectionAdapter = {
  async *connect(messages, data) {
    const ws = new WebSocket('wss://api.example.com')
    // ... WebSocket logic
  },
  abort() {
    ws.close()
  },
}

const chat = useChat({ connection: wsAdapter })
```

**Documentation:**

- 📖 [Connection Adapters Guide](docs/CONNECTION_ADAPTERS_GUIDE.md) - Complete guide
- 📖 [Connection Adapters API](packages/ai-client/CONNECTION_ADAPTERS.md) - API reference

### Agent Loop Strategies

**New Feature:** `agentLoopStrategy` parameter replaces `maxIterations` with a flexible strategy pattern.

**Before:**

```typescript
const stream = ai.chat({
  model: "gpt-4",
  messages: [...],
  tools: [...],
  maxIterations: 5,
});
```

**After:**

```typescript
import { maxIterations, untilFinishReason, combineStrategies } from "@tanstack/ai";

const stream = ai.chat({
  model: "gpt-4",
  messages: [...],
  tools: [...],
  agentLoopStrategy: maxIterations(5), // Or custom strategy
});
```

**Built-in Strategies:**

- `maxIterations(max)` - Continue for max iterations
- `untilFinishReason(reasons)` - Stop on specific finish reasons
- `combineStrategies(strategies)` - Combine multiple strategies

### ToolCallManager Class

**Refactoring:** Tool execution logic extracted into separate `ToolCallManager` class.

**Benefits:**

- ✅ Reduced `chat()` method size from ~180 lines to ~85 lines
- ✅ Independently testable
- ✅ Cleaner separation of concerns

## Previous Refactoring (October 2025)

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
import { chat, tool, maxIterations } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openaiText(),
  model: 'gpt-4o',
  messages: [{ role: 'user', content: "What's the weather in Paris?" }],
  tools: [weatherTool],
  agentLoopStrategy: maxIterations(5), // Optional: control loop
})

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
import {
  maxIterations,
  untilFinishReason,
  combineStrategies,
} from '@tanstack/ai'

// Built-in strategies
agentLoopStrategy: maxIterations(10)
agentLoopStrategy: untilFinishReason(['stop', 'length'])
agentLoopStrategy: combineStrategies([
  maxIterations(10),
  ({ messages }) => messages.length < 100,
])

// Custom strategy
agentLoopStrategy: ({ iterationCount, messages, finishReason }) => {
  return iterationCount < 10 && messages.length < 50
}
```

#### 3. ToolCallManager Class

Tool execution logic extracted into a testable class:

```typescript
import { ToolCallManager } from '@tanstack/ai'

const manager = new ToolCallManager(tools)

// Accumulate tool calls from stream
manager.addToolCallChunk(chunk)

// Check if tools need execution
if (manager.hasToolCalls()) {
  const results = yield * manager.executeTools(doneChunk)
}

// Clear for next iteration
manager.clear()
```

#### 4. Explicit Server-Sent Events Helpers

```typescript
import { toStreamResponse, toServerSentEventsStream } from '@tanstack/ai'

// Full HTTP Response with SSE headers
return toStreamResponse(stream)

// Just the ReadableStream (for custom response)
return new Response(toServerSentEventsStream(stream), {
  headers: { 'X-Custom': 'value' },
})
```

### New Exports

```typescript
// From @tanstack/ai
export { chat, chatCompletion } // Separate streaming and promise methods
export { toStreamResponse, toServerSentEventsStream } // HTTP helpers
export { ToolCallManager } // Tool execution manager
export { maxIterations, untilFinishReason, combineStrategies } // Loop strategies
export type { AgentLoopStrategy, AgentLoopState } // Strategy types
export type { ToolResultStreamChunk } // New chunk type
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
