---
id: RerankAdapter
title: RerankAdapter
---

Defined in: packages/ai/src/activities/rerank/adapter.ts:23

Rerank adapter interface with pre-resolved generics.

An adapter is created by a provider function: `provider('model')` → `adapter`
All type resolution happens at the provider call site, not in this interface.

Generic parameters:
- TModel: The specific model name (e.g. 'rerank-v3.5')
- TProviderOptions: Provider-specific options (already resolved)

## Type Parameters

### TModel

`TModel` *extends* `string` = `string`

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### ~types

```ts
~types: object;
```

Defined in: packages/ai/src/activities/rerank/adapter.ts:37

**`Internal`**

Type-only properties for inference. Not assigned at runtime.

#### providerOptions

```ts
providerOptions: TProviderOptions;
```

***

### kind

```ts
readonly kind: "rerank";
```

Defined in: packages/ai/src/activities/rerank/adapter.ts:28

Discriminator for adapter kind

***

### model

```ts
readonly model: TModel;
```

Defined in: packages/ai/src/activities/rerank/adapter.ts:32

The model this adapter is configured for

***

### name

```ts
readonly name: string;
```

Defined in: packages/ai/src/activities/rerank/adapter.ts:30

Adapter name identifier

***

### rerank

```ts
rerank: (options) => Promise<RerankAdapterResult>;
```

Defined in: packages/ai/src/activities/rerank/adapter.ts:46

Rerank the given (pre-serialized) documents against the query, returning
scored indices into `options.documents`. The activity layer maps these
back to the caller's original documents.

#### Parameters

##### options

[`RerankOptions`](RerankOptions.md)\<`TProviderOptions`\>

#### Returns

`Promise`\<[`RerankAdapterResult`](RerankAdapterResult.md)\>
