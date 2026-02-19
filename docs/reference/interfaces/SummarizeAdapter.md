---
id: SummarizeAdapter
title: SummarizeAdapter
---

# Interface: SummarizeAdapter\<TModel, TProviderOptions\>

Defined in: [activities/summarize/adapter.ts:28](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/summarize/adapter.ts#L28)

Summarize adapter interface with pre-resolved generics.

An adapter is created by a provider function: `provider('model')` → `adapter`
All type resolution happens at the provider call site, not in this interface.

Generic parameters:
- TModel: The specific model name (e.g., 'gpt-4o')
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

Defined in: [activities/summarize/adapter.ts:42](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/summarize/adapter.ts#L42)

**`Internal`**

Type-only properties for inference. Not assigned at runtime.

#### providerOptions

```ts
providerOptions: TProviderOptions;
```

***

### kind

```ts
readonly kind: "summarize";
```

Defined in: [activities/summarize/adapter.ts:33](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/summarize/adapter.ts#L33)

Discriminator for adapter kind - used by generate() to determine API shape

***

### model

```ts
readonly model: TModel;
```

Defined in: [activities/summarize/adapter.ts:37](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/summarize/adapter.ts#L37)

The model this adapter is configured for

***

### name

```ts
readonly name: string;
```

Defined in: [activities/summarize/adapter.ts:35](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/summarize/adapter.ts#L35)

Adapter name identifier

***

### summarize()

```ts
summarize: (options) => Promise<SummarizationResult>;
```

Defined in: [activities/summarize/adapter.ts:49](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/summarize/adapter.ts#L49)

Summarize the given text

#### Parameters

##### options

[`SummarizationOptions`](SummarizationOptions.md)

#### Returns

`Promise`\<[`SummarizationResult`](SummarizationResult.md)\>

***

### summarizeStream()?

```ts
optional summarizeStream: (options) => AsyncIterable<AGUIEvent>;
```

Defined in: [activities/summarize/adapter.ts:56](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/summarize/adapter.ts#L56)

Stream summarization of the given text.
Optional - if not implemented, the activity layer will fall back to
non-streaming summarize and yield the result as a single chunk.

#### Parameters

##### options

[`SummarizationOptions`](SummarizationOptions.md)

#### Returns

`AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md)\>
