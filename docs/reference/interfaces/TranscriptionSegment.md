---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/ai/src/types.ts:2583](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2583)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence?: number;
```

Defined in: [packages/ai/src/types.ts:2593](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2593)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:2589](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2589)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:2585](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2585)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker?: string;
```

Defined in: [packages/ai/src/types.ts:2595](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2595)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:2587](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2587)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2591](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2591)

Transcribed text for this segment
