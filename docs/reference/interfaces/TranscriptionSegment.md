---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/ai/src/types.ts:1738](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1738)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/ai/src/types.ts:1748](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1748)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:1744](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1744)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:1740](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1740)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/ai/src/types.ts:1750](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1750)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:1742](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1742)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1746](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1746)

Transcribed text for this segment
