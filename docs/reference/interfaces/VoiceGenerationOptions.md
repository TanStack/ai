---
id: VoiceGenerationOptions
title: VoiceGenerationOptions
---

Defined in: [packages/ai/src/types.ts:2629](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2629)

Options for creating a voice.

Providers create voices in one of two ways, and some support both:
- **design** — synthesize a brand new voice from a text [prompt](#prompt).
- **clone** — derive a voice from [referenceAudio](#referenceaudio) of a real speaker.

At least one of `prompt` / `referenceAudio` is required; which ones an
adapter accepts depends on the model. An adapter may require both — the
only adapter today, `elevenlabsVoiceDesign`, always needs `prompt` and
takes `referenceAudio` as an additional design reference.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2664](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2664)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific - never store on a global client config.

***

### description?

```ts
optional description?: string;
```

Defined in: [packages/ai/src/types.ts:2650](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2650)

Human-readable description stored alongside the voice

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2658](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2658)

Internal logger threaded from the generateVoice() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2633](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2633)

The model to use for voice creation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2652](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2652)

Model-specific options for voice creation

***

### name?

```ts
optional name?: string;
```

Defined in: [packages/ai/src/types.ts:2648](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2648)

Name to store the voice under in the provider's voice library. Providers
differ on what this implies — ElevenLabs only persists a designed voice
when a name is given. Read [GeneratedVoice.saved](GeneratedVoice.md#saved) to find out what
actually happened.

***

### prompt?

```ts
optional prompt?: string;
```

Defined in: [packages/ai/src/types.ts:2635](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2635)

Text description of the voice to create, for design-capable models

***

### referenceAudio?

```ts
optional referenceAudio?: string | ArrayBuffer | File | Blob;
```

Defined in: [packages/ai/src/types.ts:2641](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2641)

Reference audio of the speaker to clone - base64 string, base64 data URL,
File, Blob, or ArrayBuffer. For clone-capable models. Remote URLs are not
accepted; read the file and pass the bytes.
