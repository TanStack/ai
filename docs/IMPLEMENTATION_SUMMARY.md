# Implementation Summary: Type-Safe Multi-Adapter with Fallback

## Overview

This implementation adds two major features to the AI SDK:

1. **Type-Safe Model Validation** - Models are validated against the selected adapter at compile-time
2. **Automatic Adapter Fallback** - Automatically tries multiple adapters in order when one fails

## Key Features

### ✅ Type Safety

- Model names are validated based on the selected adapter
- Adapter names are type-checked
- Full IDE autocomplete support
- Compile-time error detection

### ✅ Fallback System

- Global fallback order configuration in constructor
- Per-request fallback order override
- Automatic retry on errors, rate limits, or service outages
- Detailed error reporting from all failed adapters
- Works with all methods (chat, stream, generate, summarize, embed)

## Tool Execution Architecture

The `chat()` method includes an automatic tool execution loop implemented via the `ToolCallManager` class:

```typescript
// In AI.chat() method
const toolCallManager = new ToolCallManager(tools || []);

while (iterationCount < maxIterations) {
  // Stream chunks and accumulate tool calls
  for await (const chunk of adapter.chatStream()) {
    if (chunk.type === "tool_call") {
      toolCallManager.addToolCallChunk(chunk);
    }
  }
  
  // Execute tools if model requested them
  if (shouldExecuteTools && toolCallManager.hasToolCalls()) {
    const toolResults = yield* toolCallManager.executeTools(doneChunk);
    messages = [...messages, ...toolResults];
    continue; // Next iteration
  }
  
  break; // No tools to execute, done
}
```

**ToolCallManager handles:**
- ✅ Accumulating streaming tool call chunks
- ✅ Validating tool calls (ID and name present)
- ✅ Executing tool `execute` functions
- ✅ Yielding `tool_result` chunks
- ✅ Creating tool result messages

## Architecture

### Type System

```typescript
// Adapter map with typed models
type AdapterMap = Record<string, AIAdapter<readonly string[]>>;

// Extract model types from adapter
type ExtractModels<T> = T extends AIAdapter<infer M> ? M[number] : string;

// Single adapter mode: strict model validation
type ChatOptionsWithAdapter<TAdapters, K> = {
  adapter: K;
  model: ExtractModels<TAdapters[K]>; // Models for this adapter only
};

// Fallback mode: union of all models
type ChatOptionsWithFallback<TAdapters> = {
  adapters: ReadonlyArray<keyof TAdapters & string>;
  model: UnionOfModels<TAdapters>; // Models from any adapter
};
```

### Core Components

1. **BaseAdapter** - Abstract class with generic model list
2. **AIAdapter Interface** - Includes `models` property with generic type
3. **AI Class** - Main class with fallback logic and tool execution loop
4. **ToolCallManager** - Handles tool call accumulation, validation, and execution
5. **Adapter Implementations** - OpenAI, Anthropic, Gemini, Ollama with model lists

### Fallback Logic

```typescript
private async tryWithFallback<TResult>(
  adapters: ReadonlyArray<keyof T & string>,
  operation: (adapter: keyof T & string) => Promise<TResult>,
  operationName: string
): Promise<TResult> {
  const errors: Array<{ adapter: string; error: Error }> = [];

  for (const adapterName of adapters) {
    try {
      return await operation(adapterName); // Try operation
    } catch (error: any) {
      errors.push({ adapter: adapterName, error }); // Record error
      console.warn(`[AI] Adapter "${adapterName}" failed for ${operationName}`);
    }
  }

  // All failed - throw comprehensive error
  throw new Error(`All adapters failed for ${operationName}:\n${errorDetails}`);
}
```

## API Design

### Constructor

```typescript
const ai = new AI({
  adapters: {
    primary: new OpenAIAdapter({ apiKey: "..." }),
    secondary: new AnthropicAdapter({ apiKey: "..." }),
  },
  fallbackOrder: ["primary", "secondary"], // Optional global order
});
```

### Single Adapter Mode (Strict Type Safety)

```typescript
await ai.chat({
  adapter: "primary",           // Type-safe: must exist in adapters
  model: "gpt-4",               // Type-safe: must be valid for primary
  messages: [...],
});
```

### Fallback Mode (Automatic Retry)

