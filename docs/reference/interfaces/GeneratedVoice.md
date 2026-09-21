---
id: GeneratedVoice
title: GeneratedVoice
---

Defined in: [packages/ai/src/types.ts:2588](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2588)

A single voice produced by [VoiceGenerationOptions](VoiceGenerationOptions.md).

## Properties

### audio?

```ts
optional audio?: string;
```

Defined in: [packages/ai/src/types.ts:2595](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2595)

Base64-encoded preview audio, when the provider returns one

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: [packages/ai/src/types.ts:2599](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2599)

Content type of the preview (e.g. 'audio/mpeg')

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2601](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2601)

Duration of the preview in seconds, if available

***

### format?

```ts
optional format?: string;
```

Defined in: [packages/ai/src/types.ts:2597](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2597)

Audio format of the preview (e.g. 'mp3')

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2603](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2603)

Language of the preview, if reported

***

### saved

```ts
saved: boolean;
```

Defined in: [packages/ai/src/types.ts:2608](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2608)

Whether the voice is persisted in the provider's voice library. Unsaved
voices are previews and generally expire.

***

### status

```ts
status: VoiceTrainingStatus;
```

Defined in: [packages/ai/src/types.ts:2613](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2613)

Whether the voice can be used in `generateSpeech()` yet. Required so a
caller never has to guess: every adapter states it outright.

***

### voiceId

```ts
voiceId: string;
```

Defined in: [packages/ai/src/types.ts:2593](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2593)

The provider's voice identifier. Pass it straight back as the `voice`
option on `generateSpeech()`.
