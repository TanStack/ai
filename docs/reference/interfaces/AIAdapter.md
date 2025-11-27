---
id: AIAdapter
title: AIAdapter
---

# Interface: AIAdapter\<TChatModels, TEmbeddingModels, TChatProviderOptions, TEmbeddingProviderOptions, TModelProviderOptionsByName\>

Defined in: [types.ts:425](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L425)

AI adapter interface with support for endpoint-specific models and provider options.

Generic parameters:
- TChatModels: Models that support chat/text completion
- TImageModels: Models that support image generation
- TEmbeddingModels: Models that support embeddings
- TAudioModels: Models that support audio (transcription and text-to-speech)
- TVideoModels: Models that support video generation
- TChatProviderOptions: Provider-specific options for chat endpoint
- TImageProviderOptions: Provider-specific options for image endpoint
- TEmbeddingProviderOptions: Provider-specific options for embedding endpoint
- TAudioProviderOptions: Provider-specific options for audio endpoint
- TVideoProviderOptions: Provider-specific options for video endpoint

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

## Properties

### \_chatProviderOptions?

```ts
optional _chatProviderOptions: TChatProviderOptions;
```

Defined in: [types.ts:441](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L441)

***

### \_embeddingProviderOptions?

```ts
optional _embeddingProviderOptions: TEmbeddingProviderOptions;
```

Defined in: [types.ts:442](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L442)

***

### \_modelProviderOptionsByName

```ts
_modelProviderOptionsByName: TModelProviderOptionsByName;
```

Defined in: [types.ts:448](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L448)

Type-only map from model name to its specific provider options.
Used by the core AI types to narrow providerOptions based on the selected model.
Must be provided by all adapters.

***

### \_providerOptions?

```ts
optional _providerOptions: TChatProviderOptions;
```

Defined in: [types.ts:440](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L440)

***

### chatStream()

```ts
chatStream: (options) => AsyncIterable<StreamChunk>;
```

Defined in: [types.ts:451](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L451)

#### Parameters

##### options

[`ChatOptions`](../ChatOptions.md)\<`string`, `TChatProviderOptions`\>

#### Returns

`AsyncIterable`\<[`StreamChunk`](../../type-aliases/StreamChunk.md)\>

***

### createEmbeddings()

```ts
createEmbeddings: (options) => Promise<EmbeddingResult>;
```

Defined in: [types.ts:459](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L459)

#### Parameters

##### options

[`EmbeddingOptions`](../EmbeddingOptions.md)

#### Returns

`Promise`\<[`EmbeddingResult`](../EmbeddingResult.md)\>

***

### embeddingModels?

```ts
optional embeddingModels: TEmbeddingModels;
```

Defined in: [types.ts:437](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L437)

Models that support embeddings

***

### models

```ts
models: TChatModels;
```

Defined in: [types.ts:434](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L434)

Models that support chat/text completion

***

### name

```ts
name: string;
```

Defined in: [types.ts:432](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L432)

***

### summarize()

```ts
summarize: (options) => Promise<SummarizationResult>;
```

Defined in: [types.ts:456](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L456)

#### Parameters

##### options

[`SummarizationOptions`](../SummarizationOptions.md)

#### Returns

`Promise`\<[`SummarizationResult`](../SummarizationResult.md)\>
