# Automatic Tool Execution Loop

## Overview

The `chat()` method in TanStack AI includes an **automatic tool execution loop** that handles all tool calling internally. When you provide tools with `execute` functions, the SDK automatically:

1. Detects when the model wants to call a tool
2. Executes the tool's function
3. Adds the result to the conversation
4. Continues the conversation with the model
5. Repeats until complete (up to `maxIterations`)

**You don't need to manually execute tools or manage conversation state** - the SDK handles everything!

## Architecture

The tool execution loop is implemented using the `ToolCallManager` class, which:

- **Accumulates tool calls** from streaming chunks
- **Validates tool calls** (ensures IDs and names are present)
- **Executes tools** and emits `tool_result` chunks
- **Returns tool result messages** for adding to conversation

This separation makes the code maintainable and testable.

## How It Works

### Step-by-Step Flow

```
User Message
    ↓
Model Response (wants to call tool)
    ↓
SDK emits tool_call chunk ← You see this
    ↓
SDK executes tool.execute() ← Happens automatically
    ↓
SDK emits tool_result chunk ← You see this
    ↓
SDK adds result to messages ← Happens automatically
    ↓
SDK calls model again with updated messages ← Happens automatically
    ↓
Model responds with final answer
    ↓
SDK emits content chunks ← You see this
    ↓
Done!
```

### What You Do

**You only handle the stream chunks for display:**

```typescript
for await (const chunk of stream) {
  if (chunk.type === "content") {
    // Display text to user
    console.log(chunk.delta);
  } else if (chunk.type === "tool_call") {
    // Show that a tool is being called
    console.log(`Calling: ${chunk.toolCall.function.name}`);
  } else if (chunk.type === "tool_result") {
    // Show the tool result
    console.log(`Result: ${chunk.content}`);
  }
}
```

### What the SDK Does Automatically

1. **Tracks tool calls** from the stream
2. **Executes tools** when `finishReason === "tool_calls"`
3. **Adds messages** (assistant with tool calls + tool results)
4. **Continues conversation** by calling the model again
5. **Repeats** until no more tools are needed

## Complete Example

```typescript
import { chat, tool } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

// Define tools with execute functions
const tools = [
  tool({
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather for a location",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string" },
          unit: { type: "string", enum: ["celsius", "fahrenheit"] },
        },
        required: ["location"],
      },
    },
    execute: async (args) => {
      // This is called automatically by the SDK
      const weather = await fetchWeatherAPI(args.location);
      return JSON.stringify({
        temperature: weather.temp,
        conditions: weather.conditions,
        unit: args.unit || "celsius",
      });
    },
  }),

  tool({
    type: "function",
    function: {
      name: "calculate",
      description: "Perform mathematical calculations",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string" },
        },
        required: ["expression"],
      },
    },
    execute: async (args) => {
      // This is called automatically by the SDK
      const result = evaluateExpression(args.expression);
      return JSON.stringify({ result });
    },
  }),
];

// Use with chat - tools are automatically executed
const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [{ role: "user", content: "What's the weather in Paris?" }],
  tools,
  agentLoopStrategy: maxIterations(5), // Control loop behavior
  // Or use custom strategy:
  // agentLoopStrategy: ({ iterationCount, messages }) => iterationCount < 10,
});

// Handle the stream
for await (const chunk of stream) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.delta);
  } else if (chunk.type === "tool_call") {
    console.log(`\n🔧 Calling: ${chunk.toolCall.function.name}`);
  } else if (chunk.type === "tool_result") {
    console.log(`✓ Result: ${chunk.content}\n`);
  } else if (chunk.type === "done") {
    console.log(`\nDone! (${chunk.finishReason})`);
  }
}
```

### Output

```
🔧 Calling: get_weather
✓ Result: {"temperature":15,"conditions":"cloudy","unit":"celsius"}

The current weather in Paris is 15°C and cloudy.

Done! (stop)
```

## Multi-Turn Tool Execution

The loop can handle multiple rounds of tool execution:

