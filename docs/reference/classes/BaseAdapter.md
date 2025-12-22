---
id: BaseAdapter
title: BaseAdapter
---

# Abstract Class: BaseAdapter\<TChatModels, TEmbeddingModels, TChatProviderOptions, TEmbeddingProviderOptions, TModelProviderOptionsByName, TModelInputModalitiesByName, TMessageMetadataByModality\>

Defined in: [base-adapter.ts:26](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L26)

Base adapter class with support for endpoint-specific models and provider options.

Generic parameters:
- TChatModels: Models that support chat/text completion
- TEmbeddingModels: Models that support embeddings
- TChatProviderOptions: Provider-specific options for chat endpoint
- TEmbeddingProviderOptions: Provider-specific options for embedding endpoint
- TModelProviderOptionsByName: Provider-specific options for model by name
- TModelInputModalitiesByName: Map from model name to its supported input modalities
- TMessageMetadataByModality: Map from modality type to adapter-specific metadata types

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

### TModelInputModalitiesByName

`TModelInputModalitiesByName` *extends* `Record`\<`string`, `ReadonlyArray`\<[`Modality`](../type-aliases/Modality.md)\>\> = `Record`\<`string`, `ReadonlyArray`\<[`Modality`](../type-aliases/Modality.md)\>\>

### TMessageMetadataByModality

`TMessageMetadataByModality` *extends* `object` = [`DefaultMessageMetadataByModality`](../interfaces/DefaultMessageMetadataByModality.md)

## Implements

- [`AIAdapter`](../interfaces/AIAdapter.md)\<`TChatModels`, `TEmbeddingModels`, `TChatProviderOptions`, `TEmbeddingProviderOptions`, `TModelProviderOptionsByName`, `TModelInputModalitiesByName`, `TMessageMetadataByModality`\>

## Constructors

### Constructor

```ts
new BaseAdapter<TChatModels, TEmbeddingModels, TChatProviderOptions, TEmbeddingProviderOptions, TModelProviderOptionsByName, TModelInputModalitiesByName, TMessageMetadataByModality>(config): BaseAdapter<TChatModels, TEmbeddingModels, TChatProviderOptions, TEmbeddingProviderOptions, TModelProviderOptionsByName, TModelInputModalitiesByName, TMessageMetadataByModality>;
```

Defined in: [base-adapter.ts:70](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L70)

#### Parameters

##### config

`AIAdapterConfig` = `{}`

#### Returns

`BaseAdapter`\<`TChatModels`, `TEmbeddingModels`, `TChatProviderOptions`, `TEmbeddingProviderOptions`, `TModelProviderOptionsByName`, `TModelInputModalitiesByName`, `TMessageMetadataByModality`\>

## Properties

### \_chatProviderOptions?

```ts
optional _chatProviderOptions: TChatProviderOptions;
```

Defined in: [base-adapter.ts:61](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L61)

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`_chatProviderOptions`](../interfaces/AIAdapter.md#_chatprovideroptions)

***

### \_embeddingProviderOptions?

```ts
optional _embeddingProviderOptions: TEmbeddingProviderOptions;
```

Defined in: [base-adapter.ts:62](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L62)

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`_embeddingProviderOptions`](../interfaces/AIAdapter.md#_embeddingprovideroptions)

***

### \_messageMetadataByModality?

```ts
optional _messageMetadataByModality: TMessageMetadataByModality;
```

Defined in: [base-adapter.ts:68](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L68)

Type-only map from modality type to adapter-specific metadata types.
Used to provide type-safe autocomplete for metadata on content parts.

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`_messageMetadataByModality`](../interfaces/AIAdapter.md#_messagemetadatabymodality)

***

### \_modelInputModalitiesByName?

```ts
optional _modelInputModalitiesByName: TModelInputModalitiesByName;
```

Defined in: [base-adapter.ts:66](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L66)

Type-only map from model name to its supported input modalities.
Used by the core AI types to narrow ContentPart types based on the selected model.
Must be provided by all adapters.

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`_modelInputModalitiesByName`](../interfaces/AIAdapter.md#_modelinputmodalitiesbyname)

***

### \_modelProviderOptionsByName

```ts
_modelProviderOptionsByName: TModelProviderOptionsByName;
```

Defined in: [base-adapter.ts:64](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L64)

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

Defined in: [base-adapter.ts:60](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L60)

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`_providerOptions`](../interfaces/AIAdapter.md#_provideroptions)

***

### config

```ts
protected config: AIAdapterConfig;
```

Defined in: [base-adapter.ts:57](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L57)

***

### embeddingModels?

```ts
optional embeddingModels: TEmbeddingModels;
```

Defined in: [base-adapter.ts:56](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L56)

Models that support embeddings

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`embeddingModels`](../interfaces/AIAdapter.md#embeddingmodels)

***

### models

```ts
abstract models: TChatModels;
```

Defined in: [base-adapter.ts:55](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L55)

Models that support chat/text completion

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`models`](../interfaces/AIAdapter.md#models)

***

### name

```ts
abstract name: string;
```

Defined in: [base-adapter.ts:54](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L54)

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`name`](../interfaces/AIAdapter.md#name)

## Methods

### chatStream()

```ts
abstract chatStream(options): AsyncIterable<StreamChunk>;
```

Defined in: [base-adapter.ts:74](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L74)

#### Parameters

##### options

[`TextOptions`](../interfaces/TextOptions.md)

#### Returns

`AsyncIterable`\<[`StreamChunk`](../type-aliases/StreamChunk.md)\>

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`chatStream`](../interfaces/AIAdapter.md#chatstream)

***

### createEmbeddings()

```ts
abstract createEmbeddings(options): Promise<EmbeddingResult>;
```

Defined in: [base-adapter.ts:79](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L79)

#### Parameters

##### options

`EmbeddingOptions`

#### Returns

`Promise`\<`EmbeddingResult`\>

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`createEmbeddings`](../interfaces/AIAdapter.md#createembeddings)

***

### generateId()

```ts
protected generateId(): string;
```

Defined in: [base-adapter.ts:81](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L81)

#### Returns

`string`

***

### summarize()

```ts
abstract summarize(options): Promise<SummarizationResult>;
```

Defined in: [base-adapter.ts:76](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L76)

#### Parameters

##### options

[`SummarizationOptions`](../interfaces/SummarizationOptions.md)

#### Returns

`Promise`\<[`SummarizationResult`](../interfaces/SummarizationResult.md)\>

#### Implementation of

[`AIAdapter`](../interfaces/AIAdapter.md).[`summarize`](../interfaces/AIAdapter.md#summarize)
