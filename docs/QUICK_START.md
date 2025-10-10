# Quick Start Guide: Type-Safe Adapters with Fallback

This guide shows how to use both type-safe model validation and automatic adapter fallback together.

## Installation

```bash
npm install @tanstack/ai @tanstack/ai-openai @tanstack/ai-anthropic
```

## Basic Setup

```typescript
import { AI } from "@tanstack/ai";
import { OpenAIAdapter } from "@tanstack/ai-openai";
import { AnthropicAdapter } from "@tanstack/ai-anthropic";

const ai = new AI({
  adapters: {
    openai: new OpenAIAdapter({
      apiKey: process.env.OPENAI_API_KEY!,
    }),
    anthropic: new AnthropicAdapter({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    }),
  },
  fallbackOrder: ["openai", "anthropic"], // Try OpenAI first, then Anthropic
});
```

## Usage Patterns

### Pattern 1: Single Adapter (Strict Type Safety)

```typescript
// ✅ Type-safe: model must be valid for OpenAI
await ai.chat({
  adapter: "openai",
  model: "gpt-4", // ✅ Valid OpenAI model
  messages: [{ role: "user", content: "Hello!" }],
});

// ❌ TypeScript Error: gpt-4 not valid for Anthropic
await ai.chat({
  adapter: "anthropic",
  model: "gpt-4", // ❌ Error!
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Pattern 2: Fallback with Global Order

```typescript
// Uses global fallbackOrder from constructor
await ai.chat({
  adapters: [], // Empty = use global order
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello!" }],
});

