---
id: GeneratedVoice
title: GeneratedVoice
---

Defined in: [packages/ai/src/types.ts:3104](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3104)

A single voice produced by [VoiceGenerationOptions](VoiceGenerationOptions.md).

## Properties

### audio?

```ts
optional audio?: string;
```

Defined in: [packages/ai/src/types.ts:3111](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3111)

Base64-encoded preview audio, when the provider returns one

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: [packages/ai/src/types.ts:3115](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3115)

Content type of the preview (e.g. 'audio/mpeg')

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:3117](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3117)

Duration of the preview in seconds, if available

***

### format?

```ts
optional format?: string;
```

Defined in: [packages/ai/src/types.ts:3113](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3113)

Audio format of the preview (e.g. 'mp3')

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:3119](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3119)

Language of the preview, if reported

***

### saved

```ts
saved: boolean;
```

Defined in: [packages/ai/src/types.ts:3124](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3124)

Whether the voice is persisted in the provider's voice library. Unsaved
voices are previews and generally expire.

***

### status

```ts
status: VoiceTrainingStatus;
```

Defined in: [packages/ai/src/types.ts:3129](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3129)

Whether the voice can be used in `generateSpeech()` yet. Required so a
caller never has to guess: every adapter states it outright.

***

### voiceId

```ts
voiceId: string;
```

Defined in: [packages/ai/src/types.ts:3109](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3109)

The provider's voice identifier. Pass it straight back as the `voice`
option on `generateSpeech()`.
