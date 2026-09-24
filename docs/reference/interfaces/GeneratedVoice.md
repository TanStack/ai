---
id: GeneratedVoice
title: GeneratedVoice
---

Defined in: [packages/ai/src/types.ts:2670](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2670)

A single voice produced by [VoiceGenerationOptions](VoiceGenerationOptions.md).

## Properties

### audio?

```ts
optional audio?: string;
```

Defined in: [packages/ai/src/types.ts:2677](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2677)

Base64-encoded preview audio, when the provider returns one

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: [packages/ai/src/types.ts:2681](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2681)

Content type of the preview (e.g. 'audio/mpeg')

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2683](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2683)

Duration of the preview in seconds, if available

***

### format?

```ts
optional format?: string;
```

Defined in: [packages/ai/src/types.ts:2679](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2679)

Audio format of the preview (e.g. 'mp3')

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2685](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2685)

Language of the preview, if reported

***

### saved

```ts
saved: boolean;
```

Defined in: [packages/ai/src/types.ts:2690](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2690)

Whether the voice is persisted in the provider's voice library. Unsaved
voices are previews and generally expire.

***

### status

```ts
status: VoiceTrainingStatus;
```

Defined in: [packages/ai/src/types.ts:2695](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2695)

Whether the voice can be used in `generateSpeech()` yet. Required so a
caller never has to guess: every adapter states it outright.

***

### voiceId

```ts
voiceId: string;
```

Defined in: [packages/ai/src/types.ts:2675](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2675)

The provider's voice identifier. Pass it straight back as the `voice`
option on `generateSpeech()`.
