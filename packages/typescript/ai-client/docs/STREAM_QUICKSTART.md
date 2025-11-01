# Stream Processor - Quick Start

Get started with the Stream Processor in 2 minutes.

## Installation

Already included if you're using `@tanstack/ai-client`!

## Basic Usage

### Default Behavior (No Configuration)

```typescript
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
});

await client.sendMessage("Hello!");
// ✅ Works immediately - updates on every chunk
```

### Smooth Reading Experience

```typescript
import {
  ChatClient,
  fetchServerSentEvents,
  PunctuationStrategy,
} from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  streamProcessor: {
    chunkStrategy: new PunctuationStrategy(),
  },
});

await client.sendMessage("Tell me a story.");
// ✅ Updates only at punctuation marks - smoother!
```

### Reduce Update Frequency

```typescript
import {
  ChatClient,
  fetchServerSentEvents,
  BatchStrategy,
} from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  streamProcessor: {
    chunkStrategy: new BatchStrategy(5), // Every 5 chunks
  },
});

await client.sendMessage("Explain AI.");
// ✅ Less frequent updates - better performance
```

## Available Strategies

| Strategy                 | When Updates     | Use Case                 |
| ------------------------ | ---------------- | ------------------------ |
| `ImmediateStrategy()`    | Every chunk      | Real-time feel (default) |
| `PunctuationStrategy()`  | On `. , ! ? ; :` | Natural reading          |
| `BatchStrategy(N)`       | Every N chunks   | Performance              |
| `WordBoundaryStrategy()` | At spaces        | No word cuts             |
| `DebounceStrategy(ms)`   | After delay      | High-speed streams       |

## Tool Calls

Works automatically - no configuration needed!

```typescript
const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  onMessagesChange: (messages) => {
    const last = messages[messages.length - 1];
    if (last.toolCalls) {
      console.log("Tool calls:", last.toolCalls);
      // ✅ Parallel tool calls handled automatically!
    }
  },
});

await client.sendMessage("Get weather in Paris and Tokyo");
```

## Custom Strategy

```typescript
import { type ChunkStrategy } from "@tanstack/ai-client";

class MyStrategy implements ChunkStrategy {
  shouldEmit(chunk: string, accumulated: string): boolean {
    return accumulated.length > 100; // Update every 100 chars
  }
}

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  streamProcessor: {
    chunkStrategy: new MyStrategy(),
  },
});
```

## Testing

Run the test suite:

```bash
cd packages/typescript/ai-client
pnpm test
```

Or run tests in watch mode:

```bash
pnpm test:watch
```

## Next Steps

- [STREAM_EXAMPLES.md](./STREAM_EXAMPLES.md) - Detailed examples
- [STREAM_PROCESSOR.md](./STREAM_PROCESSOR.md) - Architecture & API reference
- [STREAM_POC_SUMMARY.md](./STREAM_POC_SUMMARY.md) - Implementation details

## Questions?

The stream processor is:

- ✅ **Opt-in** - Works without configuration
- ✅ **Type-safe** - Full TypeScript support
- ✅ **Tested** - Run POC test to validate
- ✅ **Documented** - See docs above

Start simple, add complexity only when needed!
