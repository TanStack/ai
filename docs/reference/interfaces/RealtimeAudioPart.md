---
id: RealtimeAudioPart
title: RealtimeAudioPart
---

# Interface: RealtimeAudioPart

Defined in: [packages/typescript/ai/src/realtime/types.ts:102](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L102)

Audio content part in a realtime message

## Properties

### audioData?

```ts
optional audioData: ArrayBuffer;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:107](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L107)

Raw audio data (optional, if stored)

***

### durationMs?

```ts
optional durationMs: number;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:109](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L109)

Duration of the audio in milliseconds

***

### transcript

```ts
transcript: string;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:105](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L105)

Transcription of the audio

***

### type

```ts
type: "audio";
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:103](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L103)
