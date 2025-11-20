# Architecture

This document describes the architecture of `@tanstack/ai-client`, including system design, component responsibilities, and design decisions.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          ChatClient                             │
│                                                                 │
│  Messages: UIMessage[]                                          │
│  Loading State, Error State                                    │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐     │
│  │         processStream()                                │     │
│  │                                                        │     │
│  │    → processStreamWithProcessor()                     │     │
│  └───────────────────────────────────────────────────────┘     │
│                           │                                     │
│                           ▼                                     │
│  ┌───────────────────────────────────────────────────────┐     │
│  │       StreamProcessor (when configured)                │     │
│  │                                                        │     │
│  │  ┌──────────────┐  ┌──────────────────────────┐      │     │
│  │  │ChunkStrategy │  │   StreamParser           │      │     │
│  │  │              │  │   (parses raw stream)    │      │     │
│  │  │- Immediate   │  │                          │      │     │
│  │  │- Punctuation │  │   ┌──────────────────┐   │      │     │
│  │  │- Batch       │  │   │ for chunk in     │   │      │     │
│  │  │- Word Bounds │  │   │   stream:        │   │      │     │
│  │  │- Debounce    │  │   │   yield          │   │      │     │
│  │  │- Composite   │  │   │   StreamChunk    │   │      │     │
│  │  │- Custom      │  │   └──────────────────┘   │      │     │
│  │  └──────────────┘  └──────────────────────────┘      │     │
│  │                                                        │     │
│  │  State Machine:                                       │     │
│  │  ┌──────────────────────────────────────────────┐    │     │
│  │  │ Text Content:                                │    │     │
│  │  │   - accumulated: string                      │    │     │
│  │  │   - pending: string (not yet emitted)        │    │     │
│  │  │                                               │    │     │
│  │  │ Tool Calls: Map<index, ToolCallState>        │    │     │
│  │  │   {                                           │    │     │
│  │  │     id: string                                │    │     │
│  │  │     name: string                              │    │     │
│  │  │     arguments: string                         │    │     │
│  │  │     complete: boolean                         │    │     │
│  │  │   }                                           │    │     │
│  │  │                                               │    │     │
│  │  │ Last Tool Call Index: number                 │    │     │
│  │  └──────────────────────────────────────────────┘    │     │
│  │                                                        │     │
│  │  Event Emission:                                      │     │
│  │  ┌──────────────────────────────────────────────┐    │     │
│  │  │ - onTextUpdate(content)                      │    │     │
│  │  │ - onToolCallStart(idx, id, name)             │    │     │
│  │  │ - onToolCallDelta(idx, args)                 │    │     │
│  │  │ - onToolCallComplete(idx, id, name, args)    │    │     │
│  │  │ - onStreamEnd(content, toolCalls)            │    │     │
│  │  └──────────────────────────────────────────────┘    │     │
│  └───────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## Stream Architecture

### Connection Adapters

Connection adapters provide a transport-agnostic abstraction for streaming. They return async iterables of `StreamChunk` objects:

```typescript
interface ConnectionAdapter {
  connect(
    messages: UIMessage[] | ModelMessage[],
    data?: Record<string, any>,
    abortSignal?: AbortSignal
  ): AsyncIterable<StreamChunk>;
}
```

This design works with:
- Async generators
- Any object with `[Symbol.asyncIterator]`
- Fetch API Response bodies (via connection adapters)
- WebSocket connections
- Server-Sent Events (SSE)
- Direct server functions
- Any custom streaming mechanism

### Benefits

✅ **Transport Agnostic** - Works with any streaming mechanism  
✅ **Type Safe** - Full TypeScript support  
✅ **Composable** - Easy to create custom connection adapters  
✅ **Testable** - Mock connection adapters for testing  
✅ **Flexible** - Support for SSE, HTTP streams, WebSocket, server functions, etc.  
✅ **Separation of Concerns** - Transport logic independent of chat client

## Stream Processor Architecture

### State Machine Design

The `StreamProcessor` implements a state machine to track:

1. **Text Content State**
   - Accumulated content
   - Pending chunks (not yet emitted based on strategy)

