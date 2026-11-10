---
id: RealtimeAudioPart
title: RealtimeAudioPart
---

Defined in: [packages/ai/src/realtime/types.ts:116](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L116)

Audio content part in a realtime message

## Properties

### audioData?

```ts
optional audioData?: ArrayBuffer;
```

Defined in: [packages/ai/src/realtime/types.ts:121](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L121)

Raw audio data (optional, if stored)

***

### durationMs?

```ts
optional durationMs?: number;
```

Defined in: [packages/ai/src/realtime/types.ts:123](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L123)

Duration of the audio in milliseconds

***

### transcript

```ts
transcript: string;
```

Defined in: [packages/ai/src/realtime/types.ts:119](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L119)

Transcription of the audio

***

### type

```ts
type: "audio";
```

Defined in: [packages/ai/src/realtime/types.ts:117](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L117)
