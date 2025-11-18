# Tool Registry API - Implementation Summary

> **🔄 Automatic Tool Execution Loop:** This document describes how tools are registered and referenced. Remember that the `chat()` method automatically executes tools in a loop - when the model calls a tool, the SDK executes it, adds the result to messages, and continues the conversation automatically (up to `maxIterations`, default: 5).

## Overview

Successfully refactored the AI API to support a **tool registry** where tools are defined once in the constructor and then referenced by name in a type-safe manner throughout the application.

## Key Changes

### 1. Tool Registry in Constructor

**Before:**
```typescript
const ai = new AI({
  adapters: { /* ... */ }
});

// Had to pass full tool definitions every time
ai.chat({
  messages: [...],
  tools: [
    { type: "function", function: { name: "get_weather", ... }, execute: ... },
    { type: "function", function: { name: "calculate", ... }, execute: ... },
  ],
});
```

**After:**
```typescript
const ai = new AI({
  adapters: { /* ... */ },
  tools: {
    get_weather: {
      type: "function" as const,
      function: { name: "get_weather", ... },
      execute: async (args) => { ... },
    },
    calculate: {
      type: "function" as const,
      function: { name: "calculate", ... },
      execute: async (args) => { ... },
    },
  },
});

// Reference by name - type-safe!
ai.chat({
  messages: [...],
  tools: ["get_weather", "calculate"], // ← Type-safe string array!
});
```

### 2. Type System Updates

Added new generic parameter to `AI` class:
```typescript
class AI<T extends AdapterMap, TTools extends ToolRegistry>
```

Where:
- `T` - Adapter map (existing)
- `TTools` - Tool registry (new!)

### 3. Type-Safe Tool Names

Tool names are extracted from the registry type:
```typescript
type ToolNames<TTools extends ToolRegistry> = keyof TTools & string;
```

TypeScript provides:
- ✅ Autocomplete for tool names
- ✅ Compile-time validation
- ✅ Refactoring safety

### 4. Updated Method Signatures

All chat methods now accept tool names instead of full tool objects:

```typescript
// ChatOptionsWithAdapter
type ChatOptionsWithAdapter<TAdapters, TTools> = {
  // ... other options
  tools?: ReadonlyArray<ToolNames<TTools>>; // ← Type-safe tool names!
};
```

### 5. Internal Tool Resolution

New helper methods:
```typescript
class AI {
  getTool(name: ToolNames<TTools>): Tool; // Get single tool
  get toolNames(): Array<ToolNames<TTools>>; // List all tool names
  private getToolsByNames(names: ToolNames<TTools>[]): Tool[]; // Convert names to objects
}
```

## API Examples

### Basic Usage

```typescript
const ai = new AI({
  adapters: {
    openai: new OpenAIAdapter({ apiKey: "..." }),
  },
  tools: {
    get_weather: { /* ... */ },
    calculate: { /* ... */ },
  },
});

// Use specific tools
await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
  tools: ["get_weather"], // ← Type-safe!
});

// Use multiple tools
await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
  tools: ["get_weather", "calculate"], // ← Both validated!
});

// No tools
await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
  // No tools specified
});
```

### With Streaming

```typescript
const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
  tools: ["get_weather", "calculate"],
});

for await (const chunk of stream) {
  // Handle chunks
}
```

### With HTTP Response

```typescript
import { toStreamResponse } from "@tanstack/ai";

const stream = ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
  tools: ["get_weather", "search_products"],
});

return toStreamResponse(stream);
```

## Real-World Example: api.tanchat.ts

**Before:**
```typescript
const tools: Tool[] = [
  { type: "function", function: { name: "getGuitars", ... }, execute: ... },
  { type: "function", function: { name: "recommendGuitar", ... }, execute: ... },
];

const ai = new AI({ adapters: { /* ... */ } });

ai.chat({
  messages: [...],
  tools, // ← Pass array of Tool objects
});
```

**After:**
```typescript
const tools = {
  getGuitars: {
    type: "function" as const,
    function: { name: "getGuitars", ... },
    execute: async () => { ... },
  },
  recommendGuitar: {
    type: "function" as const,
    function: { name: "recommendGuitar", ... },
    execute: async (args) => { ... },
  },
} as const;

const ai = new AI({
  adapters: { /* ... */ },
  tools, // ← Register once!
});

ai.chat({
  messages: [...],
  tools: ["getGuitars", "recommendGuitar"], // ← Type-safe names!
});
```

## Benefits

### 1. Type Safety
- ✅ Autocomplete for tool names in IDE
- ✅ Compile-time errors for invalid tool names
- ✅ Refactoring support (rename tools safely)

### 2. Better Organization
- ✅ Centralized tool definitions
- ✅ Single source of truth
- ✅ Easy to maintain and update

