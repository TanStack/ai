# Tool Registry API

> **🔄 Automatic Tool Execution Loop:** The `chat()` method automatically executes tools in a loop. When the model decides to call a tool, the SDK:
> 1. Executes the tool's `execute` function
> 2. Emits `tool_result` chunks with the result
> 3. Adds tool results to messages automatically
> 4. Continues the conversation with the model
> 5. Repeats until no more tools are needed (up to `maxIterations`, default: 5)
>
> **You don't need to manually handle tool execution** - just provide tools with `execute` functions and the SDK handles everything!
>
> **📚 See also:** [Complete Tool Execution Loop Documentation](TOOL_EXECUTION_LOOP.md)

## Overview

The Tool Registry API allows you to define tools once in the AI constructor and then reference them by name throughout your application. This provides better organization, type safety, and reusability.

## Key Benefits

✅ **Define Once, Use Everywhere** - Register tools in one place  
✅ **Type-Safe Tool Names** - TypeScript autocomplete and validation  
✅ **Better Organization** - Centralized tool management  
✅ **No Duplication** - Reuse tools across different chats  
✅ **Runtime Validation** - Errors if referencing non-existent tools  

## Basic Usage

### 1. Define Tools Registry

```typescript
import { AI } from "@ts-poc/ai";
import { OpenAIAdapter } from "@ts-poc/ai-openai";

// Define all your tools in a registry
const tools = {
  get_weather: {
    type: "function" as const,
    function: {
      name: "get_weather",
      description: "Get current weather for a location",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "City name" },
        },
        required: ["location"],
      },
    },
    execute: async (args: { location: string }) => {
      // Your implementation
      return JSON.stringify({ temp: 72, condition: "sunny" });
    },
  },
  
  calculate: {
    type: "function" as const,
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
    execute: async (args: { expression: string }) => {
      const result = eval(args.expression); // Use safe math parser in production!
      return JSON.stringify({ result });
    },
  },
} as const; // ← Important: use "as const" for type safety!
```

### 2. Initialize AI with Tools

```typescript
const ai = new AI({
  adapters: {
    openai: new OpenAIAdapter({
      apiKey: process.env.OPENAI_API_KEY,
    }),
  },
  tools, // ← Register tools here!
});
```

### 3. Use Tools by Name (Type-Safe!)

```typescript
// Use specific tools
const result = await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [
    { role: "user", content: "What's the weather in SF?" },
  ],
  tools: ["get_weather"], // ← Type-safe! Only registered tool names
  toolChoice: "auto",
  maxIterations: 5,
});

// Use multiple tools
const result2 = await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [
    { role: "user", content: "What's the weather in SF and what's 2+2?" },
  ],
  tools: ["get_weather", "calculate"], // ← Multiple tools, all type-safe!
  toolChoice: "auto",
  maxIterations: 5,
});

// No tools (regular chat)
const result3 = await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [
    { role: "user", content: "Tell me a joke" },
  ],
  // No tools specified
});
```

## Type Safety

TypeScript provides full autocomplete and validation:

```typescript
const ai = new AI({
  adapters: { /* ... */ },
  tools: {
    get_weather: { /* ... */ },
    calculate: { /* ... */ },
  },
});

// ✅ Valid - TypeScript knows these tool names exist
ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
  tools: ["get_weather"], // ← Autocomplete works!
});

// ✅ Valid - multiple tools
ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
  tools: ["get_weather", "calculate"], // ← Both validated!
});

// ❌ TypeScript Error - invalid tool name
ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
  tools: ["invalid_tool"], // ← Compile error!
});
```

## Migration from Old API

### Before (Tools Inline)

```typescript
const result = await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
  tools: [
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "Get weather",
        parameters: { /* ... */ },
      },
      execute: async (args) => { /* ... */ },
    },
    {
      type: "function",
      function: {
        name: "calculate",
        description: "Calculate",
        parameters: { /* ... */ },
      },
      execute: async (args) => { /* ... */ },
    },
  ],
  toolChoice: "auto",
});
```

### After (Tool Registry)

```typescript
// Define once in constructor
const ai = new AI({
  adapters: { /* ... */ },
  tools: {
    get_weather: {
      type: "function",
      function: {
        name: "get_weather",
        description: "Get weather",
        parameters: { /* ... */ },
      },
      execute: async (args) => { /* ... */ },
    },
    calculate: {
      type: "function",
      function: {
        name: "calculate",
        description: "Calculate",
        parameters: { /* ... */ },
      },
      execute: async (args) => { /* ... */ },
    },
  },
});

// Use by name (type-safe!)
const result = await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
  tools: ["get_weather", "calculate"], // ← Much cleaner!
  toolChoice: "auto",
});
```

## Working with Tools

### Get Tool by Name

```typescript
const weatherTool = ai.getTool("get_weather");
console.log(weatherTool.function.description);
```

### List All Tool Names

