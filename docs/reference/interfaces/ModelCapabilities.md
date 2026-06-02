---
id: ModelCapabilities
title: ModelCapabilities
---

# Interface: ModelCapabilities\<TInput, TFeatures, TTools, TOptions\>

Defined in: [packages/ai/src/extend-adapter.ts:41](https://github.com/TanStack/ai/blob/main/packages/ai/src/extend-adapter.ts#L41)

Capability bag accepted by the object form of `createModel`.

## Type Parameters

### TInput

`TInput` *extends* `ReadonlyArray`\<[`Modality`](../type-aliases/Modality.md)\> = `ReadonlyArray`\<[`Modality`](../type-aliases/Modality.md)\>

### TFeatures

`TFeatures` *extends* `ReadonlyArray`\<`string`\> = `ReadonlyArray`\<`string`\>

### TTools

`TTools` *extends* `ReadonlyArray`\<`string`\> = `ReadonlyArray`\<`string`\>

### TOptions

`TOptions` = `unknown`

## Properties

### features?

```ts
optional features: TFeatures;
```

Defined in: [packages/ai/src/extend-adapter.ts:48](https://github.com/TanStack/ai/blob/main/packages/ai/src/extend-adapter.ts#L48)

***

### input?

```ts
optional input: TInput;
```

Defined in: [packages/ai/src/extend-adapter.ts:47](https://github.com/TanStack/ai/blob/main/packages/ai/src/extend-adapter.ts#L47)

***

### modelOptions?

```ts
optional modelOptions: TOptions;
```

Defined in: [packages/ai/src/extend-adapter.ts:50](https://github.com/TanStack/ai/blob/main/packages/ai/src/extend-adapter.ts#L50)

***

### tools?

```ts
optional tools: TTools;
```

Defined in: [packages/ai/src/extend-adapter.ts:49](https://github.com/TanStack/ai/blob/main/packages/ai/src/extend-adapter.ts#L49)
