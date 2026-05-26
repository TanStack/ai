---
id: TranscriptionSegment
title: TranscriptionSegment
---

# Interface: TranscriptionSegment

Defined in: [packages/ai/src/types.ts:1707](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1707)

A single segment of transcribed audio with timing information.

## Properties

### confidence?

```ts
optional confidence: number;
```

Defined in: [packages/ai/src/types.ts:1717](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1717)

Confidence score (0-1), if available

***

### end

```ts
end: number;
```

Defined in: [packages/ai/src/types.ts:1713](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1713)

End time of the segment in seconds

***

### id

```ts
id: number;
```

Defined in: [packages/ai/src/types.ts:1709](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1709)

Unique identifier for the segment

***

### speaker?

```ts
optional speaker: string;
```

Defined in: [packages/ai/src/types.ts:1719](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1719)

Speaker identifier, if diarization is enabled

***

### start

```ts
start: number;
```

Defined in: [packages/ai/src/types.ts:1711](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1711)

Start time of the segment in seconds

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1715](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1715)

Transcribed text for this segment
