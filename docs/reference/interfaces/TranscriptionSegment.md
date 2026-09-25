---
id: TranscriptionSegment
title: TranscriptionSegment
---

Defined in: [packages/ai/src/types.ts:2842](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2842)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence?: number;
```

Defined in: [packages/ai/src/types.ts:2852](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2852)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:2848](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2848)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:2844](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2844)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker?: string;
```

Defined in: [packages/ai/src/types.ts:2854](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2854)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:2846](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2846)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2850](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2850)

Transcribed text for this segment