2. **Tool Call States**
   - Map of tool calls by index
   - Each tool call tracks: `{ id, name, arguments, complete }`

3. **Lifecycle Transitions**
   - Tool call completion is detected when:
     - A different tool call index starts (means previous is done)
     - Text content arrives (means all tool calls are done)
     - Stream ends (means everything is done)

### Data Flow

#### Text Streaming

```
Raw Stream
    │
    ▼
StreamParser.parse()
    │
    ▼
{ type: "text", content: "Hello" }
    │
    ▼
StreamProcessor.processChunk()
    │
    ├─▶ Accumulate: textContent += "Hello"
    ├─▶ Pending: pendingTextChunks += "Hello"
    │
    ▼
ChunkStrategy.shouldEmit("Hello", "Hello")?
    │
    ├─▶ YES ─▶ onTextUpdate("Hello")
    │           pendingTextChunks = ""
    │
    └─▶ NO ──▶ Wait for next chunk
```

#### Tool Call Streaming

```
Raw Stream
    │
    ▼
StreamParser.parse()
    │
    ▼
{ type: "tool-call-delta", toolCallIndex: 0, toolCall: {...} }
    │
    ▼
StreamProcessor.processChunk()
    │
    ▼
Is this a new tool call?
    │
    ├─▶ YES ─▶ Complete previous tool calls (if different index)
    │          Create new ToolCallState
    │          onToolCallStart(0, "call_1", "getWeather")
    │
    └─▶ NO ──▶ Append to existing tool call
               onToolCallDelta(0, '{"loc')
```

#### Completion Detection

```
Tool Call #0 is streaming...
    │
    ▼
New event arrives:
    │
    ├─▶ Text chunk?        ──▶ Complete ALL tool calls
    │                          onToolCallComplete(0, ...)
    │
    ├─▶ Different index?   ──▶ Complete previous indices
    │   (Tool #1 starts)       onToolCallComplete(0, ...)
    │
    └─▶ Stream ends?       ──▶ Complete ALL tool calls
                               onToolCallComplete(0, ...)
                               onStreamEnd(...)
```

### State Transitions

#### Tool Call State Machine

```
┌──────────┐
│   IDLE   │
└────┬─────┘
     │ Tool call delta arrives
     ▼
┌─────────────────┐
│   STREAMING     │◀─┐
│                 │  │ More deltas arrive
│ complete: false │──┘
└────┬────────────┘
     │ Completion trigger:
     │ - Next tool index
     │ - Text chunk
     │ - Stream end
     ▼
┌─────────────────┐
│   COMPLETE      │
│                 │
│ complete: true  │
└─────────────────┘
```

### Chunk Strategy Decision Tree

```
Text chunk arrives
    │
    ▼
┌─────────────────────┐
│  ChunkStrategy      │
│  shouldEmit()?      │
└──────┬──────────────┘
       │
       ├─▶ ImmediateStrategy
       │       │
       │       └─▶ Always true
       │
       ├─▶ PunctuationStrategy
       │       │
       │       └─▶ chunk contains [.,!?;:]?
       │
       ├─▶ BatchStrategy(N)
       │       │
       │       └─▶ chunkCount >= N?
       │
       ├─▶ WordBoundaryStrategy
       │       │
       │       └─▶ chunk ends with whitespace?
       │
       ├─▶ DebounceStrategy(ms)
       │       │
       │       └─▶ ms elapsed since last chunk?
       │
       ├─▶ CompositeStrategy([...])
       │       │
       │       └─▶ ANY sub-strategy returns true?
       │
       └─▶ CustomStrategy
               │
               └─▶ Your custom logic
```

## Connection Adapters Architecture

### Connection Adapter Interface

A connection adapter is an object with a `connect()` method that returns an `AsyncIterable<StreamChunk>`:

```typescript
interface ConnectionAdapter {
  connect(
    messages: any[],
    data?: Record<string, any>,
    abortSignal?: AbortSignal // Abort signal from ChatClient for cancellation
  ): AsyncIterable<StreamChunk>;
}
```

