---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/ai/src/types.ts:2325](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2325)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence?: number;
```

Defined in: [packages/ai/src/types.ts:2335](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2335)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:2331](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2331)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:2327](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2327)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker?: string;
```

Defined in: [packages/ai/src/types.ts:2337](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2337)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:2329](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2329)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2333](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2333)

Transcribed text for this segment
