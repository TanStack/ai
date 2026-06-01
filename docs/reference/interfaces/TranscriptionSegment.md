---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/ai/src/types.ts:1793](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1793)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/ai/src/types.ts:1803](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1803)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:1799](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1799)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:1795](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1795)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/ai/src/types.ts:1805](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1805)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:1797](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1797)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1801](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1801)

Transcribed text for this segment
