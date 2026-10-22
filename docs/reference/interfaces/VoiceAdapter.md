---
id: VoiceAdapter
title: VoiceAdapter
---

Defined in: packages/ai/src/activities/generateVoice/adapter.ts:24

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

Defined in: packages/ai/src/activities/generateVoice/adapter.ts:38

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

Defined in: packages/ai/src/activities/generateVoice/adapter.ts:45

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

Defined in: packages/ai/src/activities/generateVoice/adapter.ts:29

Discriminator for adapter kind - used to determine API shape

***

### model

```ts
readonly model: TModel;
```

Defined in: packages/ai/src/activities/generateVoice/adapter.ts:33

The model this adapter is configured for

***

### name

```ts
readonly name: string;
```

Defined in: packages/ai/src/activities/generateVoice/adapter.ts:31

Adapter name identifier
