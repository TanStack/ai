# Agent Loop Strategies

## Overview

Agent loop strategies provide flexible control over when the tool execution loop in `chat()` should stop. Instead of a simple `maxIterations` number, you can now use strategy functions that decide whether to continue based on the current state.

## Quick Start

```typescript
import { chat, maxIterations } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [...],
  tools: [weatherTool],
  agentLoopStrategy: maxIterations(5), // Control loop with strategy
});
```

## Built-in Strategies

### `maxIterations(max)`

Continue for a maximum number of iterations:

```typescript
import { maxIterations } from "@tanstack/ai";

const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [...],
  tools: [...],
  agentLoopStrategy: maxIterations(10), // Max 10 iterations
});
```

### `untilFinishReason(stopReasons)`

Continue until one of the specified finish reasons is encountered:

```typescript
import { untilFinishReason } from "@tanstack/ai";

const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [...],
  tools: [...],
  agentLoopStrategy: untilFinishReason(["stop", "length"]),
});
```

### `combineStrategies(strategies)`

Combine multiple strategies with AND logic (all must return true to continue):

```typescript
import { maxIterations, combineStrategies } from "@tanstack/ai";

const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [...],
  tools: [...],
  agentLoopStrategy: combineStrategies([
    maxIterations(10),
    ({ messages }) => messages.length < 100,
  ]),
});
```

## Custom Strategies

Create your own strategy function:

```typescript
import type { AgentLoopStrategy } from "@tanstack/ai";

// Simple: based on iteration count
const simple: AgentLoopStrategy = ({ iterationCount }) => {
  return iterationCount < 5;
};

// Advanced: based on multiple conditions
const advanced: AgentLoopStrategy = ({ 
  iterationCount, 
  messages, 
  finishReason 
}) => {
  // Stop after 10 iterations
  if (iterationCount >= 10) return false;
  
  // Stop if conversation gets too long
  if (messages.length > 50) return false;
  
  // Stop on specific finish reasons
  if (finishReason === "length" || finishReason === "content_filter") {
    return false;
  }
  
  // Otherwise continue
  return true;
};

// Use custom strategy
const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [...],
  tools: [...],
  agentLoopStrategy: advanced,
});
```

## AgentLoopState Interface

The state object passed to your strategy function:

```typescript
export interface AgentLoopState {
  /** Current iteration count (0-indexed) */
  iterationCount: number;
  
  /** Current messages in the conversation */
  messages: Message[];
  
  /** Finish reason from the last model response */
  finishReason: string | null;
}
```

**Finish reasons:**
- `"stop"` - Model finished naturally
- `"length"` - Hit token limit
- `"tool_calls"` - Model called tools (triggers tool execution)
- `"content_filter"` - Content filtered
- `null` - No finish reason yet

## Use Cases

### Prevent Runaway Loops

```typescript
// Stop after 3 iterations OR 20 messages
const conservative: AgentLoopStrategy = ({ iterationCount, messages }) => {
  return iterationCount < 3 && messages.length < 20;
};
```

### Budget Control

```typescript
// Stop based on estimated token usage
const budgetAware: AgentLoopStrategy = ({ messages }) => {
  const estimatedTokens = messages.reduce((sum, m) => 
    sum + (m.content?.length || 0) / 4, // Rough estimate
    0
  );
  return estimatedTokens < 10000; // Stop before 10k tokens
};
```

### Conditional Execution

```typescript
// Different limits for different scenarios
const conditional: AgentLoopStrategy = ({ iterationCount, messages }) => {
  const hasToolCalls = messages.some(m => m.toolCalls && m.toolCalls.length > 0);
  
  // Allow more iterations if tools are being used
  const maxIters = hasToolCalls ? 10 : 3;
  
  return iterationCount < maxIters;
};
```

### Debug Mode

```typescript
// Stop early during development
const debug: AgentLoopStrategy = ({ iterationCount }) => {
  console.log(`Iteration ${iterationCount + 1}`);
  return iterationCount < 2; // Only 2 iterations in debug mode
};
```

## Pattern: Strategy Factory

Create reusable strategy factories:

