---
id: GeneratedVoice
title: GeneratedVoice
---

Defined in: packages/ai/src/types.ts:3062

A single voice produced by [VoiceGenerationOptions](VoiceGenerationOptions.md).

## Properties

### audio?

```ts
optional audio?: string;
```

Defined in: packages/ai/src/types.ts:3069

Base64-encoded preview audio, when the provider returns one

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: packages/ai/src/types.ts:3073

Content type of the preview (e.g. 'audio/mpeg')

***

### duration?

```ts
optional duration?: number;
```

Defined in: packages/ai/src/types.ts:3075

Duration of the preview in seconds, if available

***

### format?

```ts
optional format?: string;
```

Defined in: packages/ai/src/types.ts:3071

Audio format of the preview (e.g. 'mp3')

***

### language?

```ts
optional language?: string;
```

Defined in: packages/ai/src/types.ts:3077

Language of the preview, if reported

***

### saved

```ts
saved: boolean;
```

Defined in: packages/ai/src/types.ts:3082

Whether the voice is persisted in the provider's voice library. Unsaved
voices are previews and generally expire.

***

### status

```ts
status: VoiceTrainingStatus;
```

Defined in: packages/ai/src/types.ts:3087

Whether the voice can be used in `generateSpeech()` yet. Required so a
caller never has to guess: every adapter states it outright.

***

### voiceId

```ts
voiceId: string;
```

Defined in: packages/ai/src/types.ts:3067

The provider's voice identifier. Pass it straight back as the `voice`
option on `generateSpeech()`.
