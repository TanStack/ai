---
id: ExtendedModelDef
title: ExtendedModelDef
---

# Interface: ExtendedModelDef\<TName, TInput, TOptions\>

Defined in: [extend-adapter.ts:21](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/extend-adapter.ts#L21)

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

## Properties

### input

```ts
input: TInput;
```

Defined in: [extend-adapter.ts:29](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/extend-adapter.ts#L29)

Supported input modalities for this model

***

### modelOptions

```ts
modelOptions: TOptions;
```

Defined in: [extend-adapter.ts:31](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/extend-adapter.ts#L31)

Type brand for provider options - use `{} as YourOptionsType`

***

### name

```ts
name: TName;
```

Defined in: [extend-adapter.ts:27](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/extend-adapter.ts#L27)

The model name identifier
