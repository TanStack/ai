---
title: Extend Adapter
id: extend-adapter
order: 8
description: "Extend TanStack AI adapter factories with custom model IDs and fine-tuned models while keeping full type safety for input modalities and provider options."
keywords:
  - tanstack ai
  - extendAdapter
  - custom models
  - fine-tuned models
  - createModel
  - type safety
  - adapter factory
---

The `extendAdapter` utility allows you to extend existing adapter factories (like `openaiText`, `anthropicText`) with custom model names while maintaining full type safety for input modalities and provider options.

## Basic Usage

```typescript
import { createModel, extendAdapter } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// Define your custom models using createModel helper
const myOpenaiModel = createModel('my-fine-tuned-gpt4',['text', 'image']);
const myOpenaiModelButCooler = createModel('my-fine-tuned-gpt5',['text', 'image']);
 

// Create an extended adapter factory - simple API, no type parameters needed
const myOpenai = extendAdapter(openaiText, [
  myOpenaiModel,
  myOpenaiModelButCooler 
])

// Use with original models - full type inference preserved
const gpt5Adapter = myOpenai('gpt-5.5')

// Use with custom models - your custom types are applied
const customAdapter = myOpenai('my-fine-tuned-gpt4')

// Works seamlessly with chat()
import { chat } from '@tanstack/ai'

const stream = chat({
  adapter: myOpenai('my-fine-tuned-gpt4'),
  messages: [{ role: 'user', content: 'Hello!' }]
})
```

## The `createModel` Helper

The `createModel` function provides a clean way to define custom models with full type inference:

```typescript
import { createModel } from '@tanstack/ai'

// Arguments define name and input modalities
const model = createModel(
  'my-model',      // model name (literal type inferred)
  ['text', 'image'] // input modalities (tuple type inferred)
)
```
 
 
## Model Definition Structure

A custom model definition (`ExtendedModelDef`) has the required properties `name`, `input`, and `modelOptions`, plus optional `features` and `tools`. The two `createModel` overloads let you fill these in two ways.

### Defining Input Modalities

The positional form takes a model name and an `input` array specifying which content types your model supports:

```typescript
import { createModel } from '@tanstack/ai'

const models = [
  createModel('text-only-model', ['text']),
  createModel('multimodal-model', ['text', 'image', 'audio']),
] as const
```

Available modalities: `'text'`, `'image'`, `'audio'`, `'video'`, `'document'`

### Capabilities-object form

To attach typed `modelOptions`, declared `features`, or provider `tools` to a custom model, use the second `createModel` overload, which takes a capabilities object as its second argument:

```typescript
import { createModel } from '@tanstack/ai'
import type { OpenAITextProviderOptions } from '@tanstack/ai-openai'

// Type brand for provider options — the value is unused at runtime.
const modelOptions: OpenAITextProviderOptions = {}

const reasoner = createModel('my-reasoner', {
  input: ['text'],
  features: ['reasoning', 'structured_outputs'],
  tools: ['web_search'],
  modelOptions,
})
```

- `input` — supported input modalities (same as the positional form).
- `features` — declared feature flags (e.g. `'reasoning'`, `'structured_outputs'`).
- `tools` — declared provider tools (e.g. `'web_search'`).
- `modelOptions` — a type brand for the provider options accepted by this model; the value is unused at runtime, so declare an empty object typed as the provider options (e.g. `const modelOptions: OpenAITextProviderOptions = {}`).
 
## Preserving Original Factory Behavior

`extendAdapter` fully preserves the original factory's signature, including any configuration parameters:

```typescript
import { createModel, extendAdapter } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const customModels = [createModel('my-fine-tuned-gpt4', ['text', 'image'])] as const

const myOpenai = extendAdapter(openaiText, customModels)

// Config parameter is preserved
const adapter = myOpenai('my-fine-tuned-gpt4', {
  baseURL: 'https://my-proxy.com/v1',
  timeout: 30000
})
```

## Type Safety

The extended adapter provides full type safety:

```typescript ignore
import { extendAdapter, createModel } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const myOpenai = extendAdapter(openaiText, [createModel('custom-model', ['text'])])

// ✅ Original models work with their original types
const a1 = myOpenai('gpt-5.5')

// ✅ Custom models work with your defined types
const a2 = myOpenai('custom-model')

// ❌ Type error: invalid model name
// Note: Type checking works when you assign the result to a variable
const invalid = myOpenai('nonexistent-model') // TypeScript error!
```
 

## Runtime Behavior

At runtime, `extendAdapter` simply passes through to the original factory:

- No validation is performed on custom model names
- The original factory receives exactly what you pass
- This allows the original provider's API to handle the model name

This design is intentional - it allows you to:
- Use fine-tuned model names that the provider accepts but TypeScript doesn't know about
- Proxy requests to different backends that accept custom model identifiers
- Add type safety without runtime overhead

## Check what a model accepts

A user attaches an image, but the selected model only reads text. You want to know that before you send the request. Read `inputModalities` on the text adapter:

```typescript
import { openaiText } from '@tanstack/ai-openai'

const adapter = openaiText('gpt-6.1-sol')

console.log(adapter.inputModalities) // ['image', 'text']

if (!adapter.inputModalities?.includes('image')) {
  console.log('This model cannot read images. Pick another model.')
}
```

- The list comes from the model metadata of the provider package.
- It is `undefined` when the package does not know the model, for example a custom model from `extendAdapter`. Treat `undefined` as "not known", not as "text only".

If you write your own adapter, set `inputModalities` from your model list:

```typescript
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import type { DefaultMessageMetadataByModality, Modality } from '@tanstack/ai'

const INPUT_BY_MODEL: Record<string, ReadonlyArray<Modality>> = {
  'my-vision-model': ['text', 'image'],
  'my-text-model': ['text'],
}

class MyTextAdapter extends BaseTextAdapter<
  string,
  Record<string, never>,
  ReadonlyArray<Modality>,
  DefaultMessageMetadataByModality
> {
  readonly name = 'my-provider'
  override readonly inputModalities = INPUT_BY_MODEL[this.model]

  constructor(model: string) {
    super({}, model)
  }

  async *chatStream() {
    // Call your provider and yield its chunks here.
  }

  structuredOutput() {
    return Promise.resolve({ data: {}, rawText: '{}' })
  }
}

console.log(new MyTextAdapter('my-vision-model').inputModalities) // ['text', 'image']
```

## Example: OpenAI-Compatible Proxy

A common use case is typing models for an OpenAI-compatible proxy:

```typescript
import { extendAdapter, createModel } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// Models available through your proxy
const proxyModels = [
  createModel(
    'llama-3.1-70b',
    ['text']
  ),
  createModel(
    'mixtral-8x7b',
    ['text']
  ),
] as const

const proxyAdapter = extendAdapter(openaiText, proxyModels)

// Use with your proxy's base URL
const adapter = proxyAdapter('llama-3.1-70b', {
  baseURL: 'https://my-llm-proxy.com/v1'
})
```

## Example: Fine-tuned Models

Adding type safety for your fine-tuned models:

```typescript
import { chat, createModel, extendAdapter } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'

const fineTunedModels = [
  createModel(
    'ft:claude-3-opus:my-org:custom-task:abc123',
    ['text', 'image']
  ),
] as const

const myAnthropic = extendAdapter(anthropicText, fineTunedModels)

chat({
  adapter: myAnthropic('ft:claude-3-opus:my-org:custom-task:abc123'),
  messages: [{ role: 'user', content: 'Analyze this...' }]
})
```
