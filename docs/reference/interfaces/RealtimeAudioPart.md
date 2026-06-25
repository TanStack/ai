---
id: RealtimeAudioPart
title: RealtimeAudioPart
---

# Interface: RealtimeAudioPart

Defined in: [packages/ai/src/realtime/types.ts:104](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L104)

Audio content part in a realtime message

## Properties

### audioData?

```ts
optional audioData: ArrayBuffer;
```

Defined in: [packages/ai/src/realtime/types.ts:109](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L109)

Raw audio data (optional, if stored)

***

### durationMs?

```ts
optional durationMs: number;
```

Defined in: [packages/ai/src/realtime/types.ts:111](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L111)

Duration of the audio in milliseconds

***

### transcript

```ts
transcript: string;
```

Defined in: [packages/ai/src/realtime/types.ts:107](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L107)

Transcription of the audio

***

### type

```ts
type: "audio";
```

Defined in: [packages/ai/src/realtime/types.ts:105](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L105)
