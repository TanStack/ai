---
id: TextAdapter
title: TextAdapter
---

# Interface: TextAdapter\<TModel, TProviderOptions, TInputModalities, TMessageMetadataByModality, TToolCapabilities, TToolCallMetadata\>

Defined in: [packages/typescript/ai/src/activities/chat/adapter.ts:59](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/adapter.ts#L59)

Text adapter interface with pre-resolved generics.

An adapter is created by a provider function: `provider('model')` → `adapter`
All type resolution happens at the provider call site, not in this interface.

Generic parameters:
- TModel: The specific model name (e.g., 'gpt-4o')
- TProviderOptions: Provider-specific options for this model (already resolved)
- TInputModalities: Supported input modalities for this model (already resolved)
- TMessageMetadata: Metadata types for content parts (already resolved)
- TToolCapabilities: Tuple of tool-kind strings supported by this model, resolved from `supports.tools`
- TToolCallMetadata: Metadata type that round-trips with tool calls (e.g. Gemini's `thoughtSignature`)

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

### TToolCallMetadata

`TToolCallMetadata` = `unknown`

## Properties

### ~types

```ts
~types: object;
```

Defined in: [packages/typescript/ai/src/activities/chat/adapter.ts:77](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/adapter.ts#L77)

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

#### toolCallMetadata

```ts
toolCallMetadata: TToolCallMetadata;
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

Defined in: [packages/typescript/ai/src/activities/chat/adapter.ts:88](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/adapter.ts#L88)

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

Defined in: [packages/typescript/ai/src/activities/chat/adapter.ts:68](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/adapter.ts#L68)

Discriminator for adapter kind

***

### model

```ts
readonly model: TModel;
```

Defined in: [packages/typescript/ai/src/activities/chat/adapter.ts:72](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/adapter.ts#L72)

The model this adapter is configured for

***

### name

```ts
readonly name: string;
```

Defined in: [packages/typescript/ai/src/activities/chat/adapter.ts:70](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/adapter.ts#L70)

Provider name identifier (e.g., 'openai', 'anthropic')

***

### structuredOutput()

```ts
structuredOutput: (options) => Promise<StructuredOutputResult<unknown>>;
```

Defined in: [packages/typescript/ai/src/activities/chat/adapter.ts:100](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/adapter.ts#L100)

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

***

### structuredOutputStream()?

```ts
optional structuredOutputStream: (options) => AsyncIterable<AGUIEvent>;
```

Defined in: [packages/typescript/ai/src/activities/chat/adapter.ts:117](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/adapter.ts#L117)

Stream structured output using the provider's native streaming structured
output API (stream + response_format json_schema in a single request).

Optional — adapters without native streaming JSON omit this method and the
activity layer synthesizes a stream around the non-streaming
`structuredOutput` call.

Implementations must emit standard AG-UI lifecycle events (RUN_STARTED,
TEXT_MESSAGE_*, RUN_FINISHED) carrying raw JSON text deltas, plus a final
`CUSTOM` event named `structured-output.complete` whose `value` is
`{ object, raw, reasoning? }`.

#### Parameters

##### options

`StructuredOutputOptions`\<`TProviderOptions`\>

#### Returns

`AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md)\>
