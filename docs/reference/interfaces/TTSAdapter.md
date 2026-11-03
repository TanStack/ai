---
id: TTSAdapter
title: TTSAdapter
---

Defined in: [packages/ai/src/activities/generateSpeech/adapter.ts:46](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateSpeech/adapter.ts#L46)

TTS adapter interface with pre-resolved generics.

An adapter is created by a provider function: `provider('model')` → `adapter`
All type resolution happens at the provider call site, not in this interface.

Generic parameters:
- TModel: The specific model name (e.g., 'tts-1')
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

Defined in: [packages/ai/src/activities/generateSpeech/adapter.ts:65](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateSpeech/adapter.ts#L65)

**`Internal`**

Type-only properties for inference. Not assigned at runtime.

#### providerOptions

```ts
providerOptions: TProviderOptions;
```

***

### capabilities?

```ts
readonly optional capabilities?: TTSCapabilities;
```

Defined in: [packages/ai/src/activities/generateSpeech/adapter.ts:60](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateSpeech/adapter.ts#L60)

Optional static capability declaration. Absent means "single voice, no
timestamps" — the contract every adapter had before dialogue existed.

***

### generateSpeech

```ts
generateSpeech: (options) => Promise<TTSResult>;
```

Defined in: [packages/ai/src/activities/generateSpeech/adapter.ts:72](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateSpeech/adapter.ts#L72)

Generate speech from text

#### Parameters

##### options

[`TTSOptions`](TTSOptions.md)\<`TProviderOptions`\>

#### Returns

`Promise`\<[`TTSResult`](TTSResult.md)\>

***

### kind

```ts
readonly kind: "tts";
```

Defined in: [packages/ai/src/activities/generateSpeech/adapter.ts:51](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateSpeech/adapter.ts#L51)

Discriminator for adapter kind - used to determine API shape

***

### listVoices?

```ts
optional listVoices?: (options?) => Promise<ListVoicesResult>;
```

Defined in: [packages/ai/src/activities/generateSpeech/adapter.ts:84](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateSpeech/adapter.ts#L84)

List the voices this account can use.

Optional, because only some providers have a catalog worth querying at
runtime. A provider whose voices are a fixed list known at build time
publishes that list from its own package instead (`GeminiTTSVoices`, or
the `OpenAITTSVoice` union), which is strictly better than a network
call. Implement this only when the catalog is per-account and can change,
which is the case wherever `generateVoice()` can add to it.

#### Parameters

##### options?

[`ListVoicesOptions`](ListVoicesOptions.md)

#### Returns

`Promise`\<[`ListVoicesResult`](ListVoicesResult.md)\>

***

### model

```ts
readonly model: TModel;
```

Defined in: [packages/ai/src/activities/generateSpeech/adapter.ts:55](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateSpeech/adapter.ts#L55)

The model this adapter is configured for

***

### name

```ts
readonly name: string;
```

Defined in: [packages/ai/src/activities/generateSpeech/adapter.ts:53](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateSpeech/adapter.ts#L53)

Adapter name identifier
