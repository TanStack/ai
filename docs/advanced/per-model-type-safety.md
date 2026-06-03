---
title: Per-Model Type Safety
id: per-model-type-safety
order: 5
description: "TanStack AI narrows modelOptions and content types to the specific model you select, enforcing capabilities at compile time."
keywords:
  - tanstack ai
  - type safety
  - per-model types
  - modelOptions
  - typescript
  - autocomplete
  - compile-time
---

The AI SDK provides **model-specific type safety** for `modelOptions`. Each model's capabilities determine which model options are allowed, and TypeScript will enforce this at compile time.

> **Tip:** For structured outputs, most users should prefer the first-class `chat({ outputSchema })` option over the raw provider `text` option shown below — it works across providers and validates the result for you. The raw `text` option is for when you need provider-specific control.

## How It Works

Each adapter factory captures the model literal as a type parameter — `openaiText<TModel>(model)` — so the adapter carries the exact model you selected at the type level.

The `modelOptions` you pass are then resolved against a per-model map (`ResolveProviderOptions<TModel>`). Each model's entry declares only the options that model actually supports. A model without a structured-output capability simply has no `text` property in its resolved options type, so TypeScript's excess-property checking rejects `text` for that model — at compile time, with zero runtime cost.

This is the same mechanism described in [Typed Pre-Configured Options](./typed-options) (which captures these resolved options in a reusable object) and [Extend Adapter](./extend-adapter) (which lets you attach the same typed `modelOptions` to custom models).

## Usage Examples

### ✅ Correct Usage

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

// ✅ gpt-5 supports structured outputs - `text` is allowed
const validCall = chat({
  adapter: openaiText("gpt-5"),
  messages: [],
  modelOptions: {
    // OK - text is included for gpt-5
    text: {
      format: {
        type: "json_schema",
        name: "my_schema",
        schema: {
          /* JSON Schema object */
        },
      },
    },
  },
});
```

### ❌ Incorrect Usage

```typescript
// ❌ gpt-4-turbo does NOT support structured outputs - `text` is rejected
const invalidCall = chat({
  adapter: openaiText("gpt-4-turbo"),
  messages: [],
  modelOptions: {
    text: {}, // ❌ TypeScript error: 'text' does not exist in type
  },
});
```

TypeScript will produce:

```
error TS2353: Object literal may only specify known properties, and 'text' does not exist in type ...'.
```
 
## Benefits

- **Compile-time safety**: Catch incorrect model options before deployment
- **Better IDE experience**: Autocomplete shows only valid options for each model
- **Self-documenting**: Model capabilities are explicit in the type system
- **Zero runtime overhead**: All type checking happens at compile time
