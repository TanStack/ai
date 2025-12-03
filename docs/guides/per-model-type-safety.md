---
title: Per-Model Type Safety
id: per-model-type-safety
---

The AI SDK now provides **model-specific type safety** for `providerOptions`. Each model's capabilities (defined in `model-meta.ts`) determine which provider options are allowed, and TypeScript will enforce this at compile time.

## How It Works

### Architecture

1. **Manual Type Map per Adapter**  
   Each adapter (e.g., OpenAI) defines an explicit type map that associates each model name with its allowed provider option fragments:

   ```typescript
   // In ai-openai/src/model-meta.ts
   export type OpenAIChatModelProviderOptionsByName = {
     // Models WITH structured output support (include OpenAIStructuredOutputOptions)
     "gpt-5": OpenAIBaseOptions &
       OpenAIReasoningOptions &
       OpenAIStructuredOutputOptions &
       OpenAIToolsOptions &
       OpenAIStreamingOptions &
       OpenAIMetadataOptions;
     "gpt-4o": OpenAIBaseOptions &
       OpenAIStructuredOutputOptions &
       OpenAIToolsOptions &
       OpenAIStreamingOptions &
       OpenAIMetadataOptions;

     // Models WITHOUT structured output support (exclude OpenAIStructuredOutputOptions)
     "gpt-4-turbo": OpenAIBaseOptions &
       OpenAIToolsOptions &
       OpenAIStreamingOptions &
       OpenAIMetadataOptions;
     "gpt-4": OpenAIBaseOptions &
       OpenAIToolsOptions &
       OpenAIStreamingOptions &
       OpenAIMetadataOptions;
     // ...
   };
   ```

2. **Adapter Integration**  
   The adapter passes this type map as the 5th generic parameter to `BaseAdapter`:

   ```typescript
   class OpenAI extends BaseAdapter<
     typeof OPENAI_CHAT_MODELS,
     typeof OPENAI_EMBEDDING_MODELS,
     OpenAIProviderOptions,
     OpenAIEmbeddingProviderOptions,
     OpenAIChatModelProviderOptionsByName // <-- 5th generic
   > {
     _modelProviderOptionsByName!: OpenAIChatModelProviderOptionsByName; // Type-only property
   }
   ```

3. **Core Type System**  
   The core standalone functions use generic type helpers to extract model-specific options:

   ```typescript
   type ExtractModelSpecificProviderOptions<TAdapter, TModel> =
     TModel extends keyof TAdapter["_modelProviderOptionsByName"]
       ? TAdapter["_modelProviderOptionsByName"][TModel]
       : TAdapter["_modelProviderOptionsByName"][string];
   ```

4. **Function Signatures**  
   The `chat` function is generic in `TModel` and constrains `providerOptions` accordingly:

   ```typescript
   chat<TAdapter extends AIAdapter<any, any, any, any, any>>(
     options: ChatStreamOptionsUnion<TAdapter> & {
       model: ExtractModelsFromAdapter<TAdapter>
     }
   )
   ```

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
    text: {
      // OK - OpenAIStructuredOutputOptions is included for gpt-5
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
error TS2353: Object literal may only specify known properties, and 'text' does not exist in type 'OpenAIBaseOptions & OpenAIToolsOptions & OpenAIStreamingOptions & OpenAIMetadataOptions'.
```

## Adding New Models

When adding a new model to an adapter:

1. **Add model metadata** with capabilities in `model-meta.ts`:

   ```typescript
   export const NEW_MODEL_META = {
     // ... metadata
   } as const satisfies ModelMeta<
     OpenAIBaseOptions & OpenAIStructuredOutputOptions
   >;
   ```

2. **Update the type map** in `OpenAIChatModelProviderOptionsByName`:

   ```typescript
   export type OpenAIChatModelProviderOptionsByName = {
     // ... existing models
     "new-model": OpenAIBaseOptions &
       OpenAIStructuredOutputOptions &
       OpenAIToolsOptions &
       OpenAIStreamingOptions &
       OpenAIMetadataOptions;
   };
   ```

3. **Add to model list**:
   ```typescript
   export const OPENAI_CHAT_MODELS = [
     // ... existing
     "new-model",
   ] as const;
   ```

## Adding New Adapters

To implement per-model typing in a new adapter:

1. **Define provider option fragments**:

   ```typescript
   interface MyProviderBaseOptions {
     /* ... */
   }
   interface MyProviderStructuredOptions {
     /* ... */
   }
   interface MyProviderToolOptions {
     /* ... */
   }
   ```

2. **Create the model type map**:

   ```typescript
   export type MyProviderModelProviderOptionsByName = {
     "model-a": MyProviderBaseOptions & MyProviderStructuredOptions;
     "model-b": MyProviderBaseOptions & MyProviderToolOptions;
     // ...
   };
   ```

3. **Pass as 5th generic to BaseAdapter**:
   ```typescript
   class MyProviderAdapter extends BaseAdapter<
     typeof MY_CHAT_MODELS,
     typeof MY_EMBEDDING_MODELS,
     MyProviderOptions,
     MyProviderEmbeddingOptions,
     MyProviderModelProviderOptionsByName // <-- Type map
   > {
     _modelProviderOptionsByName!: MyProviderModelProviderOptionsByName;
   }
   ```

## Technical Notes

### Why Manual Type Maps?

Initially, we attempted automatic type extraction from `ModelMeta` using conditional types:

```typescript
type OpenAIModelProviderOptions<TModel> =
  OpenAIModelMetaMap[TModel] extends ModelMeta<infer TProviderOptions>
    ? TProviderOptions
    : unknown;
```

This approach failed because TypeScript's `satisfies` operator validates types but doesn't preserve generic type parameters in the resulting value. The value retains its concrete object type, not `ModelMeta<T>`, so the conditional type extraction fails.

**Solution**: Manually define the type map with explicit intersections for each model. This ensures accurate type narrowing and is the recommended approach.

### Type-Only Property

The `_modelProviderOptionsByName` property on adapters is a **type-only** property (definite assignment `!`). It exists purely for TypeScript's type system and is never accessed at runtime. This allows the core standalone functions to extract model-specific types via indexed access without runtime overhead.

## Benefits

- **Compile-time safety**: Catch incorrect provider options before deployment
- **Better IDE experience**: Autocomplete shows only valid options for each model
- **Self-documenting**: Model capabilities are explicit in the type system
- **Zero runtime overhead**: All type checking happens at compile time