The `abortSignal` parameter is provided by `ChatClient` when it creates an `AbortController` for the request. When `stop()` is called, the signal is aborted and adapters should respect this by:

1. Passing the signal to `fetch()` calls
2. Checking `abortSignal?.aborted` in stream reading loops
3. Breaking out of loops when aborted

### Built-in Adapters

#### `fetchServerSentEvents`

Parses Server-Sent Events format with `data:` prefix:

```
data: {"type":"content","delta":"Hello","content":"Hello",...}
data: {"type":"content","delta":" world","content":"Hello world",...}
data: {"type":"done","finishReason":"stop",...}
data: [DONE]
```

#### `fetchHttpStream`

Parses newline-delimited JSON:

```
{"type":"content","delta":"Hello","content":"Hello",...}
{"type":"content","delta":" world","content":"Hello world",...}
{"type":"done","finishReason":"stop",...}
```

#### `stream`

Wraps a factory function that returns an async iterable directly, bypassing HTTP entirely.

### Benefits

✅ **Flexibility** - Support SSE, HTTP streams, WebSockets, server functions, etc.  
✅ **Testability** - Easy to mock with custom adapters  
✅ **Type Safety** - Full TypeScript support  
✅ **Extensible** - Create custom adapters for any streaming scenario

## Component Responsibilities

### ChatClient

- ✅ Manages chat state (messages, loading, errors)
- ✅ Handles user interactions (append, reload, stop)
- ✅ Delegates stream processing to StreamProcessor (when configured)
- ✅ Updates UI via callbacks

### StreamProcessor

- ✅ Parses raw stream chunks
- ✅ Maintains stream state (text, tool calls)
- ✅ Detects tool call completion
- ✅ Applies chunk strategy
- ✅ Emits processed events

### ChunkStrategy

- ✅ Decides when to emit text updates
- ✅ Manages strategy-specific state
- ✅ Can be reset between streams

### StreamParser

- ✅ Converts raw stream format to StreamChunk
- ✅ Handles different stream formats
- ✅ Normalizes input for processor

### ConnectionAdapter

- ✅ Abstracts transport protocol (SSE, HTTP, WebSocket, etc.)
- ✅ Handles connection lifecycle
- ✅ Respects abort signals for cancellation
- ✅ Converts transport-specific format to StreamChunk

## Design Decisions

### Why External to ChatClient?

1. **Separation of Concerns** - ChatClient manages chat state, StreamProcessor manages stream parsing
2. **Testability** - Can test stream processing in isolation
3. **Reusability** - Can be used in other contexts beyond ChatClient
4. **Customization** - Easy to swap implementations

### Why State Machine?

1. **Clear States** - Easy to reason about tool call lifecycle
2. **Explicit Transitions** - Tool call completion logic is transparent
3. **Debugging** - State transitions are easy to log and trace
4. **Testing** - Deterministic behavior

### Why Pluggable Strategies?

1. **Performance** - Different apps have different update frequency needs
2. **UX** - Reading experience varies (real-time vs smooth)
3. **Customization** - Users can implement domain-specific logic
4. **Future-proof** - New strategies can be added without breaking changes

### Why Connection Adapters?

1. **Transport Flexibility** - Support multiple protocols (SSE, HTTP, WebSocket, etc.)
2. **Testability** - Easy to mock for testing
3. **Server Components** - Direct async iterable support for server functions
4. **Extensibility** - Users can create custom adapters for any scenario

### Why Async Iterables?

1. **Standard Pattern** - Native JavaScript/TypeScript support
2. **Composability** - Easy to transform, filter, combine streams
3. **Transport Agnostic** - Works with any streaming mechanism
4. **Type Safety** - Full TypeScript support

## Extension Points

### 1. Custom Chunk Strategy

```typescript
class MyStrategy implements ChunkStrategy {
  shouldEmit(chunk: string, accumulated: string): boolean {
    // Your logic
  }
  reset?(): void {
    // Reset state
  }
}
```

### 2. Custom Stream Parser

```typescript
class MyParser implements StreamParser {
  async *parse(stream: AsyncIterable<any>): AsyncIterable<StreamChunk> {
    for await (const chunk of stream) {
      yield { type: "text" | "tool-call-delta", ... };
    }
  }
}
```

