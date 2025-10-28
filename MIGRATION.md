# Simplified API - Migration Guide

## What Changed

The AI SDK has been simplified to support **single adapter only**. The complex multi-adapter configuration with fallbacks has been removed in favor of a cleaner, more straightforward API.

## Changes Summary

### Removed
- ❌ `aiMultiple()` function
- ❌ Multiple adapter support in AI class
- ❌ Fallback configuration
- ❌ Adapter name discrimination in methods
- ❌ Complex adapter map types
- ❌ `tools` option in AI config
- ❌ Tool registry by name
- ❌ `getAdapter()` and `setAdapter()` methods

### Simplified
- ✅ AI class now takes a single adapter
- ✅ No more adapter field in method options
- ✅ Tools passed directly as array into methods
- ✅ Cleaner type inference
- ✅ ~50% smaller bundle size (39KB → 18.92KB ESM)

## Before (Old API)

```typescript
// Multi-adapter with fallbacks
const ai = aiMultiple({
  adapters: {
    openai: createOpenAI(apiKey),
    ollama: createOllama(),
  },
  fallbacks: [
    { adapter: "openai", model: "gpt-4" },
    { adapter: "ollama", model: "llama2" },
  ]
});

// Had to specify adapter in every call
await ai.chat({
  adapter: "openai", // Which adapter to use
  model: "gpt-4",
  messages: [...]
});
```

## After (New API)

### Option 1: Standalone Functions (Recommended for Simple Cases)

```typescript
import { chat } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

// Direct function call with adapter
const result = await chat({
  adapter: openai(), // Adapter determines all types
  model: "gpt-4", // Autocompletes with OpenAI models
  messages: [...],
  providerOptions: { // Typed for OpenAI
    reasoningEffort: "high"
  }
});
```

### Option 2: AI Instance (For Reusable Configuration)

```typescript
import { ai, tool } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

// Define tools
const myTool = tool({
  type: "function",
  function: {
    name: "myTool",
    description: "My tool description",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" }
      },
      required: ["query"],
    },
  },
  execute: async (args) => {
    return `Result for: ${args.query}`;
  },
});

// Create instance with single adapter
const aiInstance = ai(openai(), {
  systemPrompts: ["You are helpful."]
});

// Use instance - pass tools directly
await aiInstance.chat({
  model: "gpt-4",
  messages: [...],
  tools: [myTool]
});
```

## Migration Examples

### Example 1: Basic Chat

**Before:**
```typescript
const ai = aiMultiple({
  adapters: { openai: createOpenAI(key) }
});

await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [...]
});
```

**After:**
```typescript
// Standalone function
await chat({
  adapter: openai(),
  model: "gpt-4",
  messages: [...]
});

// OR AI instance
const ai = ai(openai());
await ai.chat({
  model: "gpt-4",
  messages: [...]
});
```

### Example 2: With Tools

**Before:**
```typescript
const ai = ai(openai(), {
  tools: {
    myTool: tool({
      type: "function",
      function: {
        name: "myTool",
        description: "My tool description",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "The ID" }
          },
          required: ["id"],
        },
      },
      execute: async (args) => {
        return args.id;
      },
    })
  }
});

await ai.chat({
  model: "gpt-4",
  messages: [...],
  tools: ["myTool"] // Reference by name
});
```

**After:**
```typescript
// Define tools as standalone constants
const myTool = tool({
  type: "function",
  function: {
    name: "myTool",
    description: "My tool description",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The ID" }
      },
      required: ["id"],
    },
  },
  execute: async (args) => {
    return args.id;
  },
});

const ai = ai(openai());

await ai.chat({
  model: "gpt-4",
  messages: [...],
  tools: [myTool] // Pass tool objects directly
});
```

### Example 3: Switching Adapters

**Before:**
```typescript
const ai = aiMultiple({
  adapters: {
    openai: createOpenAI(key),
    ollama: createOllama()
  }
});

// Switch by specifying different adapter
await ai.chat({ adapter: "openai", ... });
await ai.chat({ adapter: "ollama", ... });
```

**After:**
```typescript
// Use standalone functions with different adapters
await chat({ adapter: openai(), ... });
await chat({ adapter: ollama(), ... });

// OR create separate instances
const openAIInstance = ai(openai());
const ollamaInstance = ai(ollama());

await openAIInstance.chat({ ... });
await ollamaInstance.chat({ ... });
```

## Benefits of Simplified API

### 1. Smaller Bundle
- **Before:** 39KB ESM, 46.97KB types
- **After:** 18.92KB ESM, 30.89KB types
- **Savings:** ~50% reduction

### 2. Better Type Inference
```typescript
// Types automatically inferred from adapter
chat({
  adapter: openai(),
  model: "gpt-4", // ← OpenAI models autocomplete
  providerOptions: { // ← OpenAI-specific options
    reasoningEffort: "high"
  }
});
```

### 3. Simpler Mental Model
- One adapter per instance/call
- Tools passed directly as values, not by name
- No complex configuration
- Easier to understand and debug

### 4. More Flexible
```typescript
// Easy to switch adapters per call
await chat({ adapter: openai(), ... });
await chat({ adapter: ollama(), ... });
await chat({ adapter: anthropic(), ... });

// Easy to compose tools
const allTools = [tool1, tool2, tool3];
await chat({ adapter: openai(), tools: allTools, ... });

// Or selectively pass tools
await chat({ adapter: openai(), tools: [tool1], ... });
```

## When to Use What

### Use Standalone Functions When:
- ✅ You need one-off API calls
- ✅ You want maximum flexibility
- ✅ You're switching adapters frequently
- ✅ Tools are different for each call

### Use AI Instance When:
- ✅ You want default system prompts
- ✅ You're reusing the same configuration
- ✅ You want a cleaner API in your app
- ✅ Tools can be passed per call as needed

## Fallback Strategy

If you need fallback functionality, implement it at your application level:

```typescript
async function chatWithFallback(options) {
  try {
    return await chat({
      adapter: openai(),
      ...options
    });
  } catch (error) {
    console.warn("OpenAI failed, trying Ollama...");
    return await chat({
      adapter: ollama(),
      ...options
    });
  }
}
```

## Summary

The simplified API focuses on the 80% use case - single adapter with clean type inference. This makes the library:

- ✨ Easier to learn
- 🚀 Faster (smaller bundle)
- 💪 More type-safe
- 🎯 More focused

For complex multi-provider scenarios, build your own abstraction on top of the simple primitives!