```typescript
// User asks: "What's the weather in Paris and what's 5 + 3?"

// Round 1: Model calls get_weather
// → SDK executes get_weather
// → SDK adds result to messages

// Round 2: Model calls calculate
// → SDK executes calculate
// → SDK adds result to messages

// Round 3: Model responds with final answer using both results
// → "In Paris it's 15°C and cloudy. Also, 5 + 3 = 8."
```

All handled automatically by the SDK!

## Configuration

### Agent Loop Strategies

Control when the tool execution loop stops using `agentLoopStrategy`:

#### Built-in Strategies

```typescript
import { maxIterations, untilFinishReason, combineStrategies } from "@tanstack/ai";

// 1. Max iterations (default behavior)
const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [...],
  tools: [...],
  agentLoopStrategy: maxIterations(3), // Max 3 rounds
});

// 2. Until specific finish reason
const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [...],
  tools: [...],
  agentLoopStrategy: untilFinishReason(["stop", "length"]),
});

// 3. Combine multiple strategies
const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [...],
  tools: [...],
  agentLoopStrategy: combineStrategies([
    maxIterations(10),
    ({ messages }) => messages.length < 100, // Custom condition
  ]),
});
```

#### Custom Strategies

Create your own strategy function:

```typescript
// Simple custom strategy
const myStrategy: AgentLoopStrategy = ({ iterationCount }) => {
  return iterationCount < 5;
};

// Advanced custom strategy
const advancedStrategy: AgentLoopStrategy = ({
  iterationCount,
  messages,
  finishReason
}) => {
  // Stop if too many iterations
  if (iterationCount >= 10) return false;

  // Stop if conversation too long
  if (messages.length > 50) return false;

  // Stop on specific finish reasons
  if (finishReason === "length") return false;

  // Otherwise continue
  return true;
};

const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [...],
  tools: [...],
  agentLoopStrategy: advancedStrategy,
});
```

#### Alternative: maxIterations

You can also use `maxIterations` as a number for convenience:

```typescript
const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [...],
  tools: [...],
  maxIterations: 3, // Shorthand for agentLoopStrategy: maxIterations(3)
});
```

This is equivalent to `agentLoopStrategy: maxIterations(3)`.

### Agent Loop Strategy Types

```typescript
export interface AgentLoopState {
  iterationCount: number; // Current iteration (0-indexed)
  messages: Message[]; // Current conversation messages
  finishReason: string | null; // Last finish reason from model
}

export type AgentLoopStrategy = (state: AgentLoopState) => boolean;
```

### `toolChoice`

Control when tools are used:

```typescript
const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [...],
  tools: [...],
  toolChoice: "auto", // Let model decide (default)
  // toolChoice: "required", // Force model to call a tool
  // toolChoice: "none", // Prevent tool calling
});
```

## Stream Chunk Types

### `tool_call`

Emitted when the model decides to call a tool:

```typescript
{
  type: "tool_call",
  toolCall: {
    id: "call_abc123",
    type: "function",
    function: {
      name: "get_weather",
      arguments: '{"location":"Paris"}' // May be incomplete during streaming
    }
  },
  index: 0 // Index of this tool call if multiple
}
```

### `tool_result`

Emitted after the SDK executes a tool:

```typescript
{
  type: "tool_result",
  toolCallId: "call_abc123",
  content: '{"temperature":15,"conditions":"cloudy"}'
}
```

## Best Practices

### ✅ DO

- Provide tools with `execute` functions for automatic execution
- Handle chunk types for display/logging
- Use `maxIterations` to prevent infinite loops
- Return JSON strings from `execute` functions
- Handle errors in `execute` functions

### ❌ DON'T

- Try to execute tools manually (SDK does this)
- Manage conversation state manually (SDK does this)
- Add tool result messages yourself (SDK does this)
- Worry about message ordering (SDK handles this)

## HTTP Streaming with Tools

Perfect for API endpoints - tool execution happens on server, results stream to client:

```typescript
import { chat } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";
import { toStreamResponse } from "@tanstack/ai";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openai(),
    model: "gpt-4o",
    messages,
    tools: [weatherTool, calculateTool],
    maxIterations: 5,
  });

  // Client receives tool_call and tool_result chunks
  return toStreamResponse(stream);
}
```

