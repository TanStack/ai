---
id: TranscriptionSegment
title: TranscriptionSegment
---

Defined in: [packages/ai/src/types.ts:2453](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2453)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence?: number;
```

Defined in: [packages/ai/src/types.ts:2463](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2463)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:2459](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2459)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:2455](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2455)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker?: string;
```

Defined in: [packages/ai/src/types.ts:2465](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2465)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:2457](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2457)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2461](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2461)

Transcribed text for this segment
