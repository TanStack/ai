---
id: BaseAdapter
title: BaseAdapter
---

# Abstract Class: BaseAdapter\<TChatModels, TEmbeddingModels, TChatProviderOptions, TEmbeddingProviderOptions, TModelProviderOptionsByName\>

Defined in: [base-adapter.ts:22](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L22)

Base adapter class with support for endpoint-specific models and provider options.

Generic parameters:
- TChatModels: Models that support chat/text completion
- TEmbeddingModels: Models that support embeddings
- TChatProviderOptions: Provider-specific options for chat endpoint
- TEmbeddingProviderOptions: Provider-specific options for embedding endpoint
- TModelProviderOptionsByName: Provider-specific options for model by name

## Type Parameters

### TChatModels

`TChatModels` *extends* `ReadonlyArray`\<`string`\> = `ReadonlyArray`\<`string`\>

### TEmbeddingModels

`TEmbeddingModels` *extends* `ReadonlyArray`\<`string`\> = `ReadonlyArray`\<`string`\>

### TChatProviderOptions

`TChatProviderOptions` *extends* `Record`\<`string`, `any`\> = `Record`\<`string`, `any`\>

### TEmbeddingProviderOptions

`TEmbeddingProviderOptions` *extends* `Record`\<`string`, `any`\> = `Record`\<`string`, `any`\>

### TModelProviderOptionsByName

`TModelProviderOptionsByName` *extends* `Record`\<`string`, `any`\> = `Record`\<`string`, `any`\>

## Implements

- [`AIAdapter`](../interfaces/AIAdapter.md)\<`TChatModels`, `TEmbeddingModels`, `TChatProviderOptions`, `TEmbeddingProviderOptions`, `TModelProviderOptionsByName`\>

## Constructors

### Constructor

```ts
new BaseAdapter<TChatModels, TEmbeddingModels, TChatProviderOptions, TEmbeddingProviderOptions, TModelProviderOptionsByName>(config): BaseAdapter<TChatModels, TEmbeddingModels, TChatProviderOptions, TEmbeddingProviderOptions, TModelProviderOptionsByName>;
```

Defined in: [base-adapter.ts:49](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L49)

#### Parameters

##### config

[`AIAdapterConfig`](../interfaces/AIAdapterConfig.md) = `{}`

#### Returns

`BaseAdapter`\<`TChatModels`, `TEmbeddingModels`, `TChatProviderOptions`, `TEmbeddingProviderOptions`, `TModelProviderOptionsByName`\>

## Properties

### \_chatProviderOptions?

```ts
optional _chatProviderOptions: TChatProviderOptions;
```

Defined in: [base-adapter.ts:44](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L44)

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`_chatProviderOptions`](../interfaces/AIAdapter.md#_chatprovideroptions)

***

### \_embeddingProviderOptions?

```ts
optional _embeddingProviderOptions: TEmbeddingProviderOptions;
```

Defined in: [base-adapter.ts:45](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L45)

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`_embeddingProviderOptions`](../interfaces/AIAdapter.md#_embeddingprovideroptions)

***

### \_modelProviderOptionsByName

```ts
_modelProviderOptionsByName: TModelProviderOptionsByName;
```

Defined in: [base-adapter.ts:47](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L47)

Type-only map from model name to its specific provider options.
Used by the core AI types to narrow providerOptions based on the selected model.
Must be provided by all adapters.

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`_modelProviderOptionsByName`](../interfaces/AIAdapter.md#_modelprovideroptionsbyname)

***

### \_providerOptions?

```ts
optional _providerOptions: TChatProviderOptions;
```

Defined in: [base-adapter.ts:43](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L43)

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`_providerOptions`](../interfaces/AIAdapter.md#_provideroptions)

***

### config

```ts
protected config: AIAdapterConfig;
```

Defined in: [base-adapter.ts:40](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L40)

***

### embeddingModels?

```ts
optional embeddingModels: TEmbeddingModels;
```

Defined in: [base-adapter.ts:39](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L39)

Models that support embeddings

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`embeddingModels`](../interfaces/AIAdapter.md#embeddingmodels)

***

### models

```ts
abstract models: TChatModels;
```

Defined in: [base-adapter.ts:38](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L38)

Models that support chat/text completion

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`models`](../interfaces/AIAdapter.md#models)

***

### name

```ts
abstract name: string;
```

Defined in: [base-adapter.ts:37](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L37)

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`name`](../interfaces/AIAdapter.md#name)

## Methods

### chatStream()

```ts
abstract chatStream(options): AsyncIterable<StreamChunk>;
```

Defined in: [base-adapter.ts:53](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L53)

#### Parameters

##### options

[`ChatOptions`](../interfaces/ChatOptions.md)

#### Returns

`AsyncIterable`\<[`StreamChunk`](../type-aliases/StreamChunk.md)\>

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`chatStream`](../interfaces/AIAdapter.md#chatstream)

***

### createEmbeddings()

```ts
abstract createEmbeddings(options): Promise<EmbeddingResult>;
```

Defined in: [base-adapter.ts:58](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L58)

#### Parameters

##### options

[`EmbeddingOptions`](../interfaces/EmbeddingOptions.md)

#### Returns

`Promise`\<[`EmbeddingResult`](../interfaces/EmbeddingResult.md)\>

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`createEmbeddings`](../interfaces/AIAdapter.md#createembeddings)

***

### generateId()

```ts
protected generateId(): string;
```

Defined in: [base-adapter.ts:60](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L60)

#### Returns

`string`

***

### summarize()

```ts
abstract summarize(options): Promise<SummarizationResult>;
```

Defined in: [base-adapter.ts:55](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L55)

#### Parameters

##### options

[`SummarizationOptions`](../interfaces/SummarizationOptions.md)

#### Returns

`Promise`\<[`SummarizationResult`](../interfaces/SummarizationResult.md)\>

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`summarize`](../interfaces/AIAdapter.md#summarize)
