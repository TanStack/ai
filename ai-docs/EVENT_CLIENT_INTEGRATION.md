# AI Event Client Integration Example

This example demonstrates how the event client automatically captures events from AI operations.

## Usage

```typescript
import { aiEventClient } from '@tanstack/ai/event-client';
import { chat } from '@tanstack/ai';
import { openai } from '@tanstack/ai-openai';

// Set up event listeners BEFORE making AI calls
aiEventClient.on('usage:tokens', (data) => {
  console.log(`Tokens used: ${data.usage.totalTokens}`);
});

aiEventClient.on('stream:content', (data) => {
  process.stdout.write(data.delta);
});

// Now make AI calls - events will be automatically emitted
const adapter = openai({ apiKey: process.env.OPENAI_API_KEY! });

const stream = chat({
  adapter,
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
});

for await (const chunk of stream) {
  // Events are automatically emitted during streaming
  // No need to manually emit anything
}
```

## How It Works

1. The `aiEventClient` is a singleton EventEmitter that's automatically used by the AI core
2. When you call `chat()` or `chatCompletion()`, the AI core emits events to the client
3. Your event listeners receive these events in real-time
4. No configuration needed - just import and listen!

## Event Flow

```
chat() called
  ↓
chat:started event
  ↓
stream:started event
  ↓
stream:content events (multiple)
stream:tool-call events (if tools used)
stream:done event
  ↓
usage:tokens event
  ↓
stream:ended event
```

## Common Patterns

### Pattern 1: Real-time Content Display
```typescript
aiEventClient.on('stream:content', (data) => {
  document.getElementById('output').textContent += data.delta;
});
```

### Pattern 2: Token Usage Tracking
```typescript
let totalCost = 0;
aiEventClient.on('usage:tokens', (data) => {
  const cost = data.usage.totalTokens * 0.00003; // Example cost
  totalCost += cost;
  console.log(`Cost: $${cost.toFixed(6)}, Total: $${totalCost.toFixed(6)}`);
});
```

### Pattern 3: Error Handling
```typescript
aiEventClient.on('stream:error', (data) => {
  console.error('AI Error:', data.error.message);
  // Show error to user
});
```

### Pattern 4: Tool Monitoring
```typescript
aiEventClient.on('tool:completed', (data) => {
  console.log(`Tool ${data.toolName} completed in ${data.duration}ms`);
});
```

## Benefits

- ✅ **Zero Configuration**: Works automatically with all AI operations
- ✅ **Type-Safe**: Full TypeScript support with event type inference
- ✅ **Decoupled**: Observability doesn't affect your core AI logic
- ✅ **Flexible**: Subscribe to only the events you need
- ✅ **Performance**: Minimal overhead, designed for production use
