---
id: RealtimeAudioPart
title: RealtimeAudioPart
---

# Interface: RealtimeAudioPart

Defined in: [packages/ai/src/realtime/types.ts:107](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L107)

Audio content part in a realtime message

## Properties

### audioData?

```ts
optional audioData: ArrayBuffer;
```

Defined in: [packages/ai/src/realtime/types.ts:112](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L112)

Raw audio data (optional, if stored)

***

### durationMs?

```ts
optional durationMs: number;
```

Defined in: [packages/ai/src/realtime/types.ts:114](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L114)

Duration of the audio in milliseconds

***

### transcript

```ts
transcript: string;
```

Defined in: [packages/ai/src/realtime/types.ts:110](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L110)

Transcription of the audio

***

### type

```ts
type: "audio";
```

Defined in: [packages/ai/src/realtime/types.ts:108](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L108)
