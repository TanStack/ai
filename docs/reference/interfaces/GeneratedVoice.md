---
id: GeneratedVoice
title: GeneratedVoice
---

Defined in: [packages/ai/src/types.ts:2610](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2610)

A single voice produced by [VoiceGenerationOptions](VoiceGenerationOptions.md).

## Properties

### audio?

```ts
optional audio?: string;
```

Defined in: [packages/ai/src/types.ts:2617](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2617)

Base64-encoded preview audio, when the provider returns one

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: [packages/ai/src/types.ts:2621](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2621)

Content type of the preview (e.g. 'audio/mpeg')

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2623](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2623)

Duration of the preview in seconds, if available

***

### format?

```ts
optional format?: string;
```

Defined in: [packages/ai/src/types.ts:2619](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2619)

Audio format of the preview (e.g. 'mp3')

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2625](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2625)

Language of the preview, if reported

***

### saved

```ts
saved: boolean;
```

Defined in: [packages/ai/src/types.ts:2630](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2630)

Whether the voice is persisted in the provider's voice library. Unsaved
voices are previews and generally expire.

***

### status

```ts
status: VoiceTrainingStatus;
```

Defined in: [packages/ai/src/types.ts:2635](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2635)

Whether the voice can be used in `generateSpeech()` yet. Required so a
caller never has to guess: every adapter states it outright.

***

### voiceId

```ts
voiceId: string;
```

Defined in: [packages/ai/src/types.ts:2615](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2615)

The provider's voice identifier. Pass it straight back as the `voice`
option on `generateSpeech()`.
