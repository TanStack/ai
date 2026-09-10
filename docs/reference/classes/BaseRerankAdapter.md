---
id: BaseRerankAdapter
title: BaseRerankAdapter
---

# Abstract Class: BaseRerankAdapter\<TModel, TProviderOptions\>

Defined in: [packages/ai/src/activities/rerank/adapter.ts:63](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/rerank/adapter.ts#L63)

Abstract base class for rerank adapters.
Extend this class to implement a rerank adapter for a specific provider.

Generic parameters match RerankAdapter - all pre-resolved by the provider function.

## Type Parameters

### TModel

`TModel` *extends* `string` = `string`

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Implements

- [`RerankAdapter`](../interfaces/RerankAdapter.md)\<`TModel`, `TProviderOptions`\>

## Constructors

### Constructor

```ts
new BaseRerankAdapter<TModel, TProviderOptions>(config?, model): BaseRerankAdapter<TModel, TProviderOptions>;
```

Defined in: [packages/ai/src/activities/rerank/adapter.ts:78](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/rerank/adapter.ts#L78)

#### Parameters

##### config?

`RerankAdapterConfig` = `{}`

##### model

`TModel`

#### Returns

`BaseRerankAdapter`\<`TModel`, `TProviderOptions`\>

## Properties

### ~types

```ts
~types: object;
```

Defined in: [packages/ai/src/activities/rerank/adapter.ts:72](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/rerank/adapter.ts#L72)

**`Internal`**

Type-only properties for inference. Not assigned at runtime.

#### providerOptions

```ts
providerOptions: TProviderOptions;
```

#### Implementation of

[`RerankAdapter`](../interfaces/RerankAdapter.md).[`~types`](../interfaces/RerankAdapter.md#types)

***

### config

```ts
protected config: RerankAdapterConfig;
```

Defined in: [packages/ai/src/activities/rerank/adapter.ts:76](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/rerank/adapter.ts#L76)

***

### kind

```ts
readonly kind: "rerank";
```

Defined in: [packages/ai/src/activities/rerank/adapter.ts:67](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/rerank/adapter.ts#L67)

Discriminator for adapter kind

#### Implementation of

[`RerankAdapter`](../interfaces/RerankAdapter.md).[`kind`](../interfaces/RerankAdapter.md#kind)

***

### model

```ts
readonly model: TModel;
```

Defined in: [packages/ai/src/activities/rerank/adapter.ts:69](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/rerank/adapter.ts#L69)

The model this adapter is configured for

#### Implementation of

[`RerankAdapter`](../interfaces/RerankAdapter.md).[`model`](../interfaces/RerankAdapter.md#model)

***

### name

```ts
abstract readonly name: string;
```

Defined in: [packages/ai/src/activities/rerank/adapter.ts:68](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/rerank/adapter.ts#L68)

Adapter name identifier

#### Implementation of

[`RerankAdapter`](../interfaces/RerankAdapter.md).[`name`](../interfaces/RerankAdapter.md#name)

## Methods

### generateId()

```ts
protected generateId(): string;
```

Defined in: [packages/ai/src/activities/rerank/adapter.ts:87](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/rerank/adapter.ts#L87)

#### Returns

`string`

***

### rerank()

```ts
abstract rerank(options): Promise<RerankAdapterResult>;
```

Defined in: [packages/ai/src/activities/rerank/adapter.ts:83](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/rerank/adapter.ts#L83)

Rerank the given (pre-serialized) documents against the query, returning
scored indices into `options.documents`. The activity layer maps these
back to the caller's original documents.

#### Parameters

##### options

[`RerankOptions`](../interfaces/RerankOptions.md)\<`TProviderOptions`\>

#### Returns

`Promise`\<[`RerankAdapterResult`](../interfaces/RerankAdapterResult.md)\>

#### Implementation of

[`RerankAdapter`](../interfaces/RerankAdapter.md).[`rerank`](../interfaces/RerankAdapter.md#rerank)
