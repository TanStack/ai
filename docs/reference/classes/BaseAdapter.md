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

`TModelInputModalitiesByName` *extends* `Record`\<`string`, `ReadonlyArray`\<[`Modality`](../../type-aliases/Modality)\>\> = `Record`\<`string`, `ReadonlyArray`\<[`Modality`](../../type-aliases/Modality)\>\>

### TMessageMetadataByModality

`TMessageMetadataByModality` *extends* `object` = [`DefaultMessageMetadataByModality`](../../interfaces/DefaultMessageMetadataByModality)
## Implements

- [`AIAdapter`](../../interfaces/AIAdapter)\<`TChatModels`, `TEmbeddingModels`, `TChatProviderOptions`, `TEmbeddingProviderOptions`, `TModelProviderOptionsByName`, `TModelInputModalitiesByName`, `TMessageMetadataByModality`\>

## Constructors

### Constructor

```ts
new BaseAdapter<TChatModels, TEmbeddingModels, TChatProviderOptions, TEmbeddingProviderOptions, TModelProviderOptionsByName, TModelInputModalitiesByName, TMessageMetadataByModality>(config): BaseAdapter<TChatModels, TEmbeddingModels, TChatProviderOptions, TEmbeddingProviderOptions, TModelProviderOptionsByName, TModelInputModalitiesByName, TMessageMetadataByModality>;
```

Defined in: [base-adapter.ts:69](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L69)

#### Parameters

##### config

[`AIAdapterConfig`](../../interfaces/AIAdapterConfig) = `{}`

#### Returns

`BaseAdapter`\<`TChatModels`, `TEmbeddingModels`, `TChatProviderOptions`, `TEmbeddingProviderOptions`, `TModelProviderOptionsByName`, `TModelInputModalitiesByName`, `TMessageMetadataByModality`\>

## Properties

### \_chatProviderOptions?

```ts
optional _chatProviderOptions: TChatProviderOptions;
```

Defined in: [base-adapter.ts:60](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L60)

#### Implementation of

[`AIAdapter`](../../interfaces/AIAdapter).[`_chatProviderOptions`](../../interfaces/AIAdapter#_chatprovideroptions)

***

### \_embeddingProviderOptions?

```ts
optional _embeddingProviderOptions: TEmbeddingProviderOptions;
```

Defined in: [base-adapter.ts:61](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L61)

#### Implementation of

[`AIAdapter`](../../interfaces/AIAdapter).[`_embeddingProviderOptions`](../../interfaces/AIAdapter#_embeddingprovideroptions)

***

### \_messageMetadataByModality?

```ts
optional _messageMetadataByModality: TMessageMetadataByModality;
```

Defined in: [base-adapter.ts:67](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L67)

Type-only map from modality type to adapter-specific metadata types.
Used to provide type-safe autocomplete for metadata on content parts.

#### Implementation of

[`AIAdapter`](../../interfaces/AIAdapter).[`_messageMetadataByModality`](../../interfaces/AIAdapter#_messagemetadatabymodality)

***

### \_modelInputModalitiesByName?

```ts
optional _modelInputModalitiesByName: TModelInputModalitiesByName;
```

Defined in: [base-adapter.ts:65](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L65)

Type-only map from model name to its supported input modalities.
Used by the core AI types to narrow ContentPart types based on the selected model.
Must be provided by all adapters.

#### Implementation of

[`AIAdapter`](../../interfaces/AIAdapter).[`_modelInputModalitiesByName`](../../interfaces/AIAdapter#_modelinputmodalitiesbyname)

***

### \_modelProviderOptionsByName

```ts
_modelProviderOptionsByName: TModelProviderOptionsByName;
```

Defined in: [base-adapter.ts:63](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L63)

Type-only map from model name to its specific provider options.
Used by the core AI types to narrow providerOptions based on the selected model.
Must be provided by all adapters.

#### Implementation of

[`AIAdapter`](../../interfaces/AIAdapter).[`_modelProviderOptionsByName`](../../interfaces/AIAdapter#_modelprovideroptionsbyname)

***

### \_providerOptions?

```ts
optional _providerOptions: TChatProviderOptions;
```

Defined in: [base-adapter.ts:59](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L59)

#### Implementation of

[`AIAdapter`](../../interfaces/AIAdapter).[`_providerOptions`](../../interfaces/AIAdapter#_provideroptions)

***

### config

```ts
protected config: AIAdapterConfig;
```

Defined in: [base-adapter.ts:56](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L56)

***

### embeddingModels?

```ts
optional embeddingModels: TEmbeddingModels;
```

Defined in: [base-adapter.ts:55](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L55)

Models that support embeddings

#### Implementation of

[`AIAdapter`](../../interfaces/AIAdapter).[`embeddingModels`](../../interfaces/AIAdapter#embeddingmodels)

***

### models

```ts
abstract models: TChatModels;
```

Defined in: [base-adapter.ts:54](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L54)

Models that support chat/text completion

#### Implementation of

[`AIAdapter`](../../interfaces/AIAdapter).[`models`](../../interfaces/AIAdapter#models)

***

### name

```ts
abstract name: string;
```

Defined in: [base-adapter.ts:53](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L53)

#### Implementation of

[`AIAdapter`](../../interfaces/AIAdapter).[`name`](../../interfaces/AIAdapter#name)

## Methods

### chatStream()

```ts
abstract chatStream(options): AsyncIterable<StreamChunk>;
```

Defined in: [base-adapter.ts:73](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L73)

#### Parameters

##### options

[`ChatOptions`](../../interfaces/ChatOptions)

#### Returns

`AsyncIterable`\<[`StreamChunk`](../../type-aliases/StreamChunk)\>

#### Implementation of

[`AIAdapter`](../../interfaces/AIAdapter).[`chatStream`](../../interfaces/AIAdapter#chatstream)

***

### createEmbeddings()

```ts
abstract createEmbeddings(options): Promise<EmbeddingResult>;
```

Defined in: [base-adapter.ts:78](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L78)

#### Parameters

##### options

[`EmbeddingOptions`](../../interfaces/EmbeddingOptions)

#### Returns

`Promise`\<[`EmbeddingResult`](../../interfaces/EmbeddingResult)\>

#### Implementation of

[`AIAdapter`](../../interfaces/AIAdapter).[`createEmbeddings`](../../interfaces/AIAdapter#createembeddings)

***

### generateId()

```ts
protected generateId(): string;
```

Defined in: [base-adapter.ts:80](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L80)

#### Returns

`string`

***

### summarize()

```ts
abstract summarize(options): Promise<SummarizationResult>;
```

Defined in: [base-adapter.ts:75](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/base-adapter.ts#L75)

#### Parameters

##### options

[`SummarizationOptions`](../../interfaces/SummarizationOptions)

#### Returns

`Promise`\<[`SummarizationResult`](../../interfaces/SummarizationResult)\>

#### Implementation of

[`AIAdapter`](../../interfaces/AIAdapter).[`summarize`](../../interfaces/AIAdapter#summarize)
