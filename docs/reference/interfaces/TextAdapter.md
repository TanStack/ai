---
id: TextAdapter
title: TextAdapter
---

Defined in: packages/ai/src/activities/chat/adapter.ts:75

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

### TReasoning

`TReasoning` *extends* [`ReasoningCapability`](ReasoningCapability.md) = `never`

## Properties

### ~types

```ts
~types: object;
```

Defined in: packages/ai/src/activities/chat/adapter.ts:133

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

#### reasoning?

```ts
optional reasoning?: TReasoning;
```

The model's reasoning levels, for `chat({ reasoning })`. `never`: the
model does not reason (or the adapter does not map `reasoning`), and
the option is a type error. Optional, so an adapter written before this
key existed still type-checks (and gets no `reasoning` option).

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

### api?

```ts
readonly optional api?: string;
```

Defined in: packages/ai/src/activities/chat/adapter.ts:90

Wire API identity. Defaults to the adapter kind when omitted.

***

### chatStream

```ts
chatStream: (options) => AsyncIterable<AdapterYieldChunk>;
```

Defined in: packages/ai/src/activities/chat/adapter.ts:152

Stream text completions from the model

#### Parameters

##### options

[`TextOptions`](TextOptions.md)\<`TProviderOptions`\>

#### Returns

`AsyncIterable`\<[`AdapterYieldChunk`](../type-aliases/AdapterYieldChunk.md)\>

***

### combinedStructuredOutputSource?

```ts
optional combinedStructuredOutputSource?: (modelOptions?) => "text" | "event";
```

Defined in: packages/ai/src/activities/chat/adapter.ts:227

Where native-combined structured output is taken from.

- `'text'` (default when omitted): the agent loop's accumulated
  assistant text is schema JSON. The engine parses it after the loop.
  HTTP adapters use this.
- `'event'`: the adapter emits `structured-output.complete` during
  `chatStream`. The engine must not parse accumulated prose. Harness
  adapters use this.

#### Parameters

##### modelOptions?

`TProviderOptions`

#### Returns

`"text"` \| `"event"`

***

### compact?

```ts
optional compact?: (options) => Promise<ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
| null>[]>;
```

Defined in: packages/ai/src/activities/chat/adapter.ts:192

Compact the history with the provider's own compaction endpoint.
Resolves to the history to send from the next call on. It can hold
provider items that only this provider reads. Optional: adapters
without native compaction omit it.

#### Parameters

##### options

[`TextCompactOptions`](TextCompactOptions.md)

#### Returns

`Promise`\<[`ModelMessage`](ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>[]\>

***

### inputModalities?

```ts
readonly optional inputModalities?: readonly ("text" | "image" | "audio" | "video" | "document")[];
```

Defined in: packages/ai/src/activities/chat/adapter.ts:120

The input kinds the model reads, at runtime, from the provider's model
metadata. `undefined` means not known. This mirrors the type-level
`'~types'.inputModalities`, which has no runtime value. `| undefined`
keeps model lookups assignable under `exactOptionalPropertyTypes`.

***

### kind

```ts
readonly kind: "text";
```

Defined in: packages/ai/src/activities/chat/adapter.ts:86

Discriminator for adapter kind

***

### midConversationChannels?

```ts
readonly optional midConversationChannels?: MidConversationChannels;
```

Defined in: packages/ai/src/activities/chat/adapter.ts:128

The mid-conversation channels of the model: tools and system prompts
added between model calls can go out with no change to the cached prompt
prefix. `chat()` passes `TextOptions.midConversationChanges` only when a
channel is on. `undefined` means no channels.

***

### model

```ts
readonly model: TModel;
```

Defined in: packages/ai/src/activities/chat/adapter.ts:94

The model this adapter is configured for

***

### name

```ts
readonly name: string;
```

Defined in: packages/ai/src/activities/chat/adapter.ts:88

Provider name identifier (e.g., 'openai', 'anthropic')

***

### provider?

```ts
readonly optional provider?: string;
```

Defined in: packages/ai/src/activities/chat/adapter.ts:92

Provider identity. Defaults to `name` when omitted.

***

### requires?

```ts
readonly optional requires?: readonly CapabilityHandle[];
```

Defined in: packages/ai/src/activities/chat/adapter.ts:103

Capabilities this adapter requires at runtime. `chat()` validates that the
configured middleware provides each one. Model adapters omit this; harness
adapters (e.g. a future `claudeCode()`) declare e.g. `[sandboxCapability]`.
Runtime access to capabilities from inside the adapter is not yet wired —
this is the declaration/validation surface only.

***

### structuredOutput

```ts
structuredOutput: (options) => Promise<StructuredOutputResult<unknown>>;
```

Defined in: packages/ai/src/activities/chat/adapter.ts:164

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

### structuredOutputStream?

```ts
optional structuredOutputStream?: (options) => AsyncIterable<AdapterYieldChunk>;
```

Defined in: packages/ai/src/activities/chat/adapter.ts:182

Stream structured output using the provider's native streaming structured
output API (stream + response_format json_schema in a single request).

Optional — adapters without native streaming JSON omit this method and the
activity layer synthesizes a stream around the non-streaming
`structuredOutput` call.

Implementations must emit standard AG-UI lifecycle events (RUN_STARTED,
TEXT_MESSAGE_*, RUN_FINISHED) carrying raw JSON text deltas, plus a final
`CUSTOM` event named `structured-output.complete` whose `value` is
`{ object, raw, reasoning? }`. Events must be timestamped when emitted so
their timestamps follow stream order.

#### Parameters

##### options

`StructuredOutputOptions`\<`TProviderOptions`\>

#### Returns

`AsyncIterable`\<[`AdapterYieldChunk`](../type-aliases/AdapterYieldChunk.md)\>

***

### supportsCombinedToolsAndSchema?

```ts
optional supportsCombinedToolsAndSchema?: (modelOptions?) => boolean;
```

Defined in: packages/ai/src/activities/chat/adapter.ts:213

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

***

### supportsFileSources?

```ts
readonly optional supportsFileSources?: boolean;
```

Defined in: packages/ai/src/activities/chat/adapter.ts:112

Declares that this adapter can consume `{ type: 'file' }` content sources
(provider Files API references). `chat()` rejects file sources in preflight
for adapters that don't declare this, so an adapter written before the
file arm existed fails closed instead of silently mis-mapping a reference
onto its URL/data branch.
