---
id: VoiceAdapter
title: VoiceAdapter
---

Defined in: [packages/ai/src/activities/generateVoice/adapter.ts:24](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVoice/adapter.ts#L24)

Voice adapter interface with pre-resolved generics.

An adapter is created by a provider function: `provider('model')` → `adapter`
All type resolution happens at the provider call site, not in this interface.

Generic parameters:
- TModel: The specific model name (e.g., 'eleven_ttv_v3')
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

Defined in: [packages/ai/src/activities/generateVoice/adapter.ts:38](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVoice/adapter.ts#L38)

**`Internal`**

Type-only properties for inference. Not assigned at runtime.

#### providerOptions

```ts
providerOptions: TProviderOptions;
```

***

### generateVoice

```ts
generateVoice: (options) => Promise<VoiceResult>;
```

Defined in: [packages/ai/src/activities/generateVoice/adapter.ts:45](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVoice/adapter.ts#L45)

Create a voice from a text description and/or reference audio

#### Parameters

##### options

[`VoiceGenerationOptions`](VoiceGenerationOptions.md)\<`TProviderOptions`\>

#### Returns

`Promise`\<[`VoiceResult`](VoiceResult.md)\>

***

### kind

```ts
readonly kind: "voice";
```

Defined in: [packages/ai/src/activities/generateVoice/adapter.ts:29](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVoice/adapter.ts#L29)

Discriminator for adapter kind - used to determine API shape

***

### model

```ts
readonly model: TModel;
```

Defined in: [packages/ai/src/activities/generateVoice/adapter.ts:33](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVoice/adapter.ts#L33)

The model this adapter is configured for

***

### name

```ts
readonly name: string;
```

Defined in: [packages/ai/src/activities/generateVoice/adapter.ts:31](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVoice/adapter.ts#L31)

Adapter name identifier
