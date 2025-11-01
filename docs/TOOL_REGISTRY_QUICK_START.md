# Tool Registry API - Quick Start

> **🔄 Automatic Tool Execution:** The `chat()` method automatically executes tools in a loop. When the model calls a tool, the SDK executes it, adds the result to messages, and continues the conversation automatically (controlled by `agentLoopStrategy`, default: `maxIterations(5)`). You don't need to manually handle tool execution!
>
> **📚 See also:** [Complete Tool Execution Loop Documentation](TOOL_EXECUTION_LOOP.md)

## In 3 Steps

### 1. Define Tools in Constructor

```typescript
const ai = new AI({
  adapters: {
    openai: new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY }),
  },
  tools: {
    // ← Define all tools here!
    get_weather: {
      type: "function" as const,
      function: {
        name: "get_weather",
        description: "Get weather for a location",
        parameters: {
          type: "object",
          properties: {
            location: { type: "string" },
          },
          required: ["location"],
        },
      },
      execute: async (args: { location: string }) => {
        return JSON.stringify({ temp: 72, condition: "sunny" });
      },
    },
    calculate: {
      type: "function" as const,
      function: {
        name: "calculate",
        description: "Perform calculations",
        parameters: {
          type: "object",
          properties: {
            expression: { type: "string" },
          },
          required: ["expression"],
        },
      },
      execute: async (args: { expression: string }) => {
        return JSON.stringify({ result: eval(args.expression) });
      },
    },
  },
});
```

### 2. Reference Tools by Name (Type-Safe!)

```typescript
const result = await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "What's the weather in SF?" }],
  tools: ["get_weather"], // ← Type-safe! Autocomplete works!
  toolChoice: "auto",
});
```

### 3. Use Multiple Tools

```typescript
const result = await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Weather in NYC and calculate 5*20" }],
  tools: ["get_weather", "calculate"], // ← Both tools!
  toolChoice: "auto",
});
```

## Type Safety

✅ **Autocomplete** - IDE suggests available tool names  
✅ **Validation** - TypeScript catches typos at compile time  
✅ **Runtime checks** - Errors if tool doesn't exist

```typescript
// ✅ Valid
tools: ["get_weather", "calculate"];

// ❌ TypeScript Error
tools: ["invalid_tool"];
```

## Benefits vs Old API

### Before (Inline Tools)

```typescript
// Had to define tools every time!
ai.chat({
  messages: [...],
  tools: [
    { type: "function", function: { name: "get_weather", ... }, execute: ... },
    { type: "function", function: { name: "calculate", ... }, execute: ... },
  ],
});
```

### After (Tool Registry)

```typescript
// Define once in constructor, use by name everywhere!
ai.chat({
  messages: [...],
  tools: ["get_weather", "calculate"], // ← Much cleaner!
});
```

## With Streaming

The `chat()` method automatically executes tools and emits chunks for each step:

```typescript
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
  tools: ["get_weather", "calculate"],
  toolChoice: "auto",
  agentLoopStrategy: maxIterations(5), // Optional: control loop
});

for await (const chunk of stream) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.delta); // Stream text content
  } else if (chunk.type === "tool_call") {
    console.log(`→ Calling: ${chunk.toolCall.function.name}`);
  } else if (chunk.type === "tool_result") {
    console.log(`✓ Tool result: ${chunk.content}`);
  }
}
```

**What happens internally:**

1. Model decides to call a tool → `tool_call` chunk emitted
2. SDK executes the tool's `execute` function automatically
3. SDK emits `tool_result` chunk with the result
4. SDK adds tool result to messages and continues conversation
5. Model responds with final answer based on tool results

## With HTTP Response

```typescript
import { toStreamResponse } from "@tanstack/ai";

// Perfect for API endpoints!
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
  tools: ["get_weather", "search_products", "send_email"],
  toolChoice: "auto",
});

return toStreamResponse(stream);
```

## Pro Tips

1. **Use `as const`** when defining tools for type safety
2. **Descriptive names** like `get_weather`, `search_products`
3. **Keep tools in one place** for easy maintenance
4. **List available tools**: `ai.toolNames`
5. **Get a tool**: `ai.getTool("get_weather")`

## Common Pattern: Separate File

```typescript
// tools.ts
export const tools = {
  get_weather: { /* ... */ },
  calculate: { /* ... */ },
  search_products: { /* ... */ },
} as const;

// ai-client.ts
import { tools } from "./tools";

export const ai = new AI({
  adapters: { /* ... */ },
  tools, // ← Import from separate file!
});

// api.ts
import { ai } from "./ai-client";

ai.chat({
  messages: [...],
  tools: ["get_weather"], // ← Type-safe across files!
});
```

## Summary

**Define once, use everywhere with full type safety!** 🎉

See full documentation: `docs/TOOL_REGISTRY.md`
