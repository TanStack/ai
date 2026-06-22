---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/ai/src/types.ts:1751](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1751)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/ai/src/types.ts:1761](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1761)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:1757](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1757)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:1753](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1753)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/ai/src/types.ts:1763](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1763)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:1755](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1755)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1759](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1759)

Transcribed text for this segment
