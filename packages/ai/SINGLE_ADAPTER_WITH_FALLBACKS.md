# Single Adapter with Optional Fallbacks

## Overview

The AI class now supports a flexible fallback system where you can specify a primary adapter and model, with optional fallbacks that are only used if the primary fails.

## Three Usage Modes

### Mode 1: Single Adapter Only (No Fallbacks)

Use a single adapter without any fallback handling:

```typescript
const result = await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Mode 2: Single Adapter with Fallbacks (New!)

Try a primary adapter first, and if it fails, fall back to alternatives:

```typescript
const result = await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello!" }],
  // If OpenAI fails, try these in order
  fallbacks: [
    { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
    { adapter: "gemini", model: "gemini-1.5-pro" },
  ],
});
```

### Mode 3: Fallback-Only Mode

Use only the fallback system without a primary adapter:

```typescript
const result = await ai.chat({
  fallbacks: [
    { adapter: "openai", model: "gpt-4" },
    { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
  ],
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Global Fallbacks

You can configure global fallbacks in the constructor that are used by default:

```typescript
const ai = new AI({
  adapters: {
    openai: new OpenAIAdapter({ apiKey: "..." }),
    anthropic: new AnthropicAdapter({ apiKey: "..." }),
  },
  // These fallbacks are used if no fallbacks are provided in method options
  fallbacks: [
    { adapter: "openai", model: "gpt-3.5-turbo" },
    { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
  ],
});

// This will use global fallbacks if primary fails
await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Behavior Details

### Primary + Fallbacks Behavior

When you specify both a primary adapter and fallbacks:

1. **Primary Attempt**: The system tries the primary adapter with the specified model first
2. **Fallback on Error**: If the primary fails, it logs a warning and tries the fallback list
3. **Fallback Priority**: 
   - Fallbacks provided in method options are tried first
   - If no method fallbacks, global constructor fallbacks are used
   - If no fallbacks at all, the error is thrown immediately
4. **Error Aggregation**: If all fallbacks fail, a comprehensive error is thrown showing all failures

### Example with All Methods

This pattern works across all AI methods:

```typescript
// Chat
await ai.chat({ adapter: "openai", model: "gpt-4", fallbacks: [...], ... });

// Chat Stream
for await (const chunk of ai.chatStream({ adapter: "openai", model: "gpt-4", fallbacks: [...], ... })) {
  // ...
}

// Stream Chat
for await (const chunk of ai.streamChat({ adapter: "openai", model: "gpt-4", fallbacks: [...], ... })) {
  // ...
}

// Generate Text
await ai.generateText({ adapter: "openai", model: "gpt-4", fallbacks: [...], ... });

// Generate Text Stream
for await (const text of ai.generateTextStream({ adapter: "openai", model: "gpt-4", fallbacks: [...], ... })) {
  // ...
}

// Summarize
await ai.summarize({ adapter: "openai", model: "gpt-4", fallbacks: [...], ... });

// Embed
await ai.embed({ adapter: "openai", model: "text-embedding-ada-002", fallbacks: [...], ... });
```

## Type Safety

The model field is type-safe based on the selected adapter:

```typescript
// ✓ Valid: gpt-4 is a valid OpenAI model
await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [...],
});

// ✗ Invalid: Type error - claude-3 is not an OpenAI model
await ai.chat({
  adapter: "openai",
  model: "claude-3-5-sonnet-20241022", // Type error!
  messages: [...],
});

// ✓ Valid: Each fallback has correct model for its adapter
await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  fallbacks: [
    { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" }, // ✓
    { adapter: "gemini", model: "gemini-1.5-pro" }, // ✓
  ],
  messages: [...],
});
```

## Migration from Previous API

### Before (fallbackOrder with adapter names only)

```typescript
const ai = new AI({
  adapters: { openai, anthropic },
  fallbackOrder: ["openai", "anthropic"],
});

await ai.chat({
  model: "gpt-4", // Model only, adapter determined by fallbackOrder
  messages: [...],
});
```

### After (fallbacks with adapter + model pairs)

```typescript
const ai = new AI({
  adapters: { openai, anthropic },
  // Global fallbacks with adapter+model pairs
  fallbacks: [
    { adapter: "openai", model: "gpt-4" },
    { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
  ],
});

// Option 1: Use fallback-only mode
await ai.chat({
  fallbacks: [
    { adapter: "openai", model: "gpt-4" },
    { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
  ],
  messages: [...],
});

// Option 2: Use primary + fallbacks
await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  fallbacks: [
    { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
  ],
  messages: [...],
});
```

## Benefits

1. **Explicit Model Selection**: Each fallback explicitly specifies which model to use, preventing model compatibility issues
2. **Flexible Fallback Strategy**: Choose between primary-with-fallbacks or fallback-only mode
3. **Type Safety**: Models are type-checked against their adapter's available models
4. **Graceful Degradation**: Primary adapter failures automatically fall back to alternatives
5. **Global + Local Configuration**: Set global fallbacks in constructor and override per-method as needed
