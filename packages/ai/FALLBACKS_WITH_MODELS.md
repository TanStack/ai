# Adapter Fallbacks with Model Configuration

## Overview

The AI SDK supports fallback configurations where each fallback specifies **both** the adapter name and the model to use with that adapter. This allows you to:

- Use different models with different adapters in the fallback chain
- Have complete control over which model is used when an adapter fails
- Maintain full TypeScript type safety for model selection per adapter

## API Structure

### Fallback Configuration
```typescript
type AdapterFallback = {
  adapter: string;  // The adapter name
  model: string;    // The model to use with this specific adapter
};
```

### Constructor API
```typescript
const ai = new AI({
  adapters: { /* ... */ },
  fallbacks: [
    { adapter: "openai", model: "gpt-4" },
    { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
  ],
});
```

### Method API
```typescript
ai.chat({
  fallbacks: [
    { adapter: "openai", model: "gpt-4" },
    { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
  ],
  messages: [/* ... */],
});
```

**Key Feature**: The `model` field is type-checked against the specific adapter's available models!

## Usage Examples

### 1. Single Adapter Mode (No Fallback)
```typescript
// Full type safety - model must be valid for the selected adapter
const result = await ai.chat({
  adapter: "openai",
  model: "gpt-4o", // TypeScript ensures this is a valid OpenAI model
  messages: [{ role: "user", content: "Hello" }],
});
```

### 2. Global Fallback Configuration
```typescript
const ai = new AI({
  adapters: {
    openai: new OpenAIAdapter({ apiKey: "..." }),
    anthropic: new AnthropicAdapter({ apiKey: "..." }),
  },
  fallbacks: [
    { adapter: "openai", model: "gpt-4" },
    { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
  ],
});

// Use global fallbacks
const result = await ai.chat({
  fallbacks: [], // Empty array = use global fallbacks
  messages: [{ role: "user", content: "Hello" }],
});
```

### 3. Per-Request Fallback Override
```typescript
// Override global fallbacks for this specific request
const result = await ai.chat({
  fallbacks: [
    { adapter: "anthropic", model: "claude-3-haiku-20240307" }, // Try budget model first
    { adapter: "openai", model: "gpt-3.5-turbo" }, // Fall back to OpenAI
  ],
  messages: [{ role: "user", content: "Quick question" }],
});
```

### 4. Complex Fallback Strategy
```typescript
// Try multiple models across multiple providers
const result = await ai.chat({
  fallbacks: [
    { adapter: "openai", model: "gpt-4o" },           // Try latest/best first
    { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
    { adapter: "openai", model: "gpt-3.5-turbo" },    // Cheap fallback
  ],
  messages: [{ role: "user", content: "Complex task" }],
});
```

### 5. Streaming with Fallbacks
```typescript
for await (const chunk of ai.streamChat({
  fallbacks: [
    { adapter: "openai", model: "gpt-4" },
    { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
  ],
  messages: [{ role: "user", content: "Stream response" }],
})) {
  if (chunk.type === "content" && chunk.delta) {
    process.stdout.write(chunk.delta);
  }
}
```

## Type Safety

### Single Adapter Mode
When using a single adapter, TypeScript enforces that the model is valid for that specific adapter:

```typescript
// ✅ Valid - gpt-4 is an OpenAI model
ai.chat({ adapter: "openai", model: "gpt-4", messages: [...] });

// ❌ TypeScript error - claude-3 is not an OpenAI model
ai.chat({ adapter: "openai", model: "claude-3-5-sonnet-20241022", messages: [...] });
```

### Fallback Mode
When using fallbacks, TypeScript enforces that each model is valid for its corresponding adapter:

```typescript
// ✅ Valid - each model matches its adapter
fallbacks: [
  { adapter: "openai", model: "gpt-4" },
  { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
]

// ❌ TypeScript error - wrong model for adapter
fallbacks: [
  { adapter: "openai", model: "claude-3-5-sonnet-20241022" }, // Error!
]
```

### How It Works
The `AdapterFallback` type uses TypeScript generics to constrain the `model` field based on the `adapter` field:

```typescript
type AdapterFallback<
  TAdapters extends AdapterMap,
  K extends keyof TAdapters & string = keyof TAdapters & string
> = {
  adapter: K;
  model: ExtractModels<TAdapters[K]>;  // Model must be valid for this adapter!
};
```

## All Supported Methods

The fallback configuration works with all AI methods:

- ✅ `chat()` - Standard chat completion
- ✅ `chatStream()` - Legacy streaming (deprecated)
- ✅ `streamChat()` - Structured streaming with tools
- ✅ `generateText()` - Text generation
- ✅ `generateTextStream()` - Streaming text generation
- ✅ `summarize()` - Text summarization
- ✅ `embed()` - Create embeddings

All methods support both:
1. **Single adapter mode**: `{ adapter: "name", model: "model", ... }`
2. **Fallback mode**: `{ fallbacks: [{ adapter, model }, ...], ... }`

## Error Handling

When all fallbacks fail, you get a comprehensive error message:

```typescript
try {
  const result = await ai.chat({
    fallbacks: [
      { adapter: "openai", model: "gpt-4" },
      { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
    ],
    messages: [...],
  });
} catch (error) {
  // Error message shows all failures:
  // "All adapters failed for chat:
  //   - openai (gpt-4): Rate limit exceeded
  //   - anthropic (claude-3-5-sonnet-20241022): Service unavailable"
  console.error(error.message);
}
```

## Best Practices

1. **Use meaningful fallback orders**: Start with your preferred model/adapter, then fall back to alternatives
2. **Mix and match strategically**: Use expensive models first, then cheaper ones
3. **Consider latency**: Put faster models first for better user experience
4. **Global vs per-request**: Use global fallbacks for consistent behavior, override per-request when needed
5. **Single adapter for development**: Use single adapter mode during development for faster debugging
6. **Model compatibility**: Each adapter specifies its own model, so no need to worry about model compatibility across adapters

## Why `adapter` and `model` Together?

**Problem**: Different AI providers have completely different model names:
- OpenAI: `gpt-4`, `gpt-4o`, `gpt-3.5-turbo`
- Anthropic: `claude-3-5-sonnet-20241022`, `claude-3-haiku-20240307`
- Gemini: `gemini-pro`, `gemini-1.5-pro`

**Solution**: By specifying both the adapter and its model in each fallback, you can:
- Use the optimal model for each provider
- Avoid model compatibility issues
- Get full TypeScript type safety per adapter
- Have complete control over your fallback strategy

## See Also

- [Example: Fallbacks with Models](../../examples/fallbacks-with-models-example.ts)
- [Example: Adapter Fallback Demo](../../examples/adapter-fallback-demo.ts)
- [Quick Start Guide](./QUICK_START.md)
