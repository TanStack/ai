---
title: Per-Model Type Safety
id: per-model-type-safety
order: 5
description: "TanStack AI narrows modelOptions and content types to the model you select. TypeScript rejects an option that the model does not support."
keywords:
  - tanstack ai
  - type safety
  - per-model types
  - modelOptions
  - typescript
  - autocomplete
  - compile-time
---

Provider options are typed from the model you pass to the adapter. An option that model does not support is a type error.

TanStack AI gives `modelOptions` the type of the exact model that you select. Your editor shows only the options that the model has, and TypeScript rejects the others.

## Quick setup

There is nothing to turn on. Pass the model to the adapter factory, then write `modelOptions`:

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// gpt-6.1-sol supports structured outputs, so `text` is allowed.
const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Give me a short answer.' }],
  threadId: 'thread-1',
  modelOptions: {
    text: {
      format: {
        type: 'json_schema',
        name: 'my_schema',
        schema: {
          type: 'object',
          properties: { answer: { type: 'string' } },
          required: ['answer'],
          additionalProperties: false,
        },
      },
    },
  },
})
```

Now pick a model without structured outputs. The same option is a type error:

```typescript ignore
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// gpt-4-turbo does not support structured outputs, so `text` is rejected.
const stream = chat({
  adapter: openaiText('gpt-4-turbo'),
  messages: [{ role: 'user', content: 'Give me a short answer.' }],
  threadId: 'thread-1',
  modelOptions: {
    text: {}, // TypeScript error: 'text' does not exist in type
  },
})
```

TypeScript reports:

```
error TS2353: Object literal may only specify known properties, and 'text' does not exist in type ...'.
```

> [!TIP]
> For structured output, use `chat({ outputSchema })` in most apps. It works with every provider and validates the result. The raw `text` option is for control that is specific to the provider. See [Structured Outputs](../chat/structured-outputs).

## What you get

- Wrong model options fail at compile time, not in production.
- Autocomplete shows only the options of the selected model.
- The types document what each model can do.
- There is no runtime cost. All checks happen at compile time.

## How it works

Each adapter factory keeps the model name as a type parameter: `openaiText<TModel>(model)`. So the adapter knows the exact model at the type level.

`chat()` looks up the options for that model in a map for each model (`ResolveProviderOptions<TModel>`). Each entry lists only the options that the model supports. A model without structured outputs has no `text` property in its options type. TypeScript then rejects `text` as an unknown property.

The same types also work in these places:

- [Typed Pre-Configured Options](./typed-options): keep the options for one model in a reusable object.
- [Extend Adapter](./extend-adapter): attach typed `modelOptions` to your own models.
