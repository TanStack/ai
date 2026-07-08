---
id: createModel
title: createModel
---

# Function: createModel()

## Call Signature

```ts
function createModel<TName, TInput>(name, input): ExtendedModelDef<TName, TInput>;
```

Defined in: [packages/ai/src/extend-adapter.ts:91](https://github.com/TanStack/ai/blob/main/packages/ai/src/extend-adapter.ts#L91)

Creates a custom model definition for use with `extendAdapter`.

This is a helper function that provides proper type inference without
requiring manual `as const` casts on individual properties.

### Type Parameters

#### TName

`TName` *extends* `string`

The model name (inferred from argument)

#### TInput

`TInput` *extends* readonly [`Modality`](../type-aliases/Modality.md)[]

The input modalities array (inferred from argument)

### Parameters

#### name

`TName`

The model name identifier (literal string)

#### input

`TInput`

Array of supported input modalities

### Returns

[`ExtendedModelDef`](../interfaces/ExtendedModelDef.md)\<`TName`, `TInput`\>

A properly typed model definition for use with `extendAdapter`

### Examples

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

```typescript
// Capabilities object form - declare features and provider tools
const reasoner = createModel('reasoner', {
  input: ['text'],
  features: ['reasoning', 'structured_outputs'],
  tools: ['web_search'],
})
```

## Call Signature

```ts
function createModel<TName, TCaps>(name, capabilities): ExtendedModelDef<TName, TCaps["input"] extends readonly Modality[] ? any[any] : readonly Modality[], TCaps["modelOptions"], TCaps["features"] extends readonly string[] ? any[any] : readonly string[], TCaps["tools"] extends readonly string[] ? any[any] : readonly string[]>;
```

Defined in: [packages/ai/src/extend-adapter.ts:96](https://github.com/TanStack/ai/blob/main/packages/ai/src/extend-adapter.ts#L96)

Creates a custom model definition for use with `extendAdapter`.

This is a helper function that provides proper type inference without
requiring manual `as const` casts on individual properties.

### Type Parameters

#### TName

`TName` *extends* `string`

The model name (inferred from argument)

#### TCaps

`TCaps` *extends* [`ModelCapabilities`](../interfaces/ModelCapabilities.md)\<readonly [`Modality`](../type-aliases/Modality.md)[], readonly `string`[], readonly `string`[], `unknown`\>

### Parameters

#### name

`TName`

The model name identifier (literal string)

#### capabilities

`TCaps`

### Returns

[`ExtendedModelDef`](../interfaces/ExtendedModelDef.md)\<`TName`, `TCaps`\[`"input"`\] *extends* readonly [`Modality`](../type-aliases/Modality.md)[] ? `any`\[`any`\] : readonly [`Modality`](../type-aliases/Modality.md)[], `TCaps`\[`"modelOptions"`\], `TCaps`\[`"features"`\] *extends* readonly `string`[] ? `any`\[`any`\] : readonly `string`[], `TCaps`\[`"tools"`\] *extends* readonly `string`[] ? `any`\[`any`\] : readonly `string`[]\>

A properly typed model definition for use with `extendAdapter`

### Examples

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

```typescript
// Capabilities object form - declare features and provider tools
const reasoner = createModel('reasoner', {
  input: ['text'],
  features: ['reasoning', 'structured_outputs'],
  tools: ['web_search'],
})
```
