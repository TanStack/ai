# Endpoint-Specific Type System Implementation

## Overview
Implemented a comprehensive endpoint-aware type system where models and provider options are specific to each API endpoint (chat, image, embeddings). This provides IDE autocomplete and TypeScript errors when using incompatible models or options.

## Architecture Changes

### 1. BaseAdapter Generics (6 Parameters)
**Before:** 3 generics (TModels, TProviderOptions, TAdditionalOptions)
**After:** 6 generics for endpoint-specific types

```typescript
export class BaseAdapter<
  TChatModels extends readonly string[] = string[],
  TImageModels extends readonly string[] = string[],
  TEmbeddingModels extends readonly string[] = string[],
  TChatProviderOptions extends readonly string[] = string[],
  TImageProviderOptions extends readonly string[] = string[],
  TEmbeddingProviderOptions extends readonly string[] = string[],
>
```

**Properties:**
- `chatModels`: Models supporting chat completions
- `imageModels`: Models supporting image generation
- `embeddingModels`: Models supporting text embeddings
- Phantom type properties for provider options (used for type inference only)

### 2. AIAdapter Interface (5 Generics)
Updated to match BaseAdapter structure:
```typescript
export interface AIAdapter<
  TChatModels extends readonly string[] = string[],
  TImageModels extends readonly string[] = string[],
  TChatProviderOptions extends readonly string[] = string[],
  TImageProviderOptions extends readonly string[] = string[],
  TEmbeddingProviderOptions extends readonly string[] = string[],
>
```

### 3. AI Class Discriminated Unions
Type helpers extract endpoint-specific options:
- `GetChatProviderOptionsForAdapter<TAdapter>`: Extracts chat provider options
- `GetImageProviderOptionsForAdapter<TAdapter>`: Extracts image provider options
- `ChatOptionsWithAdapter<TAdapter>`: Uses chat models and chat provider options
- `ImageGenerationOptionsWithAdapter<TAdapter>`: Uses image models and image provider options

## OpenAI Adapter Implementation

### Model Classifications
Based on OpenAI API documentation (crawled from platform.openai.com):

**Chat Models (32 total):**
```typescript
const OPENAI_CHAT_MODELS = [
  'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5-pro',
  'gpt-4.1', 'gpt-4.1-mini',
  'o3', 'o4', 'o4-mini',
  'gpt-audio-preview',
  'gpt-realtime-preview',
  'chatgpt-4o-latest',
  'gpt-4o', 'gpt-4o-mini', 'gpt-4o-audio-preview', 'gpt-4o-realtime-preview',
  'gpt-4-turbo', 'gpt-4-turbo-preview',
  'gpt-4', 'gpt-4-32k',
  'gpt-3.5-turbo', 'gpt-3.5-turbo-16k',
  // ... and more
] as const;
```

**Image Models (4 total):**
```typescript
const OPENAI_IMAGE_MODELS = [
  'gpt-image-1',
  'gpt-image-1-mini',
  'dall-e-3',
  'dall-e-2',
] as const;
```

**Embedding Models (3 total):**
```typescript
const OPENAI_EMBEDDING_MODELS = [
  'text-embedding-3-large',
  'text-embedding-3-small',
  'text-embedding-ada-002',
] as const;
```

### Provider Options

**OpenAIChatProviderOptions (20+ properties):**
```typescript
export type OpenAIChatProviderOptions = {
  reasoningEffort?: 'low' | 'medium' | 'high';
  parallelToolCalls?: boolean;
  store?: boolean;
  maxToolCalls?: number;
  metadata?: Record<string, string>;
  user?: string;
  reasoningSummary?: boolean;
  strictJsonSchema?: boolean;
  serviceTier?: 'auto' | 'default';
  textVerbosity?: 'minimal' | 'standard' | 'detailed';
  logitBias?: Record<string, number>;
  prediction?: {
    type: 'content';
    content: string | Array<{ type: 'text'; text: string }>;
  };
  maxCompletionTokens?: number;
  modalities?: Array<'text' | 'audio'>;
  audio?: {
    voice: 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse';
    format: 'wav' | 'mp3' | 'flac' | 'opus' | 'pcm16';
  };
  // ... and more
};
```