```typescript
const toolNames = ai.toolNames;
console.log("Available tools:", toolNames);
// Output: ["get_weather", "calculate"]
```

### Check if Tool Exists

```typescript
try {
  const tool = ai.getTool("some_tool");
  console.log("Tool exists!");
} catch (error) {
  console.log("Tool not found");
}
```

## Streaming with Tools

Tools work seamlessly with streaming:

```typescript
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [
    { role: "user", content: "What's the weather in Paris and what's 100*5?" },
  ],
  tools: ["get_weather", "calculate"],
  toolChoice: "auto",
  maxIterations: 5,
});

for await (const chunk of stream) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.delta);
  } else if (chunk.type === "tool_call") {
    console.log(`\n→ Calling: ${chunk.toolCall.function.name}`);
  } else if (chunk.type === "done") {
    console.log("\n✓ Done");
  }
}
```

## HTTP Streaming with Tools

Perfect for API endpoints:

```typescript
import { toStreamResponse } from "@tanstack/ai";

export const Route = createAPIFileRoute("/api/chat")({
  POST: async ({ request }): Promise<Response> => {
    const { messages } = await request.json();
    
    const stream = ai.chat({
      adapter: "openai",
      model: "gpt-4o",
      messages,
      tools: ["get_weather", "search_database", "send_email"],
      toolChoice: "auto",
      maxIterations: 5,
    });

    return toStreamResponse(stream);
  }
});
```

## Real-World Example: E-commerce Assistant

```typescript
const tools = {
  search_products: {
    type: "function" as const,
    function: {
      name: "search_products",
      description: "Search for products in the catalog",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          category: { type: "string" },
          maxPrice: { type: "number" },
        },
        required: ["query"],
      },
    },
    execute: async (args: { query: string; category?: string; maxPrice?: number }) => {
      const results = await db.products.search(args);
      return JSON.stringify(results);
    },
  },
  
  get_product_details: {
    type: "function" as const,
    function: {
      name: "get_product_details",
      description: "Get detailed information about a product",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "string" },
        },
        required: ["productId"],
      },
    },
    execute: async (args: { productId: string }) => {
      const product = await db.products.findById(args.productId);
      return JSON.stringify(product);
    },
  },
  
  check_inventory: {
    type: "function" as const,
    function: {
      name: "check_inventory",
      description: "Check if a product is in stock",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "string" },
          quantity: { type: "number", default: 1 },
        },
        required: ["productId"],
      },
    },
    execute: async (args: { productId: string; quantity?: number }) => {
      const available = await inventory.check(args.productId, args.quantity || 1);
      return JSON.stringify({ available, productId: args.productId });
    },
  },
  
  add_to_cart: {
    type: "function" as const,
    function: {
      name: "add_to_cart",
      description: "Add a product to the shopping cart",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "string" },
          quantity: { type: "number", default: 1 },
        },
        required: ["productId"],
      },
    },
    execute: async (args: { productId: string; quantity?: number }) => {
      await cart.add(args.productId, args.quantity || 1);
      return JSON.stringify({ success: true, productId: args.productId });
    },
  },
} as const;

const ai = new AI({
  adapters: { openai: new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY }) },
  tools,
});

// Now any chat can use these tools by name!
const result = await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [
    { role: "user", content: "I'm looking for a red guitar under $500" },
  ],
  tools: ["search_products", "get_product_details", "check_inventory", "add_to_cart"],
  toolChoice: "auto",
  maxIterations: 10,
});
```

## Advanced: Dynamic Tool Selection

You can dynamically select which tools to use:

```typescript
function getChatTools(userRole: string): string[] {
  if (userRole === "admin") {
    return ["search_products", "get_product_details", "check_inventory", "add_to_cart", "update_prices"];
  } else if (userRole === "customer") {
    return ["search_products", "get_product_details", "add_to_cart"];
  } else {
    return ["search_products"]; // Guest users
  }
}

const result = await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
  tools: getChatTools(user.role) as any, // Type assertion needed for dynamic arrays
  toolChoice: "auto",
});
```

## Best Practices

1. **Use `as const`** when defining tools for maximum type safety
2. **Descriptive names** - Use clear, verb-based names like `get_weather`, `search_products`
3. **Comprehensive descriptions** - Help the AI understand when to use each tool
4. **Required parameters** - Mark parameters as required when appropriate
5. **Error handling** - Return error information in execute functions
6. **Validation** - Validate parameters in execute functions
7. **Centralize** - Keep all tool definitions in one place for maintainability

## Summary

The Tool Registry API provides:

✅ **Type-Safe Tool References** - Autocomplete and validation  
✅ **Centralized Management** - Define once, use everywhere  
✅ **Cleaner Code** - Reference by name instead of inline definitions  
✅ **Better Reusability** - Share tools across different chats  
✅ **Runtime Validation** - Catch errors early  

**Migration Path**: Move inline tool definitions to the constructor registry, then reference them by name in your chat calls!
