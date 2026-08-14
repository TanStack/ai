---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/ai/src/types.ts:2570](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2570)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence?: number;
```

Defined in: [packages/ai/src/types.ts:2580](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2580)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:2576](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2576)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:2572](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2572)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker?: string;
```

Defined in: [packages/ai/src/types.ts:2582](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2582)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:2574](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2574)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2578](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2578)

Transcribed text for this segment
