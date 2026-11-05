---
id: TranscriptionSegment
title: TranscriptionSegment
---

Defined in: [packages/ai/src/types.ts:3238](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3238)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence?: number;
```

Defined in: [packages/ai/src/types.ts:3248](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3248)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:3244](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3244)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:3240](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3240)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker?: string;
```

Defined in: [packages/ai/src/types.ts:3250](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3250)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:3242](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3242)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:3246](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3246)

Transcribed text for this segment