### 3. Code Reusability
- ✅ Define tools once, use everywhere
- ✅ Share tools across different chat calls
- ✅ No duplication

### 4. Developer Experience
- ✅ Cleaner code (tool names vs full objects)
- ✅ Less typing (just reference by name)
- ✅ Better readability

### 5. Runtime Safety
- ✅ Validation that tools exist
- ✅ Clear error messages
- ✅ No silent failures

## Implementation Details

### Type System

```typescript
// Tool registry type
type ToolRegistry = Record<string, Tool>;

// Extract tool names
type ToolNames<TTools extends ToolRegistry> = keyof TTools & string;

// AI class with tool registry
class AI<T extends AdapterMap, TTools extends ToolRegistry> {
  private tools: TTools;
  
  constructor(config: AIConfig<T, TTools>) {
    this.tools = config.tools || {} as TTools;
  }
  
  private getToolsByNames(names: ReadonlyArray<ToolNames<TTools>>): Tool[] {
    return names.map(name => this.getTool(name));
  }
}
```

### Chat Options

```typescript
type ChatOptionsWithAdapter<TAdapters, TTools> = {
  adapter: keyof TAdapters;
  model: ExtractModels<TAdapters[adapter]>;
  messages: Message[];
  tools?: ReadonlyArray<ToolNames<TTools>>; // ← Tool names, not objects
  // ... other options
};
```

### Internal Resolution

When `chat()` is called:
1. Extract tool names from options
2. Convert tool names to Tool objects using `getToolsByNames()`
3. Pass Tool objects to adapter methods
4. Adapters work with full Tool objects (no changes needed)

## Files Changed

### Core Implementation
- ✅ `packages/ai/src/ai.ts`
  - Added `TTools` generic parameter to `AI` class
  - Added `ToolRegistry` and `ToolNames` types
  - Updated `ChatOptionsWithAdapter` and `ChatOptionsWithFallback`
  - Added `getTool()`, `toolNames`, and `getToolsByNames()` methods
  - Updated `chatPromise()` and `chatStream()` to convert tool names

### Documentation
- ✅ `docs/TOOL_REGISTRY.md` - Comprehensive guide
- ✅ `docs/TOOL_REGISTRY_QUICK_START.md` - Quick reference
- ✅ `examples/tool-registry-example.ts` - Full examples

### Example Updates
- ✅ `examples/ts-chat/src/routes/demo/api.tanchat.ts` - Updated to use tool registry

## Migration Guide

### Step 1: Convert Tool Array to Registry

```typescript
// Before
const tools: Tool[] = [
  { type: "function", function: { name: "tool1", ... } },
  { type: "function", function: { name: "tool2", ... } },
];

// After
const tools = {
  tool1: { type: "function" as const, function: { name: "tool1", ... } },
  tool2: { type: "function" as const, function: { name: "tool2", ... } },
} as const; // ← Important!
```

### Step 2: Register Tools in Constructor

```typescript
// Before
const ai = new AI({ adapters: { /* ... */ } });

// After
const ai = new AI({
  adapters: { /* ... */ },
  tools, // ← Add tools here
});
```

### Step 3: Use Tool Names in Chat Calls

```typescript
// Before
ai.chat({
  messages: [...],
  tools: tools, // ← Full array
});

// After
ai.chat({
  messages: [...],
  tools: ["tool1", "tool2"], // ← Just names!
});
```

## Testing

Verify type safety:
```typescript
const ai = new AI({
  adapters: { /* ... */ },
  tools: {
    get_weather: { /* ... */ },
    calculate: { /* ... */ },
  },
});

// ✅ Should work
ai.chat({ messages: [], tools: ["get_weather"] });

// ❌ Should show TypeScript error
ai.chat({ messages: [], tools: ["invalid_tool"] });
```

## Performance

No performance impact:
- Tool name resolution happens once per chat call
- Minimal overhead (simple object lookup)
- Tool execution unchanged

## Backward Compatibility

**Breaking Change**: This is a breaking change. Users must:
1. Convert tool arrays to registries
2. Register tools in constructor
3. Use tool names instead of objects

However, the migration path is straightforward and provides significant benefits.

## Future Enhancements

Potential improvements:
- Tool namespaces (e.g., `weather.get`, `weather.forecast`)
- Tool permissions/access control
- Tool versioning
- Dynamic tool registration
- Tool composition/chaining

## Summary

The Tool Registry API provides:

✅ **Type-Safe Tool References** - Autocomplete and validation  
✅ **Centralized Management** - Define once, use everywhere  
✅ **Cleaner Code** - Reference by name instead of objects  
✅ **Better Reusability** - Share tools across chats  
✅ **Runtime Validation** - Clear error messages  
✅ **Developer Experience** - Improved DX with less code  

**Result**: More maintainable, type-safe, and developer-friendly tool management! 🎉
