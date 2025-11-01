# Stream Processor

A robust stream processing system for handling AI response streams with support for:
- **Parallel tool calls** - Multiple tools executing simultaneously
- **Tool call lifecycle tracking** - Start, streaming, and completion detection
- **Configurable text chunking** - Control when UI updates occur
- **Custom parsers** - Handle different stream formats

## Architecture

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

### Component Overview

```
┌─────────────────────────────────────────────────────────┐
│                    ChatClient                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │         StreamProcessor (optional)               │   │
│  │  ┌──────────────┐  ┌──────────────────────────┐ │   │
│  │  │ ChunkStrategy│  │  StreamParser            │ │   │
│  │  │              │  │  - DefaultStreamParser   │ │   │
│  │  │ - Immediate  │  │  - CustomParser          │ │   │
│  │  │ - Punctuation│  │                          │ │   │
│  │  │ - Batch      │  │                          │ │   │
│  │  │ - Custom     │  │                          │ │   │
│  │  └──────────────┘  └──────────────────────────┘ │   │
│  │                                                  │   │
│  │  State Machine:                                 │   │
│  │  - Text accumulation                            │   │
│  │  - Tool call tracking (parallel support)        │   │
│  │  - Completion detection                         │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Files

- **`types.ts`** - Type definitions for all stream processing components
- **`processor.ts`** - Core `StreamProcessor` state machine
- **`chunk-strategies.ts`** - Built-in chunking strategies
- **`index.ts`** - Public exports

## Usage

### Basic Integration

```typescript
import { ChatClient, PunctuationStrategy } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  streamProcessor: {
    chunkStrategy: new PunctuationStrategy(),
  },
});
```

### Direct Usage

```typescript
import { StreamProcessor } from "@tanstack/ai-client/stream";

const processor = new StreamProcessor({
  chunkStrategy: new PunctuationStrategy(),
  handlers: {
    onTextUpdate: (content) => console.log(content),
    onToolCallStart: (index, id, name) => console.log(`Tool: ${name}`),
    onToolCallComplete: (index, id, name, args) => console.log("Done!"),
  },
});

const result = await processor.process(stream);
```

## Chunk Strategies

Control when text updates are emitted to reduce UI jitter and improve UX.

### Built-in Strategies

1. **ImmediateStrategy** (default)
   - Emits on every chunk
   - Real-time feel

2. **PunctuationStrategy**
   - Emits when chunk contains punctuation (`. , ! ? ; :`)
   - Natural reading flow

3. **BatchStrategy(N)**
   - Emits every N chunks
   - Reduces update frequency

4. **WordBoundaryStrategy**
   - Emits when chunk ends with whitespace
   - Prevents cutting words in half

5. **DebounceStrategy(ms)**
   - Emits after ms of silence
   - Good for high-frequency streams

6. **CompositeStrategy([...])**
   - Combines multiple strategies with OR logic
   - Flexible combination of rules

### Custom Strategy

```typescript
class CustomStrategy implements ChunkStrategy {
  shouldEmit(chunk: string, accumulated: string): boolean {
    // Your logic here
    return accumulated.length > 100;
  }

  reset?(): void {
    // Reset state between streams
  }
}
```

## Stream Parser

Handle different stream formats by implementing `StreamParser`.

### Default Parser

Expects chunks in the format:
```typescript
{ type: "content", content: string }
{ type: "tool_call", index: number, toolCall: {...} }
```

### Custom Parser

```typescript
class CustomParser implements StreamParser {
  async *parse(stream: AsyncIterable<any>): AsyncIterable<StreamChunk> {
    for await (const chunk of stream) {
      // Transform your format into StreamChunk
      yield {
        type: "text" | "tool-call-delta",
        content?: string,
        toolCallIndex?: number,
        toolCall?: {...},
      };
    }
  }
}
```

## Tool Call Lifecycle

### Event Flow

```
Tool Call at Index 0:
  1. onToolCallStart(0, "call_1", "getWeather")
  2. onToolCallDelta(0, '{"lo')
  3. onToolCallDelta(0, 'cation":')
  4. onToolCallDelta(0, '"Paris"}')
  
  [Next tool starts OR text arrives OR stream ends]
  
  5. onToolCallComplete(0, "call_1", "getWeather", '{"location":"Paris"}')
```

### Parallel Tool Calls

```
Tool Calls at Index 0 and 1:
  1. onToolCallStart(0, "call_1", "getWeather")
  2. onToolCallDelta(0, '{"location')
  3. onToolCallStart(1, "call_2", "getTime")
  4. onToolCallDelta(1, '{"city')
  5. onToolCallDelta(0, '":"Paris"}')
  
  [Tool 0 switches to tool 1]
  
  6. onToolCallComplete(0, "call_1", "getWeather", '{"location":"Paris"}')
  7. onToolCallDelta(1, '":"Tokyo"}')
  
  [Stream ends]
  
  8. onToolCallComplete(1, "call_2", "getTime", '{"city":"Tokyo"}')
  9. onStreamEnd(content, [call_1, call_2])
```

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

## Testing Strategy

### Unit Tests
- Individual chunk strategies
- Tool call state transitions
- Edge cases (empty streams, errors, etc.)

### Integration Tests
- Full stream processing scenarios
- ChatClient integration
- Multiple parallel tool calls

### POC Test
- Manual validation
- Visual inspection of events
- Run: `npx tsx packages/ai-client/src/stream/poc-test.ts`

## Future Enhancements

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

## API Reference

See [EXAMPLE.md](./EXAMPLE.md) for detailed usage examples.

