---
id: GeneratedVoice
title: GeneratedVoice
---

Defined in: [packages/ai/src/types.ts:2888](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2888)

A single voice produced by [VoiceGenerationOptions](VoiceGenerationOptions.md).

## Properties

### audio?

```ts
optional audio?: string;
```

Defined in: [packages/ai/src/types.ts:2895](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2895)

Base64-encoded preview audio, when the provider returns one

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: [packages/ai/src/types.ts:2899](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2899)

Content type of the preview (e.g. 'audio/mpeg')

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2901](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2901)

Duration of the preview in seconds, if available

***

### format?

```ts
optional format?: string;
```

Defined in: [packages/ai/src/types.ts:2897](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2897)

Audio format of the preview (e.g. 'mp3')

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2903](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2903)

Language of the preview, if reported

***

### saved

```ts
saved: boolean;
```

Defined in: [packages/ai/src/types.ts:2908](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2908)

Whether the voice is persisted in the provider's voice library. Unsaved
voices are previews and generally expire.

***

### status

```ts
status: VoiceTrainingStatus;
```

Defined in: [packages/ai/src/types.ts:2913](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2913)

Whether the voice can be used in `generateSpeech()` yet. Required so a
caller never has to guess: every adapter states it outright.

***

### voiceId

```ts
voiceId: string;
```

Defined in: [packages/ai/src/types.ts:2893](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2893)

The provider's voice identifier. Pass it straight back as the `voice`
option on `generateSpeech()`.
