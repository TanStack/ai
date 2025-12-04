---
title: Per-Model Type Safety
id: per-model-type-safety
---

The AI SDK provides **model-specific type safety** for `providerOptions`. Each model's capabilities determine which provider options are allowed, and TypeScript will enforce this at compile time.

## How It Works
 
## Usage Examples

### ✅ Correct Usage

```typescript
import { chat } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

const adapter = openai();

// ✅ gpt-5 supports structured outputs - `text` is allowed
const validCall = chat({
  adapter,
  model: "gpt-5",
  messages: [],
  providerOptions: {
    // OK - text is included for gpt-5
    text: {
      type: "json_schema",
      json_schema: {
        /* ... */
      },
    },
  },
});
```

### ❌ Incorrect Usage

```typescript
// ❌ gpt-4-turbo does NOT support structured outputs - `text` is rejected
const invalidCall = chat({
  adapter: openai(),
  model: "gpt-4-turbo",
  messages: [],
  providerOptions: {
    text: {}, // ❌ TypeScript error: 'text' does not exist in type
  },
});
```

TypeScript will produce:

```
error TS2353: Object literal may only specify known properties, and 'text' does not exist in type ...'.
```
 
## Benefits

- **Compile-time safety**: Catch incorrect provider options before deployment
- **Better IDE experience**: Autocomplete shows only valid options for each model
- **Self-documenting**: Model capabilities are explicit in the type system
- **Zero runtime overhead**: All type checking happens at compile time
