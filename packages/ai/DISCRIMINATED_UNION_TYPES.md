# Discriminated Union Types for Type-Safe Adapter Selection

## Overview

The AI class now uses **discriminated union types** to ensure complete type safety when selecting adapters and models. When you specify an adapter name, TypeScript automatically narrows the available models to only those supported by that adapter.

## How It Works

### Discriminated Union Type Structure

Instead of using a generic parameter, we create a union of all possible adapter-model combinations:

```typescript
type ChatOptionsWithAdapter<TAdapters> = {
  [K in keyof TAdapters]: {
    adapter: K;
    model: ExtractModels<TAdapters[K]>;
    // ... other options
  };
}[keyof TAdapters];
```

This creates a union type like:

```typescript
{
  adapter: "openai";
  model: "gpt-4" | "gpt-3.5-turbo";
} | {
  adapter: "anthropic";
  model: "claude-3-5-sonnet-20241022" | "claude-3-opus-20240229";
} | {
  adapter: "gemini";
  model: "gemini-1.5-pro" | "gemini-1.5-flash";
}
```

## Type Safety Benefits

### 1. Adapter Selection Narrows Model Type

When you type `adapter: "openai"`, TypeScript **automatically** knows that `model` can only be an OpenAI model:

```typescript
await ai.chat({
  adapter: "openai",
  model: "gpt-4", // ✓ Valid - TypeScript autocompletes only OpenAI models
  messages: [{ role: "user", content: "Hello" }],
});

await ai.chat({
  adapter: "anthropic",
  model: "claude-3-5-sonnet-20241022", // ✓ Valid - only Anthropic models shown
  messages: [{ role: "user", content: "Hello" }],
});
```

### 2. Type Errors for Invalid Combinations

TypeScript will show an error if you try to use a model that doesn't belong to the selected adapter:

```typescript
// ✗ Type Error!
await ai.chat({
  adapter: "openai",
  model: "claude-3-5-sonnet-20241022", // Error: claude-3 is not an OpenAI model
  messages: [{ role: "user", content: "Hello" }],
});
```

### 3. Fallbacks Are Also Type-Safe

Each fallback in the array is also a discriminated union, so you get the same type safety:

```typescript
await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  fallbacks: [
    { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" }, // ✓
    { adapter: "gemini", model: "gemini-1.5-pro" }, // ✓
    // { adapter: "anthropic", model: "gpt-4" }, // ✗ Type Error!
  ],
  messages: [{ role: "user", content: "Hello" }],
});
```

## Examples

### Example 1: IDE Autocomplete

When you type `adapter: "openai"` and then start typing `model:`, your IDE will **only** show OpenAI models in autocomplete suggestions. It won't show Anthropic or Gemini models.

```typescript
await ai.chat({
  adapter: "openai",
  model: "gp..." // IDE autocompletes: "gpt-4", "gpt-3.5-turbo", "gpt-4-turbo", etc.
  messages: [...],
});
```

### Example 2: Type Narrowing in Functions

The discriminated union allows TypeScript to narrow types in conditional logic:

```typescript
function handleResult(
  options:
    | { adapter: "openai"; model: "gpt-4" | "gpt-3.5-turbo" }
    | { adapter: "anthropic"; model: "claude-3-5-sonnet-20241022" }
) {
  if (options.adapter === "openai") {
    // TypeScript knows model is "gpt-4" | "gpt-3.5-turbo" here
    const model: "gpt-4" | "gpt-3.5-turbo" = options.model;
  } else {
    // TypeScript knows model is "claude-3-5-sonnet-20241022" here
    const model: "claude-3-5-sonnet-20241022" = options.model;
  }
}
```

### Example 3: All Methods Support This

Every method in the AI class uses discriminated unions:

```typescript
// Chat
await ai.chat({ adapter: "openai", model: "gpt-4", ... });

// Generate Text
await ai.generateText({ adapter: "anthropic", model: "claude-3-5-sonnet-20241022", ... });

// Embeddings
await ai.embed({ adapter: "openai", model: "text-embedding-ada-002", ... });

// Streaming
for await (const chunk of ai.chatStream({ adapter: "gemini", model: "gemini-1.5-pro", ... })) {
  // ...
}
```

## Technical Details

### Type Definition

```typescript
type AdapterFallback<TAdapters extends AdapterMap> = {
  [K in keyof TAdapters & string]: {
    adapter: K;
    model: ExtractModels<TAdapters[K]>;
  };
}[keyof TAdapters & string];
```

This creates a **mapped type** that iterates over all adapter names, creating a separate object type for each adapter with its corresponding models. The indexed access `[keyof TAdapters & string]` creates a **union** of all these object types.

### Model Extraction

```typescript
type ExtractModels<T> = T extends AIAdapter<infer M> ? M[number] : string;
```

This extracts the models array from an adapter and converts it to a union of string literals.

### Benefits Over Generic Parameter Approach

**Before (Generic Parameter):**
```typescript
async chat<K extends keyof T & string>(
  options: ChatOptionsWithAdapter<T, K>
)
```

- Required explicitly passing the adapter name as a generic: `ai.chat<"openai">(...)`
- TypeScript couldn't infer the adapter from the value
- Less ergonomic API

**After (Discriminated Union):**
```typescript
async chat(
  options: ChatOptionsWithAdapter<T>
)
```

- TypeScript automatically narrows based on the `adapter` value
- No need to specify generics
- More ergonomic API with better autocomplete

## Testing Type Safety

You can test that types are working by uncommenting the invalid examples in `examples/type-safety-test.ts`:

```typescript
// This SHOULD show a type error when uncommented:
/*
await ai.chat({
  adapter: "openai",
  model: "claude-3-5-sonnet-20241022", // Type error!
  messages: [{ role: "user", content: "Hello" }],
});
*/
```

## Comparison Table

| Feature | Generic Parameter | Discriminated Union |
|---------|------------------|---------------------|
| Type Safety | ✓ Yes | ✓ Yes |
| Autocomplete | ✓ Yes | ✓✓ Better |
| Type Narrowing | ✗ No | ✓ Yes |
| Explicit Generics | Required | Not needed |
| IDE Experience | Good | Excellent |
| Ergonomics | Good | Excellent |

## Conclusion

The discriminated union approach provides:
1. **Automatic type narrowing** - select adapter, get correct models
2. **Better IDE support** - autocomplete shows only relevant models
3. **No explicit generics** - cleaner, more ergonomic API
4. **Type safety everywhere** - primary adapter, fallbacks, all methods
