# Stream Processor Architecture

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

## Data Flow

### Text Streaming

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

### Tool Call Streaming

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

### Completion Detection

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

## State Transitions

### Tool Call State Machine

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

## Chunk Strategy Decision Tree

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

### 3. Custom Event Handlers

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

### POC Test
- Manual validation
- Visual inspection
- Scenario coverage

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

## Key Design Patterns

1. **State Machine** - Tool call lifecycle
2. **Strategy Pattern** - Chunk strategies
3. **Observer Pattern** - Event handlers
4. **Adapter Pattern** - Stream parser
5. **Factory Pattern** - Strategy creation
6. **Composition** - Composite strategy

## Benefits

✅ **Separation of Concerns** - Each component has single responsibility  
✅ **Testability** - Components can be tested in isolation  
✅ **Extensibility** - Easy to add new strategies/parsers  
✅ **Performance** - Efficient state management and updates  
✅ **Type Safety** - Full TypeScript support  
✅ **Developer Experience** - Simple by default, powerful when needed  