```typescript
function maxTokens(max: number): AgentLoopStrategy {
  return ({ messages }) => {
    const totalTokens = messages.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      0
    );
    return totalTokens < max;
  };
}

function maxMessages(max: number): AgentLoopStrategy {
  return ({ messages }) => messages.length < max;
}

// Use factory
const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [...],
  tools: [...],
  agentLoopStrategy: combineStrategies([
    maxIterations(10),
    maxTokens(5000),
    maxMessages(30),
  ]),
});
```

## Simplified Syntax

For convenience, you can use the `maxIterations` option directly:

```typescript
// Simplified syntax
const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [...],
  tools: [...],
  maxIterations: 5, // Shorthand for agentLoopStrategy: maxIterations(5)
});

// Explicit strategy (more flexible)
const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [...],
  tools: [...],
  agentLoopStrategy: maxIterations(5),
});
```

Both are equivalent. The `maxIterations` number is automatically converted to `agentLoopStrategy: maxIterations(n)`.

## Testing Strategies

### Unit Test Example

```typescript
import { describe, it, expect } from "vitest";
import type { AgentLoopStrategy, AgentLoopState } from "@tanstack/ai";

describe("Custom Strategy", () => {
  it("should stop after 3 iterations", () => {
    const strategy: AgentLoopStrategy = ({ iterationCount }) => {
      return iterationCount < 3;
    };
    
    expect(strategy({ iterationCount: 0, messages: [], finishReason: null })).toBe(true);
    expect(strategy({ iterationCount: 2, messages: [], finishReason: null })).toBe(true);
    expect(strategy({ iterationCount: 3, messages: [], finishReason: null })).toBe(false);
  });
  
  it("should stop when finish reason is length", () => {
    const strategy: AgentLoopStrategy = ({ finishReason }) => {
      return finishReason !== "length";
    };
    
    expect(strategy({ iterationCount: 0, messages: [], finishReason: null })).toBe(true);
    expect(strategy({ iterationCount: 0, messages: [], finishReason: "stop" })).toBe(true);
    expect(strategy({ iterationCount: 0, messages: [], finishReason: "length" })).toBe(false);
  });
});
```

## Best Practices

### ✅ DO

- Use built-in strategies when possible (`maxIterations`, `combineStrategies`)
- Consider message count to prevent memory issues
- Handle all finish reasons appropriately
- Test your custom strategies
- Document complex strategy logic

### ❌ DON'T

- Create strategies that never return false (infinite loops)
- Ignore the `finishReason` - it contains important information
- Make strategies too complex - keep them simple and testable
- Forget to handle edge cases (null finishReason, empty messages)

## Examples

### Production-Ready Strategy

```typescript
import { maxIterations, combineStrategies } from "@tanstack/ai";

// Combine safety limits
const productionStrategy = combineStrategies([
  maxIterations(15), // Hard limit on iterations
  ({ messages }) => messages.length < 100, // Limit conversation length
  ({ finishReason }) => finishReason !== "content_filter", // Stop on filter
]);

const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [...],
  tools: [...],
  agentLoopStrategy: productionStrategy,
});
```

### Development Strategy

```typescript
// Aggressive limits during development
const devStrategy: AgentLoopStrategy = ({ iterationCount, messages }) => {
  if (iterationCount >= 2) {
    console.warn("DEV: Stopping at 2 iterations");
    return false;
  }
  if (messages.length >= 10) {
    console.warn("DEV: Stopping at 10 messages");
    return false;
  }
  return true;
};
```

## Migration from maxIterations

Before:
```typescript
chat({ ..., maxIterations: 10 })
```

After:
```typescript
import { maxIterations } from "@tanstack/ai";
chat({ ..., agentLoopStrategy: maxIterations(10) })
```

Or create a custom strategy:
```typescript
chat({ 
  ..., 
  agentLoopStrategy: ({ iterationCount, messages }) => {
    return iterationCount < 10 && messages.length < 50;
  }
})
```

## See Also

- [Tool Execution Loop Documentation](TOOL_EXECUTION_LOOP.md)
- [Unified Chat API](UNIFIED_CHAT_API.md)
- [Quick Reference](UNIFIED_CHAT_QUICK_REFERENCE.md)