```typescript
await ai.chat({
  adapters: ["primary", "secondary"], // Type-safe: all must exist
  model: "gpt-4",                     // Must work with at least one adapter
  messages: [...],
});
```

## Files Modified

### Core Package (`packages/ai/src/`)

- **`ai.ts`** - Main AI class with fallback logic
- **`base-adapter.ts`** - Added generic models property
- **`types.ts`** - Added models to AIAdapter interface

### Adapter Packages

- **`packages/ai-openai/src/openai-adapter.ts`** - Added OpenAI model list
- **`packages/ai-anthropic/src/anthropic-adapter.ts`** - Added Anthropic model list
- **`packages/ai-gemini/src/gemini-adapter.ts`** - Added Gemini model list
- **`packages/ai-ollama/src/ollama-adapter.ts`** - Added Ollama model list

### Documentation

- **`docs/TYPE_SAFETY.md`** - Complete type safety guide
- **`docs/ADAPTER_FALLBACK.md`** - Complete fallback guide
- **`docs/QUICK_START.md`** - Quick reference for both features

### Examples

- **`examples/type-safety-demo.ts`** - Type safety examples
- **`examples/visual-error-examples.ts`** - Shows exact TypeScript errors
- **`examples/model-safety-demo.ts`** - Comprehensive type safety examples
- **`examples/adapter-fallback-demo.ts`** - Comprehensive fallback examples
- **`examples/all-adapters-type-safety.ts`** - All adapters together

## Usage Examples

### Example 1: Type Safety Only

```typescript
const ai = new AI({
  adapters: {
    openai: new OpenAIAdapter({ apiKey: "..." }),
  },
});

// ✅ Valid
await ai.chat({ adapter: "openai", model: "gpt-4", messages: [] });

// ❌ TypeScript Error
await ai.chat({ adapter: "openai", model: "claude-3", messages: [] });
```

### Example 2: Fallback Only

```typescript
const ai = new AI({
  adapters: {
    primary: new OpenAIAdapter({ apiKey: "..." }),
    backup: new AnthropicAdapter({ apiKey: "..." }),
  },
  fallbackOrder: ["primary", "backup"],
});

// Automatically tries backup if primary fails
await ai.chat({ adapters: [], model: "gpt-4", messages: [] });
```

### Example 3: Combined Usage

```typescript
const ai = new AI({
  adapters: {
    fast: new OpenAIAdapter({ apiKey: "..." }),
    reliable: new AnthropicAdapter({ apiKey: "..." }),
  },
  fallbackOrder: ["fast", "reliable"],
});

// Single adapter: strict type safety
await ai.chat({ 
  adapter: "fast", 
  model: "gpt-4",  // ✅ Validated against fast adapter
  messages: [] 
});

// Fallback mode: automatic retry
await ai.chat({ 
  adapters: ["fast", "reliable"], 
  model: "gpt-4",  // ⚠️ Less strict, but has fallback
  messages: [] 
});
```

## Benefits

### For Developers

1. **Catch Errors Early** - Model mismatches caught at compile-time, not runtime
2. **Better IDE Experience** - Autocomplete shows only valid models per adapter
3. **Refactoring Safety** - Changing adapters immediately shows model incompatibilities
4. **Self-Documenting** - Types show exactly what's available

### For Applications

1. **Higher Reliability** - Automatic failover on service outages
2. **Rate Limit Protection** - Seamlessly switch to backup on rate limits
3. **Cost Optimization** - Try cheaper options first, fall back to expensive ones
4. **Better Observability** - Detailed error logs from all failed attempts

## Trade-offs

### Type Safety vs Flexibility

- **Single adapter mode**: Maximum type safety, no fallback
- **Fallback mode**: Less strict types, automatic retry

**Recommendation**: Use single adapter mode when possible, fallback mode when reliability is critical.

### Model Compatibility

In fallback mode, TypeScript allows any model from any adapter. This is necessary for flexibility but means you must ensure the model works with at least one adapter in your list.

**Solution**: Define model mappings per adapter for strict control.

## Migration Path

### Existing Code (Single Adapter)

```typescript
// Before
const ai = new AI(new OpenAIAdapter({ apiKey: "..." }));
await ai.chat("gpt-4", messages);

// After (backwards compatible)
const ai = new AI({
  adapters: { openai: new OpenAIAdapter({ apiKey: "..." }) }
});
await ai.chat({ adapter: "openai", model: "gpt-4", messages });
```