### 3. Custom Connection Adapter

```typescript
function createWebSocketAdapter(url: string): ConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal) {
      const ws = new WebSocket(url);
      
      if (abortSignal) {
        abortSignal.addEventListener("abort", () => ws.close());
      }
      
      // Yield chunks as they arrive
      // ...
    },
  };
}
```

### 4. Custom Event Handlers

```typescript
const processor = new StreamProcessor({
  handlers: {
    onTextUpdate: (content) => { /* ... */ },
    onToolCallStart: (idx, id, name) => { /* ... */ },
    onToolCallDelta: (idx, args) => { /* ... */ },
    onToolCallComplete: (idx, id, name, args) => { /* ... */ },
    onStreamEnd: (content, toolCalls) => { /* ... */ },
  },
});
```

## Performance Considerations

### Memory

- Tool calls stored in Map (O(1) lookup)
- Text accumulated once (not per-chunk copies)
- Pending chunks cleared on emit

### CPU

- Strategy evaluated per text chunk only
- Tool call completion detected via simple index comparison
- No unnecessary iterations or lookups

### UI Updates

- Controlled by ChunkStrategy
- Can batch multiple chunks
- Reduces React/DOM thrashing

## Error Handling

```
Error in stream
    │
    ▼
StreamParser catches
    │
    ├─▶ Can recover? ──▶ Log warning, continue
    │
    └─▶ Fatal? ──────▶ Throw error
                       ChatClient catches
                       setError()
                       onError callback
```

## Testing Strategy

### Unit Tests

- Each chunk strategy
- Tool call state transitions
- Completion detection logic
- Edge cases (empty streams, errors)

### Integration Tests

- Full stream scenarios
- ChatClient integration
- Multiple parallel tool calls
- Mixed text + tool calls

## Key Design Patterns

1. **State Machine** - Tool call lifecycle
2. **Strategy Pattern** - Chunk strategies
3. **Observer Pattern** - Event handlers
4. **Adapter Pattern** - Stream parser and connection adapters
5. **Factory Pattern** - Strategy creation
6. **Composition** - Composite strategy

## Future Architecture

### Client-Side Tool Execution

```
┌─────────────────────────────────────┐
│      StreamProcessor                │
│                                     │
│  onToolCallComplete()               │
│         │                           │
│         ▼                           │
│  ┌──────────────────┐               │
│  │ ToolExecutor     │               │
│  │                  │               │
│  │ - getGPS()       │               │
│  │ - camera()       │               │
│  │ - custom()       │               │
│  └────┬─────────────┘               │
│       │                             │
│       ▼                             │
│  Execute locally                    │
│       │                             │
│       ▼                             │
│  Inject result into stream          │
└─────────────────────────────────────┘
```

### Metrics & Monitoring

```
┌─────────────────────────────────────┐
│      StreamProcessor                │
│                                     │
│  ┌──────────────────┐               │
│  │ MetricsCollector │               │
│  │                  │               │
│  │ - Chunk rate     │               │
│  │ - Update freq    │               │
│  │ - Tool call time │               │
│  │ - Memory usage   │               │
│  └──────────────────┘               │
└─────────────────────────────────────┘
```

### Future Enhancements

1. **Client-side tool execution**
   - Tool call interceptor
   - Browser API integration (GPS, camera, etc.)
   - Result injection back into stream

2. **Stream recovery**
   - Resume from disconnection
   - Replay missed chunks

3. **Performance metrics**
   - Track chunk processing time
   - Update frequency statistics
   - Memory usage monitoring

4. **Advanced strategies**
   - Token-based chunking
   - Semantic boundaries (sentences, paragraphs)
   - Adaptive strategies based on stream speed

## Benefits

✅ **Separation of Concerns** - Each component has single responsibility  
✅ **Testability** - Components can be tested in isolation  
✅ **Extensibility** - Easy to add new strategies/parsers/adapters  
✅ **Performance** - Efficient state management and updates  
✅ **Type Safety** - Full TypeScript support  
✅ **Developer Experience** - Simple by default, powerful when needed

