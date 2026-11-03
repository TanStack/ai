---
id: EmbeddingAdapter
title: EmbeddingAdapter
---

Defined in: [packages/ai/src/activities/embed/adapter.ts:31](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/embed/adapter.ts#L31)

Embedding adapter interface with pre-resolved generics.

An adapter is created by a provider function: `provider('model')` → `adapter`
All type resolution happens at the provider call site, not in this interface.

Generic parameters:
- TModel: The specific model name (e.g., 'text-embedding-3-small')
- TProviderOptions: Base provider-specific options (already resolved)
- TModelProviderOptionsByName: Map from model name to its specific provider options
- TModelInputModalitiesByName: Map from model name to the input modalities it
  accepts (constrains the `input` item types at compile time)

## Type Parameters

### TModel

`TModel` *extends* `string` = `string`

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

### TModelProviderOptionsByName

`TModelProviderOptionsByName` *extends* `Record`\<`string`, `any`\> = `Record`\<`string`, `any`\>

### TModelInputModalitiesByName

`TModelInputModalitiesByName` *extends* [`EmbeddingModelInputModalitiesByName`](../type-aliases/EmbeddingModelInputModalitiesByName.md) = [`EmbeddingModelInputModalitiesByName`](../type-aliases/EmbeddingModelInputModalitiesByName.md)

## Properties

### ~types

```ts
~types: object;
```

Defined in: [packages/ai/src/activities/embed/adapter.ts:54](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/embed/adapter.ts#L54)

**`Internal`**

Type-only properties for inference. Not assigned at runtime.

#### modelInputModalitiesByName

```ts
modelInputModalitiesByName: TModelInputModalitiesByName;
```

#### modelProviderOptionsByName

```ts
modelProviderOptionsByName: TModelProviderOptionsByName;
```

#### providerOptions

```ts
providerOptions: TProviderOptions;
```

***

### createEmbeddings

```ts
createEmbeddings: (options) => Promise<EmbeddingResult>;
```

Defined in: [packages/ai/src/activities/embed/adapter.ts:63](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/embed/adapter.ts#L63)

Generate embeddings for the input items (one vector per item)

#### Parameters

##### options

[`EmbeddingOptions`](EmbeddingOptions.md)\<`TProviderOptions`\>

#### Returns

`Promise`\<[`EmbeddingResult`](EmbeddingResult.md)\>

***

### kind

```ts
readonly kind: "embedding";
```

Defined in: [packages/ai/src/activities/embed/adapter.ts:39](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/embed/adapter.ts#L39)

Discriminator for adapter kind

***

### model

```ts
readonly model: TModel;
```

Defined in: [packages/ai/src/activities/embed/adapter.ts:49](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/embed/adapter.ts#L49)

The model this adapter is configured for

***

### name

```ts
readonly name: string;
```

Defined in: [packages/ai/src/activities/embed/adapter.ts:41](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/embed/adapter.ts#L41)

Adapter name identifier

***

### supportsFileSources?

```ts
readonly optional supportsFileSources?: boolean;
```

Defined in: [packages/ai/src/activities/embed/adapter.ts:47](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/embed/adapter.ts#L47)

Declares that this adapter can consume `{ type: 'file' }` content
sources (provider Files API references). `embed()` rejects file sources
in preflight for adapters that don't declare this.
