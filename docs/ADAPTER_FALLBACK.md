# Adapter Fallback System

The AI SDK includes a powerful automatic fallback system that allows you to specify multiple adapters in priority order. If one adapter fails due to rate limits, service outages, or errors, the SDK automatically tries the next adapter in the list.

## Features

- ✅ **Type-safe adapter ordering** - TypeScript validates adapter names
- ✅ **Global fallback configuration** - Set default order in constructor
- ✅ **Per-request override** - Customize adapter order for specific calls
- ✅ **Automatic retry** - Seamlessly switches to next adapter on failure
- ✅ **Detailed error reporting** - See which adapters failed and why
- ✅ **Works with all methods** - chat, stream, generate, summarize, embed

## Basic Usage

### Global Fallback Order

Configure a default fallback order in the constructor:

```typescript
const ai = new AI({
  adapters: {
    primary: new OpenAIAdapter({ apiKey: "..." }),
    backup: new AnthropicAdapter({ apiKey: "..." }),
    local: new OllamaAdapter(),
  },
  fallbackOrder: ["primary", "backup", "local"], // Try in this order
});

// Use global fallback order
const result = await ai.chat({
  adapters: [], // Empty = use global fallbackOrder
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Per-Request Fallback Order

Override the global order for specific requests:

```typescript
// Try local first, then cloud (for privacy or cost savings)
const result = await ai.chat({
  adapters: ["local", "primary", "backup"], // Custom order for this request
  model: "llama3",
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Single Adapter Mode

Use a specific adapter without fallback:

```typescript
// No fallback - if this fails, error is thrown
const result = await ai.chat({
  adapter: "primary", // Single adapter
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Configuration

### Constructor Options

```typescript
interface AIConfig<T extends AdapterMap> {
  adapters: T; // Required: Map of adapter names to adapter instances
  fallbackOrder?: ReadonlyArray<keyof T & string>; // Optional: Default fallback order
}
```

### Method Options

All methods support two modes:

**Single Adapter Mode:**
```typescript
{
  adapter: "adapter-name",  // Type-safe: must be a valid adapter name
  model: "...",             // Type-safe: must be valid for the adapter
  // ... other options
}
```

**Fallback Mode:**
```typescript
{
  adapters: ["first", "second", "third"], // Type-safe array of adapter names
  model: "...",                            // Must work with at least one adapter
  // ... other options
}
```

## Use Cases

### 1. Rate Limit Protection

```typescript
const ai = new AI({
  adapters: {
    openai: new OpenAIAdapter({ apiKey: "..." }),
    anthropic: new AnthropicAdapter({ apiKey: "..." }),
  },
  fallbackOrder: ["openai", "anthropic"],
});

// If OpenAI hits rate limit, automatically uses Anthropic
const result = await ai.chat({
  adapters: [],
  model: "gpt-4", // Will use OpenAI if available
  messages: [{ role: "user", content: "Hello!" }],
});
```

### 2. Cost Optimization

```typescript
const ai = new AI({
  adapters: {
    local: new OllamaAdapter(), // Free local model
    cloud: new OpenAIAdapter({ apiKey: "..." }), // Paid cloud model
  },
  fallbackOrder: ["local", "cloud"], // Try cheap option first
});

// Tries local Ollama first, falls back to OpenAI if needed
const result = await ai.chat({
  adapters: [],
  model: "llama3",
  messages: [{ role: "user", content: "Simple task" }],
});
```

### 3. Service Availability

```typescript
const ai = new AI({
  adapters: {
    primary: new OpenAIAdapter({ apiKey: "..." }),
    backup1: new AnthropicAdapter({ apiKey: "..." }),
    backup2: new GeminiAdapter({ apiKey: "..." }),
  },
  fallbackOrder: ["primary", "backup1", "backup2"],
});

// Ensures your app stays online even if one service is down
const result = await ai.chat({
  adapters: [],
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello!" }],
});
```

### 4. Geographic Failover

```typescript
const ai = new AI({
  adapters: {
    usEast: new OpenAIAdapter({ apiKey: "...", baseURL: "https://us-east.api..." }),
    usWest: new OpenAIAdapter({ apiKey: "...", baseURL: "https://us-west.api..." }),
    eu: new OpenAIAdapter({ apiKey: "...", baseURL: "https://eu.api..." }),
  },
  fallbackOrder: ["usEast", "usWest", "eu"],
});
```

### 5. Different Strategies per Operation

```typescript
// For chat: prioritize quality (cloud first)
await ai.chat({
  adapters: ["openai", "anthropic", "local"],
  model: "gpt-4",
  messages: [userMessage],
});

// For embeddings: prioritize speed (local first)
await ai.embed({
  adapters: ["local", "openai"], // Local is faster
  model: "nomic-embed-text",
  input: "Text to embed",
});
```

## Error Handling

### Automatic Retry

The SDK automatically tries each adapter in order:

```typescript
const ai = new AI({
  adapters: {
    first: new OpenAIAdapter({ apiKey: "..." }),
    second: new AnthropicAdapter({ apiKey: "..." }),
    third: new OllamaAdapter(),
  },
  fallbackOrder: ["first", "second", "third"],
});

try {
  const result = await ai.chat({
    adapters: [],
    model: "gpt-4",
    messages: [{ role: "user", content: "Hello!" }],
  });
  // Success with one of the adapters
} catch (error) {
  // All three adapters failed
}
```

### Detailed Error Information

When all adapters fail, you get detailed information about each failure:

```typescript
try {
  await ai.chat({
    adapters: ["first", "second"],
    model: "invalid-model",
    messages: [],
  });
} catch (error) {
  console.error(error.message);
  // Output:
  // All adapters failed for chat:
  //   - first: Rate limit exceeded (429)
  //   - second: Service temporarily unavailable (503)
}
```

### Console Warnings

During fallback, warnings are logged for debugging:

```typescript
// Console output:
// [AI] Adapter "primary" failed for chat: Rate limit exceeded
// [AI] Adapter "backup" failed for chat: Service unavailable
// (Then either succeeds with next adapter or throws final error)
```

## Type Safety

### Adapter Names are Type-Checked

```typescript
const ai = new AI({
  adapters: {
    openai: new OpenAIAdapter({ apiKey: "..." }),
    anthropic: new AnthropicAdapter({ apiKey: "..." }),
  },
  fallbackOrder: ["openai", "anthropic"], // ✅ Valid
  // fallbackOrder: ["gpt", "claude"], // ❌ TypeScript Error
});

// ✅ Valid adapter names
await ai.chat({
  adapters: ["openai", "anthropic"],
  model: "gpt-4",
  messages: [],
});

// ❌ TypeScript Error - invalid adapter names
// await ai.chat({
//   adapters: ["openai-gpt4", "claude"],
//   model: "gpt-4",
//   messages: [],
// });
```

### Model Compatibility

When using fallback mode, the model must be compatible with at least one adapter:

```typescript
// ✅ gpt-4 is valid for OpenAI
await ai.chat({
  adapters: ["openai", "anthropic"],
  model: "gpt-4", // Works with OpenAI
  messages: [],
});

// ⚠️ Note: In fallback mode, TypeScript allows any model from any adapter
// Runtime will fail if no adapter supports the model
```

## Best Practices

### 1. Configure Global Fallback Order

Set a sensible default in the constructor:

```typescript
const ai = new AI({
  adapters: { /* ... */ },
  fallbackOrder: ["primary", "secondary", "tertiary"], // Good default
});
```

### 2. Use Compatible Models

When using fallback, ensure the model works with at least one adapter in your list:

```typescript
// ❌ Bad - gpt-4 doesn't work with Anthropic or Ollama
await ai.chat({
  adapters: ["anthropic", "ollama"],
  model: "gpt-4", // Will fail on both adapters
  messages: [],
});

// ✅ Good - choose compatible models per adapter
const modelMap = {
  openai: "gpt-4",
  anthropic: "claude-3-5-sonnet-20241022",
  ollama: "llama3",
};
```

### 3. Order by Priority

Put your preferred adapter first:

```typescript
// Quality first
fallbackOrder: ["openai", "anthropic", "local"]

// Cost first
fallbackOrder: ["local", "openai", "anthropic"]

// Speed first
fallbackOrder: ["local", "openai", "anthropic"]
```

### 4. Handle Errors Gracefully

```typescript
try {
  const result = await ai.chat({
    adapters: ["primary", "backup"],
    model: "gpt-4",
    messages: [userMessage],
  });
  return result;
} catch (error) {
  // All adapters failed - provide user-friendly error
  return { error: "Service temporarily unavailable. Please try again later." };
}
```

### 5. Log Adapter Usage

Track which adapters are being used:

```typescript
const result = await ai.chat({
  adapters: ["primary", "backup"],
  model: "gpt-4",
  messages: [userMessage],
});

// Log successful adapter for monitoring
console.log("Request completed successfully");
```

## Limitations

### Model Compatibility

In fallback mode, TypeScript can't enforce that the model works with all adapters:

```typescript
// TypeScript allows this, but it will fail at runtime
await ai.chat({
  adapters: ["anthropic"], // Claude models only
  model: "gpt-4", // OpenAI model - will fail!
  messages: [],
});
```

**Solution**: Use single-adapter mode for strict type safety, or carefully choose compatible models.

### Streaming Edge Cases

When streaming fails midway, the SDK can't retry with another adapter (stream already started):

```typescript
// If stream fails after yielding chunks, error is thrown
for await (const chunk of ai.streamChat({
  adapters: ["primary", "backup"],
  model: "gpt-4",
  messages: [],
})) {
  // If this fails after first chunk, backup won't be tried
}
```

**Solution**: Fallback only applies before streaming starts.

## Examples

See `/examples/adapter-fallback-demo.ts` for comprehensive examples including:

- Global vs per-request fallback
- Rate limit handling
- Cost optimization
- Service availability
- Error handling
- Type safety demonstrations

## API Reference

### AIConfig

```typescript
interface AIConfig<T extends AdapterMap> {
  adapters: T;
  fallbackOrder?: ReadonlyArray<keyof T & string>;
}
```

### Method Options

All methods accept either:

```typescript
// Single adapter mode
{
  adapter: keyof T & string;
  model: ExtractModels<T[adapter]>;
  // ... method-specific options
}

// Fallback mode
{
  adapters: ReadonlyArray<keyof T & string>;
  model: UnionOfModels<T>;
  // ... method-specific options
}
```

## Migration Guide

### From Single Adapter

Before:
```typescript
const ai = new AI({
  adapters: { openai: new OpenAIAdapter({ apiKey: "..." }) }
});

await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [],
});
```

After (with fallback):
```typescript
const ai = new AI({
  adapters: {
    openai: new OpenAIAdapter({ apiKey: "..." }),
    anthropic: new AnthropicAdapter({ apiKey: "..." }),
  },
  fallbackOrder: ["openai", "anthropic"],
});

await ai.chat({
  adapters: [], // Use fallback
  model: "gpt-4",
  messages: [],
});
```

## See Also

- [Type Safety Guide](./TYPE_SAFETY.md) - Model validation per adapter
- [Examples](../examples/) - Working code examples
- [API Documentation](../README.md) - Full API reference
