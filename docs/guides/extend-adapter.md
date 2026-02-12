# Extending Adapters with Custom Models

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
const gpt4Adapter = myOpenai('gpt-4o')

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

Each custom model definition has three properties:

### Defining Input Modalities

The `input` array specifies which content types your model supports:

```typescript
const models = [
  createModel('text-only-model', ['text']),
  createModel('multimodal-model', ['text', 'image', 'audio']),
] as const
```

Available modalities: `'text'`, `'image'`, `'audio'`, `'video'`, `'document'`
 
## Preserving Original Factory Behavior

`extendAdapter` fully preserves the original factory's signature, including any configuration parameters:

```typescript
import { createModel, extendAdapter } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const myOpenai = extendAdapter(openaiText, customModels)

// Config parameter is preserved
const adapter = myOpenai('my-fine-tuned-gpt4', {
  baseURL: 'https://my-proxy.com/v1',
  timeout: 30000
})
```

## Type Safety

The extended adapter provides full type safety:

```typescript
import { extendAdapter, createModel } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const myOpenai = extendAdapter(openaiText, [createModel('custom-model', ['text'])])

// ✅ Original models work with their original types
const a1 = myOpenai('gpt-4o')

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
import { createModel, extendAdapter } from '@tanstack/ai'
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
