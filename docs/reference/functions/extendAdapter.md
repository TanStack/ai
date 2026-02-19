---
id: extendAdapter
title: extendAdapter
---

# Function: extendAdapter()

```ts
function extendAdapter<TFactory, TDefs>(factory, _customModels): (model, ...args) => InferAdapterReturn<TFactory>;
```

Defined in: [extend-adapter.ts:166](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/extend-adapter.ts#L166)

Extends an existing adapter factory with additional custom models.

The extended adapter accepts both original models (with full original type inference)
and custom models (with types from your definitions).

At runtime, this simply passes through to the original factory - no validation is performed.
The original factory's signature is fully preserved, including any config parameters.

## Type Parameters

### TFactory

`TFactory` *extends* (...`args`) => `any`

### TDefs

`TDefs` *extends* readonly [`ExtendedModelDef`](../interfaces/ExtendedModelDef.md)\<`string`, readonly [`Modality`](../type-aliases/Modality.md)[], `unknown`\>[]

## Parameters

### factory

`TFactory`

The original adapter factory function (e.g., `openaiText`, `anthropicText`)

### \_customModels

`TDefs`

## Returns

A new factory function that accepts both original and custom models

```ts
(model, ...args): InferAdapterReturn<TFactory>;
```

### Parameters

#### model

`InferFactoryModels`\<`TFactory`\> | `ExtractCustomModelNames`\<`TDefs`\>

#### args

...`InferConfig`\<`TFactory`\> *extends* `undefined` ? \[\] : \[`InferConfig`\<`TFactory`\>\]

### Returns

`InferAdapterReturn`\<`TFactory`\>

## Example

```typescript
import { extendAdapter, createModel } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// Define custom models
const customModels = [
  createModel('my-fine-tuned-gpt4', ['text', 'image']),
  createModel('local-llama', ['text']),
] as const

// Create extended adapter
const myOpenai = extendAdapter(openaiText, customModels)

// Use with original models - full type inference preserved
const gpt4 = myOpenai('gpt-4o')

// Use with custom models
const custom = myOpenai('my-fine-tuned-gpt4')

// Type error: 'invalid-model' is not a valid model
// myOpenai('invalid-model')

// Works with chat()
chat({
  adapter: myOpenai('my-fine-tuned-gpt4'),
  messages: [...]
})
```
