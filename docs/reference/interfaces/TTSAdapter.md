---
id: TTSAdapter
title: TTSAdapter
---

# Interface: TTSAdapter\<TModel, TProviderOptions\>

Defined in: [activities/generateSpeech/adapter.ts:24](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateSpeech/adapter.ts#L24)

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

Defined in: [activities/generateSpeech/adapter.ts:38](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateSpeech/adapter.ts#L38)

**`Internal`**

Type-only properties for inference. Not assigned at runtime.

#### providerOptions

```ts
providerOptions: TProviderOptions;
```

***

### generateSpeech()

```ts
generateSpeech: (options) => Promise<TTSResult>;
```

Defined in: [activities/generateSpeech/adapter.ts:45](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateSpeech/adapter.ts#L45)

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

Defined in: [activities/generateSpeech/adapter.ts:29](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateSpeech/adapter.ts#L29)

Discriminator for adapter kind - used to determine API shape

***

### model

```ts
readonly model: TModel;
```

Defined in: [activities/generateSpeech/adapter.ts:33](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateSpeech/adapter.ts#L33)

The model this adapter is configured for

***

### name

```ts
readonly name: string;
```

Defined in: [activities/generateSpeech/adapter.ts:31](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateSpeech/adapter.ts#L31)

Adapter name identifier
