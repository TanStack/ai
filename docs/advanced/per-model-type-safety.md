---
title: Per-Model Type Safety
id: per-model-type-safety
order: 5
description: "modelOptions and content types narrow to the selected model at compile time."
keywords:
  - tanstack ai
  - type safety
  - per-model types
  - modelOptions
  - typescript
  - autocomplete
  - compile-time
---

If you pick a model → only that model's options and modalities type-check. Prefer first-class `chat({ outputSchema })` for structured output; use raw provider `text` only when you need provider-specific control.

## How it works

1. Adapter factory captures the model literal: `openaiText<TModel>(model)`.
2. `modelOptions` resolves via `ResolveProviderOptions<TModel>` — only options that model supports.
3. Excess properties (e.g. `text` on a model without structured output) fail at compile time.

Same mechanism as [Typed Pre-Configured Options](./typed-options) and [Extend Adapter](./extend-adapter).

## Valid

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

// gpt-5 supports structured outputs — `text` allowed
const validCall = chat({
  adapter: openaiText("gpt-5"),
  messages: [],
  modelOptions: {
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

## Invalid

```typescript ignore
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

// gpt-4-turbo does not support structured outputs
const invalidCall = chat({
  adapter: openaiText("gpt-4-turbo"),
  messages: [],
  modelOptions: {
    text: {}, // TS2353: 'text' does not exist
  },
});
```

## What you get

1. Compile-time rejection of invalid options
2. Autocomplete limited to the selected model
3. Zero runtime overhead
