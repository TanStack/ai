---
id: TTSCapabilities
title: TTSCapabilities
---

Defined in: [packages/ai/src/activities/generateSpeech/adapter.ts:14](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateSpeech/adapter.ts#L14)

What a TTS adapter can do beyond a single voice reading a single string.

Declared statically so `generateSpeech()` can reject an unsupported request
before it reaches the provider, instead of surfacing a provider 422.

## Properties

### maxSpeakers?

```ts
optional maxSpeakers?: number;
```

Defined in: [packages/ai/src/activities/generateSpeech/adapter.ts:20](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateSpeech/adapter.ts#L20)

Maximum number of distinct voices accepted across `turns`
(ElevenLabs 10, Gemini 2). Omit it when the adapter has no dialogue
endpoint — then `turns` is rejected outright.

***

### timestamps?

```ts
optional timestamps?: boolean;
```

Defined in: [packages/ai/src/activities/generateSpeech/adapter.ts:22](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateSpeech/adapter.ts#L22)

Set when the adapter can honour `timestamps: true`.
