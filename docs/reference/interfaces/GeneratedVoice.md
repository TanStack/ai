---
id: GeneratedVoice
title: GeneratedVoice
---

Defined in: [packages/ai/src/types.ts:3111](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3111)

A single voice produced by [VoiceGenerationOptions](VoiceGenerationOptions.md).

## Properties

### audio?

```ts
optional audio?: string;
```

Defined in: [packages/ai/src/types.ts:3118](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3118)

Base64-encoded preview audio, when the provider returns one

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: [packages/ai/src/types.ts:3122](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3122)

Content type of the preview (e.g. 'audio/mpeg')

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:3124](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3124)

Duration of the preview in seconds, if available

***

### format?

```ts
optional format?: string;
```

Defined in: [packages/ai/src/types.ts:3120](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3120)

Audio format of the preview (e.g. 'mp3')

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:3126](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3126)

Language of the preview, if reported

***

### saved

```ts
saved: boolean;
```

Defined in: [packages/ai/src/types.ts:3131](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3131)

Whether the voice is persisted in the provider's voice library. Unsaved
voices are previews and generally expire.

***

### status

```ts
status: VoiceTrainingStatus;
```

Defined in: [packages/ai/src/types.ts:3136](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3136)

Whether the voice can be used in `generateSpeech()` yet. Required so a
caller never has to guess: every adapter states it outright.

***

### voiceId

```ts
voiceId: string;
```

Defined in: [packages/ai/src/types.ts:3116](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3116)

The provider's voice identifier. Pass it straight back as the `voice`
option on `generateSpeech()`.