// If OpenAI fails (rate limit, error), automatically tries Anthropic
// Note: Anthropic doesn't have gpt-4, so this would ultimately fail
```

### Pattern 3: Fallback with Custom Order

```typescript
// Override global order for this request
await ai.chat({
  adapters: ["anthropic", "openai"], // Try Anthropic first
  model: "claude-3-5-sonnet-20241022",
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Pattern 4: Intelligent Model Selection

```typescript
// Define model mapping per adapter
const getModelForAdapter = (adapter: "openai" | "anthropic") => {
  return adapter === "openai" 
    ? "gpt-4" 
    : "claude-3-5-sonnet-20241022";
};

// Use with single adapter mode for full type safety
const adapter = "openai"; // or "anthropic"
await ai.chat({
  adapter,
  model: getModelForAdapter(adapter),
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Common Scenarios

### Scenario 1: Rate Limit Protection

```typescript
const ai = new AI({
  adapters: {
    primary: new OpenAIAdapter({ apiKey: "..." }),
    backup: new AnthropicAdapter({ apiKey: "..." }),
  },
  fallbackOrder: ["primary", "backup"],
});

// Automatically falls back if primary hits rate limit
const result = await ai.chat({
  adapters: [],
  model: "gpt-4", // Will use primary (OpenAI) if available
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Scenario 2: Cost Optimization

```typescript
const ai = new AI({
  adapters: {
    local: new OllamaAdapter(), // Free
    cloud: new OpenAIAdapter({ apiKey: "..." }), // Paid
  },
  fallbackOrder: ["local", "cloud"],
});

// Try local first (cheap), fall back to cloud (better quality)
const result = await ai.chat({
  adapters: [],
  model: "llama3", // Local model
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Scenario 3: High Availability

```typescript
const ai = new AI({
  adapters: {
    primary: new OpenAIAdapter({ apiKey: "..." }),
    secondary: new AnthropicAdapter({ apiKey: "..." }),
    tertiary: new GeminiAdapter({ apiKey: "..." }),
  },
  fallbackOrder: ["primary", "secondary", "tertiary"],
});

// Ensures your app works even if one service is down
const result = await ai.chat({
  adapters: [],
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Type Safety Features

### ✅ Valid Combinations

```typescript
// Single adapter: model is validated against adapter
await ai.chat({
  adapter: "openai",
  model: "gpt-4", // ✅ Valid for OpenAI
  messages: [],
});

await ai.chat({
  adapter: "anthropic",
  model: "claude-3-5-sonnet-20241022", // ✅ Valid for Anthropic
  messages: [],
});

// Fallback mode: model can be from any adapter
await ai.chat({
  adapters: ["openai", "anthropic"],
  model: "gpt-4", // ✅ Valid (for OpenAI)
  messages: [],
});
```

### ❌ Invalid Combinations

```typescript
// TypeScript prevents these:

// ❌ Wrong model for adapter
await ai.chat({
  adapter: "openai",
  model: "claude-3-5-sonnet-20241022", // ❌ Error: Not an OpenAI model
  messages: [],
});

// ❌ Wrong adapter name
await ai.chat({
  adapter: "gpt4", // ❌ Error: Invalid adapter name
  model: "gpt-4",
  messages: [],
});

// ❌ Wrong model name (typo)
await ai.chat({
  adapter: "openai",
  model: "gpt-5", // ❌ Error: Model doesn't exist
  messages: [],
});
```

## All Methods Support Both Modes

```typescript
// Chat
await ai.chat({ adapter: "openai", model: "gpt-4", messages: [] });
await ai.chat({ adapters: ["openai"], model: "gpt-4", messages: [] });

// Stream
for await (const chunk of ai.streamChat({ adapter: "openai", model: "gpt-4", messages: [] })) { }
for await (const chunk of ai.streamChat({ adapters: ["openai"], model: "gpt-4", messages: [] })) { }

// Generate Text
await ai.generateText({ adapter: "openai", model: "gpt-3.5-turbo-instruct", prompt: "..." });
await ai.generateText({ adapters: ["openai"], model: "gpt-3.5-turbo-instruct", prompt: "..." });

// Summarize
await ai.summarize({ adapter: "anthropic", model: "claude-3-haiku-20240307", text: "..." });
await ai.summarize({ adapters: ["anthropic"], model: "claude-3-haiku-20240307", text: "..." });

// Embeddings
await ai.embed({ adapter: "openai", model: "text-embedding-3-small", input: "..." });
await ai.embed({ adapters: ["openai"], model: "text-embedding-3-small", input: "..." });
```

## Error Handling

### Single Adapter Mode

```typescript
try {
  await ai.chat({
    adapter: "openai",
    model: "gpt-4",
    messages: [],
  });
} catch (error) {
  // OpenAI failed - error thrown immediately
  console.error("OpenAI error:", error);
}
```

### Fallback Mode

```typescript
try {
  await ai.chat({
    adapters: ["openai", "anthropic"],
    model: "gpt-4",
    messages: [],
  });
} catch (error) {
  // Both adapters failed
  console.error("All adapters failed:", error.message);
  // Output: "All adapters failed for chat:\n  - openai: ...\n  - anthropic: ..."
}
```

## Best Practices

### 1. Use Single Adapter Mode for Maximum Type Safety

```typescript
// ✅ Best: TypeScript validates model against adapter
await ai.chat({
  adapter: "openai",
  model: "gpt-4", // Validated against OpenAI models
  messages: [],
});
```

### 2. Use Fallback Mode for Reliability

```typescript
// ✅ Best: Automatic failover on errors
await ai.chat({
  adapters: ["primary", "backup"],
  model: "gpt-4",
  messages: [],
});
```

### 3. Combine with Model Mapping

```typescript
// ✅ Best: Type-safe AND reliable
const adapters = ["openai", "anthropic"] as const;
const modelMap = {
  openai: "gpt-4",
  anthropic: "claude-3-5-sonnet-20241022",
} as const;

for (const adapter of adapters) {
  try {
    const result = await ai.chat({
      adapter,
      model: modelMap[adapter],
      messages: [],
    });
    break; // Success
  } catch (error) {
    console.warn(`${adapter} failed, trying next...`);
  }
}
```

### 4. Configure Global Fallback Order

```typescript
// ✅ Set sensible defaults
const ai = new AI({
  adapters: {
    fast: new OpenAIAdapter({ apiKey: "..." }),
    reliable: new AnthropicAdapter({ apiKey: "..." }),
    local: new OllamaAdapter(),
  },
  fallbackOrder: ["fast", "reliable", "local"], // Good default
});
```

## Quick Reference

| Feature | Syntax | Type Safety | Fallback |
|---------|--------|-------------|----------|
| Single Adapter | `{ adapter: "name", model: "..." }` | ✅ Strict | ❌ No |
| Fallback Mode | `{ adapters: ["a", "b"], model: "..." }` | ⚠️ Loose | ✅ Yes |
| Global Order | `adapters: []` | ⚠️ Loose | ✅ Yes |

## Next Steps

- Read [Type Safety Guide](./TYPE_SAFETY.md) for detailed type safety documentation
- Read [Adapter Fallback Guide](./ADAPTER_FALLBACK.md) for detailed fallback documentation
- See [Examples](../examples/) for working code examples

## Questions?

**Q: Should I use single adapter or fallback mode?**
A: Use single adapter for maximum type safety. Use fallback for reliability.

**Q: Can I mix models from different adapters in fallback mode?**
A: Yes, but ensure at least one adapter supports your model.

**Q: What happens if all adapters fail?**
A: An error is thrown with details about each adapter's failure.

**Q: Can I change the fallback order per request?**
A: Yes! Pass a custom `adapters` array to override the global order.

**Q: Does streaming support fallback?**
A: Yes, but only before streaming starts. Once streaming begins, errors can't be retried.
