# TanStack AI Client Documentation

Documentation for `@tanstack/ai-client` - A framework-agnostic headless client for AI chat applications.

## 📚 Documentation

### Stream Processor

The Stream Processor is a robust system for handling AI response streams with support for parallel tool calls, configurable text chunking, and custom parsers.

- **[Quick Start](./STREAM_QUICKSTART.md)** - Get started in 2 minutes
- **[Examples](./STREAM_EXAMPLES.md)** - Comprehensive usage examples with all strategies
- **[Architecture](./STREAM_PROCESSOR.md)** - API reference and architecture overview
- **[Architecture Diagrams](./STREAM_ARCHITECTURE.md)** - Visual diagrams and data flows
- **[POC Summary](./STREAM_POC_SUMMARY.md)** - Implementation details and design decisions

## Quick Example

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
    console.log(messages);
  },
});

await client.sendMessage("Hello!");
```

## Features

✅ **Parallel Tool Calls** - Automatically handles multiple simultaneous tool executions  
✅ **Smart Chunking** - Control UI update frequency with built-in or custom strategies  
✅ **Custom Parsers** - Support for any stream format  
✅ **Type Safe** - Full TypeScript support  
✅ **Framework Agnostic** - Works with React, Vue, Svelte, Solid, or vanilla JS  
✅ **Well Tested** - Comprehensive test coverage  

## Connection Adapters

- `fetchServerSentEvents()` - Server-Sent Events
- `fetchHttpStream()` - HTTP streaming
- `stream()` - Custom async iterables

## Contributing

See the main [TanStack AI repository](https://github.com/TanStack/ai) for contribution guidelines.

