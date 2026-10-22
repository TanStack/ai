---
title: Extend Adapter
id: extend-adapter
order: 8
description: "Add your own model names, such as fine-tuned models or proxy models, to an adapter factory. You keep type checks for input types and provider options."
keywords:
  - tanstack ai
  - extendAdapter
  - custom models
  - fine-tuned models
  - createModel
  - type safety
  - adapter factory
---

`extendAdapter` adds your model ids to an existing text adapter. `openaiText('my-fine-tuned-model')` type-checks after you register that id.

The built-in models keep their types, and your models get the types that you declare.

## Quick setup

### 1. Declare your models

Wrap the factory with `extendAdapter`. Describe each model with `createModel`: the name, then the input types it can read.

```typescript
// lib/ai/my-openai.ts
import { createModel, extendAdapter } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export const myOpenai = extendAdapter(openaiText, [
  createModel('my-fine-tuned-model', ['text', 'image']),
  createModel('my-other-model', ['text']),
])
```

### 2. Use the new factory

Use `myOpenai` where you used `openaiText`:

```typescript
import { chat } from '@tanstack/ai'
import { myOpenai } from './lib/ai/my-openai'

const stream = chat({
  adapter: myOpenai('my-fine-tuned-model'),
  messages: [{ role: 'user', content: 'Hello!' }],
  threadId: 'thread-1',
})

for await (const chunk of stream) {
  console.log(chunk)
}
```

Your model name now autocompletes, and the request goes to the provider with that name.

## Use the built-in models and the factory config

The new factory still takes every model of the original factory. It also takes the same config argument:

```typescript
import { createModel, extendAdapter } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const myOpenai = extendAdapter(openaiText, [
  createModel('my-fine-tuned-model', ['text', 'image']),
])

// A built-in model, with its normal types
const builtIn = myOpenai('gpt-6.1-sol')

// Your model, with a config for the client
const custom = myOpenai('my-fine-tuned-model', {
  baseURL: 'https://my-proxy.com/v1',
  timeout: 30000,
})
```

## Example: an OpenAI-compatible proxy

Give types to the models that your proxy serves:

```typescript
import { createModel, extendAdapter } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const proxyAdapter = extendAdapter(openaiText, [
  createModel('llama-3.1-70b', ['text']),
  createModel('mixtral-8x7b', ['text']),
])

const adapter = proxyAdapter('llama-3.1-70b', {
  baseURL: 'https://my-llm-proxy.com/v1',
})
```

## Example: a fine-tuned model on Anthropic

`extendAdapter` works with every adapter factory, for example `anthropicText`:

```typescript
import { chat, createModel, extendAdapter } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'

const myAnthropic = extendAdapter(anthropicText, [
  createModel('ft:claude-3-opus:my-org:custom-task:abc123', ['text', 'image']),
])

const stream = chat({
  adapter: myAnthropic('ft:claude-3-opus:my-org:custom-task:abc123'),
  messages: [{ role: 'user', content: 'Analyze this text.' }],
  threadId: 'thread-1',
})
```

## How it works

`extendAdapter` changes only the types. At runtime, it returns the original factory.

- The library does not check your model names. The factory gets exactly what you pass.
- The API of the provider decides if the model name is valid.
- There is no runtime cost.
- A custom model has no reasoning data, so `chat()` does not take a `reasoning` option for it.

## Check what a model accepts

A user attaches an image, but the selected model reads only text. You want to know that before you send the request. Read `inputModalities` on the text adapter:

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

Do you write your own adapter? See [Set inputModalities in your own adapter](./extend-adapter-advanced#set-inputmodalities-in-your-own-adapter).

## Advanced

### Input types

The second argument of the positional form lists the input types of the model:

```typescript
import { createModel } from '@tanstack/ai'

const models = [
  createModel('text-only-model', ['text']),
  createModel('multimodal-model', ['text', 'image', 'audio']),
] as const
```

The input types are `'text'`, `'image'`, `'audio'`, `'video'`, and `'document'`.

### Capabilities-object form

A model definition (`ExtendedModelDef`) has three required fields: `name`, `input`, and `modelOptions`. It also has two optional fields: `features` and `tools`.

To set the typed `modelOptions`, the `features`, or the provider `tools`, give `createModel` a capabilities object as the second argument:

```typescript
import { createModel } from '@tanstack/ai'
import type { OpenAITextProviderOptions } from '@tanstack/ai-openai'

// Type brand for the provider options. The value is not used at runtime.
const modelOptions: OpenAITextProviderOptions = {}

const reasoner = createModel('my-reasoner', {
  input: ['text'],
  features: ['reasoning', 'structured_outputs'],
  tools: ['web_search'],
  modelOptions,
})
```

- `input`: the input types, the same as in the positional form. If you do not set it, the value is `['text']`.
- `features`: the feature flags of the model, for example `'reasoning'` or `'structured_outputs'`.
- `tools`: the provider tools of the model, for example `'web_search'`.
- `modelOptions`: a type brand for the provider options of the model. The value is not used at runtime. Declare an empty object with the type of the provider options.

### Type errors for unknown names

The new factory rejects a name that is not in either list:

```typescript ignore
import { createModel, extendAdapter } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const myOpenai = extendAdapter(openaiText, [createModel('custom-model', ['text'])])

// OK: a built-in model, with its built-in types
const a1 = myOpenai('gpt-6.1-sol')

// OK: your model, with the types that you declared
const a2 = myOpenai('custom-model')

// Type error: the name is not known.
// The check works when you assign the result to a variable.
const invalid = myOpenai('nonexistent-model')
```

### Write your own adapter

Do you build a full adapter for a new provider? [Extend Adapter: Advanced](./extend-adapter-advanced) shows how to:

- Set `inputModalities`.
- Add reasoning levels.
- Send the prompt cache.
- Send mid-conversation changes.
- Send assistant blocks in order.
