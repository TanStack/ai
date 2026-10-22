---
id: ExtendedModelDef
title: ExtendedModelDef
---

Defined in: packages/ai/src/extend-adapter.ts:21

Definition for a custom model to add to an adapter.

## Example

```typescript
const customModels = [
  createModel('my-custom-model', ['text', 'image']),
] as const
```

## Type Parameters

### TName

`TName` *extends* `string` = `string`

The model name as a literal string type

### TInput

`TInput` *extends* `ReadonlyArray`\<[`Modality`](../type-aliases/Modality.md)\> = `ReadonlyArray`\<[`Modality`](../type-aliases/Modality.md)\>

Array of supported input modalities

### TOptions

`TOptions` = `unknown`

Provider options type for this model

### TFeatures

`TFeatures` *extends* `ReadonlyArray`\<`string`\> = `ReadonlyArray`\<`string`\>

### TTools

`TTools` *extends* `ReadonlyArray`\<`string`\> = `ReadonlyArray`\<`string`\>

## Properties

### features?

```ts
optional features?: TFeatures;
```

Defined in: packages/ai/src/extend-adapter.ts:35

Optional declared features (e.g. 'reasoning', 'structured_outputs')

***

### input

```ts
input: TInput;
```

Defined in: packages/ai/src/extend-adapter.ts:31

Supported input modalities for this model

***

### modelOptions

```ts
modelOptions: TOptions;
```

Defined in: packages/ai/src/extend-adapter.ts:33

Type brand for provider options - use `{} as YourOptionsType`

***

### name

```ts
name: TName;
```

Defined in: packages/ai/src/extend-adapter.ts:29

The model name identifier

***

### tools?

```ts
optional tools?: TTools;
```

Defined in: packages/ai/src/extend-adapter.ts:37

Optional declared provider tools (e.g. 'web_search')
