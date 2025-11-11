# AI Event Client - Observability & Debugging

The `@tanstack/ai/event-client` provides a type-safe EventEmitter for monitoring and debugging AI operations in your application.

## Installation

The event client is included with `@tanstack/ai`:

```bash
npm install @tanstack/ai
```

## Usage

```typescript
import { aiEventClient } from '@tanstack/ai/event-client';

// Subscribe to events
aiEventClient.on('stream:content', (data) => {
  console.log('Content delta:', data.delta);
});

aiEventClient.on('usage:tokens', (data) => {
  console.log('Tokens used:', data.usage.totalTokens);
});
```

## Available Events

### Chat Lifecycle Events

#### `chat:started`
Emitted when a chat completion or stream starts.

```typescript
{
  timestamp: number;
  model: string;
  messageCount: number;
  hasTools: boolean;
  streaming: boolean;
}
```

#### `chat:completed`
Emitted when a non-streaming chat completion finishes.

```typescript
{
  timestamp: number;
  model: string;
  result: ChatCompletionResult;
  duration: number;
}
```

#### `chat:iteration`
Emitted when the AI makes another iteration (e.g., for tool calling).

```typescript
{
  timestamp: number;
  iteration: number;
  reason: string;
}
```

### Stream Events

#### `stream:started`
Emitted when a streaming response begins.

```typescript
{
  timestamp: number;
  messageId: string;
}
```

#### `stream:ended`
Emitted when a streaming response completes.

```typescript
{
  timestamp: number;
  messageId: string;
  duration: number;
}
```

#### `stream:chunk`
Emitted for every stream chunk (includes all chunk types).

```typescript
{
  timestamp: number;
  messageId: string;
  chunk: StreamChunk;
}
```

#### `stream:content`
Emitted for content delta chunks.

```typescript
{
  timestamp: number;
  messageId: string;
  delta: string;
}
```

#### `stream:tool-call`
Emitted when a tool call is received.

```typescript
{
  timestamp: number;
  messageId: string;
  toolCallId: string;
  toolName: string;
  arguments: string;
}
```

#### `stream:tool-result`
Emitted when a tool result is received.

```typescript
{
  timestamp: number;
  messageId: string;
  toolCallId: string;
  content: string;
}
```

#### `stream:done`
Emitted when the stream completes with finish reason and usage.

```typescript
{
  timestamp: number;
  messageId: string;
  finishReason: string | null;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

#### `stream:error`
Emitted when a stream encounters an error.

```typescript
{
  timestamp: number;
  messageId: string;
  error: {
    message: string;
    code?: string;
  };
}
```

### Tool Events

#### `tool:approval-requested`
Emitted when a tool requires user approval before execution.

```typescript
{
  timestamp: number;
  messageId: string;
  toolCallId: string;
  toolName: string;
  input: any;
  approvalId: string;
}
```

#### `tool:input-available`
Emitted when a client-side tool has its input ready.

```typescript
{
  timestamp: number;
  messageId: string;
  toolCallId: string;
  toolName: string;
  input: any;
}
```

#### `tool:completed`
Emitted when a tool execution completes.

```typescript
{
  timestamp: number;
  toolCallId: string;
  toolName: string;
  result: any;
  duration: number;
}
```

### Token Usage Events

#### `usage:tokens`
Emitted when token usage information is available (both streaming and non-streaming).

```typescript
{
  timestamp: number;
  messageId?: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

## Example Use Cases

### 1. Token Usage Tracking & Cost Monitoring

```typescript
import { aiEventClient } from '@tanstack/ai/event-client';

let totalTokens = 0;
let totalCost = 0;

const costPerToken = {
  'gpt-4o': 0.00003, // $30 per 1M tokens
  'gpt-4o-mini': 0.00000015, // $0.15 per 1M tokens
};

aiEventClient.on('usage:tokens', (data) => {
  totalTokens += data.usage.totalTokens;
  const cost = (data.usage.totalTokens * (costPerToken[data.model] || 0));
  totalCost += cost;
  
  console.log({
    model: data.model,
    tokens: data.usage.totalTokens,
    cost: `$${cost.toFixed(6)}`,
    totalCost: `$${totalCost.toFixed(6)}`,
  });
});
```

### 2. Real-time Content Streaming Display

```typescript
import { aiEventClient } from '@tanstack/ai/event-client';

process.stdout.write('AI: ');
aiEventClient.on('stream:content', (data) => {
  process.stdout.write(data.delta);
});

aiEventClient.on('stream:done', () => {
  process.stdout.write('\n');
});
```

### 3. Logging & Debugging

```typescript
import { aiEventClient } from '@tanstack/ai/event-client';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'ai-events.log' }),
  ],
});

// Log all events
aiEventClient.on('chat:started', (data) => {
  logger.info('Chat started', data);
});

aiEventClient.on('stream:error', (data) => {
  logger.error('Stream error', data);
});

aiEventClient.on('usage:tokens', (data) => {
  logger.info('Token usage', data);
});
```

### 4. Performance Monitoring

```typescript
import { aiEventClient } from '@tanstack/ai/event-client';

const chatMetrics = new Map();

aiEventClient.on('chat:started', (data) => {
  chatMetrics.set(data.timestamp, {
    startTime: data.timestamp,
    model: data.model,
  });
});

aiEventClient.on('chat:completed', (data) => {
  const metrics = Array.from(chatMetrics.values()).find(
    m => m.model === data.model
  );
  
  if (metrics) {
    console.log('Performance:', {
      model: data.model,
      duration: data.duration,
      tokensPerSecond: data.result.usage.totalTokens / (data.duration / 1000),
    });
  }
});
```

### 5. Tool Execution Monitoring

```typescript
import { aiEventClient } from '@tanstack/ai/event-client';

aiEventClient.on('tool:input-available', (data) => {
  console.log(`[${data.toolName}] Called with:`, data.input);
});

aiEventClient.on('tool:completed', (data) => {
  console.log(`[${data.toolName}] Completed in ${data.duration}ms`);
  console.log('Result:', data.result);
});

aiEventClient.on('tool:approval-requested', (data) => {
  console.log(`[${data.toolName}] Needs approval:`, data.input);
});
```

## API Reference

### `aiEventClient.on(event, listener)`
Subscribe to an event.

```typescript
aiEventClient.on('stream:content', (data) => {
  // Handle event
});
```

### `aiEventClient.once(event, listener)`
Subscribe to an event once (automatically unsubscribes after first emission).

```typescript
aiEventClient.once('chat:completed', (data) => {
  console.log('First chat completed:', data);
});
```

### `aiEventClient.off(event, listener)`
Unsubscribe from an event.

```typescript
const handler = (data) => console.log(data);
aiEventClient.on('stream:content', handler);
// Later...
aiEventClient.off('stream:content', handler);
```

### `aiEventClient.removeAllListeners(event?)`
Remove all listeners for a specific event or all events.

```typescript
// Remove all listeners for a specific event
aiEventClient.removeAllListeners('stream:content');

// Remove all listeners for all events
aiEventClient.removeAllListeners();
```

## Type Safety

The event client is fully type-safe. TypeScript will autocomplete event names and infer the correct data types for each event:

```typescript
aiEventClient.on('usage:tokens', (data) => {
  // TypeScript knows data has: timestamp, model, usage
  const totalTokens = data.usage.totalTokens; // ✓ Type-safe
});
```

## Notes

- The event client uses Node.js `EventEmitter` under the hood
- Maximum listeners is set to 100 by default to prevent warnings in observability scenarios
- Events are emitted for both streaming and non-streaming operations
- All events include a `timestamp` field for tracking and analysis