**Client-side:**

```typescript
const response = await fetch("/api/chat", {
  method: "POST",
  body: JSON.stringify({ messages }),
});

const reader = response.body.getReader();
// Receives: content chunks, tool_call chunks, tool_result chunks, done chunk
```

## Comparison: chat() vs chatCompletion()

| Feature                   | `chat()`             | `chatCompletion()`               |
| ------------------------- | -------------------- | -------------------------------- |
| **Tool Execution**        | ✅ Automatic loop    | ❌ Manual (returns tool calls)   |
| **Streaming**             | ✅ Yes               | ❌ No                            |
| **Tool Results**          | ✅ Emitted as chunks | ❌ Not executed                  |
| **Conversation Continue** | ✅ Automatic         | ❌ Manual                        |
| **Use Case**              | Real-time UIs, APIs  | Batch processing, manual control |

### When to use `chatCompletion()`

Use `chatCompletion()` if you need manual control over tool execution:

```typescript
const result = await chatCompletion({
  adapter: openai(),
  model: "gpt-4o",
  messages: [...],
  tools: [weatherTool],
});

// Model wants to call a tool, but SDK doesn't execute it
if (result.toolCalls) {
  // You decide whether/how to execute
  for (const toolCall of result.toolCalls) {
    // Manual execution
    const tool = tools.find(t => t.function.name === toolCall.function.name);
    const result = await tool.execute(JSON.parse(toolCall.function.arguments));

    // You must add result to messages and call chatCompletion again
    messages.push({
      role: "assistant",
      content: result.content,
      toolCalls: result.toolCalls
    });
    messages.push({
      role: "tool",
      content: result,
      toolCallId: toolCall.id
    });

    // Call again with updated messages
    const nextResult = await chatCompletion({
      adapter: openai(),
      model: "gpt-4o",
      messages,
      tools: [weatherTool],
    });
  }
}
```

**For most use cases, use `chat()` with automatic tool execution!**

## ToolCallManager Class

The tool execution logic is implemented in the `ToolCallManager` class for better maintainability and testability.

### Public API

```typescript
class ToolCallManager {
  constructor(tools: ReadonlyArray<Tool>);

  // Add a streaming tool call chunk
  addToolCallChunk(chunk: ToolCallChunk): void;

  // Check if there are complete tool calls
  hasToolCalls(): boolean;

  // Get all validated tool calls
  getToolCalls(): ToolCall[];

  // Execute tools and yield tool_result chunks
  async *executeTools(
    doneChunk
  ): AsyncGenerator<ToolResultStreamChunk, Message[]>;

  // Clear for next iteration
  clear(): void;
}
```

### Usage in chat() method

```typescript
async *chat(options) {
  const toolCallManager = new ToolCallManager(options.tools || []);

  while (iterationCount < maxIterations) {
    // Stream chunks
    for await (const chunk of adapter.chatStream()) {
      yield chunk;

      if (chunk.type === "tool_call") {
        toolCallManager.addToolCallChunk(chunk); // Accumulate
      }
    }

    // Execute if needed
    if (toolCallManager.hasToolCalls()) {
      const toolResults = yield* toolCallManager.executeTools(doneChunk);
      messages = [...messages, ...toolResults];
      toolCallManager.clear(); // Clear for next iteration
      continue;
    }

    break;
  }
}
```

### Benefits

- ✅ **Testable** - Unit tests for tool execution logic
- ✅ **Maintainable** - Tool logic separate from chat logic
- ✅ **Reusable** - Can be used in other contexts
- ✅ **Clean** - Single responsibility principle

### Unit Tests

The `ToolCallManager` has comprehensive unit tests. Run them with:

```bash
cd packages/ai
pnpm test
```

See `packages/ai/src/tool-call-manager.test.ts` for test scenarios:

- Accumulating streaming chunks
- Filtering incomplete tool calls
- Executing tools
- Error handling
- Multiple tool calls
- Clearing state

## License

MIT