### Adding Fallback

```typescript
// Step 1: Add more adapters
const ai = new AI({
  adapters: {
    openai: new OpenAIAdapter({ apiKey: "..." }),
    anthropic: new AnthropicAdapter({ apiKey: "..." }), // New!
  },
});

// Step 2: Use fallback mode
await ai.chat({
  adapters: ["openai", "anthropic"], // Fallback enabled
  model: "gpt-4",
  messages: [],
});

// Step 3: Configure global fallback (optional)
const ai = new AI({
  adapters: { /* ... */ },
  fallbackOrder: ["openai", "anthropic"], // Global default
});

await ai.chat({ adapters: [], model: "gpt-4", messages: [] });
```

## Testing Recommendations

### Test Type Safety

```typescript
// These should NOT compile
ai.chat({ adapter: "openai", model: "claude-3", messages: [] }); // ❌
ai.chat({ adapter: "invalid", model: "gpt-4", messages: [] }); // ❌
ai.chat({ adapter: "openai", model: "gpt-5", messages: [] }); // ❌
```

### Test Fallback Behavior

```typescript
// Mock adapters to simulate failures
const mockAdapter1 = {
  chatCompletion: jest.fn().mockRejectedValue(new Error("Rate limit")),
};
const mockAdapter2 = {
  chatCompletion: jest.fn().mockResolvedValue({ content: "Success" }),
};

const ai = new AI({
  adapters: { first: mockAdapter1, second: mockAdapter2 },
  fallbackOrder: ["first", "second"],
});

// Should try first, fail, then succeed with second
await ai.chat({ adapters: [], model: "gpt-4", messages: [] });

expect(mockAdapter1.chatCompletion).toHaveBeenCalled();
expect(mockAdapter2.chatCompletion).toHaveBeenCalled();
```

### Test ToolCallManager

The `ToolCallManager` class has comprehensive unit tests:

```bash
cd packages/ai
pnpm test
```

Test coverage includes:
- ✅ Accumulating streaming tool call chunks (name, arguments)
- ✅ Filtering incomplete tool calls (missing ID or name)
- ✅ Executing tools with parsed arguments
- ✅ Handling tool execution errors gracefully
- ✅ Handling tools without execute functions
- ✅ Multiple tool calls in one iteration
- ✅ Clearing state between iterations
- ✅ Emitting tool_result chunks
- ✅ Creating tool result messages

See `packages/ai/src/tool-call-manager.test.ts` for implementation.

## Performance Considerations

### Single Adapter Mode

- **No overhead** - Direct call to adapter
- **Fast failure** - Error thrown immediately

### Fallback Mode

- **Sequential retry** - Tries each adapter in order
- **Additional latency** - On failure, waits for timeout before trying next
- **More robust** - Higher chance of success

**Recommendation**: Use single adapter mode for performance-critical paths, fallback mode for user-facing features where reliability matters.

## Future Enhancements

### Possible Additions

1. **Parallel fallback** - Try multiple adapters simultaneously
2. **Smart routing** - Choose adapter based on request characteristics
3. **Caching** - Remember which adapter succeeded for similar requests
4. **Circuit breaker** - Skip known-failing adapters temporarily
5. **Metrics** - Track success rate, latency per adapter
6. **Weighted fallback** - Probabilistic adapter selection

### Extensibility

The system is designed to be extended:

```typescript
// Custom adapter with type-safe models
const MY_MODELS = ["model-1", "model-2"] as const;

class MyAdapter extends BaseAdapter<typeof MY_MODELS> {
  name = "my-adapter";
  models = MY_MODELS;
  // ... implement methods
}

// Use with full type safety
const ai = new AI({
  adapters: { mine: new MyAdapter() },
});

await ai.chat({
  adapter: "mine",
  model: "model-1", // ✅ Type-safe
  messages: [],
});
```

## Conclusion

This implementation provides:

- ✅ **Compile-time safety** for model selection
- ✅ **Runtime reliability** with automatic fallback
- ✅ **Developer experience** improvements (autocomplete, error messages)
- ✅ **Production readiness** (error handling, logging)
- ✅ **Extensibility** for future enhancements

The combination of type safety and fallback makes the SDK both safer and more reliable, suitable for production use cases where uptime and correctness are critical.
