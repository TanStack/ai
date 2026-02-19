---
id: createModel
title: createModel
---

# Function: createModel()

```ts
function createModel<TName, TInput>(name, input): ExtendedModelDef<TName, TInput>;
```

Defined in: [extend-adapter.ts:61](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/extend-adapter.ts#L61)

Creates a custom model definition for use with `extendAdapter`.

This is a helper function that provides proper type inference without
requiring manual `as const` casts on individual properties.

## Type Parameters

### TName

`TName` *extends* `string`

The model name (inferred from argument)

### TInput

`TInput` *extends* readonly [`Modality`](../type-aliases/Modality.md)[]

The input modalities array (inferred from argument)

## Parameters

### name

`TName`

The model name identifier (literal string)

### input

`TInput`

Array of supported input modalities

## Returns

[`ExtendedModelDef`](../interfaces/ExtendedModelDef.md)\<`TName`, `TInput`\>

A properly typed model definition for use with `extendAdapter`

## Example

```typescript
import { extendAdapter, createModel } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

// Define custom models with full type inference
const customModels = [
  createModel('my-fine-tuned-gpt4', ['text', 'image']),
  createModel('local-llama', ['text']),
] as const

const myOpenai = extendAdapter(openaiText, customModels)
```
