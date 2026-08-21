---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/ai/src/types.ts:2591](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2591)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence?: number;
```

Defined in: [packages/ai/src/types.ts:2601](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2601)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:2597](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2597)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:2593](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2593)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker?: string;
```

Defined in: [packages/ai/src/types.ts:2603](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2603)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:2595](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2595)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2599](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2599)

Transcribed text for this segment
