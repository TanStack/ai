---
id: AIAdapter
title: AIAdapter
---

# Interface: AIAdapter\<TChatModels, TEmbeddingModels, TChatProviderOptions, TEmbeddingProviderOptions, TModelProviderOptionsByName, TModelInputModalitiesByName, TMessageMetadataByModality\>

Defined in: [types.ts:756](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L756)

AI adapter interface with support for endpoint-specific models and provider options.

Generic parameters:
- TChatModels: Models that support chat/text completion
- TEmbeddingModels: Models that support embeddings
- TChatProviderOptions: Provider-specific options for chat endpoint
- TEmbeddingProviderOptions: Provider-specific options for embedding endpoint
- TModelProviderOptionsByName: Map from model name to its specific provider options
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

`TMessageMetadataByModality` *extends* `object` = [`DefaultMessageMetadataByModality`](DefaultMessageMetadataByModality.md)

## Properties

### \_chatProviderOptions?

```ts
optional _chatProviderOptions: TChatProviderOptions;
```

Defined in: [types.ts:783](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L783)

***

### \_embeddingProviderOptions?

```ts
optional _embeddingProviderOptions: TEmbeddingProviderOptions;
```

Defined in: [types.ts:784](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L784)

***

### \_messageMetadataByModality?

```ts
optional _messageMetadataByModality: TMessageMetadataByModality;
```

Defined in: [types.ts:801](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L801)

Type-only map from modality type to adapter-specific metadata types.
Used to provide type-safe autocomplete for metadata on content parts.

***

### \_modelInputModalitiesByName?

```ts
optional _modelInputModalitiesByName: TModelInputModalitiesByName;
```

Defined in: [types.ts:796](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L796)

Type-only map from model name to its supported input modalities.
Used by the core AI types to narrow ContentPart types based on the selected model.
Must be provided by all adapters.

***

### \_modelProviderOptionsByName

```ts
_modelProviderOptionsByName: TModelProviderOptionsByName;
```

Defined in: [types.ts:790](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L790)

Type-only map from model name to its specific provider options.
Used by the core AI types to narrow providerOptions based on the selected model.
Must be provided by all adapters.

***

### \_providerOptions?

```ts
optional _providerOptions: TChatProviderOptions;
```

Defined in: [types.ts:782](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L782)

***

### chatStream()

```ts
chatStream: (options) => AsyncIterable<StreamChunk>;
```

Defined in: [types.ts:804](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L804)

#### Parameters

##### options

[`ChatOptions`](ChatOptions.md)\<`string`, `TChatProviderOptions`\>

#### Returns

`AsyncIterable`\<[`StreamChunk`](../type-aliases/StreamChunk.md)\>

***

### createEmbeddings()

```ts
createEmbeddings: (options) => Promise<EmbeddingResult>;
```

Defined in: [types.ts:812](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L812)

#### Parameters

##### options

[`EmbeddingOptions`](EmbeddingOptions.md)

#### Returns

`Promise`\<[`EmbeddingResult`](EmbeddingResult.md)\>

***

### embeddingModels?

```ts
optional embeddingModels: TEmbeddingModels;
```

Defined in: [types.ts:779](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L779)

Models that support embeddings

***

### models

```ts
models: TChatModels;
```

Defined in: [types.ts:776](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L776)

Models that support chat/text completion

***

### name

```ts
name: string;
```

Defined in: [types.ts:774](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L774)

***

### summarize()

```ts
summarize: (options) => Promise<SummarizationResult>;
```

Defined in: [types.ts:809](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L809)

#### Parameters

##### options

[`SummarizationOptions`](SummarizationOptions.md)

#### Returns

`Promise`\<[`SummarizationResult`](SummarizationResult.md)\>