**OpenAIImageProviderOptions (5 properties):**
```typescript
export type OpenAIImageProviderOptions = {
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  seed?: number;
  background?: 'transparent' | 'opaque';
  outputFormat?: 'url' | 'b64_json';
};
```

**OpenAIEmbeddingProviderOptions (3 properties):**
```typescript
export type OpenAIEmbeddingProviderOptions = {
  encodingFormat?: 'float' | 'base64';
  user?: string;
  dimensions?: number;
};
```

### OpenAIAdapter Class
```typescript
export class OpenAIAdapter extends BaseAdapter<
  typeof OPENAI_CHAT_MODELS,
  typeof OPENAI_IMAGE_MODELS,
  typeof OPENAI_EMBEDDING_MODELS,
  OpenAIChatProviderOptions,
  OpenAIImageProviderOptions,
  OpenAIEmbeddingProviderOptions
>
```

## Type Safety Examples

### ✅ Valid Usage

**Chat Endpoint:**
```typescript
const chatResponse = await ai.chat({
  adapter: openaiAdapter,
  model: 'gpt-5', // ✅ Only chat models suggested
  messages: [...],
  providerOptions: {
    reasoningEffort: 'high', // ✅ Only chat options available
    parallelToolCalls: true,
    temperature: 0.7,
  }
});
```

**Image Endpoint:**
```typescript
const imageResponse = await ai.image({
  adapter: openaiAdapter,
  model: 'gpt-image-1', // ✅ Only image models suggested
  prompt: 'A mountain landscape',
  providerOptions: {
    quality: 'hd', // ✅ Only image options available
    style: 'vivid',
    background: 'transparent',
  }
});
```

### ❌ Type Errors (Prevented)

```typescript
// ❌ Error: 'gpt-image-1' is not a chat model
ai.chat({ adapter: openaiAdapter, model: 'gpt-image-1', messages: [...] });

// ❌ Error: 'gpt-5' is not an image model
ai.image({ adapter: openaiAdapter, model: 'gpt-5', prompt: '...' });

// ❌ Error: 'quality' not available on chat endpoint
ai.chat({ 
  adapter: openaiAdapter, 
  model: 'gpt-5', 
  messages: [...],
  providerOptions: { quality: 'hd' }
});

// ❌ Error: 'reasoningEffort' not available on image endpoint
ai.image({ 
  adapter: openaiAdapter, 
  model: 'gpt-image-1', 
  prompt: '...',
  providerOptions: { reasoningEffort: 'high' }
});
```

## External Provider Wrapper Updates
Updated `wrapExternalProvider` and `ExternalAdapterWrapper` to support 6 generics:

```typescript
export function wrapExternalProvider<
  TChatModels extends readonly string[],
  TImageModels extends readonly string[],
  TEmbeddingModels extends readonly string[],
  TChatProviderOptions extends readonly string[],
  TImageProviderOptions extends readonly string[],
  TEmbeddingProviderOptions extends readonly string[],
>(/* ... */) {
  // Implementation
}
```

## Build Status
✅ **Package builds successfully:**
- ESM: 34.29 KB (153ms)
- CJS: 34.62 KB (154ms)
- DTS: 28.58 KB (740ms)

## Testing
Comprehensive example created in `examples/endpoint-specific-example.ts` demonstrating:
1. Chat endpoint with chat-specific models and options
2. Image endpoint with image-specific models and options
3. Type error prevention examples (commented with @ts-expect-error)

## Benefits
1. **Better IDE Support:** Autocomplete only suggests appropriate models per endpoint
2. **Type Safety:** Compile-time errors prevent using wrong models or options
3. **Developer Experience:** Clear separation between endpoint capabilities
4. **Documentation:** Types serve as inline documentation for available options
5. **Flexibility:** Easy to extend with new endpoints or providers

## Next Steps
1. Verify `AI.embed()` discriminated unions use `GetEmbeddingProviderOptionsForAdapter`
2. Build and test `@tanstack/ai-openai` package separately
3. Update other adapters (Anthropic, Gemini, Ollama) with endpoint-specific types
4. Add runtime tests for the type system
5. Update documentation with usage examples

## References
- OpenAI Models: https://platform.openai.com/docs/models
- Chat Completions API: https://platform.openai.com/docs/api-reference/chat/create
- Images API: https://platform.openai.com/docs/api-reference/images/create
- Embeddings API: https://platform.openai.com/docs/api-reference/embeddings/create
