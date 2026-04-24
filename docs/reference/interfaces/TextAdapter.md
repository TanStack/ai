---
id: TextAdapter
title: TextAdapter
---

# Interface: TextAdapter\<TModel, TProviderOptions, TInputModalities, TMessageMetadataByModality, TToolCapabilities\>

Defined in: [packages/typescript/ai/src/activities/chat/adapter.ts:58](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/adapter.ts#L58)

Text adapter interface with pre-resolved generics.

An adapter is created by a provider function: `provider('model')` → `adapter`
All type resolution happens at the provider call site, not in this interface.

Generic parameters:
- TModel: The specific model name (e.g., 'gpt-4o')
- TProviderOptions: Provider-specific options for this model (already resolved)
- TInputModalities: Supported input modalities for this model (already resolved)
- TMessageMetadata: Metadata types for content parts (already resolved)
- TToolCapabilities: Tuple of tool-kind strings supported by this model, resolved from `supports.tools`

## Type Parameters

### TModel

`TModel` *extends* `string`

### TProviderOptions

`TProviderOptions` *extends* `Record`\<`string`, `any`\>

### TInputModalities

`TInputModalities` *extends* `ReadonlyArray`\<[`Modality`](../type-aliases/Modality.md)\>

### TMessageMetadataByModality

`TMessageMetadataByModality` *extends* [`DefaultMessageMetadataByModality`](DefaultMessageMetadataByModality.md)

### TToolCapabilities

`TToolCapabilities` *extends* `ReadonlyArray`\<`string`\> = `ReadonlyArray`\<`string`\>

## Properties

### ~types

```ts
~types: object;
```

Defined in: [packages/typescript/ai/src/activities/chat/adapter.ts:75](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/adapter.ts#L75)

**`Internal`**

Type-only properties for inference. Not assigned at runtime.

#### inputModalities

```ts
inputModalities: TInputModalities;
```

#### messageMetadataByModality

```ts
messageMetadataByModality: TMessageMetadataByModality;
```

#### providerOptions

```ts
providerOptions: TProviderOptions;
```

#### toolCapabilities

```ts
toolCapabilities: TToolCapabilities;
```

***

### chatStream()

```ts
chatStream: (options) => AsyncIterable<AGUIEvent>;
```

Defined in: [packages/typescript/ai/src/activities/chat/adapter.ts:85](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/adapter.ts#L85)

Stream text completions from the model

#### Parameters

##### options

[`TextOptions`](TextOptions.md)\<`TProviderOptions`\>

#### Returns

`AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md)\>

***

### kind

```ts
readonly kind: "text";
```

Defined in: [packages/typescript/ai/src/activities/chat/adapter.ts:66](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/adapter.ts#L66)

Discriminator for adapter kind

***

### model

```ts
readonly model: TModel;
```

Defined in: [packages/typescript/ai/src/activities/chat/adapter.ts:70](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/adapter.ts#L70)

The model this adapter is configured for

***

### name

```ts
readonly name: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/adapter.ts:68](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/adapter.ts#L68)

Provider name identifier (e.g., 'openai', 'anthropic')

***

### structuredOutput()

```ts
structuredOutput: (options) => Promise<StructuredOutputResult<unknown>>;
```

Defined in: [packages/typescript/ai/src/activities/chat/adapter.ts:97](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/adapter.ts#L97)

Generate structured output using the provider's native structured output API.
This method uses stream: false and sends the JSON schema to the provider
to ensure the response conforms to the expected structure.

#### Parameters

##### options

`StructuredOutputOptions`\<`TProviderOptions`\>

Structured output options containing chat options and JSON schema

#### Returns

`Promise`\<`StructuredOutputResult`\<`unknown`\>\>

Promise with the raw data (validation is done in the chat function)
