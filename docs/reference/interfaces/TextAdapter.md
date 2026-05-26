---
id: TextAdapter
title: TextAdapter
---

# Interface: TextAdapter\<TModel, TProviderOptions, TInputModalities, TMessageMetadataByModality, TToolCapabilities, TToolCallMetadata, TSystemPromptMetadata\>

Defined in: [packages/ai/src/activities/chat/adapter.ts:63](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/adapter.ts#L63)

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
- TSystemPromptMetadata: Provider-typed metadata accepted on each
  `systemPrompts[i]` entry (e.g. Anthropic `cache_control`). Defaults to
  `never` — adapters without per-prompt metadata reject the `metadata`
  field at the call site.

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

### TSystemPromptMetadata

`TSystemPromptMetadata` = `never`

## Properties

### ~types

```ts
~types: object;
```

Defined in: [packages/ai/src/activities/chat/adapter.ts:82](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/adapter.ts#L82)

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

#### systemPromptMetadata

```ts
systemPromptMetadata: TSystemPromptMetadata;
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

Defined in: [packages/ai/src/activities/chat/adapter.ts:94](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/adapter.ts#L94)

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

Defined in: [packages/ai/src/activities/chat/adapter.ts:73](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/adapter.ts#L73)

Discriminator for adapter kind

***

### model

```ts
readonly model: TModel;
```

Defined in: [packages/ai/src/activities/chat/adapter.ts:77](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/adapter.ts#L77)

The model this adapter is configured for

***

### name

```ts
readonly name: string;
```

Defined in: [packages/ai/src/activities/chat/adapter.ts:75](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/adapter.ts#L75)

Provider name identifier (e.g., 'openai', 'anthropic')

***

### structuredOutput()

```ts
structuredOutput: (options) => Promise<StructuredOutputResult<unknown>>;
```

Defined in: [packages/ai/src/activities/chat/adapter.ts:106](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/adapter.ts#L106)

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

Defined in: [packages/ai/src/activities/chat/adapter.ts:123](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/adapter.ts#L123)

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

***

### supportsCombinedToolsAndSchema()?

```ts
optional supportsCombinedToolsAndSchema: (modelOptions?) => boolean;
```

Defined in: [packages/ai/src/activities/chat/adapter.ts:146](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/adapter.ts#L146)

Declares whether the adapter supports combining `tools` and a
schema-constrained final answer in a single streaming request.

When `true`, the engine wires `outputSchema` into the regular
`chatStream()` call and skips the separate `runStructuredFinalization`
round-trip. The model's natural final turn carries the
schema-constrained JSON text and the engine harvests it from the agent
loop's accumulated content.

When `false`, `undefined`, or the method is omitted, the engine runs
the agent loop without `outputSchema` and then issues a separate
`structuredOutput` / `structuredOutputStream` call against the JSON
schema for finalization (the legacy path).

The method receives the per-call `modelOptions` so providers whose
support depends on the resolved upstream model (e.g. OpenRouter) can
answer per-request. Most adapters can return a constant.

#### Parameters

##### modelOptions?

`TProviderOptions`

#### Returns

`boolean`
