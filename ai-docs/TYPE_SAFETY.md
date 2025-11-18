# Type-Safe Multi-Adapter AI API

This package provides complete TypeScript type safety for working with multiple AI providers, ensuring that you can only use models that are supported by each adapter.

## Features

- ✅ **Adapter-specific model validation** - TypeScript prevents using GPT models with Anthropic and vice versa
- ✅ **Full autocomplete support** - Your IDE suggests only valid models for the selected adapter
- ✅ **Compile-time safety** - Catch model incompatibilities before runtime
- ✅ **Multi-adapter support** - Use multiple AI providers in a single application
- ✅ **Type inference** - Model types are automatically inferred from adapter configuration

## Installation

```bash
npm install @tanstack/ai @tanstack/ai-openai @tanstack/ai-anthropic
```

## Basic Usage

### Creating an AI instance with multiple adapters

```typescript
import { AI } from "@tanstack/ai";
import { OpenAIAdapter } from "@tanstack/ai-openai";
import { AnthropicAdapter } from "@tanstack/ai-anthropic";

const ai = new AI({
  adapters: {
    "openai": new OpenAIAdapter({
      apiKey: process.env.OPENAI_API_KEY!,
    }),
    "anthropic": new AnthropicAdapter({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    }),
  },
});
```

### Type-safe model selection

```typescript
// ✅ VALID - OpenAI with GPT model
await ai.chat({
  adapter: "openai",
  model: "gpt-4", // TypeScript knows this is valid
  messages: [{ role: "user", content: "Hello!" }],
});

// ✅ VALID - Anthropic with Claude model
await ai.chat({
  adapter: "anthropic",
  model: "claude-3-5-sonnet-20241022", // TypeScript knows this is valid
  messages: [{ role: "user", content: "Hello!" }],
});

// ❌ COMPILE ERROR - Wrong model for adapter
await ai.chat({
  adapter: "anthropic",
  model: "gpt-4", // TypeScript error: "gpt-4" not valid for Anthropic!
  messages: [{ role: "user", content: "Hello!" }],
});

// ❌ COMPILE ERROR - Wrong model for adapter
await ai.chat({
  adapter: "openai",
  model: "claude-3-5-sonnet-20241022", // TypeScript error: Claude not valid for OpenAI!
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Available Models

### OpenAI Models

```typescript
type OpenAIModel =
  | "gpt-4"
  | "gpt-4-turbo"
  | "gpt-4-turbo-preview"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-3.5-turbo"
  | "gpt-3.5-turbo-16k"
  | "gpt-3.5-turbo-instruct"
  | "text-embedding-ada-002"
  | "text-embedding-3-small"
  | "text-embedding-3-large";
```

### Anthropic Models

```typescript
type AnthropicModel =
  | "claude-3-5-sonnet-20241022"
  | "claude-3-5-sonnet-20240620"
  | "claude-3-opus-20240229"
  | "claude-3-sonnet-20240229"
  | "claude-3-haiku-20240307"
  | "claude-2.1"
  | "claude-2.0"
  | "claude-instant-1.2";
```

## API Methods

All methods support the same type-safe adapter and model selection:

### Chat Completion

```typescript
const result = await ai.chat({
  adapter: "openai",
  model: "gpt-4",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "What is TypeScript?" },
  ],
  temperature: 0.7,
  maxTokens: 500,
});
```

### Streaming Chat

```typescript
for await (const chunk of ai.streamChat({
  adapter: "anthropic",
  model: "claude-3-5-sonnet-20241022",
  messages: [{ role: "user", content: "Count from 1 to 5" }],
})) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.delta);
  }
}
```

### Text Generation

```typescript
const result = await ai.generateText({
  adapter: "openai",
  model: "gpt-3.5-turbo-instruct",
  prompt: "Write a haiku about TypeScript",
  maxTokens: 100,
});
```

### Summarization

```typescript
const result = await ai.summarize({
  adapter: "anthropic",
  model: "claude-3-haiku-20240307",
  text: "Long text to summarize...",
  style: "bullet-points",
  maxLength: 200,
});
```

### Embeddings

```typescript
const result = await ai.embed({
  adapter: "openai",
  model: "text-embedding-3-small",
  input: "Text to embed",
});
```

## Advanced Features

### Dynamic Adapter Addition

```typescript
const aiWithGemini = ai.addAdapter(
  "gemini",
  new GeminiAdapter({ apiKey: "..." })
);

// Now "gemini" is available with full type safety
await aiWithGemini.chat({
  adapter: "gemini",
  model: "gemini-pro", // Types updated automatically
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Getting Available Adapters

```typescript
console.log(ai.adapterNames); // ["openai", "anthropic"]
```

### Direct Adapter Access

```typescript
const openai = ai.getAdapter("openai");
console.log(openai.models); // Array of OpenAI models
```

## Benefits

### 1. Compile-Time Safety

**Before:**
```typescript
// Runtime error when deployed
await ai.chat({
  provider: "anthropic",
  model: "gpt-4", // Oops! Wrong model
});
// Error: Model 'gpt-4' not found for provider 'anthropic'
```

**After:**
```typescript
// Compile-time error in your editor
await ai.chat({
  adapter: "anthropic",
  model: "gpt-4", // TypeScript error immediately
});
// Error: Type '"gpt-4"' is not assignable to type 'claude-...'
```

### 2. IDE Autocomplete

When you type `model:`, your IDE will show you **only** the models available for the selected adapter:

- Select `openai` → See GPT models
- Select `anthropic` → See Claude models

### 3. Refactoring Safety

If you switch adapters, TypeScript will immediately flag any incompatible models:

```typescript
// Change from OpenAI to Anthropic
await ai.chat({
  adapter: "anthropic", // Changed this
  model: "gpt-4", // TypeScript immediately flags this as an error
  messages: [],
});
```

### 4. Self-Documenting Code

The types serve as documentation - you can see all available models without checking docs:

```typescript
// Hover over "model" to see all valid options
ai.chat({ adapter: "openai", model: /* hover here */ });
```

## Creating Custom Adapters

To create a custom adapter with type safety:

```typescript
import { BaseAdapter } from "@tanstack/ai";

const MY_MODELS = ["my-model-1", "my-model-2", "my-model-3"] as const;

export class MyAdapter extends BaseAdapter<typeof MY_MODELS> {
  name = "my-adapter";
  models = MY_MODELS;

  // Implement required methods...
}
```

Then use it with full type safety:

```typescript
const ai = new AI({
  adapters: {
    "my-adapter": new MyAdapter({ apiKey: "..." }),
  },
});

// TypeScript now knows about "my-model-1", "my-model-2", etc.
await ai.chat({
  adapter: "my-adapter",
  model: "my-model-1", // Autocomplete works!
  messages: [],
});
```

## Examples

See the `/examples` directory for complete working examples:

- `model-safety-demo.ts` - Comprehensive demonstration of type safety
- `type-safety-demo.ts` - Quick reference showing valid and invalid usage
- `multi-adapter-example.ts` - Real-world multi-adapter usage

## TypeScript Configuration

This package requires TypeScript 4.5 or higher for full type inference support.

## License

MIT
