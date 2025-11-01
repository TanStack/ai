# Stream Processor Examples

This document demonstrates how to use the new `StreamProcessor` system with `ChatClient`.

## Basic Usage (Default)

By default, `ChatClient` uses immediate chunking (every chunk updates the UI):

```typescript
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  onMessagesChange: (messages) => {
    console.log("Messages updated:", messages);
  },
});

await client.sendMessage("Hello!");
```

## Using Punctuation Strategy

Update the UI only when punctuation is encountered (smoother for reading):

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
  onMessagesChange: (messages) => {
    console.log("Messages updated:", messages);
  },
});

await client.sendMessage("Tell me a story.");
```

## Using Batch Strategy

Update the UI every N chunks (reduces update frequency):

```typescript
import {
  ChatClient,
  fetchServerSentEvents,
  BatchStrategy,
} from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  streamProcessor: {
    chunkStrategy: new BatchStrategy(10), // Update every 10 chunks
  },
  onMessagesChange: (messages) => {
    console.log("Messages updated:", messages);
  },
});

await client.sendMessage("Explain quantum physics.");
```

## Combining Strategies

Use `CompositeStrategy` to combine multiple strategies (OR logic):

```typescript
import {
  ChatClient,
  fetchServerSentEvents,
  CompositeStrategy,
  PunctuationStrategy,
  BatchStrategy,
} from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  streamProcessor: {
    chunkStrategy: new CompositeStrategy([
      new PunctuationStrategy(), // Update on punctuation
      new BatchStrategy(20), // OR every 20 chunks
    ]),
  },
  onMessagesChange: (messages) => {
    console.log("Messages updated:", messages);
  },
});
```

## Custom Chunk Strategy

Create your own strategy for fine-grained control:

```typescript
import {
  ChatClient,
  fetchServerSentEvents,
  type ChunkStrategy,
} from "@tanstack/ai-client";

class CustomStrategy implements ChunkStrategy {
  private wordCount = 0;

  shouldEmit(chunk: string, accumulated: string): boolean {
    // Count words in the chunk
    const words = chunk.split(/\s+/).filter((w) => w.length > 0);
    this.wordCount += words.length;

    // Emit every 5 words
    if (this.wordCount >= 5) {
      this.wordCount = 0;
      return true;
    }
    return false;
  }

  reset(): void {
    this.wordCount = 0;
  }
}

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  streamProcessor: {
    chunkStrategy: new CustomStrategy(),
  },
  onMessagesChange: (messages) => {
    console.log("Messages updated:", messages);
  },
});
```

## Custom Stream Parser

For handling non-standard stream formats:

```typescript
import {
  ChatClient,
  stream,
  type StreamParser,
  type StreamChunk,
} from "@tanstack/ai-client";

class CustomParser implements StreamParser {
  async *parse(source: AsyncIterable<any>): AsyncIterable<StreamChunk> {
    for await (const chunk of source) {
      // Custom parsing logic for your stream format
      if (chunk.message) {
        yield {
          type: "text",
          content: chunk.message,
        };
      }

      if (chunk.tool) {
        yield {
          type: "tool-call-delta",
          toolCallIndex: chunk.tool.index,
          toolCall: {
            id: chunk.tool.id,
            function: {
              name: chunk.tool.name,
              arguments: chunk.tool.args,
            },
          },
        };
      }
    }
  }
}

const client = new ChatClient({
  connection: stream(async (messages) => {
    // Your custom stream source
    return customStreamGenerator(messages);
  }),
  streamProcessor: {
    parser: new CustomParser(),
  },
  onMessagesChange: (messages) => {
    console.log("Messages updated:", messages);
  },
});
```

## Parallel Tool Calls

The stream processor automatically handles multiple parallel tool calls:

```typescript
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  streamProcessor: {
    // Use any chunk strategy
  },
  onMessagesChange: (messages) => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.toolCalls) {
      console.log("Tool calls in progress:", lastMessage.toolCalls);
      // Can have multiple tool calls streaming simultaneously!
    }
  },
});

await client.sendMessage("Get weather in Paris and Tokyo");
```

## Tool Call Lifecycle Events

You can also use the `StreamProcessor` directly for more control:

```typescript
import {
  StreamProcessor,
  PunctuationStrategy,
} from "@tanstack/ai-client/stream";

const processor = new StreamProcessor({
  chunkStrategy: new PunctuationStrategy(),
  handlers: {
    onTextUpdate: (content) => {
      console.log("Text updated:", content);
    },
    onToolCallStart: (index, id, name) => {
      console.log(`Tool call #${index} started: ${name} (${id})`);
    },
    onToolCallDelta: (index, args) => {
      console.log(`Tool call #${index} delta:`, args);
    },
    onToolCallComplete: (index, id, name, args) => {
      console.log(`Tool call #${index} completed: ${name}`, {
        id,
        args,
      });
    },
    onStreamEnd: (content, toolCalls) => {
      console.log("Stream finished!", { content, toolCalls });
    },
  },
});

const result = await processor.process(streamSource);
```

## Performance Considerations

### High-Frequency Updates

For very fast streams, use `BatchStrategy` or `DebounceStrategy`:

```typescript
import {
  ChatClient,
  fetchServerSentEvents,
  DebounceStrategy,
} from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  streamProcessor: {
    chunkStrategy: new DebounceStrategy(100), // Wait 100ms after last chunk
  },
});
```

### Natural Reading Flow

For the best reading experience, use `PunctuationStrategy` or `WordBoundaryStrategy`:

```typescript
import {
  ChatClient,
  fetchServerSentEvents,
  WordBoundaryStrategy,
} from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  streamProcessor: {
    chunkStrategy: new WordBoundaryStrategy(),
  },
});
```

## Built-in Strategies Summary

| Strategy                 | When it Emits                             | Best For                     |
| ------------------------ | ----------------------------------------- | ---------------------------- |
| `ImmediateStrategy`      | Every chunk                               | Default, real-time feel      |
| `PunctuationStrategy`    | When chunk contains `. , ! ? ; :`         | Natural reading flow         |
| `BatchStrategy(N)`       | Every N chunks                            | Reducing update frequency    |
| `WordBoundaryStrategy`   | When chunk ends with whitespace           | Preventing word cuts         |
| `DebounceStrategy(ms)`   | After ms of silence                       | High-frequency streams       |
| `CompositeStrategy([])`  | When ANY sub-strategy emits (OR)          | Combining multiple rules     |
| Custom `ChunkStrategy`   | Your custom `shouldEmit()` logic          | Fine-grained control         |

