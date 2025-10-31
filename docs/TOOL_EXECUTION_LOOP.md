# Automatic Tool Execution Loop

## Overview

The `chat()` method in TanStack AI includes an **automatic tool execution loop** that handles all tool calling internally. When you provide tools with `execute` functions, the SDK automatically:

1. Detects when the model wants to call a tool
2. Executes the tool's function
3. Adds the result to the conversation
4. Continues the conversation with the model
5. Repeats until complete (up to `maxIterations`)

**You don't need to manually execute tools or manage conversation state** - the SDK handles everything!

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
          unit: { type: "string", enum: ["celsius", "fahrenheit"] }
        },
        required: ["location"]
      }
    },
    execute: async (args) => {
      // This is called automatically by the SDK
      const weather = await fetchWeatherAPI(args.location);
      return JSON.stringify({
        temperature: weather.temp,
        conditions: weather.conditions,
        unit: args.unit || "celsius"
      });
    }
  }),
  
  tool({
    type: "function",
    function: {
      name: "calculate",
      description: "Perform mathematical calculations",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string" }
        },
        required: ["expression"]
      }
    },
    execute: async (args) => {
      // This is called automatically by the SDK
      const result = evaluateExpression(args.expression);
      return JSON.stringify({ result });
    }
  })
];

// Use with chat - tools are automatically executed
const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [
    { role: "user", content: "What's the weather in Paris?" }
  ],
  tools,
  maxIterations: 5, // Max tool execution rounds (default: 5)
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

### `maxIterations`

Control how many rounds of tool execution are allowed (default: 5):

```typescript
const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [...],
  tools: [...],
  maxIterations: 3, // Max 3 rounds of tool execution
});
```

This prevents infinite loops if the model keeps calling tools.

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
import { toStreamResponse } from "@tanstack/ai/stream-to-response";

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
const response = await fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({ messages }),
});

const reader = response.body.getReader();
// Receives: content chunks, tool_call chunks, tool_result chunks, done chunk
```

## Comparison: chat() vs chatCompletion()

| Feature | `chat()` | `chatCompletion()` |
|---------|----------|-------------------|
| **Tool Execution** | ✅ Automatic loop | ❌ Manual (returns tool calls) |
| **Streaming** | ✅ Yes | ❌ No |
| **Tool Results** | ✅ Emitted as chunks | ❌ Not executed |
| **Conversation Continue** | ✅ Automatic | ❌ Manual |
| **Use Case** | Real-time UIs, APIs | Batch processing, manual control |

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

## License

MIT


