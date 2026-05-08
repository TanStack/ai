---
id: AudioAdapter
title: AudioAdapter
---

# Interface: AudioAdapter\<TModel, TProviderOptions\>

Defined in: [packages/typescript/ai/src/activities/generateAudio/adapter.ts:24](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateAudio/adapter.ts#L24)

Audio generation adapter interface with pre-resolved generics.

An adapter is created by a provider function: `provider('model')` → `adapter`
All type resolution happens at the provider call site, not in this interface.

Generic parameters:
- TModel: The specific model name (e.g., 'fal-ai/diffrhythm')
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

Defined in: [packages/typescript/ai/src/activities/generateAudio/adapter.ts:38](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateAudio/adapter.ts#L38)

**`Internal`**

Type-only properties for inference. Not assigned at runtime.

#### providerOptions

```ts
providerOptions: TProviderOptions;
```

***

### generateAudio()

```ts
generateAudio: (options) => Promise<AudioGenerationResult>;
```

Defined in: [packages/typescript/ai/src/activities/generateAudio/adapter.ts:45](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateAudio/adapter.ts#L45)

Generate audio from a text prompt

#### Parameters

##### options

[`AudioGenerationOptions`](AudioGenerationOptions.md)\<`TProviderOptions`\>

#### Returns

`Promise`\<[`AudioGenerationResult`](AudioGenerationResult.md)\>

***

### kind

```ts
readonly kind: "audio";
```

Defined in: [packages/typescript/ai/src/activities/generateAudio/adapter.ts:29](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateAudio/adapter.ts#L29)

Discriminator for adapter kind - used to determine API shape

***

### model

```ts
readonly model: TModel;
```

Defined in: [packages/typescript/ai/src/activities/generateAudio/adapter.ts:33](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateAudio/adapter.ts#L33)

The model this adapter is configured for

***

### name

```ts
readonly name: string;
```

Defined in: [packages/typescript/ai/src/activities/generateAudio/adapter.ts:31](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateAudio/adapter.ts#L31)

Adapter name identifier
